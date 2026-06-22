-- ============================================================================
-- Resultadismo · Card — FASE do jogo ao vivo (1º tempo / intervalo / 2º tempo /
-- prorrogação / pênaltis) ao lado do "AO VIVO".
-- ----------------------------------------------------------------------------
-- A ESPN é a única fonte grátis que entrega a fase (status.period +
-- status.type.name); o sync hoje lê só o state e descarta o resto. Aqui:
--   • match_sources.live_phase: a fase reportada por cada fonte (ESPN preenche).
--   • record_observation passa a gravar live_phase.
--   • resolve_match_golden v4: além do placar, propaga matches.live_phase = a
--     fase da observação mais recente que tiver uma (ESPN), SÓ enquanto o jogo
--     está 'live'; encerrado/qualquer outro → null (limpa). write-on-change.
-- NÃO mexe em placar/freeze/conflito (mantém Etapas 1 e 2). Aditivo.
-- Códigos de fase: '1t' | 'intervalo' | '2t' | 'prorrogacao' | 'penaltis'.
-- ============================================================================

alter table public.matches       add column if not exists live_phase text;
alter table public.match_sources add column if not exists live_phase text;
comment on column public.matches.live_phase is
  'Fase do jogo AO VIVO (1t/intervalo/2t/prorrogacao/penaltis); null fora do ao vivo. Vem da ESPN.';

-- record_observation ganha p_live_phase (recria com a nova assinatura) ---------
drop function if exists public.record_observation(uuid, text, text, text, int, int, int, int, timestamptz);
create or replace function public.record_observation(
  p_match_id    uuid,
  p_provider    text,
  p_provider_ref text,
  p_status      text,
  p_home_score  int,
  p_away_score  int,
  p_home_pen    int,
  p_away_pen    int,
  p_kickoff_at  timestamptz,
  p_live_phase  text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.match_sources(
    match_id, provider, provider_ref, status, home_score, away_score,
    home_pen, away_pen, kickoff_at, fetched_at, score_changed_at, live_phase
  ) values (
    p_match_id, p_provider::public.data_provider, p_provider_ref, p_status,
    p_home_score, p_away_score, p_home_pen, p_away_pen, p_kickoff_at, now(),
    case when p_home_score is not null then now() else null end, p_live_phase
  )
  on conflict (match_id, provider) do update set
    provider_ref = excluded.provider_ref,
    status       = excluded.status,
    home_score   = excluded.home_score,
    away_score   = excluded.away_score,
    home_pen     = excluded.home_pen,
    away_pen     = excluded.away_pen,
    kickoff_at   = excluded.kickoff_at,
    fetched_at   = excluded.fetched_at,
    live_phase   = excluded.live_phase,
    score_changed_at = case
      when excluded.home_score is not null
        and (public.match_sources.home_score is distinct from excluded.home_score
             or public.match_sources.away_score is distinct from excluded.away_score)
      then now()
      else public.match_sources.score_changed_at
    end;
end;
$$;
revoke all on function public.record_observation(uuid, text, text, text, int, int, int, int, timestamptz, text) from public, anon, authenticated;
grant execute on function public.record_observation(uuid, text, text, text, int, int, int, int, timestamptz, text) to service_role;

-- resolve_match_golden v4 — igual à v3 (Etapa 2) + propaga live_phase ----------
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
  phaseobs as ( -- fase reportada mais recente (ESPN); ignora fontes sem fase
    select match_id, live_phase from (
      select ms.match_id, ms.live_phase,
             row_number() over (partition by ms.match_id order by ms.fetched_at desc) as rn
      from public.match_sources ms
      join cand on cand.id = ms.match_id
      where ms.live_phase is not null
    ) q where q.rn = 1
  ),
  fin as (
    select c.id as match_id, c.status, c.kickoff_at,
           case when c.status = 'finished'
                then coalesce(a.home_score, maj.home_score)
                else coalesce(lv.home_score, a.home_score, maj.home_score) end as new_home,
           case when c.status = 'finished'
                then coalesce(a.away_score, maj.away_score)
                else coalesce(lv.away_score, a.away_score, maj.away_score) end as new_away,
           coalesce(maj.distinct_scores, 0) as distinct_scores,
           a.score_changed_at               as auth_changed,
           (a.match_id is not null)         as has_auth,
           case when c.status = 'live' then ph.live_phase else null end as new_phase
    from cand c
    left join majority maj on maj.match_id = c.id
    left join authobs  a   on a.match_id   = c.id
    left join liveobs  lv  on lv.match_id  = c.id
    left join phaseobs ph  on ph.match_id  = c.id
  ),
  fin2 as (
    select f.*,
      ( f.distinct_scores > 1 and not f.has_auth ) as new_conflict,
      ( f.status = 'finished'
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
     set home_score          = f.new_home,
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
      m.home_score          is distinct from f.new_home
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
