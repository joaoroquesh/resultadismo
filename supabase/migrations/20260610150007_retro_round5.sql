-- Retrô — rodada 5 (decisões do PO, 10/06):
-- 1) BARRAS DE VOLTA (modo acerto): grupos/8ª/4ª ≥1 · semi ≥2 (saldo) · FINAL = só CRAVADA.
--    Modo 'Na Crava': ≥2 até a semi · FINAL = só CRAVADA (sempre ≥ o modo fácil).
-- 2) RE-SORTEIO 🎲: cada CRAVADA dá 1 ficha de troca; o jogador pode trocar o jogo
--    atual da run (novo sorteio, cronômetro zera). Vale na Copa do Dia também (ganho
--    por mérito — o jogo trocado sai das janelas normais do sorteio).
-- 3) TREINOS RANQUEADOS: runs de LOGADO agora são todas persistentes; ranking de
--    Treino = MELHOR campanha de cada um (logado + ritmo resultadista); melhor
--    campanha do perfil considera tudo. Anônimo segue efêmero (purga diária).

alter table public.retro_runs add column if not exists rerolls int not null default 0;

-- persistência: toda run de LOGADO fica (alimenta ranking de treino + melhor campanha)
create or replace function public.retro_start_run(
  p_mode text default 'acerto',
  p_pace text default 'resultadista',
  p_daily boolean default true,
  p_anon_token uuid default null,
  p_seen uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_run public.retro_runs;
begin
  if p_mode not in ('acerto','cravada') or p_pace not in ('resultadista','classico','sempressa') then
    raise exception 'modo ou ritmo inválido';
  end if;
  if v_user is null and p_anon_token is null then
    raise exception 'anônimo precisa de anon_token';
  end if;
  if array_length(p_seen, 1) > 60 then p_seen := p_seen[1:60]; end if;

  if v_user is null then
    if (select count(*) from public.retro_runs
         where anon_token = p_anon_token
           and started_at > now() - interval '1 hour') >= 30 then
      raise exception 'muitas partidas seguidas — respira, toma uma água e volta já 😉';
    end if;
  end if;

  if p_daily and v_user is not null then
    select * into v_run from public.retro_runs
     where user_id = v_user and is_daily and daily_date = v_today;
    if found then
      if v_run.status = 'playing' then
        return jsonb_build_object('run_id', v_run.id, 'share_code', v_run.share_code,
          'mode', v_run.mode, 'pace', v_run.pace, 'resumed', true, 'points', v_run.points,
          'rerolls', v_run.rerolls,
          'current', public.retro_match_payload(v_run, v_run.current_slot));
      end if;
      raise exception 'você já jogou a Copa do Dia de hoje — volte amanhã (ou jogue o Treino)';
    end if;
  end if;

  insert into public.retro_runs (user_id, anon_token, is_daily, daily_date, mode, pace, ranked, persistent)
  values (v_user, case when v_user is null then p_anon_token end,
          p_daily, case when p_daily then v_today end, p_mode, p_pace,
          p_daily and v_user is not null and p_pace = 'resultadista',
          v_user is not null)
  returning * into v_run;

  if v_user is null then
    insert into public.retro_usage_daily as u (day, anon_runs_started) values (v_today, 1)
    on conflict (day) do update set anon_runs_started = u.anon_runs_started + 1;
  end if;

  perform public.retro_serve_slot(v_run, 1, p_seen);
  return jsonb_build_object('run_id', v_run.id, 'share_code', v_run.share_code,
    'mode', v_run.mode, 'pace', v_run.pace, 'ranked', v_run.ranked, 'resumed', false,
    'points', 0, 'rerolls', 0, 'current', public.retro_match_payload(v_run, 1));
end $$;

-- barra de avanço por modo e slot (rodada 5)
create or replace function public.retro_pass_need(p_mode text, p_slot int) returns int
language sql immutable as $$
  select case
    when p_slot = 7 then 3                                  -- FINAL: só cravada (os 2 modos)
    when p_mode = 'cravada' then 2                          -- Na Crava: saldo/cravada sempre
    when p_slot = 6 then 2                                  -- acerto: semi pede saldo
    else 1                                                  -- acerto: ≥1 até as quartas
  end
$$;

create or replace function public.retro_answer(
  p_run_id uuid,
  p_home int default null,
  p_away int default null,
  p_anon_token uuid default null,
  p_seen uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.retro_runs;
  v_rm public.retro_run_matches;
  v_m public.retro_matches;
  v_timeout boolean;
  v_type public.score_type;
  v_pts int := 0;
  v_need int;
  v_passed boolean;
  v_group_passes int;
  v_finish_status text := null;
  v_stage_reached text; v_stage_rank int;
  v_result jsonb;
begin
  select * into v_run from public.retro_runs where id = p_run_id for update;
  if not found or not public.retro_run_owned(v_run, p_anon_token) then
    raise exception 'run não encontrada';
  end if;
  if v_run.status <> 'playing' then raise exception 'run já encerrada'; end if;

  select * into v_rm from public.retro_run_matches
   where run_id = v_run.id and slot = v_run.current_slot for update;
  if not found then raise exception 'jogo ainda não servido — chame retro_next'; end if;
  if v_rm.answered_at is not null then raise exception 'slot já respondido'; end if;

  select * into v_m from public.retro_matches where id = v_rm.match_id;

  v_timeout := (v_rm.deadline_at is not null and now() > v_rm.deadline_at + interval '2 seconds')
               or p_home is null or p_away is null;
  if v_timeout then
    v_type := 'erro'; v_pts := 0;
  else
    v_type := public.compute_score_type(p_home, p_away, v_m.home_score, v_m.away_score);
    v_pts := public.score_points(v_type);
  end if;

  update public.retro_run_matches
     set guess_home = case when v_timeout then null else p_home end,
         guess_away = case when v_timeout then null else p_away end,
         answered_at = now(), is_timeout = v_timeout,
         score_type = v_type, points = v_pts
   where run_id = v_run.id and slot = v_run.current_slot;
  if v_pts > 0 then
    update public.retro_matches set scored_count = scored_count + 1 where id = v_m.id;
  end if;
  -- cravada = +1 ficha de re-sorteio 🎲 (rodada 5)
  update public.retro_runs
     set points = points + v_pts,
         rerolls = rerolls + case when v_type = 'cravada' then 1 else 0 end
   where id = v_run.id returning * into v_run;

  v_need := public.retro_pass_need(v_run.mode, v_run.current_slot);
  v_passed := v_pts >= v_need;

  if v_run.current_slot < 3 then
    null; -- grupos: joga os 3 sempre (jogo de honra incluído)
  elsif v_run.current_slot = 3 then
    select count(*) into v_group_passes from public.retro_run_matches
     where run_id = v_run.id and slot <= 3
       and points >= public.retro_pass_need(v_run.mode, 1);
    if v_group_passes < 2 then
      v_finish_status := 'eliminated'; v_stage_reached := 'Fase de grupos'; v_stage_rank := 1;
    end if;
  elsif v_run.current_slot < 7 then
    if not v_passed then
      v_finish_status := 'eliminated';
      v_stage_reached := public.retro_slot_label(v_run.current_slot);
      v_stage_rank := v_run.current_slot - 2;
    end if;
  else
    if v_passed then
      v_finish_status := 'champion'; v_stage_reached := 'Campeão 🏆'; v_stage_rank := 6;
    else
      v_finish_status := 'eliminated'; v_stage_reached := 'Vice-campeão'; v_stage_rank := 5;
    end if;
  end if;

  if v_finish_status is not null then
    update public.retro_runs
       set status = v_finish_status, stage_reached = v_stage_reached, stage_rank = v_stage_rank,
           finished_at = now(),
           total_ms = (select coalesce(sum(least(
                         extract(epoch from (rm2.answered_at - rm2.served_at)) * 1000,
                         coalesce(extract(epoch from (rm2.deadline_at - rm2.served_at)) * 1000 + 2000,
                                  extract(epoch from (rm2.answered_at - rm2.served_at)) * 1000)
                       ))::bigint, 0)
                       from public.retro_run_matches rm2
                       where rm2.run_id = v_run.id and rm2.answered_at is not null)
     where id = v_run.id returning * into v_run;
    if v_run.user_id is null then
      insert into public.retro_usage_daily as u (day, anon_runs_finished)
      values ((now() at time zone 'America/Sao_Paulo')::date, 1)
      on conflict (day) do update set anon_runs_finished = u.anon_runs_finished + 1;
    end if;
  else
    update public.retro_runs set current_slot = current_slot + 1
     where id = v_run.id returning * into v_run;
  end if;

  v_result := jsonb_build_object(
    'home_score', v_m.home_score, 'away_score', v_m.away_score,
    'pens_home', v_m.pens_home, 'pens_away', v_m.pens_away,
    'went_extra_time', v_m.went_extra_time,
    'score_type', v_type, 'points', v_pts, 'timeout', v_timeout, 'passed', v_passed,
    'reroll_earned', v_type = 'cravada');

  return jsonb_build_object(
    'result', v_result,
    'run', jsonb_build_object('id', v_run.id, 'status', v_run.status, 'points', v_run.points,
      'stage_reached', v_run.stage_reached, 'stage_rank', v_run.stage_rank,
      'total_ms', v_run.total_ms, 'share_code', v_run.share_code, 'slot', v_run.current_slot,
      'rerolls', v_run.rerolls),
    'next', null);
end $$;

-- 🎲 troca o jogo ATUAL da run (gasta 1 ficha; cronômetro renasce no novo jogo)
create or replace function public.retro_reroll(
  p_run_id uuid,
  p_anon_token uuid default null,
  p_seen uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.retro_runs;
  v_rm public.retro_run_matches;
begin
  select * into v_run from public.retro_runs where id = p_run_id for update;
  if not found or not public.retro_run_owned(v_run, p_anon_token) then
    raise exception 'run não encontrada';
  end if;
  if v_run.status <> 'playing' then raise exception 'run já encerrada'; end if;
  if v_run.rerolls < 1 then raise exception 'sem fichas de troca — crave um placar para ganhar 🎲'; end if;

  select * into v_rm from public.retro_run_matches
   where run_id = v_run.id and slot = v_run.current_slot for update;
  if not found then raise exception 'jogo ainda não servido — chame retro_next'; end if;
  if v_rm.answered_at is not null then raise exception 'slot já respondido'; end if;

  update public.retro_runs set rerolls = rerolls - 1
   where id = v_run.id returning * into v_run;
  delete from public.retro_run_matches where run_id = v_run.id and slot = v_run.current_slot;
  -- exclui o jogo trocado do novo sorteio
  perform public.retro_serve_slot(v_run, v_run.current_slot,
                                  coalesce(p_seen, '{}') || v_rm.match_id);
  return public.retro_match_payload(v_run, v_run.current_slot)
         || jsonb_build_object('rerolls', v_run.rerolls);
end $$;
revoke execute on function public.retro_reroll(uuid, uuid, uuid[]) from public;
grant execute on function public.retro_reroll(uuid, uuid, uuid[]) to anon, authenticated;

-- ranking ganha o quadro de TREINO (melhor campanha de cada um; logado + resultadista)
create or replace function public.retro_leaderboard(
  p_daily_date date default null,
  p_mode text default 'acerto',
  p_limit int default 50,
  p_board text default 'daily'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := coalesce(p_daily_date, (now() at time zone 'America/Sao_Paulo')::date);
  v_rows jsonb; v_me jsonb;
begin
  if p_board = 'treino' then
    with best as (
      select distinct on (r.user_id) r.*
        from public.retro_runs r
       where not r.is_daily and r.pace = 'resultadista' and r.user_id is not null
         and r.status <> 'playing' and r.mode = p_mode
       order by r.user_id, r.stage_rank desc, r.points desc, r.total_ms asc
    ), ranked as (
      select b.*, row_number() over (order by b.stage_rank desc, b.points desc, b.total_ms asc) as pos
        from best b
    )
    select jsonb_agg(jsonb_build_object(
             'pos', rk.pos, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
             'stage_reached', rk.stage_reached, 'points', rk.points, 'total_ms', rk.total_ms,
             'is_me', rk.user_id = auth.uid()) order by rk.pos)
      into v_rows
      from ranked rk join public.profiles p on p.id = rk.user_id
     where p.show_in_global_ranking and rk.pos <= least(coalesce(p_limit, 50), 100);

    if auth.uid() is not null then
      with best as (
        select distinct on (r.user_id) r.*
          from public.retro_runs r
         where not r.is_daily and r.pace = 'resultadista' and r.user_id is not null
           and r.status <> 'playing' and r.mode = p_mode
         order by r.user_id, r.stage_rank desc, r.points desc, r.total_ms asc
      ), ranked as (
        select b.user_id, b.stage_reached, b.points, b.total_ms,
               row_number() over (order by b.stage_rank desc, b.points desc, b.total_ms asc) as pos
          from best b
      )
      select jsonb_build_object('pos', pos, 'stage_reached', stage_reached,
                                'points', points, 'total_ms', total_ms) into v_me
        from ranked where user_id = auth.uid();
    end if;

    return jsonb_build_object('board', 'treino', 'mode', p_mode,
                              'rows', coalesce(v_rows, '[]'::jsonb), 'me', v_me);
  end if;

  select jsonb_agg(row_data) into v_rows from (
    select jsonb_build_object(
      'pos', row_number() over (order by r.stage_rank desc, r.points desc, r.total_ms asc),
      'display_name', p.display_name, 'avatar_url', p.avatar_url,
      'stage_reached', r.stage_reached, 'points', r.points, 'total_ms', r.total_ms,
      'is_me', r.user_id = auth.uid()) as row_data
    from public.retro_runs r
    join public.profiles p on p.id = r.user_id
    where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.mode = p_mode
      and p.show_in_global_ranking
    order by r.stage_rank desc, r.points desc, r.total_ms asc
    limit least(coalesce(p_limit, 50), 100)
  ) t;

  if auth.uid() is not null then
    select jsonb_build_object('pos', pos, 'stage_reached', stage_reached,
                              'points', points, 'total_ms', total_ms) into v_me
    from (select r.user_id, r.stage_reached, r.points, r.total_ms,
                 row_number() over (order by r.stage_rank desc, r.points desc, r.total_ms asc) as pos
            from public.retro_runs r
           where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.mode = p_mode) t
    where t.user_id = auth.uid();
  end if;

  return jsonb_build_object('board', 'daily', 'daily_date', v_date, 'mode', p_mode,
                            'rows', coalesce(v_rows, '[]'::jsonb), 'me', v_me);
end $$;
revoke execute on function public.retro_leaderboard(date, text, int, text) from public;
grant execute on function public.retro_leaderboard(date, text, int, text) to anon, authenticated;
drop function if exists public.retro_leaderboard(date, text, int);

-- melhor campanha do perfil agora considera TODAS as runs concluídas (daily + treino)
create or replace function public.retro_my_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_streak int := 0;
  v_d date;
  v_best jsonb;
  v_played_today boolean;
begin
  if v_user is null then
    return jsonb_build_object('streak', 0, 'best', null, 'played_today', false);
  end if;

  select exists (select 1 from public.retro_runs
    where user_id = v_user and is_daily and daily_date = v_today) into v_played_today;

  v_d := case when v_played_today then v_today else v_today - 1 end;
  while exists (select 1 from public.retro_runs
    where user_id = v_user and is_daily and daily_date = v_d
      and (status <> 'playing' or daily_date = v_today)) loop
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  end loop;

  select jsonb_build_object('stage_reached', stage_reached, 'stage_rank', stage_rank,
                            'points', points, 'total_ms', total_ms, 'daily_date', daily_date)
    into v_best
  from public.retro_runs
  where user_id = v_user and status <> 'playing'
  order by stage_rank desc, points desc, total_ms asc
  limit 1;

  return jsonb_build_object('streak', v_streak, 'best', v_best, 'played_today', v_played_today);
end $$;
