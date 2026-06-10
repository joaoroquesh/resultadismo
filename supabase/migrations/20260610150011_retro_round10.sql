-- Retrô — rodada 10 (SIMPLIFICAÇÃO + decisões do PO, 10/06):
-- 1) FORMATO substitui o antigo "modo": 'copa' (eliminatório, como hoje) e 'pontos'
--    (joga os 7 jogos sempre, soma — quem faz mais pontos lidera). Resolve a queixa de
--    "cravei tudo nos grupos e caí, e quem só acertou foi mais longe".
-- 2) TOGGLE ADMIN (retro_config): exigir saldo/cravada nas fases finais do modo Copa —
--    DESLIGADO por padrão (qualquer ponto avança em tudo). Admin liga e escolhe os mínimos.
-- 3) BUG do reroll na Copa do Dia: serve_slot no daily devolvia o MESMO jogo do dia;
--    agora o reroll força sorteio aleatório (troca de verdade nos dois formatos).
-- 4) Dificuldade do Treino: a UI passa a oferecer só Fácil/Difícil (o valor 'padrao'
--    segue válido no banco p/ a Copa do Dia, que tem curva própria).

-- ---------- colunas / config ----------
alter table public.retro_runs
  add column if not exists format text not null default 'copa'
    check (format in ('copa', 'pontos'));

-- status ganha 'finished' (fim do modo Pontos — não é campeão/eliminado)
alter table public.retro_runs drop constraint if exists retro_runs_status_check;
alter table public.retro_runs add constraint retro_runs_status_check
  check (status in ('playing', 'eliminated', 'champion', 'finished'));

create table if not exists public.retro_config (
  id int primary key default 1 check (id = 1),
  enforce_knockout_bar boolean not null default false,
  semi_min text not null default 'saldo' check (semi_min in ('acerto', 'saldo', 'cravada')),
  final_min text not null default 'cravada' check (final_min in ('acerto', 'saldo', 'cravada')),
  updated_at timestamptz not null default now()
);
insert into public.retro_config (id) values (1) on conflict (id) do nothing;
alter table public.retro_config enable row level security; -- leitura/escrita só via RPC

-- unicidade da Copa do Dia: 1 por conta POR FORMATO (Copa e Pontos são desafios distintos)
drop index if exists public.retro_runs_one_daily_per_user;
create unique index retro_runs_one_daily_per_user
  on public.retro_runs (user_id, daily_date, format) where is_daily and user_id is not null;

-- mínimo de pontos para um rótulo de exigência
create or replace function public.retro_min_points(p_label text) returns int
language sql immutable as $$
  select case p_label when 'cravada' then 3 when 'saldo' then 2 else 1 end
$$;

-- config pública (o jogo precisa saber se mostra a regra de saldo/cravada)
create or replace function public.retro_get_config() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object('enforce_knockout_bar', enforce_knockout_bar,
                            'semi_min', semi_min, 'final_min', final_min)
  from public.retro_config where id = 1
$$;
revoke execute on function public.retro_get_config() from public;
grant execute on function public.retro_get_config() to anon, authenticated;

-- admin: ler/gravar a config
create or replace function public.retro_admin_set_config(
  p_enforce boolean, p_semi_min text default 'saldo', p_final_min text default 'cravada'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'só admin'; end if;
  if p_semi_min not in ('acerto','saldo','cravada') or p_final_min not in ('acerto','saldo','cravada') then
    raise exception 'mínimo inválido';
  end if;
  update public.retro_config
     set enforce_knockout_bar = p_enforce, semi_min = p_semi_min,
         final_min = p_final_min, updated_at = now()
   where id = 1;
  return public.retro_get_config();
end $$;
revoke execute on function public.retro_admin_set_config(boolean, text, text) from public, anon;
grant execute on function public.retro_admin_set_config(boolean, text, text) to authenticated;

-- ---------- serve_slot com força de sorteio (fix do reroll no daily) ----------
create or replace function public.retro_serve_slot(
  p_run public.retro_runs, p_slot int, p_seen uuid[], p_force_random boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_match uuid; v_timer int; v_daily uuid[]; v_exclude uuid[];
begin
  if p_run.is_daily and not p_force_random then
    v_daily := public.retro_make_daily(p_run.daily_date);
    v_match := v_daily[p_slot];
  else
    select coalesce(array_agg(match_id), '{}') into v_exclude
      from public.retro_run_matches where run_id = p_run.id;
    -- no reroll do daily, também exclui os 7 jogos do dia (pra não repetir o tema)
    if p_run.is_daily then
      v_exclude := v_exclude || coalesce(public.retro_make_daily(p_run.daily_date), '{}');
    end if;
    v_exclude := v_exclude || coalesce(p_seen, '{}');
    v_match := public.retro_pick_match(p_slot, v_exclude, p_run.level);
  end if;
  v_timer := public.retro_timer_seconds(p_run.pace, p_slot);
  insert into public.retro_run_matches (run_id, slot, match_id, deadline_at)
  values (p_run.id, p_slot, v_match,
          case when v_timer is null then null else now() + make_interval(secs => v_timer + 1.5) end);
  update public.retro_matches set shown_count = shown_count + 1 where id = v_match;
end $$;
revoke execute on function public.retro_serve_slot(public.retro_runs, int, uuid[], boolean) from public, anon, authenticated;
drop function if exists public.retro_serve_slot(public.retro_runs, int, uuid[]);

create or replace function public.retro_reroll(
  p_run_id uuid, p_anon_token uuid default null, p_seen uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_run public.retro_runs; v_rm public.retro_run_matches;
begin
  select * into v_run from public.retro_runs where id = p_run_id for update;
  if not found or not public.retro_run_owned(v_run, p_anon_token) then raise exception 'run não encontrada'; end if;
  if v_run.status <> 'playing' then raise exception 'run já encerrada'; end if;
  if v_run.rerolls < 1 then raise exception 'sem fichas de troca — crave um placar para ganhar 🎲'; end if;
  select * into v_rm from public.retro_run_matches
   where run_id = v_run.id and slot = v_run.current_slot for update;
  if not found then raise exception 'jogo ainda não servido — chame retro_next'; end if;
  if v_rm.answered_at is not null then raise exception 'slot já respondido'; end if;

  update public.retro_runs set rerolls = rerolls - 1 where id = v_run.id returning * into v_run;
  delete from public.retro_run_matches where run_id = v_run.id and slot = v_run.current_slot;
  -- FORÇA sorteio aleatório (corrige: no daily voltava o mesmo jogo)
  perform public.retro_serve_slot(v_run, v_run.current_slot,
                                  coalesce(p_seen, '{}') || v_rm.match_id, true);
  return public.retro_match_payload(v_run, v_run.current_slot)
         || jsonb_build_object('rerolls', v_run.rerolls);
end $$;
revoke execute on function public.retro_reroll(uuid, uuid, uuid[]) from public;
grant execute on function public.retro_reroll(uuid, uuid, uuid[]) to anon, authenticated;

-- ---------- start com formato ----------
create or replace function public.retro_start_run(
  p_mode text default 'acerto',
  p_pace text default 'resultadista',
  p_daily boolean default true,
  p_anon_token uuid default null,
  p_seen uuid[] default '{}',
  p_level text default 'padrao',
  p_format text default 'copa'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_run public.retro_runs;
begin
  if p_format not in ('copa','pontos') then raise exception 'formato inválido'; end if;
  if p_pace not in ('resultadista','classico','sempressa') then raise exception 'ritmo inválido'; end if;
  if p_level not in ('facil','padrao','dificil') then raise exception 'dificuldade inválida'; end if;
  if v_user is null and p_anon_token is null then raise exception 'anônimo precisa de anon_token'; end if;
  if array_length(p_seen, 1) > 60 then p_seen := p_seen[1:60]; end if;

  if v_user is null and (select count(*) from public.retro_runs
       where anon_token = p_anon_token and started_at > now() - interval '1 hour') >= 30 then
    raise exception 'muitas partidas seguidas — respira, toma uma água e volta já 😉';
  end if;

  if p_daily and v_user is not null then
    select * into v_run from public.retro_runs
     where user_id = v_user and is_daily and daily_date = v_today and format = p_format;
    if found then
      if v_run.status = 'playing' then
        return jsonb_build_object('run_id', v_run.id, 'share_code', v_run.share_code,
          'format', v_run.format, 'pace', v_run.pace, 'resumed', true, 'points', v_run.points,
          'rerolls', v_run.rerolls, 'current', public.retro_match_payload(v_run, v_run.current_slot));
      end if;
      raise exception 'você já jogou a Copa do Dia (%) de hoje — volte amanhã (ou jogue o Treino)', p_format;
    end if;
  end if;

  insert into public.retro_runs (user_id, anon_token, is_daily, daily_date, mode, pace, ranked, persistent, level, format)
  values (v_user, case when v_user is null then p_anon_token end,
          p_daily, case when p_daily then v_today end, 'acerto', p_pace,
          p_daily and v_user is not null and p_pace = 'resultadista',
          v_user is not null, case when p_daily then 'padrao' else p_level end, p_format)
  returning * into v_run;

  if v_user is null then
    insert into public.retro_usage_daily as u (day, anon_runs_started) values (v_today, 1)
    on conflict (day) do update set anon_runs_started = u.anon_runs_started + 1;
  end if;

  perform public.retro_serve_slot(v_run, 1, p_seen);
  return jsonb_build_object('run_id', v_run.id, 'share_code', v_run.share_code,
    'format', v_run.format, 'pace', v_run.pace, 'ranked', v_run.ranked, 'resumed', false,
    'points', 0, 'rerolls', 0, 'current', public.retro_match_payload(v_run, 1));
end $$;
drop function if exists public.retro_start_run(text, text, boolean, uuid, uuid[], text);
revoke execute on function public.retro_start_run(text, text, boolean, uuid, uuid[], text, text) from public;
grant execute on function public.retro_start_run(text, text, boolean, uuid, uuid[], text, text) to anon, authenticated;

-- ---------- answer: ramifica por formato ----------
create or replace function public.retro_answer(
  p_run_id uuid, p_home int default null, p_away int default null,
  p_anon_token uuid default null, p_seen uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.retro_runs; v_rm public.retro_run_matches; v_m public.retro_matches;
  v_timeout boolean; v_type public.score_type; v_pts int := 0;
  v_need int; v_passed boolean; v_group_passes int;
  v_finish_status text := null; v_stage_reached text; v_stage_rank int;
  v_cfg public.retro_config; v_result jsonb;
begin
  select * into v_run from public.retro_runs where id = p_run_id for update;
  if not found or not public.retro_run_owned(v_run, p_anon_token) then raise exception 'run não encontrada'; end if;
  if v_run.status <> 'playing' then raise exception 'run já encerrada'; end if;
  select * into v_rm from public.retro_run_matches where run_id = v_run.id and slot = v_run.current_slot for update;
  if not found then raise exception 'jogo ainda não servido — chame retro_next'; end if;
  if v_rm.answered_at is not null then raise exception 'slot já respondido'; end if;
  select * into v_m from public.retro_matches where id = v_rm.match_id;

  v_timeout := (v_rm.deadline_at is not null and now() > v_rm.deadline_at + interval '2 seconds')
               or p_home is null or p_away is null;
  if v_timeout then v_type := 'erro'; v_pts := 0;
  else v_type := public.compute_score_type(p_home, p_away, v_m.home_score, v_m.away_score);
       v_pts := public.score_points(v_type); end if;

  update public.retro_run_matches
     set guess_home = case when v_timeout then null else p_home end,
         guess_away = case when v_timeout then null else p_away end,
         answered_at = now(), is_timeout = v_timeout, score_type = v_type, points = v_pts
   where run_id = v_run.id and slot = v_run.current_slot;
  if v_pts > 0 then update public.retro_matches set scored_count = scored_count + 1 where id = v_m.id; end if;
  update public.retro_runs
     set points = points + v_pts,
         rerolls = rerolls + case when v_type = 'cravada' then 1 else 0 end
   where id = v_run.id returning * into v_run;

  if v_run.format = 'pontos' then
    -- joga os 7 sempre; sem eliminação. fim no 7º.
    v_passed := true;
    if v_run.current_slot >= 7 then v_finish_status := 'finished'; v_stage_reached := null; v_stage_rank := null; end if;
  else
    -- COPA (eliminatório). barra lê a config (default: ≥1 em tudo)
    select * into v_cfg from public.retro_config where id = 1;
    if v_run.current_slot >= 6 and v_cfg.enforce_knockout_bar then
      v_need := public.retro_min_points(case when v_run.current_slot = 6 then v_cfg.semi_min else v_cfg.final_min end);
    else
      v_need := 1;
    end if;
    v_passed := v_pts >= v_need;

    if v_run.current_slot < 3 then null;  -- grupos: joga os 3
    elsif v_run.current_slot = 3 then
      select count(*) into v_group_passes from public.retro_run_matches
       where run_id = v_run.id and slot <= 3 and points >= 1;
      if v_group_passes < 2 then v_finish_status := 'eliminated'; v_stage_reached := 'Fase de grupos'; v_stage_rank := 1; end if;
    elsif v_run.current_slot < 7 then
      if not v_passed then v_finish_status := 'eliminated';
        v_stage_reached := public.retro_slot_label(v_run.current_slot); v_stage_rank := v_run.current_slot - 2; end if;
    else
      if v_passed then v_finish_status := 'champion'; v_stage_reached := 'Campeão 🏆'; v_stage_rank := 6;
      else v_finish_status := 'eliminated'; v_stage_reached := 'Vice-campeão'; v_stage_rank := 5; end if;
    end if;
  end if;

  if v_finish_status is not null then
    update public.retro_runs
       set status = v_finish_status, stage_reached = v_stage_reached, stage_rank = v_stage_rank, finished_at = now(),
           total_ms = (select coalesce(sum(least(
                         extract(epoch from (rm2.answered_at - rm2.served_at)) * 1000,
                         coalesce(extract(epoch from (rm2.deadline_at - rm2.served_at)) * 1000 + 2000,
                                  extract(epoch from (rm2.answered_at - rm2.served_at)) * 1000)))::bigint, 0)
                       from public.retro_run_matches rm2 where rm2.run_id = v_run.id and rm2.answered_at is not null)
     where id = v_run.id returning * into v_run;
    if v_run.user_id is null then
      insert into public.retro_usage_daily as u (day, anon_runs_finished)
      values ((now() at time zone 'America/Sao_Paulo')::date, 1)
      on conflict (day) do update set anon_runs_finished = u.anon_runs_finished + 1;
    end if;
  else
    update public.retro_runs set current_slot = current_slot + 1 where id = v_run.id returning * into v_run;
  end if;

  v_result := jsonb_build_object(
    'home_score', v_m.home_score, 'away_score', v_m.away_score,
    'pens_home', v_m.pens_home, 'pens_away', v_m.pens_away, 'went_extra_time', v_m.went_extra_time,
    'score_type', v_type, 'points', v_pts, 'timeout', v_timeout, 'passed', v_passed,
    'reroll_earned', v_type = 'cravada');
  return jsonb_build_object(
    'result', v_result,
    'run', jsonb_build_object('id', v_run.id, 'status', v_run.status, 'format', v_run.format,
      'points', v_run.points, 'stage_reached', v_run.stage_reached, 'stage_rank', v_run.stage_rank,
      'total_ms', v_run.total_ms, 'share_code', v_run.share_code, 'slot', v_run.current_slot,
      'rerolls', v_run.rerolls),
    'next', null);
end $$;

-- ---------- summary/leaderboard/my_stats com formato ----------
create or replace function public.retro_run_summary(p_share_code text) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'format', r.format, 'pace', r.pace, 'status', r.status,
    'stage_reached', r.stage_reached, 'points', r.points, 'total_ms', r.total_ms,
    'is_daily', r.is_daily, 'daily_date', r.daily_date, 'finished_at', r.finished_at,
    'player', case when r.user_id is not null
      then (select jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url)
              from public.profiles p where p.id = r.user_id) end,
    'slots', (select jsonb_agg(jsonb_build_object(
        'slot', rm.slot, 'slot_label', public.retro_slot_label(rm.slot),
        'score_type', rm.score_type, 'points', rm.points, 'timeout', rm.is_timeout) order by rm.slot)
      from public.retro_run_matches rm where rm.run_id = r.id and rm.answered_at is not null))
  from public.retro_runs r where r.share_code = p_share_code and r.status <> 'playing'
$$;
revoke execute on function public.retro_run_summary(text) from public;
grant execute on function public.retro_run_summary(text) to anon, authenticated;

-- ranking por FORMATO: Copa ordena por fase→pontos→tempo; Pontos por pontos→tempo.
drop function if exists public.retro_leaderboard(date, text, int, text);
create or replace function public.retro_leaderboard(
  p_daily_date date default null, p_format text default 'copa',
  p_limit int default 50, p_board text default 'daily'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := coalesce(p_daily_date, (now() at time zone 'America/Sao_Paulo')::date);
  v_rows jsonb; v_me jsonb; v_pontos boolean := (p_format = 'pontos');
begin
  if p_board = 'treino' then
    with scored as (
      select r.*, case r.level when 'dificil' then 3 when 'padrao' then 2 else 1 end as lvl_rank
        from public.retro_runs r
       where not r.is_daily and r.pace = 'resultadista' and r.user_id is not null
         and r.status <> 'playing' and r.format = p_format
    ), best as (
      select distinct on (user_id) * from scored
       order by user_id, lvl_rank desc,
                case when v_pontos then 0 else coalesce(stage_rank,0) end desc,
                points desc, total_ms asc
    ), ranked as (
      select b.*, row_number() over (
               order by b.lvl_rank desc,
                        case when v_pontos then 0 else coalesce(b.stage_rank,0) end desc,
                        b.points desc, b.total_ms asc) as pos
        from best b
    )
    select jsonb_agg(jsonb_build_object(
             'pos', rk.pos, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
             'stage_reached', rk.stage_reached, 'points', rk.points, 'total_ms', rk.total_ms,
             'level', rk.level, 'is_me', rk.user_id = auth.uid()) order by rk.pos)
      into v_rows from ranked rk join public.profiles p on p.id = rk.user_id
     where p.show_in_global_ranking and rk.pos <= least(coalesce(p_limit, 50), 100);
    return jsonb_build_object('board', 'treino', 'format', p_format,
                              'rows', coalesce(v_rows, '[]'::jsonb), 'me', null);
  end if;

  select jsonb_agg(row_data) into v_rows from (
    select jsonb_build_object(
      'pos', row_number() over (
        order by case when v_pontos then 0 else coalesce(r.stage_rank,0) end desc, r.points desc, r.total_ms asc),
      'display_name', p.display_name, 'avatar_url', p.avatar_url,
      'stage_reached', r.stage_reached, 'points', r.points, 'total_ms', r.total_ms,
      'is_me', r.user_id = auth.uid()) as row_data
    from public.retro_runs r join public.profiles p on p.id = r.user_id
    where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.format = p_format
      and p.show_in_global_ranking
    order by case when v_pontos then 0 else coalesce(r.stage_rank,0) end desc, r.points desc, r.total_ms asc
    limit least(coalesce(p_limit, 50), 100)
  ) t;

  if auth.uid() is not null then
    select jsonb_build_object('pos', pos, 'stage_reached', stage_reached, 'points', points, 'total_ms', total_ms) into v_me
    from (select r.user_id, r.stage_reached, r.points, r.total_ms,
                 row_number() over (
                   order by case when v_pontos then 0 else coalesce(r.stage_rank,0) end desc, r.points desc, r.total_ms asc) as pos
            from public.retro_runs r
           where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.format = p_format) t
    where t.user_id = auth.uid();
  end if;
  return jsonb_build_object('board', 'daily', 'format', p_format, 'daily_date', v_date,
                            'rows', coalesce(v_rows, '[]'::jsonb), 'me', v_me);
end $$;
revoke execute on function public.retro_leaderboard(date, text, int, text) from public;
grant execute on function public.retro_leaderboard(date, text, int, text) to anon, authenticated;

-- melhor campanha do perfil: por pontos (funciona p/ os dois formatos)
create or replace function public.retro_my_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid(); v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_streak int := 0; v_d date; v_best jsonb; v_played_today boolean;
begin
  if v_user is null then return jsonb_build_object('streak', 0, 'best', null, 'played_today', false); end if;
  select exists (select 1 from public.retro_runs where user_id = v_user and is_daily and daily_date = v_today)
    into v_played_today;
  v_d := case when v_played_today then v_today else v_today - 1 end;
  while exists (select 1 from public.retro_runs
    where user_id = v_user and is_daily and daily_date = v_d and (status <> 'playing' or daily_date = v_today)) loop
    v_streak := v_streak + 1; v_d := v_d - 1;
  end loop;
  select jsonb_build_object('stage_reached', stage_reached, 'points', points, 'total_ms', total_ms,
                            'format', format, 'daily_date', daily_date) into v_best
    from public.retro_runs where user_id = v_user and status <> 'playing'
    order by points desc, total_ms asc limit 1;
  return jsonb_build_object('streak', v_streak, 'best', v_best, 'played_today', v_played_today);
end $$;
