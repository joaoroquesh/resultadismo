-- ============================================================================
-- Resultadismo · resolve_match_golden — golden record por voto + freeze (no banco)
-- ----------------------------------------------------------------------------
-- Pura lógica de banco sobre match_sources -> matches. Fica no Postgres (e não
-- só na Edge Function) para ser TESTÁVEL e rodável por cron independente do sync
-- ao vivo — garantindo o FREEZE (decisão #3) mesmo sem toque ao vivo.
--
-- Para cada jogo candidato (não congelado, sem lock manual):
--   • placar GOLDEN = o (home,away) reportado pela MAIORIA das fontes; empate →
--     observação mais recente. score_sources_count = quantas confirmam o golden.
--   • score_conflict = há mais de um placar distinto entre as fontes.
--   • FREEZE = finalizado + confirmado por >=2 fontes + >1h do início → trava.
-- NUNCA toca jogo com manual_lock=true (decisão #8) nem já congelado.
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
    select m.id
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
  obs as (
    select ms.match_id, ms.home_score, ms.away_score,
           count(*) as c, max(ms.fetched_at) as latest
    from public.match_sources ms
    join cand on cand.id = ms.match_id
    where ms.home_score is not null and ms.away_score is not null
    group by ms.match_id, ms.home_score, ms.away_score
  ),
  ranked as (
    select o.match_id, o.home_score, o.away_score, o.c,
           count(*) over (partition by o.match_id) as distinct_scores,
           row_number() over (partition by o.match_id order by o.c desc, o.latest desc) as rn
    from obs o
  )
  update public.matches m
    set home_score = r.home_score,
        away_score = r.away_score,
        score_sources_count = r.c,
        score_conflict = (r.distinct_scores > 1),
        -- congela só com CONSENSO real: >=2 fontes e SEM divergência (distinct=1).
        -- Se as fontes discordam, não congela — vai pra fila de conflito do admin.
        frozen = (m.status = 'finished' and r.c >= 2 and r.distinct_scores = 1 and now() - m.kickoff_at > interval '1 hour'),
        frozen_at = case
                      when (m.status = 'finished' and r.c >= 2 and r.distinct_scores = 1 and now() - m.kickoff_at > interval '1 hour')
                      then now() else m.frozen_at
                    end
  from ranked r
  where r.rn = 1
    and m.id = r.match_id
    and m.frozen = false
    and m.manual_lock = false;

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

-- Interna: só a Edge (service_role) e o cron (postgres) chamam.
revoke all on function public.resolve_match_golden(uuid[]) from public, anon, authenticated;
grant execute on function public.resolve_match_golden(uuid[]) to service_role;

-- Cron: a cada 10 min resolve golden + congela finalizados confirmados por >=2
-- fontes (independente do sync ao vivo). Idempotente; guardado se pg_cron faltar.
do $$
begin
  perform cron.schedule(
    'resultadismo-resolve-golden',
    '*/10 * * * *',
    'select public.resolve_match_golden();'
  );
exception when others then
  raise notice 'cron.schedule (resolve-golden) indisponível: %', sqlerrm;
end $$;
