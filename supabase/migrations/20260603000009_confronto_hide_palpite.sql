-- Anti-trapaça no detalhe de confronto.
--
-- Antes, get_tie_detail devolvia o palpite (placar + pontos + joker) dos DOIS
-- lados de cada jogo, mesmo antes do jogo começar — dava pra "espiar" o palpite
-- do adversário e copiar. Agora o palpite de um lado só é revelado quando:
--   (a) o jogo já começou (kickoff_at <= now()), OU
--   (b) aquele lado é o próprio usuário logado (você sempre vê o seu).
-- Enquanto escondido, devolvemos só a_palpitou/b_palpitou (se a pessoa palpitou
-- ou não) — placar, pontos e joker ficam nulos/false.

-- A assinatura muda (novas colunas a_palpitou/b_palpitou), então é preciso DROP
-- antes do CREATE — create or replace não troca o tipo de retorno.
drop function if exists public.get_tie_detail(uuid);

create function public.get_tie_detail(p_tie_id uuid)
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
  b_joker boolean,
  a_palpitou boolean,
  b_palpitou boolean
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
    -- Lado A: revela só se o jogo começou ou se A sou eu.
    case when r.rev_a then pa.home_pred end,
    case when r.rev_a then pa.away_pred end,
    case when r.rev_a then (coalesce(public.score_points(pa.score_type), 0) * (case when pa.is_joker then 2 else 1 end)) end,
    case when r.rev_a then coalesce(pa.is_joker, false) else false end,
    -- Lado B: idem.
    case when r.rev_b then pb.home_pred end,
    case when r.rev_b then pb.away_pred end,
    case when r.rev_b then (coalesce(public.score_points(pb.score_type), 0) * (case when pb.is_joker then 2 else 1 end)) end,
    case when r.rev_b then coalesce(pb.is_joker, false) else false end,
    -- Sempre podemos dizer SE a pessoa palpitou (sem revelar o quê).
    (pa.home_pred is not null),
    (pb.home_pred is not null)
  from public.matches m
  join lc on m.competition_id = lc.competition_id
  left join public.teams ht on ht.id = m.home_team_id
  left join public.teams at on at.id = m.away_team_id
  left join public.predictions pa on pa.match_id = m.id and pa.user_id = (select member_a from t)
  left join public.predictions pb on pb.match_id = m.id and pb.user_id = (select member_b from t)
  cross join lateral (
    select
      ((m.kickoff_at is not null and m.kickoff_at <= now()) or (select member_a from t) = auth.uid()) as rev_a,
      ((m.kickoff_at is not null and m.kickoff_at <= now()) or (select member_b from t) = auth.uid()) as rev_b
  ) r
  where m.matchday = (select matchday from t)
  order by m.kickoff_at;
$$;
grant execute on function public.get_tie_detail(uuid) to anon, authenticated;
