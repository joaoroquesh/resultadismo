-- ============================================================================
-- Resultadismo · Resultadismo The Best — recorte "Que eu jogo"
-- ----------------------------------------------------------------------------
-- Recorta a classificação geral ao CONJUNTO de campeonatos que o Resultadista
-- logado joga (competições dos seus grupos). A pontuação de TODO MUNDO é
-- cortada a esse conjunto — comparação justa, só nos campeonatos em comum.
--
--   get_my_played_competition_ids() → uuid[] das competições dos meus grupos
--   get_global_standings_multi(p_competition_ids[], p_limit) → leaderboard
--   get_my_global_rank_multi(p_competition_ids[])            → minha posição
--
-- Mesma regra de pontuação do get_global_standings (3/2/1 × coringa, ignora
-- jogos ocultos, respeita opt-out do ranking).
-- ============================================================================

-- Competições que EU jogo (distintas, dos grupos onde sou membro ativo).
create or replace function public.get_my_played_competition_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct lc.competition_id), '{}')
  from public.league_competitions lc
  join public.league_members lm on lm.league_id = lc.league_id
  where lm.user_id = auth.uid()
    and lm.status = 'active';
$$;

grant execute on function public.get_my_played_competition_ids() to authenticated;

-- Leaderboard recortado a um conjunto de competições.
create or replace function public.get_global_standings_multi(
  p_competition_ids uuid[],
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
  acertos int
)
language sql
stable
security definer
set search_path = ''
as $$
  with scored as (
    select pr.user_id, pr.score_type, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.status = 'finished'
      and m.hidden = false
      and pr.score_type is not null
      and p_competition_ids is not null
      and array_length(p_competition_ids, 1) is not null
      and m.competition_id = any(p_competition_ids)
  ),
  agg as (
    select
      s.user_id,
      sum(
        (case s.score_type
           when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
        * (case when s.is_joker then 2 else 1 end)
      )::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos,
      count(*) filter (where s.score_type = 'acerto')::int as acertos
    from scored s
    group by s.user_id
  )
  select
    (row_number() over (order by a.pontos desc, a.cravadas desc, a.saldos desc, a.jogos asc))::int as rank,
    a.user_id, p.display_name, p.avatar_url, a.pontos, a.jogos, a.cravadas, a.saldos, a.acertos
  from agg a
  join public.profiles p on p.id = a.user_id
  where coalesce(p.show_in_global_ranking, true) = true
  order by a.pontos desc, a.cravadas desc, a.saldos desc, a.jogos asc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

grant execute on function public.get_global_standings_multi(uuid[], int) to authenticated;

-- Minha posição no recorte de competições.
create or replace function public.get_my_global_rank_multi(p_competition_ids uuid[])
returns table(
  rank int,
  pontos int,
  jogos int,
  total_resultadistas int
)
language sql
stable
security definer
set search_path = ''
as $$
  with scored as (
    select pr.user_id, pr.score_type, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.status = 'finished'
      and m.hidden = false
      and pr.score_type is not null
      and p_competition_ids is not null
      and array_length(p_competition_ids, 1) is not null
      and m.competition_id = any(p_competition_ids)
  ),
  agg as (
    select
      s.user_id,
      sum(
        (case s.score_type
           when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
        * (case when s.is_joker then 2 else 1 end)
      )::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos
    from scored s
    group by s.user_id
  ),
  visible as (
    select a.*
    from agg a
    join public.profiles p on p.id = a.user_id
    where coalesce(p.show_in_global_ranking, true) = true
  ),
  ranked as (
    select user_id, pontos, jogos,
      row_number() over (order by pontos desc, cravadas desc, saldos desc, jogos asc)::int as rk
    from visible
  )
  select rk::int as rank, pontos, jogos, (select count(*)::int from visible) as total_resultadistas
  from ranked
  where user_id = auth.uid();
$$;

grant execute on function public.get_my_global_rank_multi(uuid[]) to authenticated;
