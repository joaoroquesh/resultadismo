-- ============================================================================
-- Resultadismo · Placar ao vivo — Etapa 2: a fonte mais RÁPIDA lidera o ao vivo
-- ----------------------------------------------------------------------------
-- Etapa 1 deixou o FINAL correto e auto-congelado pela autoridade (football-data),
-- mas DURANTE o jogo o placar exibido seguia a autoridade (que no plano grátis é
-- atrasada). Etapa 2: enquanto o jogo está AO VIVO, o placar exibido passa a ser
-- o da fonte que MUDOU o placar por último (a que viu o gol primeiro — em geral a
-- ESPN). O FINAL continua decidido pela AUTORIDADE (e o auto-freeze da Etapa 1).
--
-- Só troca a seleção do placar exibido em resolve_match_golden:
--   • status = 'live'      → fonte com score_changed_at mais recente (líder);
--                            fallback autoridade → maioria.
--   • status = 'finished'  → autoridade (como na Etapa 1) → maioria.
-- Freeze, conflito (só sem autoridade) e write-on-change: inalterados.
-- A infra (cron 25s, poll das duas, score_changed_at, lock) já veio na Etapa 1.
-- Aditivo; nada destrutivo; não toca jogo frozen/manual_lock.
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
  authmap as ( -- provider AUTORIDADE por competição = fonte primary habilitada
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
  authobs as ( -- observação da AUTORIDADE (1 linha por match+provider)
    select o.match_id, o.home_score, o.away_score, o.score_changed_at
    from obs o
    join meta m on m.match_id = o.match_id and o.provider = m.auth_provider
  ),
  liveobs as ( -- AO VIVO: a fonte que MUDOU o placar por último (líder da velocidade)
    select match_id, home_score, away_score from (
      select o.match_id, o.home_score, o.away_score,
             row_number() over (partition by o.match_id
               order by o.score_changed_at desc nulls last, o.fetched_at desc) as rn
      from obs o
    ) q where q.rn = 1
  ),
  fin as (
    select c.id as match_id, c.status, c.kickoff_at,
           case when c.status = 'finished'
                then coalesce(a.home_score, maj.home_score)          -- final: autoridade
                else coalesce(lv.home_score, a.home_score, maj.home_score) end as new_home, -- ao vivo: líder
           case when c.status = 'finished'
                then coalesce(a.away_score, maj.away_score)
                else coalesce(lv.away_score, a.away_score, maj.away_score) end as new_away,
           coalesce(maj.distinct_scores, 0) as distinct_scores,
           a.score_changed_at               as auth_changed,
           (a.match_id is not null)         as has_auth
    from cand c
    left join majority maj on maj.match_id = c.id
    left join authobs  a   on a.match_id   = c.id
    left join liveobs  lv  on lv.match_id  = c.id
  ),
  fin2 as (
    select f.*,
      -- conflito só quando NÃO há autoridade pra confiar (fontes divergem e
      -- nenhuma primária reportou). Com autoridade presente, ela decide o final.
      ( f.distinct_scores > 1 and not f.has_auth ) as new_conflict,
      -- freeze: finalizado + autoridade tem placar + (todos concordam OU
      -- autoridade estável >=10min) + >1h do início. Não exige a ESPN.
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
         frozen_at           = case when f.new_frozen then now() else m.frozen_at end
  from fin2 f
  where m.id = f.match_id
    and f.new_home is not null
    and m.frozen = false
    and m.manual_lock = false
    and ( -- write-on-change: só grava quando algo de fato muda
      m.home_score          is distinct from f.new_home
      or m.away_score       is distinct from f.new_away
      or m.score_conflict   is distinct from f.new_conflict
      or m.frozen           is distinct from f.new_frozen
      or m.score_sources_count is distinct from f.new_count
    );

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function public.resolve_match_golden(uuid[]) from public, anon, authenticated;
grant execute on function public.resolve_match_golden(uuid[]) to service_role;
