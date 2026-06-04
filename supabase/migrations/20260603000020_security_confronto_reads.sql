-- ============================================================================
-- Resultadismo · Segurança (code review v2) · Leituras de confronto + standings
-- ----------------------------------------------------------------------------
-- C1: as RPCs get_confronto_standings / get_confronto_ties / get_tie_detail eram
--     SECURITY DEFINER concedidas a `anon` SEM checagem de visibilidade — qualquer
--     um com um lc_id/tie_id lia o bracket de uma federação PRIVADA. Passa a gatear
--     em is_app_admin() OR is_league_member() OR liga pública (igual get_league_standings).
-- H6: enquanto o sorteio está 'scheduled' (agendado p/ revelar no futuro), as
--     pairings NÃO podem vazar — get_confronto_ties / get_tie_detail retornam vazio
--     para não-admins até a revelação.
-- Medium: bye (member_b null) passa a valer vitória na classificação de confronto.
-- Medium: get_league_standings protegida contra divisão por zero (cravada = 0).
-- Medium: release_confronto_if_due deixa de ser anon e exige ser membro.
-- (Mantém o anti-trapaça de palpites já existente em get_tie_detail.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- get_confronto_ties — pontos por período + GUARD (visibilidade + agendado)
-- ---------------------------------------------------------------------------
create or replace function public.get_confronto_ties(p_lc_id uuid)
returns table (
  id uuid, round_order int, round_label text, slot int, matchday int,
  member_a uuid, member_b uuid, name_a text, name_b text, avatar_a text, avatar_b text,
  pa int, pb int, winner uuid, resolved boolean, walkover boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with comp as (
    select lc.competition_id, lc.league_id, lc.confronto_state, l.visibility
    from public.league_competitions lc
    join public.leagues l on l.id = lc.league_id
    where lc.id = p_lc_id
  ),
  gate as (
    select (
      (public.is_app_admin()
        or public.is_league_member(c.league_id)
        or c.visibility = 'public')
      and (c.confronto_state is distinct from 'scheduled'
        or public.is_league_admin(c.league_id)
        or public.is_app_admin())
    ) as ok
    from comp c
  )
  select
    t.id, t.round_order, t.round_label, t.slot, t.matchday,
    t.member_a, t.member_b,
    pa_p.display_name, pb_p.display_name, pa_p.avatar_url, pb_p.avatar_url,
    coalesce(a.pts, 0)::int as pa,
    coalesce(b.pts, 0)::int as pb,
    case
      when t.member_b is null then t.member_a
      when t.walkover_user is not null then
        case when t.walkover_user = t.member_a then t.member_b else t.member_a end
      when not pl.played then null
      when coalesce(a.pts, 0) > coalesce(b.pts, 0) then t.member_a
      when coalesce(b.pts, 0) > coalesce(a.pts, 0) then t.member_b
      else null
    end as winner,
    (t.walkover_user is not null or pl.played) as resolved,
    (t.walkover_user is not null) as walkover
  from public.cup_ties t
  left join public.profiles pa_p on pa_p.id = t.member_a
  left join public.profiles pb_p on pb_p.id = t.member_b
  left join lateral (
    select sum(coalesce(public.score_points(pr.score_type), 0)
               * (case when pr.is_joker then 2 else 1 end))::int as pts
    from public.matches m
    join comp on m.competition_id = comp.competition_id
    join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_a
    where m.status = 'finished'
      and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
  ) a on true
  left join lateral (
    select sum(coalesce(public.score_points(pr.score_type), 0)
               * (case when pr.is_joker then 2 else 1 end))::int as pts
    from public.matches m
    join comp on m.competition_id = comp.competition_id
    join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_b
    where m.status = 'finished'
      and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
  ) b on true
  left join lateral (
    select exists (
      select 1 from public.matches m
      join comp on m.competition_id = comp.competition_id
      where m.status = 'finished'
        and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
    ) as played
  ) pl on true
  where t.league_competition_id = p_lc_id
    and (select ok from gate)
  order by t.round_order, t.slot;
$$;
grant execute on function public.get_confronto_ties(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_confronto_standings — 3/1/0 por período + GUARD + bye = vitória
-- ---------------------------------------------------------------------------
create or replace function public.get_confronto_standings(p_lc_id uuid)
returns table (
  user_id uuid, display_name text, avatar_url text,
  jogos int, vitorias int, empates int, derrotas int,
  pontos int, gols_pro int, gols_contra int, rank int
)
language sql
stable
security definer
set search_path = ''
as $$
  with lc as (
    select lc.id, lc.league_id, lc.competition_id, lc.confronto_state, l.visibility
    from public.league_competitions lc
    join public.leagues l on l.id = lc.league_id
    where lc.id = p_lc_id
  ),
  gate as (
    select (
      (public.is_app_admin()
        or public.is_league_member(lc.league_id)
        or lc.visibility = 'public')
      and (lc.confronto_state is distinct from 'scheduled'
        or public.is_league_admin(lc.league_id)
        or public.is_app_admin())
    ) as ok
    from lc
  ),
  scored as (
    select
      t.member_a, t.member_b, t.walkover_user,
      coalesce(a.pts, 0) as pa, coalesce(b.pts, 0) as pb,
      pl.played
    from public.cup_ties t
    join lc on t.league_competition_id = lc.id
    left join lateral (
      select sum(coalesce(public.score_points(pr.score_type), 0)
                 * (case when pr.is_joker then 2 else 1 end))::int as pts
      from public.matches m
      join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_a
      where m.competition_id = lc.competition_id and m.status = 'finished'
        and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
    ) a on true
    left join lateral (
      select sum(coalesce(public.score_points(pr.score_type), 0)
                 * (case when pr.is_joker then 2 else 1 end))::int as pts
      from public.matches m
      join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_b
      where m.competition_id = lc.competition_id and m.status = 'finished'
        and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
    ) b on true
    left join lateral (
      select exists (
        select 1 from public.matches m
        where m.competition_id = lc.competition_id and m.status = 'finished'
          and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
      ) as played
    ) pl on true
    where t.member_b is not null
  ),
  byes as (
    -- Bye (sem adversário) conta como vitória para quem ficou de fora da rodada.
    select t.member_a as uid
    from public.cup_ties t
    join lc on t.league_competition_id = lc.id
    where t.member_b is null and t.member_a is not null
  ),
  ties as (
    select member_a, member_b, pa, pb from scored
    where walkover_user is null and played
  ),
  wo as (
    select case when walkover_user = member_a then member_b else member_a end as winner_uid
    from scored where walkover_user is not null
  ),
  results as (
    select member_a as uid,
           case when pa > pb then 3 when pa = pb then 1 else 0 end as pts,
           (pa > pb)::int as v, (pa = pb)::int as e, (pa < pb)::int as d, pa as gp, pb as gc
    from ties
    union all
    select member_b as uid,
           case when pb > pa then 3 when pa = pb then 1 else 0 end as pts,
           (pb > pa)::int as v, (pa = pb)::int as e, (pb < pa)::int as d, pb as gp, pa as gc
    from ties
    union all
    select winner_uid as uid, 3 as pts, 1 as v, 0 as e, 0 as d, 1 as gp, 0 as gc from wo
    union all
    select uid, 3 as pts, 1 as v, 0 as e, 0 as d, 1 as gp, 0 as gc from byes
  ),
  agg as (
    select uid, count(*)::int as jogos, sum(v)::int as vitorias, sum(e)::int as empates,
           sum(d)::int as derrotas, sum(pts)::int as pontos,
           sum(gp)::int as gols_pro, sum(gc)::int as gols_contra
    from results group by uid
  )
  select
    mem.user_id, pr.display_name, pr.avatar_url,
    coalesce(a.jogos, 0), coalesce(a.vitorias, 0), coalesce(a.empates, 0),
    coalesce(a.derrotas, 0), coalesce(a.pontos, 0), coalesce(a.gols_pro, 0), coalesce(a.gols_contra, 0),
    (row_number() over (
      order by coalesce(a.pontos, 0) desc,
               (coalesce(a.gols_pro, 0) - coalesce(a.gols_contra, 0)) desc,
               coalesce(a.gols_pro, 0) desc, mem.joined_at asc
    ))::int as rank
  from public.league_members mem
  join public.profiles pr on pr.id = mem.user_id
  left join agg a on a.uid = mem.user_id
  where mem.league_id = (select league_id from lc)
    and mem.status = 'active'
    and (select ok from gate)
  order by rank;
$$;
grant execute on function public.get_confronto_standings(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_tie_detail — jogos do período + GUARD (visibilidade + agendado).
-- Mantém o anti-trapaça (palpite do adversário só após kickoff).
-- ---------------------------------------------------------------------------
create or replace function public.get_tie_detail(p_tie_id uuid)
returns table (
  match_id uuid, kickoff_at timestamptz, status public.match_status,
  home_name text, away_name text, home_score int, away_score int,
  a_home int, a_away int, a_pts int, a_joker boolean,
  b_home int, b_away int, b_pts int, b_joker boolean,
  a_palpitou boolean, b_palpitou boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with t as (
    select league_competition_id, matchday, period_kind, period_value, member_a, member_b
    from public.cup_ties where id = p_tie_id
  ),
  lc as (
    select lc.competition_id, lc.league_id, lc.confronto_state, l.visibility
    from public.league_competitions lc
    join public.leagues l on l.id = lc.league_id
    where lc.id = (select league_competition_id from t)
  ),
  gate as (
    select (
      (public.is_app_admin()
        or public.is_league_member(lc.league_id)
        or lc.visibility = 'public')
      and (lc.confronto_state is distinct from 'scheduled'
        or public.is_league_admin(lc.league_id)
        or public.is_app_admin())
    ) as ok
    from lc
  )
  select
    m.id, m.kickoff_at, m.status,
    coalesce(ht.short_name, m.home_team_name),
    coalesce(at.short_name, m.away_team_name),
    m.home_score, m.away_score,
    case when r.rev_a then pa.home_pred end,
    case when r.rev_a then pa.away_pred end,
    case when r.rev_a then (coalesce(public.score_points(pa.score_type), 0) * (case when pa.is_joker then 2 else 1 end)) end,
    case when r.rev_a then coalesce(pa.is_joker, false) else false end,
    case when r.rev_b then pb.home_pred end,
    case when r.rev_b then pb.away_pred end,
    case when r.rev_b then (coalesce(public.score_points(pb.score_type), 0) * (case when pb.is_joker then 2 else 1 end)) end,
    case when r.rev_b then coalesce(pb.is_joker, false) else false end,
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
  where public.match_in_period(
          (select period_kind from t), (select period_value from t), (select matchday from t),
          m.matchday, m.stage, m.kickoff_at)
    and (select ok from gate)
  order by m.kickoff_at;
$$;
grant execute on function public.get_tie_detail(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_league_standings — protege contra divisão por zero quando cravada = 0
-- (settings.points.cravada é editável pelo admin da liga).
-- ---------------------------------------------------------------------------
create or replace function public.get_league_standings(p_lc_id uuid)
returns table (
  user_id uuid,
  display_name text,
  avatar_url text,
  jogos int,
  pontos int,
  cravadas int,
  saldos int,
  acertos int,
  erros int,
  aproveitamento numeric,
  acertividade numeric,
  rank int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_competition_id uuid;
  v_starts_on date;
  v_visibility public.league_visibility;
  v_p_cravada int;
  v_p_saldo int;
  v_p_acerto int;
begin
  select lc.league_id, lc.competition_id, lc.starts_on,
         coalesce((lc.settings -> 'points' ->> 'cravada')::int, 3),
         coalesce((lc.settings -> 'points' ->> 'saldo')::int, 2),
         coalesce((lc.settings -> 'points' ->> 'acerto')::int, 1)
    into v_league_id, v_competition_id, v_starts_on, v_p_cravada, v_p_saldo, v_p_acerto
  from public.league_competitions lc
  where lc.id = p_lc_id;

  if v_league_id is null then
    return;
  end if;

  -- nunca deixa o divisor zerar (aproveitamento usa v_p_cravada * jogos)
  if coalesce(v_p_cravada, 0) <= 0 then
    v_p_cravada := 3;
  end if;

  select l.visibility into v_visibility from public.leagues l where l.id = v_league_id;

  if not (public.is_app_admin()
          or public.is_league_member(v_league_id)
          or v_visibility = 'public') then
    return;
  end if;

  return query
  with members as (
    select lm.user_id, p.display_name, p.avatar_url, p.created_at
    from public.league_members lm
    join public.profiles p on p.id = lm.user_id
    where lm.league_id = v_league_id and lm.status = 'active'
  ),
  scored as (
    select pr.user_id, pr.score_type, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.competition_id = v_competition_id
      and m.status = 'finished'
      and pr.score_type is not null
      and (v_starts_on is null or m.kickoff_at::date >= v_starts_on)
  ),
  agg as (
    select s.user_id,
      count(*)::int as jogos,
      sum(
        (case s.score_type
            when 'cravada' then v_p_cravada
            when 'saldo' then v_p_saldo
            when 'acerto' then v_p_acerto
            else 0 end)
        * (case when s.is_joker then 2 else 1 end)
      )::int as pontos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos,
      count(*) filter (where s.score_type = 'acerto')::int as acertos,
      count(*) filter (where s.score_type = 'erro')::int as erros
    from scored s
    group by s.user_id
  )
  select
    mem.user_id,
    mem.display_name,
    mem.avatar_url,
    coalesce(a.jogos, 0),
    coalesce(a.pontos, 0),
    coalesce(a.cravadas, 0),
    coalesce(a.saldos, 0),
    coalesce(a.acertos, 0),
    coalesce(a.erros, 0),
    case when coalesce(a.jogos, 0) = 0 then 0
         else round(coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos) * 100, 1) end,
    case when coalesce(a.jogos, 0) = 0 then 0
         else round((a.cravadas + a.saldos + a.acertos)::numeric / a.jogos * 100, 1) end,
    (row_number() over (
      order by
        coalesce(a.pontos, 0) desc,
        coalesce(a.cravadas, 0) desc,
        coalesce(a.saldos, 0) desc,
        (case when coalesce(a.jogos, 0) = 0 then 0
              else coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos) end) desc,
        (case when coalesce(a.jogos, 0) = 0 then 0
              else (a.cravadas + a.saldos + a.acertos)::numeric / a.jogos end) desc,
        mem.created_at asc
    ))::int as rank
  from members mem
  left join agg a on a.user_id = mem.user_id
  order by rank;
end;
$$;

-- ---------------------------------------------------------------------------
-- release_confronto_if_due — deixa de ser anon; exige ser membro da federação.
-- (continua só revelando quando o horário já chegou).
-- ---------------------------------------------------------------------------
create or replace function public.release_confronto_if_due(p_lc_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_done boolean := false;
  v_league uuid;
begin
  select league_id into v_league from public.league_competitions where id = p_lc_id;
  if v_league is null then
    return false;
  end if;
  if not (public.is_league_member(v_league) or public.is_app_admin()) then
    return false;
  end if;

  update public.league_competitions
     set confronto_state = 'drawn', drawn_at = now()
   where id = p_lc_id
     and confronto_state = 'scheduled'
     and scheduled_draw_at is not null
     and scheduled_draw_at <= now();
  get diagnostics v_done = row_count;
  return v_done;
end;
$$;
revoke all on function public.release_confronto_if_due(uuid) from public, anon;
grant execute on function public.release_confronto_if_due(uuid) to authenticated;
