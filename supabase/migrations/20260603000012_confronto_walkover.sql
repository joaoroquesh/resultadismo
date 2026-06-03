-- Sair da federação durante uma Liga/Copa = W.O. nos confrontos restantes.
--
-- Quando alguém sai de uma federação que tem disputa de Confronto sorteada, os
-- confrontos dela que AINDA não foram resolvidos viram W.O.: o adversário vence.
-- Confrontos já resolvidos (rodada finalizada) mantêm o resultado real.
-- A pessoa é removida; pra voltar precisa ser reconvidada e NÃO reentra nas
-- disputas já sorteadas (o snapshot de participantes é fixo).

alter table public.cup_ties
  add column if not exists walkover_user uuid;

comment on column public.cup_ties.walkover_user is
  'Usuário que perdeu este confronto por W.O. (saiu da federação). O adversário vence.';

-- ---------------------------------------------------------------------------
-- get_confronto_ties: agora honra o W.O. (vencedor = adversário) e expõe o flag.
-- ---------------------------------------------------------------------------
drop function if exists public.get_confronto_ties(uuid);
create function public.get_confronto_ties(p_lc_id uuid)
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
  resolved boolean,
  walkover boolean
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
      when t.walkover_user is not null then
        case when t.walkover_user = t.member_a then t.member_b else t.member_a end -- W.O.: adversário vence
      when t.matchday is null or not exists (select 1 from played p where p.matchday = t.matchday) then null
      when coalesce(a.pts, 0) > coalesce(b.pts, 0) then t.member_a
      when coalesce(b.pts, 0) > coalesce(a.pts, 0) then t.member_b
      else null -- empate no período
    end as winner,
    (t.walkover_user is not null
      or (t.matchday is not null and exists (select 1 from played p where p.matchday = t.matchday))) as resolved,
    (t.walkover_user is not null) as walkover
  from public.cup_ties t
  left join md a on a.user_id = t.member_a and a.matchday = t.matchday
  left join md b on b.user_id = t.member_b and b.matchday = t.matchday
  left join public.profiles pa_p on pa_p.id = t.member_a
  left join public.profiles pb_p on pb_p.id = t.member_b
  where t.league_competition_id = p_lc_id
  order by t.round_order, t.slot;
$$;
grant execute on function public.get_confronto_ties(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_confronto_standings: confrontos de W.O. contam como vitória do adversário.
-- ---------------------------------------------------------------------------
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
  -- confrontos resolvidos por resultado real (rodada finalizada), exceto W.O.
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
      and t.walkover_user is null
      and t.matchday is not null
      and exists (
        select 1 from public.matches m
        where m.competition_id = (select competition_id from lc)
          and m.matchday = t.matchday
          and m.status = 'finished'
      )
  ),
  -- confrontos vencidos por W.O. (adversário de quem saiu)
  wo as (
    select case when t.walkover_user = t.member_a then t.member_b else t.member_a end as winner_uid
    from public.cup_ties t
    join lc on t.league_competition_id = lc.id
    where t.walkover_user is not null and t.member_b is not null
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
    union all
    select winner_uid as uid, 3 as pts, 1 as v, 0 as e, 0 as d, 1 as gp, 0 as gc
    from wo
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

-- ---------------------------------------------------------------------------
-- leave_league: sai da federação aplicando W.O. nos confrontos não resolvidos.
-- ---------------------------------------------------------------------------
create or replace function public.leave_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;

  -- W.O. nos confrontos ainda não resolvidos do usuário (disputas de confronto sorteadas).
  update public.cup_ties t
     set walkover_user = v_uid, updated_at = now()
  from public.league_competitions lc
  where t.league_competition_id = lc.id
    and lc.league_id = p_league_id
    and lc.mode in ('liga', 'cup')
    and t.member_b is not null
    and (t.member_a = v_uid or t.member_b = v_uid)
    and t.walkover_user is null
    and (
      t.matchday is null
      or not exists (
        select 1 from public.matches m
        where m.competition_id = lc.competition_id
          and m.matchday = t.matchday
          and m.status = 'finished'
      )
    );

  -- Remove o vínculo. Para voltar, precisa ser reconvidada — e não reentra nas
  -- disputas já sorteadas (o snapshot de participantes é fixo).
  delete from public.league_members
  where league_id = p_league_id and user_id = v_uid;
end;
$$;
revoke all on function public.leave_league(uuid) from public, anon;
grant execute on function public.leave_league(uuid) to authenticated;
