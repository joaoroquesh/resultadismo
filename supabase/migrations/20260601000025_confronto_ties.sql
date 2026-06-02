-- ============================================================================
-- get_confronto_ties: lista os confrontos (cup_ties) de uma disputa com os
-- pontos de cada lado no período (matchday) e o vencedor já resolvido.
-- Alimenta: rodadas da Liga, chaveamento da Copa, "meu confronto" e detalhe.
-- ============================================================================
create or replace function public.get_confronto_ties(p_lc_id uuid)
returns table (
  id uuid,
  round_order int,
  round_label text,
  slot int,
  matchday int,
  member_a uuid,
  member_b uuid,
  name_a text,
  name_b text,
  avatar_a text,
  avatar_b text,
  pa int,
  pb int,
  winner uuid,
  resolved boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with lc as (
    select competition_id from public.league_competitions where id = p_lc_id
  ),
  md as (
    select pr.user_id,
           m.matchday,
           sum(coalesce(public.score_points(pr.score_type), 0)
               * (case when pr.is_joker then 2 else 1 end))::int as pts
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    join lc on m.competition_id = lc.competition_id
    where m.status = 'finished' and pr.score_type is not null and m.matchday is not null
    group by pr.user_id, m.matchday
  ),
  played as (
    select distinct m.matchday
    from public.matches m
    join lc on m.competition_id = lc.competition_id
    where m.status = 'finished' and m.matchday is not null
  )
  select
    t.id,
    t.round_order,
    t.round_label,
    t.slot,
    t.matchday,
    t.member_a,
    t.member_b,
    pa_p.display_name as name_a,
    pb_p.display_name as name_b,
    pa_p.avatar_url as avatar_a,
    pb_p.avatar_url as avatar_b,
    coalesce(a.pts, 0) as pa,
    coalesce(b.pts, 0) as pb,
    case
      when t.member_b is null then t.member_a -- bye: avança
      when t.matchday is null or not exists (select 1 from played p where p.matchday = t.matchday) then null
      when coalesce(a.pts, 0) > coalesce(b.pts, 0) then t.member_a
      when coalesce(b.pts, 0) > coalesce(a.pts, 0) then t.member_b
      else null -- empate no período
    end as winner,
    (t.matchday is not null and exists (select 1 from played p where p.matchday = t.matchday)) as resolved
  from public.cup_ties t
  left join md a on a.user_id = t.member_a and a.matchday = t.matchday
  left join md b on b.user_id = t.member_b and b.matchday = t.matchday
  left join public.profiles pa_p on pa_p.id = t.member_a
  left join public.profiles pb_p on pb_p.id = t.member_b
  where t.league_competition_id = p_lc_id
  order by t.round_order, t.slot;
$$;
grant execute on function public.get_confronto_ties(uuid) to anon, authenticated;
