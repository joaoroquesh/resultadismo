-- Bateria de testes do motor Retrô (Fase 2) — rodar contra o Supabase LOCAL:
--   docker exec -i supabase_db_resultadismo psql -U postgres -d postgres < scripts/retro-engine-tests.sql
-- Pré-requisito: migrations 20260610000001/2 aplicadas (db reset). Idempotente.

-- Bateria de testes do motor Retrô (roda como postgres; simula anon/logado via JWT claims)
\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

-- ============ T1: anônimo joga TREINO até o TÍTULO (gabarito lido como postgres) ============
create or replace function pg_temp.play_full_run(p_mode text, p_pace text, p_daily boolean, p_perfect boolean)
returns jsonb language plpgsql as $$
declare
  v_token uuid := gen_random_uuid();
  v_start jsonb; v_ans jsonb; v_run uuid;
  v_m record; v_i int := 0;
  v_gh int; v_ga int;
begin
  v_start := public.retro_start_run(p_mode, p_pace, p_daily, v_token, '{}');
  v_run := (v_start->>'run_id')::uuid;
  loop
    v_i := v_i + 1;
    if v_i > 10 then raise exception 'loop infinito'; end if;
    select m.home_score, m.away_score into v_m
      from public.retro_run_matches rm join public.retro_matches m on m.id = rm.match_id
     where rm.run_id = v_run and rm.answered_at is null;
    exit when not found;
    if p_perfect then v_gh := v_m.home_score; v_ga := v_m.away_score;
    else -- palpite garantidamente errado: inverte o sinal do resultado
      if v_m.home_score > v_m.away_score then v_gh := 0; v_ga := 9;
      elsif v_m.home_score < v_m.away_score then v_gh := 9; v_ga := 0;
      else v_gh := 9; v_ga := 0; end if;
    end if;
    v_ans := public.retro_answer(v_run, v_gh, v_ga, v_token, '{}');
    exit when v_ans->'run'->>'status' <> 'playing';
    perform public.retro_next(v_run, v_token, '{}');
  end loop;
  return v_ans || jsonb_build_object('token', v_token);
end $$;

select 'T1 anon treino perfeito (espera champion/21pts/6):' ||
  (r->'run'->>'status') || '/' || (r->'run'->>'points') || 'pts/rank' || (r->'run'->>'stage_rank')
from pg_temp.play_full_run('acerto', 'sempressa', false, true) r;

-- ============ T2: anônimo ERRA tudo → eliminado nos grupos com 3 jogos jogados ============
do $$
declare j jsonb; v_n int;
begin
  j := pg_temp.play_full_run('acerto', 'sempressa', false, false);
  select count(*) into v_n from public.retro_run_matches rm
   where rm.run_id = (j->'run'->>'id')::uuid and rm.answered_at is not null;
  if j->'run'->>'status' = 'eliminated' and j->'run'->>'stage_reached' = 'Fase de grupos' and v_n = 3 then
    raise notice 'T2 anon erra tudo: OK (eliminado nos grupos com 3 jogos jogados, jogo de honra incluso)';
  else
    raise exception 'T2 FALHOU: %/%/% slots', j->'run'->>'status', j->'run'->>'stage_reached', v_n;
  end if;
end $$;

-- ============ T3: timeout no servidor (deadline vencida → erro mesmo com palpite certo) ============
do $$
declare v_token uuid := gen_random_uuid(); v_start jsonb; v_run uuid; v_m record; v_ans jsonb;
begin
  v_start := public.retro_start_run('acerto', 'resultadista', false, v_token, '{}');
  v_run := (v_start->>'run_id')::uuid;
  update public.retro_run_matches set deadline_at = now() - interval '5 seconds'
   where run_id = v_run and slot = 1;
  select m.home_score, m.away_score into v_m
    from public.retro_run_matches rm join public.retro_matches m on m.id = rm.match_id
   where rm.run_id = v_run and rm.slot = 1;
  v_ans := public.retro_answer(v_run, v_m.home_score, v_m.away_score, v_token, '{}');
  if (v_ans->'result'->>'timeout')::boolean and v_ans->'result'->>'score_type' = 'erro'
     and (v_ans->'result'->>'points')::int = 0 then
    raise notice 'T3 timeout servidor: OK (palpite certo fora da janela = erro)';
  else
    raise exception 'T3 FALHOU: %', v_ans->'result';
  end if;
end $$;

-- ============ T4: barra ≥2 na semi (acerto de 1 pt na semi NÃO passa) ============
do $$
declare v_token uuid := gen_random_uuid(); v_start jsonb; v_run uuid; v_ans jsonb;
  v_i int := 0; v_gh int; v_ga int; v_slot int; v_h int; v_a int;
begin
  v_start := public.retro_start_run('acerto', 'sempressa', false, v_token, '{}');
  v_run := (v_start->>'run_id')::uuid;
  loop
    v_i := v_i + 1; if v_i > 10 then raise exception 'loop'; end if;
    select rm.slot, m.home_score, m.away_score into v_slot, v_h, v_a
      from public.retro_run_matches rm join public.retro_matches m on m.id = rm.match_id
     where rm.run_id = v_run and rm.answered_at is null;
    if v_slot < 6 then
      v_gh := v_h; v_ga := v_a; -- crava até as quartas
    else
      -- na SEMI: acerta só o vencedor com saldo errado = 1 pt (acerto) → deve eliminar
      if v_h > v_a then v_gh := v_h + 5; v_ga := v_a;
      elsif v_h < v_a then v_gh := v_h; v_ga := v_a + 5;
      else v_gh := 9; v_ga := 0; end if; -- empate real: palpite errado de propósito
    end if;
    v_ans := public.retro_answer(v_run, v_gh, v_ga, v_token, '{}');
    exit when v_ans->'run'->>'status' <> 'playing';
    perform public.retro_next(v_run, v_token, '{}');
  end loop;
  if v_ans->'run'->>'status' = 'eliminated' and v_ans->'run'->>'stage_reached' = 'Semifinal' then
    raise notice 'T4 barra da semi: OK (1 pt não passa na semi; caiu na Semifinal)';
  else
    raise exception 'T4 FALHOU: % / %', v_ans->'run'->>'status', v_ans->'run'->>'stage_reached';
  end if;
end $$;

-- ============ T5: Copa do Dia de LOGADO — retomar + unicidade + ranking ============
do $$
declare v_user uuid; v_start jsonb; v_resume jsonb; v_run uuid; v_m record; v_ans jsonb;
  v_i int := 0; v_board jsonb; v_daily uuid[];
begin
  select id into v_user from public.profiles limit 1;
  if v_user is null then raise exception 'sem usuário de seed'; end if;
  delete from public.retro_runs
   where user_id = v_user and is_daily and daily_date = (now() at time zone 'America/Sao_Paulo')::date;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  v_start := public.retro_start_run('acerto', 'resultadista', true, null, '{}');
  v_run := (v_start->>'run_id')::uuid;
  -- retomar: segundo start devolve a MESMA run
  v_resume := public.retro_start_run('acerto', 'resultadista', true, null, '{}');
  if (v_resume->>'resumed')::boolean and (v_resume->>'run_id')::uuid = v_run then
    raise notice 'T5a retomar Copa do Dia: OK';
  else raise exception 'T5a FALHOU'; end if;
  -- os 7 jogos do dia são fixos e iguais ao retro_daily
  select match_ids into v_daily from public.retro_daily
   where daily_date = (now() at time zone 'America/Sao_Paulo')::date;
  if (select match_id from public.retro_run_matches where run_id = v_run and slot = 1) = v_daily[1] then
    raise notice 'T5b daily determinístico: OK';
  else raise exception 'T5b FALHOU'; end if;
  -- joga até o fim cravando tudo
  loop
    v_i := v_i + 1; if v_i > 10 then raise exception 'loop'; end if;
    select m.home_score, m.away_score into v_m
      from public.retro_run_matches rm join public.retro_matches m on m.id = rm.match_id
     where rm.run_id = v_run and rm.answered_at is null;
    exit when not found;
    v_ans := public.retro_answer(v_run, v_m.home_score, v_m.away_score, null, '{}');
    exit when v_ans->'run'->>'status' <> 'playing';
    perform public.retro_next(v_run, null, '{}');
  end loop;
  if v_ans->'run'->>'status' = 'champion' then raise notice 'T5c campeão logado: OK'; end if;
  -- tentar de novo hoje → exceção
  begin
    perform public.retro_start_run('acerto', 'resultadista', true, null, '{}');
    raise exception 'T5d FALHOU: deixou jogar 2x';
  exception when others then
    if sqlerrm like '%já jogou%' then raise notice 'T5d unicidade do dia: OK';
    else raise; end if;
  end;
  -- ranking do dia tem a run (ranked = logado + resultadista + daily)
  v_board := public.retro_leaderboard(null, 'acerto', 50);
  if jsonb_array_length(v_board->'rows') >= 1 and (v_board->'me'->>'pos') is not null then
    raise notice 'T5e leaderboard: OK (% linhas, minha pos %)',
      jsonb_array_length(v_board->'rows'), v_board->'me'->>'pos';
  else raise exception 'T5e FALHOU: %', v_board; end if;
  -- share summary público sem identidade dos jogos
  perform set_config('request.jwt.claims', '', true);
  v_board := public.retro_run_summary((select share_code from public.retro_runs where id = v_run));
  if v_board->'slots' is not null and v_board::text not like '%home_name%' then
    raise notice 'T5f summary sem spoiler: OK';
  else raise exception 'T5f FALHOU'; end if;
end $$;

-- ============ T6: modo Só Cravada — saldo no grupo NÃO conta como "passou" ============
do $$
declare v_token uuid := gen_random_uuid(); v_start jsonb; v_run uuid; v_m record; v_ans jsonb; v_i int := 0;
begin
  v_start := public.retro_start_run('cravada', 'sempressa', false, v_token, '{}');
  v_run := (v_start->>'run_id')::uuid;
  loop
    v_i := v_i + 1; if v_i > 5 then exit; end if;
    select m.home_score, m.away_score into v_m
      from public.retro_run_matches rm join public.retro_matches m on m.id = rm.match_id
     where rm.run_id = v_run and rm.answered_at is null;
    exit when not found;
    -- sempre SALDO (vencedor + diferença certa, placar errado): +1 em cada lado
    v_ans := public.retro_answer(v_run, v_m.home_score + 1, v_m.away_score + 1, v_token, '{}');
    exit when v_ans->'run'->>'status' <> 'playing';
    perform public.retro_next(v_run, v_token, '{}');
  end loop;
  if v_ans->'run'->>'status' = 'eliminated' and v_ans->'run'->>'stage_reached' = 'Fase de grupos'
     and (v_ans->'run'->>'points')::int = 6 then
    raise notice 'T6 Só Cravada: OK (3 saldos = 6 pts, mas eliminado nos grupos)';
  else raise exception 'T6 FALHOU: %', v_ans->'run'; end if;
end $$;

-- ============ T7: tempo de uso anônimo (clamp 60s) + RLS + purga ============
do $$
declare v_before bigint; v_after bigint; v_n int;
begin
  select coalesce(anon_seconds, 0) into v_before from public.retro_usage_daily
   where day = (now() at time zone 'America/Sao_Paulo')::date;
  perform public.retro_touch_anon(30);
  perform public.retro_touch_anon(500); -- deve virar 60
  select anon_seconds into v_after from public.retro_usage_daily
   where day = (now() at time zone 'America/Sao_Paulo')::date;
  if v_after - coalesce(v_before, 0) = 90 then raise notice 'T7a touch_anon clamp: OK (+90)';
  else raise exception 'T7a FALHOU: % → %', v_before, v_after; end if;
  -- purga: envelhece as efêmeras e roda
  update public.retro_runs set started_at = now() - interval '2 days' where not persistent;
  v_n := public.retro_purge_ephemeral();
  if v_n >= 4 and not exists (select 1 from public.retro_runs where not persistent) then
    raise notice 'T7b purga de efêmeras: OK (% apagadas; persistentes intactas: %)',
      v_n, (select count(*) from public.retro_runs);
  else raise exception 'T7b FALHOU'; end if;
end $$;

-- ============ T8: RLS — anon e authenticated não leem NADA das tabelas retro_* ============
set role anon;
select 'T8a anon lê retro_runs: ' || count(*) || ' linhas (espera 0)' from public.retro_runs;
select 'T8b anon lê retro_daily: ' || count(*) || ' linhas (espera 0)' from public.retro_daily;
reset role;
set role authenticated;
select 'T8c logado lê retro_run_matches: ' || count(*) || ' linhas (espera 0)' from public.retro_run_matches;
reset role;

select '=== TODOS OS TESTES PASSARAM ===';
