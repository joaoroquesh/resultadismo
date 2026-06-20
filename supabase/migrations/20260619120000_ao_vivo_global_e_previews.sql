-- ============================================================================
-- Resultadismo · AO VIVO no ranking global + nos previews dos grupos
-- ----------------------------------------------------------------------------
-- ADITIVA: 4 RPCs novas `_live`, espelhando as oficiais (que seguem no placar
-- FINAL — prêmio/confronto/número oficial NÃO mudam). Tudo aqui é EXIBIÇÃO:
--
--   get_global_standings_live(p_competition_ids[], p_limit)
--     → Resultadismo The Best ao vivo. p_competition_ids null = todas; [id] =
--       um campeonato; {ids} = recorte "Que eu jogo". Projeta os jogos 'live'
--       com compute_score_type no placar corrente. Setas: rank_anterior =
--       posição no consolidado (só encerrados). ao_vivo / live_scoring por user.
--   get_my_global_rank_live(p_competition_ids[])
--     → minha linha do ranking global ao vivo (mesmo recorte).
--   get_my_league_positions_live(p_league_ids[])
--     → posição/pontos ao vivo por grupo (preview da aba Grupos). Deriva de
--       get_league_standings_live (Bolão principal de cada grupo) + ao_vivo.
--   get_group_rank_window_live(p_league_id, p_radius)
--     → janela de 3 da classificação do grupo, AO VIVO (carrossel de favoritos).
--
-- Pontuação idêntica à regra do banco: cravada 3 / saldo 2 / acerto 1 / erro 0,
-- × dobro do coringa; ignora jogos ocultos; respeita opt-out do ranking global.
-- ============================================================================

-- 1. Ranking global AO VIVO (leaderboard) -----------------------------------
drop function if exists public.get_global_standings_live(uuid[], int);
create or replace function public.get_global_standings_live(
  p_competition_ids uuid[] default null,
  p_limit int default 50
)
returns table(
  rank int,
  user_id uuid,
  display_name text,
  avatar_url text,
  pontos int,
  jogos int,
  cravadas int,
  saldos int,
  acertos int,
  rank_anterior int,
  ao_vivo boolean,
  live_scoring boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  -- AGORA: encerrados (score_type guardado) + jogos ao vivo (projetados na hora)
  with cur_scored as (
    select pr.user_id,
      (case when m.status = 'finished' then pr.score_type
            else public.compute_score_type(pr.home_pred, pr.away_pred, m.home_score, m.away_score) end) as st,
      pr.is_joker,
      (m.status = 'live') as is_live
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.hidden = false
      and (p_competition_ids is null or m.competition_id = any(p_competition_ids))
      and (
        (m.status = 'finished' and pr.score_type is not null)
        or (m.status = 'live' and m.home_score is not null and m.away_score is not null)
      )
  ),
  cur_agg as (
    select cs.user_id,
      sum((case cs.st when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
          * (case when cs.is_joker then 2 else 1 end))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where cs.st = 'cravada')::int as cravadas,
      count(*) filter (where cs.st = 'saldo')::int as saldos,
      count(*) filter (where cs.st = 'acerto')::int as acertos,
      bool_or(cs.is_live) as ao_vivo,
      bool_or(cs.is_live and cs.st <> 'erro') as live_scoring
    from cur_scored cs
    group by cs.user_id
  ),
  cur_vis as (
    select a.*, p.display_name, p.avatar_url
    from cur_agg a
    join public.profiles p on p.id = a.user_id
    where coalesce(p.show_in_global_ranking, true) = true
  ),
  cur_ranked as (
    select cv.*,
      (row_number() over (order by cv.pontos desc, cv.cravadas desc, cv.saldos desc, cv.jogos asc))::int as rank
    from cur_vis cv
  ),
  -- PLACAR-BASE (consolidado): só encerrados → posição das setas
  base_scored as (
    select pr.user_id, pr.score_type as st, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.status = 'finished'
      and m.hidden = false
      and pr.score_type is not null
      and (p_competition_ids is null or m.competition_id = any(p_competition_ids))
  ),
  base_agg as (
    select bs.user_id,
      sum((case bs.st when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
          * (case when bs.is_joker then 2 else 1 end))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where bs.st = 'cravada')::int as cravadas,
      count(*) filter (where bs.st = 'saldo')::int as saldos
    from base_scored bs
    group by bs.user_id
  ),
  base_vis as (
    select a.*
    from base_agg a
    join public.profiles p on p.id = a.user_id
    where coalesce(p.show_in_global_ranking, true) = true
  ),
  base_ranked as (
    select bv.user_id,
      (row_number() over (order by bv.pontos desc, bv.cravadas desc, bv.saldos desc, bv.jogos asc))::int as rank_anterior
    from base_vis bv
  )
  select
    c.rank, c.user_id, c.display_name, c.avatar_url,
    c.pontos, c.jogos, c.cravadas, c.saldos, c.acertos,
    coalesce(b.rank_anterior, c.rank) as rank_anterior,
    c.ao_vivo, c.live_scoring
  from cur_ranked c
  left join base_ranked b on b.user_id = c.user_id
  order by c.rank
  limit greatest(coalesce(p_limit, 50), 1);
$$;
revoke all on function public.get_global_standings_live(uuid[], int) from public, anon;
grant execute on function public.get_global_standings_live(uuid[], int) to authenticated;

-- 2. Minha posição no ranking global AO VIVO --------------------------------
drop function if exists public.get_my_global_rank_live(uuid[]);
create or replace function public.get_my_global_rank_live(
  p_competition_ids uuid[] default null
)
returns table(
  rank int,
  pontos int,
  jogos int,
  total_resultadistas int,
  rank_anterior int,
  ao_vivo boolean,
  live_scoring boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with cur_scored as (
    select pr.user_id,
      (case when m.status = 'finished' then pr.score_type
            else public.compute_score_type(pr.home_pred, pr.away_pred, m.home_score, m.away_score) end) as st,
      pr.is_joker,
      (m.status = 'live') as is_live
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.hidden = false
      and (p_competition_ids is null or m.competition_id = any(p_competition_ids))
      and (
        (m.status = 'finished' and pr.score_type is not null)
        or (m.status = 'live' and m.home_score is not null and m.away_score is not null)
      )
  ),
  cur_agg as (
    select cs.user_id,
      sum((case cs.st when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
          * (case when cs.is_joker then 2 else 1 end))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where cs.st = 'cravada')::int as cravadas,
      count(*) filter (where cs.st = 'saldo')::int as saldos,
      bool_or(cs.is_live) as ao_vivo,
      bool_or(cs.is_live and cs.st <> 'erro') as live_scoring
    from cur_scored cs
    group by cs.user_id
  ),
  cur_vis as (
    select a.*
    from cur_agg a
    join public.profiles p on p.id = a.user_id
    where coalesce(p.show_in_global_ranking, true) = true
  ),
  cur_ranked as (
    select cv.user_id, cv.pontos, cv.jogos, cv.ao_vivo, cv.live_scoring,
      (row_number() over (order by cv.pontos desc, cv.cravadas desc, cv.saldos desc, cv.jogos asc))::int as rk
    from cur_vis cv
  ),
  base_scored as (
    select pr.user_id, pr.score_type as st, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.status = 'finished'
      and m.hidden = false
      and pr.score_type is not null
      and (p_competition_ids is null or m.competition_id = any(p_competition_ids))
  ),
  base_agg as (
    select bs.user_id,
      sum((case bs.st when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
          * (case when bs.is_joker then 2 else 1 end))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where bs.st = 'cravada')::int as cravadas,
      count(*) filter (where bs.st = 'saldo')::int as saldos
    from base_scored bs
    group by bs.user_id
  ),
  base_vis as (
    select a.*
    from base_agg a
    join public.profiles p on p.id = a.user_id
    where coalesce(p.show_in_global_ranking, true) = true
  ),
  base_ranked as (
    select bv.user_id,
      (row_number() over (order by bv.pontos desc, bv.cravadas desc, bv.saldos desc, bv.jogos asc))::int as rank_anterior
    from base_vis bv
  )
  select
    c.rk::int as rank, c.pontos, c.jogos,
    (select count(*)::int from cur_vis) as total_resultadistas,
    coalesce(b.rank_anterior, c.rk)::int as rank_anterior,
    c.ao_vivo, c.live_scoring
  from cur_ranked c
  left join base_ranked b on b.user_id = c.user_id
  where c.user_id = auth.uid();
$$;
revoke all on function public.get_my_global_rank_live(uuid[]) from public, anon;
grant execute on function public.get_my_global_rank_live(uuid[]) to authenticated;

-- 3. Posições dos meus grupos AO VIVO (preview da aba Grupos) ----------------
-- Espelha get_my_league_positions, mas via get_league_standings_live + ao_vivo.
drop function if exists public.get_my_league_positions_live(uuid[]);
create or replace function public.get_my_league_positions_live(p_league_ids uuid[])
returns table(
  league_id uuid,
  rank int,
  total int,
  pontos int,
  ao_vivo boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lid uuid;
  v_lc uuid;
begin
  if auth.uid() is null or p_league_ids is null then
    return;
  end if;

  foreach v_lid in array p_league_ids loop
    select lc.id into v_lc
    from public.league_competitions lc
    where lc.league_id = v_lid
      and lc.mode in ('points', 'table')
    order by lc.created_at asc
    limit 1;

    if v_lc is null then
      continue; -- grupo sem Bolão ainda
    end if;

    return query
    with st as (select * from public.get_league_standings_live(v_lc))
    select v_lid, s.rank, (select count(*)::int from st),
      s.pontos, (select bool_or(x.ao_vivo) from st x)
    from st s
    where s.user_id = auth.uid();
  end loop;
end;
$$;
revoke all on function public.get_my_league_positions_live(uuid[]) from public, anon;
grant execute on function public.get_my_league_positions_live(uuid[]) to authenticated;

-- 4. Janela da classificação do grupo AO VIVO (carrossel de favoritos) -------
-- Espelha get_group_rank_window, mas via get_league_standings_live + ao_vivo/
-- live_scoring por linha (pra pontuar em flame quem está marcando ao vivo).
drop function if exists public.get_group_rank_window_live(uuid, int);
create or replace function public.get_group_rank_window_live(
  p_league_id uuid,
  p_radius int default 1
)
returns table(
  rank int,
  user_id uuid,
  display_name text,
  avatar_url text,
  pontos int,
  jogos int,
  cravadas int,
  saldos int,
  acertos int,
  is_me boolean,
  ao_vivo boolean,
  live_scoring boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lc uuid;
begin
  if auth.uid() is null or p_league_id is null then
    return;
  end if;

  select lc.id into v_lc
  from public.league_competitions lc
  where lc.league_id = p_league_id
    and lc.mode in ('points', 'table')
  order by lc.created_at asc
  limit 1;

  if v_lc is null then
    return; -- grupo sem Bolão ainda
  end if;

  return query
  with st as (
    select * from public.get_league_standings_live(v_lc)
  ),
  meta as (
    select
      (select s.rank from st s where s.user_id = auth.uid()) as my,
      (select count(*)::int from st) as total,
      greatest(coalesce(p_radius, 1), 0) as radius
  ),
  bounds as (
    select
      greatest(1, least(my - radius, total - 2 * radius)) as lo,
      least(total, greatest(1, least(my - radius, total - 2 * radius)) + 2 * radius) as hi
    from meta
    where my is not null
  )
  select
    s.rank, s.user_id, s.display_name, s.avatar_url,
    s.pontos, s.jogos, s.cravadas, s.saldos, s.acertos,
    (s.user_id = auth.uid()) as is_me, s.ao_vivo, s.live_scoring
  from st s, bounds b
  where s.rank between b.lo and b.hi
    and exists (select 1 from st x where x.jogos > 0)  -- gate: grupo tem pontuação
  order by s.rank;
end;
$$;
revoke all on function public.get_group_rank_window_live(uuid, int) from public, anon;
grant execute on function public.get_group_rank_window_live(uuid, int) to authenticated;
