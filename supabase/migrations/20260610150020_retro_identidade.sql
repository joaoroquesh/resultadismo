-- Retrô — rodada 22 (Onda 1: identidade, coleção & conquistas):
-- Ataca o furo CD4 (Posse) do Octalysis — nada se acumulava. Agora:
-- 1) CONQUISTAS persistentes (retro_achievements catálogo + retro_player_achievements);
--    retro_claim_achievements() concede o que o jogador já mereceu (idempotente) e
--    devolve a estante completa + as recém-conquistadas (pra celebrar). Sem cadeado-
--    fantasma: ou a conquista existe e abre, ou nem aparece como possível ainda.
-- 2) COLEÇÃO de seleções (álbum): quantas seleções o jogador já cravou / venceu no dia.
-- 3) RECORDES + XP/TÍTULO no retro_my_stats (recorde de streak, totais, nível por XP).
-- Tudo RLS-first: tabelas sem policy, acesso só via RPC SECURITY DEFINER.

-- ---------- catálogo de conquistas ----------
create table if not exists public.retro_achievements (
  code text primary key,
  label text not null,
  emoji text not null,
  description text not null,
  sort int not null default 0
);
alter table public.retro_achievements enable row level security; -- leitura via RPC

insert into public.retro_achievements (code, label, emoji, description, sort) values
  ('primeira_partida', 'Estreia', '🎮', 'Jogou sua primeira campanha.', 10),
  ('primeira_cravada', 'Na mosca', '🎯', 'Cravou um placar exato.', 20),
  ('primeiro_campeao', 'Campeão', '🏆', 'Venceu sua primeira Copa Retrô.', 30),
  ('campeao_lenda', 'Lenda viva', '🐐', 'Foi campeão no modo Lenda.', 40),
  ('zerou', 'Zerou o game', '👾', 'Fez 21 pontos numa campanha (run perfeita).', 50),
  ('historico', 'Histórico', '📜', 'Mais de 15 pontos no modo Lenda.', 60),
  ('streak_3', 'Pegando o ritmo', '🔥', 'Jogou a Seleção do Dia 3 dias seguidos.', 70),
  ('streak_7', 'Toda semana', '🔥', 'Sequência de 7 dias na Seleção do Dia.', 80),
  ('streak_30', 'Inabalável', '🔥', 'Sequência de 30 dias na Seleção do Dia.', 90),
  ('tres_modos', 'Versátil', '🎚️', 'Foi campeão nos três modos (Amistoso, Clássico e Lenda).', 100),
  ('dez_campeoes', 'Pentacampeão e mais', '🏅', 'Levantou 10 taças.', 110),
  ('cinquenta_cravadas', 'Cravador', '💥', '50 cravadas na carreira.', 120)
on conflict (code) do update set
  label = excluded.label, emoji = excluded.emoji, description = excluded.description, sort = excluded.sort;

-- ---------- conquistas do jogador ----------
create table if not exists public.retro_player_achievements (
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null references public.retro_achievements(code) on delete cascade,
  earned_at timestamptz not null default now(),
  primary key (user_id, code)
);
alter table public.retro_player_achievements enable row level security; -- só via RPC

-- recorde histórico de streak (maior sequência de dias seguidos na Seleção do Dia)
create or replace function public.retro_best_streak(p_user uuid) returns int
language sql stable security definer set search_path = '' as $$
  with dias as (
    select distinct daily_date from public.retro_runs
     where user_id = p_user and is_daily and status <> 'playing'
  ), ilhas as (
    select daily_date, daily_date - (row_number() over (order by daily_date))::int as grp
      from dias
  )
  select coalesce(max(c), 0)::int from (select count(*) c from ilhas group by grp) t
$$;
revoke execute on function public.retro_best_streak(uuid) from public, anon, authenticated;

-- ---------- concede as conquistas merecidas e devolve a estante ----------
create or replace function public.retro_claim_achievements() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_earned text[]; v_new text[]; v_best_streak int; v_champs int; v_cravadas int;
begin
  if v_user is null then
    return jsonb_build_object('earned', '[]'::jsonb, 'new', '[]'::jsonb, 'all',
      (select coalesce(jsonb_agg(jsonb_build_object('code', code, 'label', label, 'emoji', emoji,
        'description', description, 'earned', false) order by sort), '[]'::jsonb) from public.retro_achievements));
  end if;

  select public.retro_best_streak(v_user) into v_best_streak;
  select count(*) filter (where status = 'champion') into v_champs from public.retro_runs where user_id = v_user;
  select count(*) into v_cravadas from public.retro_run_matches rm
    join public.retro_runs r on r.id = rm.run_id
   where r.user_id = v_user and rm.score_type = 'cravada';

  -- conjunto de códigos que o jogador JÁ merece, calculado dos dados existentes
  select array_agg(code) into v_earned from (
    select 'primeira_partida' code where exists (select 1 from public.retro_runs where user_id = v_user and status <> 'playing')
    union all select 'primeira_cravada' where v_cravadas >= 1
    union all select 'primeiro_campeao' where v_champs >= 1
    union all select 'campeao_lenda' where exists (select 1 from public.retro_runs where user_id = v_user and status = 'champion' and level = 'lenda')
    union all select 'zerou' where exists (select 1 from public.retro_runs where user_id = v_user and status = 'champion' and points >= 21)
    union all select 'historico' where exists (select 1 from public.retro_runs where user_id = v_user and level = 'lenda' and status <> 'playing' and points > 15)
    union all select 'streak_3' where v_best_streak >= 3
    union all select 'streak_7' where v_best_streak >= 7
    union all select 'streak_30' where v_best_streak >= 30
    union all select 'tres_modos' where (select count(distinct level) from public.retro_runs where user_id = v_user and status = 'champion' and level in ('amistoso','classico','lenda')) >= 3
    union all select 'dez_campeoes' where v_champs >= 10
    union all select 'cinquenta_cravadas' where v_cravadas >= 50
  ) t;

  -- grava as que faltam; coleta as NOVAS (pra celebrar no front)
  with ins as (
    insert into public.retro_player_achievements (user_id, code)
    select v_user, unnest(coalesce(v_earned, '{}'))
    on conflict (user_id, code) do nothing
    returning code
  ) select array_agg(code) into v_new from ins;

  return jsonb_build_object(
    'new', to_jsonb(coalesce(v_new, '{}')),
    'all', (select coalesce(jsonb_agg(jsonb_build_object(
              'code', a.code, 'label', a.label, 'emoji', a.emoji, 'description', a.description,
              'earned', pa.user_id is not null, 'earned_at', pa.earned_at) order by a.sort), '[]'::jsonb)
            from public.retro_achievements a
            left join public.retro_player_achievements pa on pa.code = a.code and pa.user_id = v_user));
end $$;
revoke execute on function public.retro_claim_achievements() from public, anon;
grant execute on function public.retro_claim_achievements() to authenticated;

-- ---------- coleção de seleções (álbum) ----------
create or replace function public.retro_my_collection() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_total int;
begin
  if v_user is null then return jsonb_build_object('jogadas', 0, 'total', 0, 'vencidas', '[]'::jsonb); end if;
  -- total de seleções "colecionáveis" = elegíveis a Seleção do Dia (≥7 jogos)
  select count(*) into v_total from (
    select slug from (
      select home_slug slug from public.retro_matches union all select away_slug from public.retro_matches) u
    group by slug having count(*) >= 7) e;
  return jsonb_build_object(
    'total', v_total,
    'jogadas', (  -- seleções de que o jogador já cravou/jogou algum jogo
      select count(distinct s) from (
        select m.home_slug s from public.retro_run_matches rm
          join public.retro_runs r on r.id = rm.run_id
          join public.retro_matches m on m.id = rm.match_id
         where r.user_id = v_user and rm.answered_at is not null
        union
        select m.away_slug from public.retro_run_matches rm
          join public.retro_runs r on r.id = rm.run_id
          join public.retro_matches m on m.id = rm.match_id
         where r.user_id = v_user and rm.answered_at is not null) q),
    'vencidas', (  -- Seleções do Dia que o jogador VENCEU (campeão no daily daquele time)
      select coalesce(jsonb_agg(distinct d.team_name_pt), '[]'::jsonb)
        from public.retro_runs r join public.retro_daily d on d.daily_date = r.daily_date
       where r.user_id = v_user and r.is_daily and r.status = 'champion' and d.team_name_pt is not null));
end $$;
revoke execute on function public.retro_my_collection() from public, anon;
grant execute on function public.retro_my_collection() to authenticated;

-- ---------- recordes pessoais da run (pro "NOVO RECORDE" no fim) ----------
create or replace function public.retro_run_records(p_share_code text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := auth.uid(); v_run public.retro_runs; v_best_pts int; v_best_rank int;
begin
  select * into v_run from public.retro_runs where share_code = p_share_code;
  if not found or v_user is null or v_run.user_id <> v_user then return jsonb_build_object('record', false); end if;
  select coalesce(max(points), 0), coalesce(max(coalesce(stage_rank, 0)), 0)
    into v_best_pts, v_best_rank
    from public.retro_runs where user_id = v_user and id <> v_run.id and status <> 'playing';
  return jsonb_build_object(
    'record', v_run.points > v_best_pts or coalesce(v_run.stage_rank, 0) > v_best_rank,
    'best_points', v_run.points >= v_best_pts);
end $$;
revoke execute on function public.retro_run_records(text) from public, anon;
grant execute on function public.retro_run_records(text) to authenticated;

-- ---------- my_stats expandido: recorde de streak + totais + XP/título ----------
create or replace function public.retro_my_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_streak int := 0; v_d date; v_best jsonb; v_played_today boolean;
  v_xp int; v_runs int; v_champs int; v_cravadas int; v_best_streak int;
  v_title text;
begin
  if v_user is null then
    return jsonb_build_object('streak', 0, 'best', null, 'played_today', false);
  end if;

  select exists (select 1 from public.retro_runs where user_id = v_user and is_daily and daily_date = v_today) into v_played_today;
  v_d := case when v_played_today then v_today else v_today - 1 end;
  while exists (select 1 from public.retro_runs
    where user_id = v_user and is_daily and daily_date = v_d
      and (status <> 'playing' or daily_date = v_today)) loop
    v_streak := v_streak + 1; v_d := v_d - 1;
  end loop;

  select jsonb_build_object('stage_reached', stage_reached, 'stage_rank', stage_rank,
                            'points', points, 'total_ms', total_ms, 'daily_date', daily_date, 'level', level)
    into v_best from public.retro_runs
   where user_id = v_user and status <> 'playing' and format = 'copa'
   order by coalesce(stage_rank, 0) desc, points desc, total_ms asc limit 1;

  select coalesce(sum(points), 0), count(*) filter (where status <> 'playing'),
         count(*) filter (where status = 'champion')
    into v_xp, v_runs, v_champs from public.retro_runs where user_id = v_user;
  select count(*) into v_cravadas from public.retro_run_matches rm
    join public.retro_runs r on r.id = rm.run_id where r.user_id = v_user and rm.score_type = 'cravada';
  select public.retro_best_streak(v_user) into v_best_streak;
  v_title := case
    when v_xp >= 1000 then 'Lenda' when v_xp >= 500 then 'Ídolo'
    when v_xp >= 200 then 'Craque' when v_xp >= 50 then 'Titular' else 'Reserva' end;

  return jsonb_build_object('streak', v_streak, 'best', v_best, 'played_today', v_played_today,
    'best_streak', v_best_streak, 'xp', v_xp, 'title', v_title,
    'runs', v_runs, 'champions', v_champs, 'cravadas', v_cravadas);
end $$;
revoke execute on function public.retro_my_stats() from public;
grant execute on function public.retro_my_stats() to authenticated;
