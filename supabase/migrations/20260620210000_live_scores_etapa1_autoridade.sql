-- ============================================================================
-- Resultadismo · Placar ao vivo — Etapa 1: autoridade decide o final
-- ----------------------------------------------------------------------------
-- Contexto (evidência do dono na Copa 2026): a ESPN trava antes do fim do jogo
-- (ex.: Canadá 6-0 / ESPN 5-0; Gana 1-0 / ESPN 0-0) e, como o congelamento
-- automático exigia DUAS fontes concordando, todo jogo caía na fila "Travados
-- por você" pra resolver na mão. A football-data acerta o placar final quase
-- sempre, por isso é a primária (autoridade).
--
-- Esta etapa:
--   • record_observation: grava observação da fonte + marca score_changed_at
--     (quando AQUELA fonte mudou de placar) — base do "estável por N min".
--   • resolve_match_golden v2 (ciente da AUTORIDADE):
--       - placar exibido = o da fonte PRIMÁRIA (autoridade) quando ela tem
--         placar; senão, maioria (empate → mais recente).
--       - FREEZE no final = finalizado + autoridade tem placar + (todas
--         concordam OU autoridade estável >=10min) + >1h do início. NÃO exige
--         mais a ESPN concordar → mata a fila de travar na mão.
--       - score_conflict só quando NÃO há autoridade pra confiar (fontes
--         divergem e nenhuma primária reportou). Com autoridade presente, ela
--         decide e congela — sem alerta (compõe com alertConflicts, que já só
--         notifica jogo encerrado).
--       - write-on-change: só grava em matches quando algo muda (Realtime limpo).
--   • live_competition_ids: comps com jogo ao vivo/iminente (filtro do modo scores).
--   • sync_locks + try_claim/release: trava anti-sobreposição p/ cadência de 25s.
--   • cron sync-scores: 1 min → 25 s (pg_cron 1.6 aceita segundos; fallback 1min).
--
-- NÃO toca jogo com manual_lock=true nem já congelado. Aditivo; nada destrutivo.
-- ============================================================================

-- 1) "Quando ESTA fonte mudou o placar" (estabilidade p/ freeze) -------------
alter table public.match_sources add column if not exists score_changed_at timestamptz;
comment on column public.match_sources.score_changed_at is
  'Quando ESTA fonte mudou o placar reportado pela última vez (estabilidade p/ freeze).';

-- 2) record_observation — upsert da observação + score_changed_at ------------
create or replace function public.record_observation(
  p_match_id    uuid,
  p_provider    text,
  p_provider_ref text,
  p_status      text,
  p_home_score  int,
  p_away_score  int,
  p_home_pen    int,
  p_away_pen    int,
  p_kickoff_at  timestamptz
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.match_sources(
    match_id, provider, provider_ref, status, home_score, away_score,
    home_pen, away_pen, kickoff_at, fetched_at, score_changed_at
  ) values (
    p_match_id, p_provider::public.data_provider, p_provider_ref, p_status,
    p_home_score, p_away_score, p_home_pen, p_away_pen, p_kickoff_at, now(),
    case when p_home_score is not null then now() else null end
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
    score_changed_at = case
      when excluded.home_score is not null
        and (public.match_sources.home_score is distinct from excluded.home_score
             or public.match_sources.away_score is distinct from excluded.away_score)
      then now()
      else public.match_sources.score_changed_at
    end;
end;
$$;
revoke all on function public.record_observation(uuid, text, text, text, int, int, int, int, timestamptz) from public, anon, authenticated;
grant execute on function public.record_observation(uuid, text, text, text, int, int, int, int, timestamptz) to service_role;

-- 3) live_competition_ids — comps com jogo ao vivo/iminente -----------------
create or replace function public.live_competition_ids()
returns table(competition_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct m.competition_id
  from public.matches m
  where m.hidden = false
    and (
      m.status = 'live'
      or (m.status = 'scheduled'
          and m.kickoff_at <= now() + interval '30 minutes'
          and m.kickoff_at >= now() - interval '180 minutes')
    );
$$;
revoke all on function public.live_competition_ids() from public, anon, authenticated;
grant execute on function public.live_competition_ids() to service_role;

-- 4) sync_locks — trava anti-sobreposição (cadência de 25s) -----------------
create table if not exists public.sync_locks (
  name         text primary key,
  locked_until timestamptz not null
);
alter table public.sync_locks enable row level security; -- sem policy: só definer/service_role

create or replace function public.try_claim_sync_lock(p_name text, p_ttl_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_rows int;
begin
  insert into public.sync_locks(name, locked_until)
  values (p_name, now() + make_interval(secs => p_ttl_seconds))
  on conflict (name) do update
    set locked_until = excluded.locked_until
    where public.sync_locks.locked_until < now();
  get diagnostics v_rows = row_count;
  return v_rows > 0; -- 1 = ganhou/renovou; 0 = já travado e válido
end;
$$;
revoke all on function public.try_claim_sync_lock(text, int) from public, anon, authenticated;
grant execute on function public.try_claim_sync_lock(text, int) to service_role;

create or replace function public.release_sync_lock(p_name text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.sync_locks where name = p_name;
$$;
revoke all on function public.release_sync_lock(text) from public, anon, authenticated;
grant execute on function public.release_sync_lock(text) to service_role;

-- 5) resolve_match_golden v2 — autoridade decide; freeze sem exigir ESPN -----
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
  fin as (
    select c.id as match_id, c.status, c.kickoff_at,
           coalesce(a.home_score, maj.home_score) as new_home,
           coalesce(a.away_score, maj.away_score) as new_away,
           coalesce(maj.distinct_scores, 0)       as distinct_scores,
           a.score_changed_at                     as auth_changed,
           (a.match_id is not null)               as has_auth
    from cand c
    left join majority maj on maj.match_id = c.id
    left join authobs  a   on a.match_id   = c.id
  ),
  fin2 as (
    select f.*,
      -- conflito só quando NÃO há autoridade pra confiar (fontes divergem e
      -- nenhuma primária reportou). Com autoridade presente, ela decide.
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

-- 6) Cron: placar ao vivo a cada 25s (era 1 min). Fallback p/ 1min se o
--    intervalo em segundos não estiver disponível — NUNCA fica sem cron.
do $$
begin
  perform cron.unschedule('resultadismo-sync-scores');
exception when others then null;
end $$;

do $$
begin
  perform cron.schedule('resultadismo-sync-scores', '25 seconds',
    $cron$select public.run_football_sync('scores');$cron$);
exception when others then
  begin
    perform cron.schedule('resultadismo-sync-scores', '* * * * *',
      $cron$select public.run_football_sync('scores');$cron$);
    raise notice 'sync-scores: 25s indisponível, mantido 1min (%).', sqlerrm;
  exception when others then
    raise notice 'cron sync-scores indisponível: %', sqlerrm;
  end;
end $$;
