-- Retrô — rodada 6 (decisões do PO, 10/06):
-- 1) RESET do ranking e da Copa do Dia (ordem explícita do PO: "restarte o ranking"):
--    apaga todas as runs e os desafios diários — recomeço limpo no novo formato.
-- 2) COPA DO DIA TEMÁTICA: cada dia é a Copa de UMA seleção (hoje 10/06 = BRASIL;
--    rotação diária determinística entre as seleções com ≥7 jogos na história),
--    com os 7 jogos ordenados do MAIS FÁCIL ao MAIS DIFÍCIL.
-- 3) DIFICULDADE DO TREINO: fácil (janelas -1) · padrão (atual) · difícil (janelas +1).
--    Ranking de Treino só conta o PADRÃO (comparável). A Copa do Dia ignora (é fixa).
-- 4) Ritmo "clássico" sai da UI (valor segue aceito no banco p/ histórico).

-- 1. reset
truncate public.retro_run_matches, public.retro_runs, public.retro_daily;

-- 2. colunas novas
alter table public.retro_daily
  add column if not exists team_slug text,
  add column if not exists team_name_pt text;
alter table public.retro_runs
  add column if not exists level text not null default 'padrao'
    check (level in ('facil', 'padrao', 'dificil'));

-- sorteio com nível de dificuldade do Treino (janelas deslocam ±1)
create or replace function public.retro_pick_match(p_slot int, p_exclude uuid[], p_level text default 'padrao')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_lo int; v_hi int; v_lvl int; v_r numeric; v_id uuid; v_shift int;
begin
  select case when p_slot <= 3 then 1 when p_slot = 4 then 2 when p_slot in (5, 6) then 3 else 4 end,
         case when p_slot <= 3 then 3 when p_slot = 4 then 4 when p_slot in (5, 6) then 5 else 6 end
    into v_lo, v_hi;
  v_shift := case p_level when 'facil' then -1 when 'dificil' then 1 else 0 end;
  v_lo := greatest(1, least(7, v_lo + v_shift));
  v_hi := greatest(v_lo, least(7, v_hi + v_shift));

  if random() < 0.10 then
    select id into v_id from public.retro_matches
     where (difficulty < v_lo or difficulty > v_hi) and id <> all(coalesce(p_exclude, '{}'))
     order by random() limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  v_r := random() * 100;
  if p_slot <= 3 then
    v_lvl := case when v_r < 45 then v_lo when v_r < 80 then least(v_hi, v_lo + 1) else v_hi end;
  else
    v_lvl := case when v_r < 40 then v_lo when v_r < 75 then least(v_hi, v_lo + 1) else v_hi end;
  end if;

  select id into v_id from public.retro_matches
   where difficulty = v_lvl and id <> all(coalesce(p_exclude, '{}'))
   order by random() limit 1;
  if v_id is null then
    select id into v_id from public.retro_matches
     where difficulty between v_lo and v_hi and id <> all(coalesce(p_exclude, '{}'))
     order by random() limit 1;
  end if;
  return v_id;
end $$;
revoke execute on function public.retro_pick_match(int, uuid[], text) from public, anon, authenticated;
drop function if exists public.retro_pick_match(int, uuid[]);

-- a seleção do dia: rotação determinística (dia 0 = 2026-06-10 = brasil) entre
-- as seleções com ≥7 jogos; 7 jogos sorteados e ordenados do fácil ao difícil
create or replace function public.retro_make_daily(p_date date) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[]; v_slug text; v_name text;
  v_n int; v_idx int; v_pos_brasil int;
begin
  select match_ids into v_ids from public.retro_daily where daily_date = p_date;
  if v_ids is not null then return v_ids; end if;
  perform pg_advisory_xact_lock(hashtext('retro_daily_' || p_date::text));
  select match_ids into v_ids from public.retro_daily where daily_date = p_date;
  if v_ids is not null then return v_ids; end if;

  -- elegíveis (≥7 jogos), ordenadas por nº de jogos (desc) p/ rotação estável
  create temp table _eleg on commit drop as
    select slug, name_pt, jogos,
           row_number() over (order by jogos desc, slug) - 1 as pos
      from (
        select t.slug,
               max(t.name_pt) as name_pt,
               count(*) as jogos
          from (
            select home_slug as slug, home_name_pt as name_pt from public.retro_matches
            union all
            select away_slug, away_name_pt from public.retro_matches
          ) t
         group by t.slug
        having count(*) >= 7
      ) q;

  select count(*) into v_n from _eleg;
  select pos into v_pos_brasil from _eleg where slug = 'brasil';
  v_idx := ((p_date - date '2026-06-10') + coalesce(v_pos_brasil, 0)) % v_n;
  if v_idx < 0 then v_idx := v_idx + v_n; end if;
  select slug, name_pt into v_slug, v_name from _eleg where pos = v_idx;

  -- 7 jogos da seleção, ordenados do mais fácil ao mais difícil
  select array_agg(id order by difficulty asc, rnd asc) into v_ids
    from (
      select id, difficulty, random() as rnd
        from public.retro_matches
       where home_slug = v_slug or away_slug = v_slug
       order by random()
       limit 7
    ) pick;

  insert into public.retro_daily (daily_date, match_ids, team_slug, team_name_pt)
  values (p_date, v_ids, v_slug, v_name);
  return v_ids;
end $$;
revoke execute on function public.retro_make_daily(date) from public, anon, authenticated;

-- "qual é a Copa do Dia de hoje?" (cria lazy e devolve só o TEMA — sem jogos)
create or replace function public.retro_today() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_row public.retro_daily;
begin
  perform public.retro_make_daily(v_today);
  select * into v_row from public.retro_daily where daily_date = v_today;
  return jsonb_build_object('daily_date', v_row.daily_date,
                            'team_slug', v_row.team_slug, 'team_name_pt', v_row.team_name_pt);
end $$;
revoke execute on function public.retro_today() from public;
grant execute on function public.retro_today() to anon, authenticated;

-- serve_slot passa o nível do treino pro sorteio
create or replace function public.retro_serve_slot(p_run public.retro_runs, p_slot int, p_seen uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v_match uuid; v_timer int; v_daily uuid[]; v_exclude uuid[];
begin
  if p_run.is_daily then
    v_daily := public.retro_make_daily(p_run.daily_date);
    v_match := v_daily[p_slot];
  else
    select coalesce(array_agg(match_id), '{}') into v_exclude
      from public.retro_run_matches where run_id = p_run.id;
    v_exclude := v_exclude || coalesce(p_seen, '{}');
    v_match := public.retro_pick_match(p_slot, v_exclude, p_run.level);
  end if;
  v_timer := public.retro_timer_seconds(p_run.pace, p_slot);
  insert into public.retro_run_matches (run_id, slot, match_id, deadline_at)
  values (p_run.id, p_slot, v_match,
          case when v_timer is null then null else now() + make_interval(secs => v_timer + 1.5) end);
  update public.retro_matches set shown_count = shown_count + 1 where id = v_match;
end $$;
revoke execute on function public.retro_serve_slot(public.retro_runs, int, uuid[]) from public, anon, authenticated;

-- start ganha o nível do Treino (daily força 'padrao'); UI só oferece 2 ritmos
create or replace function public.retro_start_run(
  p_mode text default 'acerto',
  p_pace text default 'resultadista',
  p_daily boolean default true,
  p_anon_token uuid default null,
  p_seen uuid[] default '{}',
  p_level text default 'padrao'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_run public.retro_runs;
begin
  if p_mode not in ('acerto','cravada') or p_pace not in ('resultadista','classico','sempressa')
     or p_level not in ('facil','padrao','dificil') then
    raise exception 'modo, ritmo ou dificuldade inválida';
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

  insert into public.retro_runs (user_id, anon_token, is_daily, daily_date, mode, pace, ranked, persistent, level)
  values (v_user, case when v_user is null then p_anon_token end,
          p_daily, case when p_daily then v_today end, p_mode, p_pace,
          p_daily and v_user is not null and p_pace = 'resultadista',
          v_user is not null,
          case when p_daily then 'padrao' else p_level end)
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
revoke execute on function public.retro_start_run(text, text, boolean, uuid, uuid[], text) from public;
grant execute on function public.retro_start_run(text, text, boolean, uuid, uuid[], text) to anon, authenticated;
drop function if exists public.retro_start_run(text, text, boolean, uuid, uuid[]);

-- ranking de Treino só compara o nível PADRÃO
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
         and r.status <> 'playing' and r.mode = p_mode and r.level = 'padrao'
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
           and r.status <> 'playing' and r.mode = p_mode and r.level = 'padrao'
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
