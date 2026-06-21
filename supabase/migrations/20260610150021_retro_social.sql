-- Retrô — rodada 22 (Onda 2: social & rivalidade — ataca CD5):
-- 1) Ranking com ESCOPO 'amigos' (reusa o grafo de league_members do app-mãe) + a
--    VIZINHANÇA do jogador (2 acima / 2 abaixo + quantos pts faltam pro de cima).
-- 2) Identidade do ANÔNIMO: apelido + escudo guardados pelo token, pro card de share
--    deixar de ser "Alguém jogou".

-- ---------- identidade do anônimo ----------
create table if not exists public.retro_anon (
  anon_token uuid primary key,
  nickname text,
  crest text,
  updated_at timestamptz not null default now()
);
alter table public.retro_anon enable row level security; -- só via RPC

create or replace function public.retro_set_anon_identity(
  p_anon_token uuid, p_nickname text, p_crest text default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_anon_token is null then raise exception 'token ausente'; end if;
  insert into public.retro_anon (anon_token, nickname, crest, updated_at)
  values (p_anon_token, left(btrim(p_nickname), 24), left(p_crest, 400), now())
  on conflict (anon_token) do update
    set nickname = excluded.nickname, crest = excluded.crest, updated_at = now();
end $$;
revoke execute on function public.retro_set_anon_identity(uuid, text, text) from public;
grant execute on function public.retro_set_anon_identity(uuid, text, text) to anon, authenticated;

-- summary v3: time do dia + player do anônimo (apelido/escudo)
create or replace function public.retro_run_summary(p_share_code text) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'format', r.format, 'pace', r.pace, 'status', r.status, 'level', r.level,
    'stage_reached', r.stage_reached, 'points', r.points, 'total_ms', r.total_ms,
    'is_daily', r.is_daily, 'daily_date', r.daily_date, 'finished_at', r.finished_at,
    'team_name_pt', d.team_name_pt, 'team_slug', d.team_slug,
    'player', case
      when r.user_id is not null
        then (select jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url)
                from public.profiles p where p.id = r.user_id)
      when r.anon_token is not null
        then (select jsonb_build_object('display_name', a.nickname, 'avatar_url', a.crest)
                from public.retro_anon a where a.anon_token = r.anon_token and a.nickname is not null)
      end,
    'slots', (select jsonb_agg(jsonb_build_object(
        'slot', rm.slot, 'slot_label', public.retro_slot_label(rm.slot),
        'score_type', rm.score_type, 'points', rm.points, 'timeout', rm.is_timeout) order by rm.slot)
      from public.retro_run_matches rm where rm.run_id = r.id and rm.answered_at is not null))
  from public.retro_runs r
  left join public.retro_daily d on r.is_daily and d.daily_date = r.daily_date
  where r.share_code = p_share_code and r.status <> 'playing'
$$;
revoke execute on function public.retro_run_summary(text) from public;
grant execute on function public.retro_run_summary(text) to anon, authenticated;

-- ---------- ranking com escopo (amigos) + vizinhança ----------
drop function if exists public.retro_leaderboard(date, text, int, text);
create or replace function public.retro_leaderboard(
  p_daily_date date default null, p_level text default 'classico',
  p_limit int default 50, p_board text default 'daily', p_scope text default 'global'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := coalesce(p_daily_date, (now() at time zone 'America/Sao_Paulo')::date);
  v_level text := case when p_level in ('amistoso','classico','lenda') then p_level else 'classico' end;
  v_me_id uuid := auth.uid();
  v_friends uuid[];
  v_rows jsonb; v_me jsonb; v_win jsonb;
begin
  -- escopo amigos: quem compartilha alguma liga ativa comigo (+ eu)
  if p_scope = 'amigos' and v_me_id is not null then
    select array_agg(distinct lm2.user_id) into v_friends
      from public.league_members lm1
      join public.league_members lm2 on lm2.league_id = lm1.league_id
     where lm1.user_id = v_me_id and lm1.status = 'active' and lm2.status = 'active';
    v_friends := coalesce(v_friends, '{}') || v_me_id;
  end if;

  if p_board = 'treino' then
    with best as (
      select distinct on (r.user_id) r.*
        from public.retro_runs r
       where not r.is_daily and r.pace = 'resultadista' and r.user_id is not null
         and r.status <> 'playing' and r.format = 'copa' and r.level = v_level
         and (p_scope <> 'amigos' or r.user_id = any(v_friends))
       order by r.user_id, coalesce(r.stage_rank, 0) desc, r.points desc, r.total_ms asc
    ), ranked as (
      select b.*, row_number() over (order by coalesce(b.stage_rank,0) desc, b.points desc, b.total_ms asc) as pos from best b
    )
    select jsonb_agg(jsonb_build_object('pos', rk.pos, 'display_name', p.display_name, 'avatar_url', p.avatar_url,
             'stage_reached', rk.stage_reached, 'points', rk.points, 'total_ms', rk.total_ms,
             'is_me', rk.user_id = v_me_id) order by rk.pos)
      into v_rows from ranked rk join public.profiles p on p.id = rk.user_id
     where p.show_in_global_ranking and rk.pos <= least(coalesce(p_limit, 50), 100);
    return jsonb_build_object('board', 'treino', 'level', v_level, 'scope', p_scope,
                              'rows', coalesce(v_rows, '[]'::jsonb), 'me', null);
  end if;

  -- DAILY: tabela completa ranqueada de hoje (no escopo escolhido)
  with full_rank as (
    select r.user_id, r.stage_reached, r.points, r.total_ms, p.display_name, p.avatar_url,
           row_number() over (order by coalesce(r.stage_rank,0) desc, r.points desc, r.total_ms asc) as pos
      from public.retro_runs r join public.profiles p on p.id = r.user_id
     where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.format = 'copa'
       and p.show_in_global_ranking and (p_scope <> 'amigos' or r.user_id = any(v_friends))
  )
  select jsonb_agg(jsonb_build_object('pos', pos, 'display_name', display_name, 'avatar_url', avatar_url,
           'stage_reached', stage_reached, 'points', points, 'total_ms', total_ms, 'is_me', user_id = v_me_id)
           order by pos)
    into v_rows from full_rank where pos <= least(coalesce(p_limit, 50), 100);

  if v_me_id is not null then
    with full_rank as (
      select r.user_id, r.stage_reached, r.points, r.total_ms, p.display_name, p.avatar_url,
             row_number() over (order by coalesce(r.stage_rank,0) desc, r.points desc, r.total_ms asc) as pos
        from public.retro_runs r join public.profiles p on p.id = r.user_id
       where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.format = 'copa'
         and (p_scope <> 'amigos' or r.user_id = any(v_friends))
    ), me as (select pos from full_rank where user_id = v_me_id)
    select jsonb_build_object('pos', m.pos, 'stage_reached', f.stage_reached, 'points', f.points, 'total_ms', f.total_ms)
      into v_me from full_rank f join me m on f.pos = m.pos;
    -- vizinhança: 2 acima / 2 abaixo
    with full_rank as (
      select r.user_id, p.display_name, p.avatar_url, r.stage_reached, r.points, r.total_ms,
             row_number() over (order by coalesce(r.stage_rank,0) desc, r.points desc, r.total_ms asc) as pos
        from public.retro_runs r join public.profiles p on p.id = r.user_id
       where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.format = 'copa'
         and (p_scope <> 'amigos' or r.user_id = any(v_friends))
    ), me as (select pos from full_rank where user_id = v_me_id)
    select jsonb_agg(jsonb_build_object('pos', f.pos, 'display_name', f.display_name, 'avatar_url', f.avatar_url,
             'stage_reached', f.stage_reached, 'points', f.points, 'is_me', f.user_id = v_me_id) order by f.pos)
      into v_win from full_rank f, me where f.pos between me.pos - 2 and me.pos + 2;
  end if;

  return jsonb_build_object('board', 'daily', 'daily_date', v_date, 'scope', p_scope,
                            'rows', coalesce(v_rows, '[]'::jsonb), 'me', v_me, 'me_window', v_win);
end $$;
revoke execute on function public.retro_leaderboard(date, text, int, text, text) from public;
grant execute on function public.retro_leaderboard(date, text, int, text, text) to anon, authenticated;
