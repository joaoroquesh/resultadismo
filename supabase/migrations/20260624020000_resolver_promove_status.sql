-- ============================================================================
-- Resultadismo · Resolver promove matches.status com base nas observações
-- ----------------------------------------------------------------------------
-- Bug observado em produção (Panamá x Croácia, 23/06/2026): football-data
-- como primária NO PLANO FREE nunca reporta 'live' (live scores é pago);
-- ela vai de scheduled → finished com atraso. Resultado: matches.status ficava
-- preso em 'scheduled' o jogo inteiro, e o ramo "fonte mais rápida lidera" da
-- Etapa 2 (que só dispara com status='live') nem acionava.
--
-- Fix: o resolver passa a PROMOVER o status do jogo baseado na observação MAIS
-- RECENTE entre todas as fontes (live/finished). Nunca regride pra 'scheduled'
-- (status estrutural só sobe). Continua não tocando frozen / manual_lock.
--
-- Códigos honrados: 'live', 'finished'. 'postponed'/'cancelled' continuam
-- controlados pelo reconcilePrimary (catalog), pra não dar falso cancel só
-- porque uma fonte espelha tarde.
-- ============================================================================

create or replace function public.resolve_match_golden(p_match_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_updated int;
begin
  with cand as (
    select m.id, m.status, m.competition_id, m.provider, m.kickoff_at
    from public.matches m
    where m.frozen = false
      and m.manual_lock = false
      and (
        (p_match_ids is not null and m.id = any(p_match_ids))
        or (p_match_ids is null
            and m.status in ('live', 'finished')
            and m.kickoff_at > now() - interval '35 days')
      )
  ),
  authmap as (
    select cs.competition_id, min(cs.provider::text) as auth_provider
    from public.competition_sources cs
    where cs.role = 'primary' and cs.enabled = true
    group by cs.competition_id
  ),
  meta as (
    select c.id as match_id,
           coalesce(a.auth_provider, c.provider::text) as auth_provider
    from cand c
    left join authmap a on a.competition_id = c.competition_id
  ),
  obs as (
    select ms.match_id, ms.provider::text as provider, ms.home_score, ms.away_score,
           ms.fetched_at, ms.score_changed_at
    from public.match_sources ms
    join cand on cand.id = ms.match_id
    where ms.home_score is not null and ms.away_score is not null
  ),
  votes as (
    select o.match_id, o.home_score, o.away_score, count(*) as c, max(o.fetched_at) as latest
    from obs o
    group by o.match_id, o.home_score, o.away_score
  ),
  ranked as (
    select v.match_id, v.home_score, v.away_score, v.c,
           count(*) over (partition by v.match_id) as distinct_scores,
           row_number() over (partition by v.match_id order by v.c desc, v.latest desc) as rn
    from votes v
  ),
  majority as (
    select match_id, home_score, away_score, distinct_scores
    from ranked where rn = 1
  ),
  authobs as (
    select o.match_id, o.home_score, o.away_score, o.score_changed_at
    from obs o
    join meta m on m.match_id = o.match_id and o.provider = m.auth_provider
  ),
  liveobs as (
    select match_id, home_score, away_score from (
      select o.match_id, o.home_score, o.away_score,
             row_number() over (partition by o.match_id
               order by o.score_changed_at desc nulls last, o.fetched_at desc) as rn
      from obs o
    ) q where q.rn = 1
  ),
  phaseobs as (
    select match_id, live_phase from (
      select ms.match_id, ms.live_phase,
             row_number() over (partition by ms.match_id order by ms.fetched_at desc) as rn
      from public.match_sources ms
      join cand on cand.id = ms.match_id
      where ms.live_phase is not null
    ) q where q.rn = 1
  ),
  -- Promoção de status (novo): a observação MAIS RECENTE entre TODAS as fontes
  -- (com ou sem placar) decide se o jogo é 'live' ou 'finished'. Só promove —
  -- nunca regride pra 'scheduled' (cria estabilidade do calendário).
  statobs as (
    select match_id, status from (
      select ms.match_id, ms.status,
             row_number() over (partition by ms.match_id order by ms.fetched_at desc) as rn
      from public.match_sources ms
      join cand on cand.id = ms.match_id
      where ms.status in ('live', 'finished')
    ) q where q.rn = 1
  ),
  fin as (
    select c.id as match_id, c.status as cur_status, c.kickoff_at,
           case when coalesce(st.status, c.status::text) = 'finished'
                then coalesce(a.home_score, maj.home_score)
                else coalesce(lv.home_score, a.home_score, maj.home_score) end as new_home,
           case when coalesce(st.status, c.status::text) = 'finished'
                then coalesce(a.away_score, maj.away_score)
                else coalesce(lv.away_score, a.away_score, maj.away_score) end as new_away,
           coalesce(maj.distinct_scores, 0) as distinct_scores,
           a.score_changed_at               as auth_changed,
           (a.match_id is not null)         as has_auth,
           case when coalesce(st.status, c.status::text) = 'live' then ph.live_phase else null end as new_phase,
           -- nunca regride: só promove de scheduled→live ou →finished
           case
             when st.status = 'finished' then 'finished'::public.match_status
             when st.status = 'live' and c.status <> 'finished' then 'live'::public.match_status
             else c.status
           end as new_status
    from cand c
    left join majority maj on maj.match_id = c.id
    left join authobs  a   on a.match_id   = c.id
    left join liveobs  lv  on lv.match_id  = c.id
    left join phaseobs ph  on ph.match_id  = c.id
    left join statobs  st  on st.match_id  = c.id
  ),
  fin2 as (
    select f.*,
      ( f.distinct_scores > 1 and not f.has_auth ) as new_conflict,
      ( f.new_status = 'finished'
        and f.has_auth
        and ( f.distinct_scores <= 1
              or (f.auth_changed is not null and now() - f.auth_changed >= interval '10 minutes') )
        and now() - f.kickoff_at > interval '1 hour' ) as new_frozen,
      coalesce((select vv.c from votes vv
                 where vv.match_id = f.match_id
                   and vv.home_score = f.new_home
                   and vv.away_score = f.new_away), 0) as new_count
    from fin f
  )
  update public.matches m
     set status              = f.new_status,
         home_score          = f.new_home,
         away_score          = f.new_away,
         score_sources_count = f.new_count,
         score_conflict      = f.new_conflict,
         frozen              = f.new_frozen,
         frozen_at           = case when f.new_frozen then now() else m.frozen_at end,
         live_phase          = f.new_phase
  from fin2 f
  where m.id = f.match_id
    and f.new_home is not null
    and m.frozen = false
    and m.manual_lock = false
    and (
      m.status              is distinct from f.new_status
      or m.home_score       is distinct from f.new_home
      or m.away_score       is distinct from f.new_away
      or m.score_conflict   is distinct from f.new_conflict
      or m.frozen           is distinct from f.new_frozen
      or m.score_sources_count is distinct from f.new_count
      or m.live_phase       is distinct from f.new_phase
    );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function public.resolve_match_golden(uuid[]) from public, anon, authenticated;
grant execute on function public.resolve_match_golden(uuid[]) to service_role;
