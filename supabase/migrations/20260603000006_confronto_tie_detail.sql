-- Detalhe de um confronto: os jogos do período (matchday) com o palpite e os
-- pontos de cada lado. Alimenta a tela "meu confronto" / detalhe jogo a jogo.
create or replace function public.get_tie_detail(p_tie_id uuid)
returns table (
  match_id uuid,
  kickoff_at timestamptz,
  status public.match_status,
  home_name text,
  away_name text,
  home_score int,
  away_score int,
  a_home int,
  a_away int,
  a_pts int,
  a_joker boolean,
  b_home int,
  b_away int,
  b_pts int,
  b_joker boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select league_competition_id, matchday, member_a, member_b
    from public.cup_ties where id = p_tie_id
  ),
  lc as (
    select competition_id from public.league_competitions
    where id = (select league_competition_id from t)
  )
  select
    m.id,
    m.kickoff_at,
    m.status,
    coalesce(ht.short_name, m.home_team_name),
    coalesce(at.short_name, m.away_team_name),
    m.home_score,
    m.away_score,
    pa.home_pred,
    pa.away_pred,
    (coalesce(public.score_points(pa.score_type), 0) * (case when pa.is_joker then 2 else 1 end)),
    coalesce(pa.is_joker, false),
    pb.home_pred,
    pb.away_pred,
    (coalesce(public.score_points(pb.score_type), 0) * (case when pb.is_joker then 2 else 1 end)),
    coalesce(pb.is_joker, false)
  from public.matches m
  join lc on m.competition_id = lc.competition_id
  left join public.teams ht on ht.id = m.home_team_id
  left join public.teams at on at.id = m.away_team_id
  left join public.predictions pa on pa.match_id = m.id and pa.user_id = (select member_a from t)
  left join public.predictions pb on pb.match_id = m.id and pb.user_id = (select member_b from t)
  where m.matchday = (select matchday from t)
  order by m.kickoff_at;
$$;
grant execute on function public.get_tie_detail(uuid) to anon, authenticated;
