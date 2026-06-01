-- ============================================================================
-- Confronto (Liga/Copa): cada "tie" é resolvido por uma rodada = um matchday.
-- Quem fez mais pontos de palpite naquela rodada vence o confronto (3/1/0).
-- Classificação calculada on-read (sem materializar) — robusto p/ federações
-- pequenas. Os confrontos (cup_ties) são gerados pelo client (motor do simulador).
-- ============================================================================

-- Vincula cada confronto a uma rodada da competição (group stage: matchday).
alter table public.cup_ties add column if not exists matchday int;

-- Classificação de confronto (tabela 3/1/0) para uma disputa (league_competition).
create or replace function public.get_confronto_standings(p_lc_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  jogos int,
  vitorias int,
  empates int,
  derrotas int,
  pontos int,
  gols_pro int,
  gols_contra int,
  rank int
)
language sql
stable
security definer
set search_path = ''
as $$
  with lc as (
    select id, league_id, competition_id
    from public.league_competitions
    where id = p_lc_id
  ),
  -- pontos de palpite de cada membro por rodada (matchday), com Joker (2x)
  md_points as (
    select pr.user_id,
           m.matchday,
           sum(coalesce(public.score_points(pr.score_type), 0)
               * (case when pr.is_joker then 2 else 1 end))::int as pts
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    join lc on m.competition_id = lc.competition_id
    where m.status = 'finished'
      and pr.score_type is not null
      and m.matchday is not null
    group by pr.user_id, m.matchday
  ),
  -- confrontos já resolvidos (a rodada tem ao menos um jogo finalizado)
  ties as (
    select t.member_a,
           t.member_b,
           coalesce(a.pts, 0) as pa,
           coalesce(b.pts, 0) as pb
    from public.cup_ties t
    join lc on t.league_competition_id = lc.id
    left join md_points a on a.user_id = t.member_a and a.matchday = t.matchday
    left join md_points b on b.user_id = t.member_b and b.matchday = t.matchday
    where t.member_b is not null
      and t.matchday is not null
      and exists (
        select 1 from public.matches m
        where m.competition_id = (select competition_id from lc)
          and m.matchday = t.matchday
          and m.status = 'finished'
      )
  ),
  results as (
    select member_a as uid,
           case when pa > pb then 3 when pa = pb then 1 else 0 end as pts,
           (pa > pb)::int as v, (pa = pb)::int as e, (pa < pb)::int as d,
           pa as gp, pb as gc
    from ties
    union all
    select member_b as uid,
           case when pb > pa then 3 when pa = pb then 1 else 0 end as pts,
           (pb > pa)::int as v, (pa = pb)::int as e, (pb < pa)::int as d,
           pb as gp, pa as gc
    from ties
  ),
  agg as (
    select uid,
           count(*)::int as jogos,
           sum(v)::int as vitorias,
           sum(e)::int as empates,
           sum(d)::int as derrotas,
           sum(pts)::int as pontos,
           sum(gp)::int as gols_pro,
           sum(gc)::int as gols_contra
    from results
    group by uid
  )
  select
    mem.user_id,
    pr.display_name,
    pr.avatar_url,
    coalesce(a.jogos, 0),
    coalesce(a.vitorias, 0),
    coalesce(a.empates, 0),
    coalesce(a.derrotas, 0),
    coalesce(a.pontos, 0),
    coalesce(a.gols_pro, 0),
    coalesce(a.gols_contra, 0),
    (row_number() over (
      order by coalesce(a.pontos, 0) desc,
               (coalesce(a.gols_pro, 0) - coalesce(a.gols_contra, 0)) desc,
               coalesce(a.gols_pro, 0) desc,
               mem.joined_at asc
    ))::int as rank
  from public.league_members mem
  join public.profiles pr on pr.id = mem.user_id
  left join agg a on a.uid = mem.user_id
  where mem.league_id = (select league_id from lc)
    and mem.status = 'active'
  order by rank;
$$;

grant execute on function public.get_confronto_standings(uuid) to anon, authenticated;
