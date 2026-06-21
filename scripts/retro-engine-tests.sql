-- Bateria de testes do motor Retrô (Fase 2) — rodar contra o Supabase LOCAL:
--   docker exec -i supabase_db_resultadismo psql -U postgres -d postgres < scripts/retro-engine-tests.sql
-- Pré-requisito: migrations 20260610150000/2 aplicadas (db reset). Idempotente.

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

-- ============ T4: modos (rodada 18) — start devolve level + difficulty; Pontos morto ============
do $$
declare v_token uuid := gen_random_uuid(); v_start jsonb; v_ans jsonb;
begin
  -- start lenda devolve level e o payload traz a dificuldade do jogo (barra do card)
  v_start := public.retro_start_run(p_daily => false, p_anon_token => v_token, p_level => 'lenda');
  if v_start->>'level' <> 'lenda' then raise exception 'T4a FALHOU: level %', v_start->>'level'; end if;
  if (v_start->'current'->'match'->>'difficulty') is null then raise exception 'T4a FALHOU: sem difficulty'; end if;
  v_ans := public.retro_answer((v_start->>'run_id')::uuid, null, null, v_token, '{}');
  if v_ans->'run'->>'level' <> 'lenda' then raise exception 'T4a FALHOU: answer sem level'; end if;
  raise notice 'T4a start/answer com level + difficulty no payload: OK';
  -- níveis antigos (facil/padrao/dificil) rejeitados
  begin
    perform public.retro_start_run(p_daily => false, p_anon_token => v_token, p_level => 'padrao');
    raise exception 'T4b FALHOU: aceitou level padrao';
  exception when others then
    if sqlerrm like '%T4b%' then raise; end if;
    raise notice 'T4b níveis antigos rejeitados: OK';
  end;
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
  v_board := public.retro_leaderboard(null, 'classico', 50);
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

-- ============ T6: janelas de dificuldade por MODO (rodada 18; estatístico, 200 sorteios) ============
do $$
declare v_id uuid; v_diff int; i int;
  amist_g int[] := '{}'; amist_f int[] := '{}'; lenda_g int[] := '{}'; lenda_f int[] := '{}';
begin
  for i in 1..200 loop
    v_id := public.retro_pick_match(1, '{}', 'amistoso'); select difficulty into v_diff from public.retro_matches where id = v_id; amist_g := amist_g || v_diff;
    v_id := public.retro_pick_match(7, '{}', 'amistoso'); select difficulty into v_diff from public.retro_matches where id = v_id; amist_f := amist_f || v_diff;
    v_id := public.retro_pick_match(1, '{}', 'lenda');    select difficulty into v_diff from public.retro_matches where id = v_id; lenda_g := lenda_g || v_diff;
    v_id := public.retro_pick_match(7, '{}', 'lenda');    select difficulty into v_diff from public.retro_matches where id = v_id; lenda_f := lenda_f || v_diff;
  end loop;
  if exists (select 1 from unnest(amist_g) x where x > 2) then raise exception 'T6 FALHOU: amistoso grupos fora de 1-2'; end if;
  if exists (select 1 from unnest(amist_f) x where x not in (3, 4)) then raise exception 'T6 FALHOU: amistoso final fora de 3-4'; end if;
  if exists (select 1 from unnest(lenda_g) x where x not in (3, 4, 5)) then raise exception 'T6 FALHOU: lenda grupos fora de 3-5'; end if;
  if exists (select 1 from unnest(lenda_f) x where x not in (5, 6, 7)) then raise exception 'T6 FALHOU: lenda final fora de 5-7'; end if;
  raise notice 'T6 janelas por modo: OK (amistoso 1-2→3+raros4 · lenda 4-5+alguns3→5-6+raros7)';
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

-- ============ T9: 🎲 cravada dá ficha de troca; reroll troca o jogo e desconta ============
do $$
declare v_token uuid := gen_random_uuid(); v_start jsonb; v_run uuid; v_h int; v_a int;
  v_ans jsonb; v_old uuid; v_new jsonb;
begin
  v_start := public.retro_start_run('acerto', 'sempressa', false, v_token, '{}');
  v_run := (v_start->>'run_id')::uuid;
  -- sem ficha: reroll deve falhar
  begin
    perform public.retro_reroll(v_run, v_token, '{}');
    raise exception 'T9a FALHOU: reroll sem ficha passou';
  exception when others then
    if sqlerrm like '%sem fichas%' then raise notice 'T9a sem ficha bloqueado: OK';
    else raise; end if;
  end;
  -- crava o jogo 1 → ganha 1 ficha
  select m.home_score, m.away_score into v_h, v_a
    from public.retro_run_matches rm join public.retro_matches m on m.id = rm.match_id
   where rm.run_id = v_run and rm.slot = 1;
  v_ans := public.retro_answer(v_run, v_h, v_a, v_token, '{}');
  if (v_ans->'run'->>'rerolls')::int = 1 and (v_ans->'result'->>'reroll_earned')::boolean then
    raise notice 'T9b cravada deu a ficha: OK';
  else raise exception 'T9b FALHOU: %', v_ans->'run'; end if;
  -- serve o jogo 2 e TROCA com a ficha
  perform public.retro_next(v_run, v_token, '{}');
  select match_id into v_old from public.retro_run_matches where run_id = v_run and slot = 2;
  v_new := public.retro_reroll(v_run, v_token, '{}');
  if (v_new->>'rerolls')::int = 0
     and (select match_id from public.retro_run_matches where run_id = v_run and slot = 2) <> v_old then
    raise notice 'T9c reroll trocou o jogo e descontou a ficha: OK';
  else raise exception 'T9c FALHOU'; end if;
end $$;

-- ============ T10: sair = W.O. + run encerrada SEM retomada (rodada 7) ============
do $$
declare v_user uuid; v_start jsonb; v_run uuid; v_h int; v_a int; v_ans jsonb; v_ab jsonb;
begin
  select id into v_user from public.profiles limit 1;
  delete from public.retro_runs
   where user_id = v_user and is_daily and daily_date = (now() at time zone 'America/Sao_Paulo')::date;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  v_start := public.retro_start_run('acerto', 'sempressa', true, null, '{}');
  v_run := (v_start->>'run_id')::uuid;
  -- responde o jogo 1 cravando, serve o 2 e ABANDONA
  select m.home_score, m.away_score into v_h, v_a
    from public.retro_run_matches rm join public.retro_matches m on m.id = rm.match_id
   where rm.run_id = v_run and rm.slot = 1;
  v_ans := public.retro_answer(v_run, v_h, v_a, null, '{}');
  perform public.retro_next(v_run, null, '{}');
  v_ab := public.retro_abandon(v_run, null);
  if v_ab->>'status' = 'eliminated' and v_ab->>'stage_reached' = 'Fase de grupos'
     and (v_ab->>'points')::int = 3
     and (select is_timeout from public.retro_run_matches where run_id = v_run and slot = 2) then
    raise notice 'T10a abandono: OK (W.O. no jogo atual, campanha preservada, eliminado nos grupos)';
  else raise exception 'T10a FALHOU: %', v_ab; end if;
  -- retomada bloqueada: novo start do daily → "já jogou"
  begin
    perform public.retro_start_run('acerto', 'sempressa', true, null, '{}');
    raise exception 'T10b FALHOU: deixou recomeçar';
  exception when others then
    if sqlerrm like '%já jogou%' then raise notice 'T10b sem retomada: OK';
    else raise; end if;
  end;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ============ T11: reroll na COPA DO DIA troca por jogo DA MESMA SELEÇÃO (rodada 20) ============
-- Daily controlado (brasil, 114 jogos) → reroll pega outro jogo do BRASIL, fora dos 7, sem fallback.
do $$
declare v_user uuid; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ids uuid[]; v_start jsonb; v_run uuid; v_h int; v_a int; v_ans jsonb; v_old uuid; v_new jsonb;
  v_newmatch uuid; v_is_team boolean;
begin
  select id into v_user from public.profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  delete from public.retro_runs where user_id = v_user and is_daily and daily_date = v_today;
  delete from public.retro_daily where daily_date = v_today;
  select array_agg(id) into v_ids from (
    select id from public.retro_matches where home_slug='brasil' or away_slug='brasil'
    order by difficulty asc, random() limit 7) q;
  insert into public.retro_daily (daily_date, match_ids, team_slug, team_name_pt)
  values (v_today, v_ids, 'brasil', 'Brasil');

  v_start := public.retro_start_run('acerto', 'sempressa', true, null, '{}');
  v_run := (v_start->>'run_id')::uuid;
  select m.home_score, m.away_score into v_h, v_a
    from public.retro_run_matches rm join public.retro_matches m on m.id = rm.match_id
   where rm.run_id = v_run and rm.slot = 1;
  v_ans := public.retro_answer(v_run, v_h, v_a, null, '{}'); -- crava → ganha ficha
  perform public.retro_next(v_run, null, '{}');
  select match_id into v_old from public.retro_run_matches where run_id = v_run and slot = 2;
  v_new := public.retro_reroll(v_run, null, '{}');
  select match_id into v_newmatch from public.retro_run_matches where run_id = v_run and slot = 2;
  select (home_slug='brasil' or away_slug='brasil') into v_is_team from public.retro_matches where id = v_newmatch;
  if v_newmatch <> v_old and v_is_team and not (v_new->>'random_fallback')::boolean
     and not (v_newmatch = any(v_ids)) then
    raise notice 'T11 reroll no daily: OK (trocou por OUTRO jogo da MESMA seleção, fora dos 7)';
  else raise exception 'T11 FALHOU: trocou=% mesma_selecao=% fallback=% fora7=%',
    v_newmatch <> v_old, v_is_team, v_new->>'random_fallback', not (v_newmatch = any(v_ids)); end if;
  delete from public.retro_runs where user_id = v_user and is_daily and daily_date = v_today;
  delete from public.retro_daily where daily_date = v_today;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ============ T12: seleção esgotada (7 jogos) → reroll cai em aleatório + flag (rodada 20) ============
do $$
declare v_user uuid; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ids uuid[]; v_start jsonb; v_run uuid; v_h int; v_a int; v_ans jsonb; v_old uuid; v_new jsonb;
  v_newmatch uuid; v_is_team boolean;
begin
  select id into v_user from public.profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  delete from public.retro_runs where user_id = v_user and is_daily and daily_date = v_today;
  delete from public.retro_daily where daily_date = v_today;
  select array_agg(id) into v_ids from (
    select id from public.retro_matches where home_slug='egito' or away_slug='egito'
    order by difficulty asc, random() limit 7) q; -- egito tem exatamente 7 → zero sobrando
  insert into public.retro_daily (daily_date, match_ids, team_slug, team_name_pt)
  values (v_today, v_ids, 'egito', 'Egito');

  v_start := public.retro_start_run('acerto', 'sempressa', true, null, '{}');
  v_run := (v_start->>'run_id')::uuid;
  select m.home_score, m.away_score into v_h, v_a
    from public.retro_run_matches rm join public.retro_matches m on m.id = rm.match_id
   where rm.run_id = v_run and rm.slot = 1;
  v_ans := public.retro_answer(v_run, v_h, v_a, null, '{}');
  perform public.retro_next(v_run, null, '{}');
  select match_id into v_old from public.retro_run_matches where run_id = v_run and slot = 2;
  v_new := public.retro_reroll(v_run, null, '{}');
  select match_id into v_newmatch from public.retro_run_matches where run_id = v_run and slot = 2;
  select (home_slug='egito' or away_slug='egito') into v_is_team from public.retro_matches where id = v_newmatch;
  if v_newmatch <> v_old and not v_is_team and (v_new->>'random_fallback')::boolean then
    raise notice 'T12 seleção esgotada: OK (caiu em jogo aleatório de outra Copa, random_fallback=true)';
  else raise exception 'T12 FALHOU: trocou=% outra_selecao=% fallback=%',
    v_newmatch <> v_old, not v_is_team, v_new->>'random_fallback'; end if;
  delete from public.retro_runs where user_id = v_user and is_daily and daily_date = v_today;
  delete from public.retro_daily where daily_date = v_today;
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ============ T13: dicas por partida — fact no payload só se revisada; anti-spoiler (rodada 21) ============
do $$
declare v_token uuid := gen_random_uuid(); v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ids uuid[]; v_mid uuid; v_start jsonb; v_run uuid; v_fact text; v_user uuid;
begin
  -- monta um daily controlado cujo slot 1 é um jogo COM dica publicada (1950 uru x bra)
  select id into v_mid from public.retro_matches where wc_year=1950 and home_slug='uruguai' and away_slug='brasil';
  if v_mid is null or (select fact_pt from public.retro_matches where id=v_mid) is null then
    raise exception 'T13 FALHOU: seed de dica ausente'; end if;
  select array_agg(id) into v_ids from (
    select v_mid as id
    union all
    select id from (
      select id from public.retro_matches
       where (home_slug='brasil' or away_slug='brasil') and id<>v_mid
       order by random() limit 6) r) q;
  select id into v_user from public.profiles limit 1;
  perform set_config('request.jwt.claims', json_build_object('sub', v_user, 'role','authenticated')::text, true);
  delete from public.retro_runs where user_id=v_user and is_daily and daily_date=v_today;
  delete from public.retro_daily where daily_date=v_today;
  insert into public.retro_daily (daily_date, match_ids, team_slug, team_name_pt) values (v_today, v_ids, 'brasil', 'Brasil');
  v_start := public.retro_start_run('acerto','sempressa',true,null,'{}');
  v_fact := v_start->'current'->'match'->>'fact';
  if v_fact is null or v_fact not ilike '%Maracana%' then raise exception 'T13 FALHOU: dica revisada não veio no payload: %', v_fact; end if;
  raise notice 'T13a dica revisada desce no payload: OK';

  -- despublica → fact some do payload
  perform public.admin_set_match_fact(v_mid, (select fact_pt from public.retro_matches where id=v_mid), false);
  delete from public.retro_runs where user_id=v_user and is_daily and daily_date=v_today;
  v_start := public.retro_start_run('acerto','sempressa',true,null,'{}');
  if (v_start->'current'->'match'->>'fact') is not null then raise exception 'T13 FALHOU: rascunho vazou no payload'; end if;
  raise notice 'T13b rascunho (não revisado) NÃO desce: OK';
  -- restaura
  perform public.admin_set_match_fact(v_mid, (select fact_pt from public.retro_matches where id=v_mid), true);
  delete from public.retro_runs where user_id=v_user and is_daily and daily_date=v_today;
  delete from public.retro_daily where daily_date=v_today;
  perform set_config('request.jwt.claims', '', true);
end $$;

select '=== TODOS OS TESTES PASSARAM ===';
