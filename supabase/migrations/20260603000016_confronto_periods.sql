-- ============================================================================
-- Confronto v3 — período por FASE ou SEMANA (aproveita a Copa inteira).
--
-- Antes, um confronto era resolvido só por `matchday` — e no mata-mata da Copa
-- o matchday é NULL, então o confronto enxergava só as 3 rodadas de grupo e
-- ignorava 32-avos/oitavas/quartas/semis/final. Agora cada confronto aponta um
-- PERÍODO genérico (matchday | stage | week), e a pontuação soma os palpites dos
-- jogos daquele período. Assim a Copa rende 8 fases (3 grupos + 5 mata-mata) ou
-- 6 semanas.
-- ============================================================================

alter table public.cup_ties
  add column if not exists period_kind text,   -- 'matchday' | 'stage' | 'week'
  add column if not exists period_value text;  -- '1'.. | 'LAST_16'.. | '2026-25'

-- Predicado: o jogo M pertence ao período do confronto?
create or replace function public.match_in_period(
  p_kind text,
  p_value text,
  p_fallback_matchday int,
  m_matchday int,
  m_stage text,
  m_kickoff timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case
    when p_value is null and p_kind is null then m_matchday = p_fallback_matchday
    when p_kind = 'week' then m_kickoff is not null
      and to_char(date_trunc('week', m_kickoff), 'IYYY-IW') = p_value
    when p_kind = 'stage' then m_stage = p_value
      or (p_value = 'FINAL' and m_stage = 'THIRD_PLACE')
    when p_kind = 'matchday' then m_matchday = p_value::int
    else m_matchday = p_fallback_matchday
  end;
$$;

-- ---------------------------------------------------------------------------
-- Períodos de uma competição, por tipo ('phase' = grupos por rodada + mata-mata
-- por fase; 'week' = semanas ISO). Inclui o nº de jogos de cada período.
-- ---------------------------------------------------------------------------
create or replace function public.get_competition_periods(
  p_competition_id uuid,
  p_kind text
)
returns table (
  period_index int,
  kind text,
  value text,
  label text,
  games int,
  starts_on date,
  ends_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select
      matchday,
      kickoff_at,
      case when stage = 'THIRD_PLACE' then 'FINAL' else stage end as stage
    from public.matches
    where competition_id = p_competition_id and kickoff_at is not null
  ),
  tagged as (
    select
      kickoff_at,
      case
        when p_kind = 'week' then 'week'
        when matchday is not null then 'matchday'
        else 'stage'
      end as p_kind_out,
      case
        when p_kind = 'week' then to_char(date_trunc('week', kickoff_at), 'IYYY-IW')
        when matchday is not null then matchday::text
        else stage
      end as p_value
    from base
  ),
  grp as (
    select p_kind_out, p_value,
           count(*)::int as games,
           min(kickoff_at) as mn,
           max(kickoff_at) as mx
    from tagged
    group by p_kind_out, p_value
  )
  select
    (row_number() over (order by mn))::int as period_index,
    p_kind_out as kind,
    p_value as value,
    case
      when p_kind_out = 'week' then 'Semana ' || (row_number() over (order by mn))::text
      when p_kind_out = 'matchday' then 'Rodada ' || p_value || ' (grupos)'
      when p_value = 'LAST_32' then '32-avos de final'
      when p_value = 'LAST_16' then 'Oitavas de final'
      when p_value = 'QUARTER_FINALS' then 'Quartas de final'
      when p_value = 'SEMI_FINALS' then 'Semifinais'
      when p_value = 'FINAL' then 'Final'
      when p_value = 'GROUP_STAGE' then 'Fase de grupos'
      else coalesce(p_value, 'Período')
    end as label,
    games,
    mn::date as starts_on,
    mx::date as ends_on
  from grp
  order by mn;
$$;
grant execute on function public.get_competition_periods(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- draw_confronto: agora grava period_kind/period_value por confronto.
-- ---------------------------------------------------------------------------
create or replace function public.draw_confronto(
  p_lc_id uuid,
  p_participants jsonb,
  p_ties jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
begin
  select league_id into v_league from public.league_competitions where id = p_lc_id;
  if v_league is null then
    raise exception 'Disputa não encontrada.';
  end if;
  if not (public.is_league_admin(v_league) or public.is_app_admin()) then
    raise exception 'Apenas administradores da federação podem sortear.';
  end if;

  delete from public.cup_ties where league_competition_id = p_lc_id;
  delete from public.confronto_participants where league_competition_id = p_lc_id;

  insert into public.confronto_participants (league_competition_id, user_id, seed)
  select p_lc_id, (e ->> 'user_id')::uuid, coalesce((e ->> 'seed')::int, 0)
  from jsonb_array_elements(p_participants) e;

  insert into public.cup_ties
    (league_competition_id, round_order, round_label, slot, member_a, member_b,
     matchday, period_kind, period_value, status)
  select p_lc_id,
         (e ->> 'round_order')::int,
         e ->> 'round_label',
         (e ->> 'slot')::int,
         nullif(e ->> 'member_a', '')::uuid,
         nullif(e ->> 'member_b', '')::uuid,
         nullif(e ->> 'matchday', '')::int,
         nullif(e ->> 'period_kind', ''),
         nullif(e ->> 'period_value', ''),
         'pending'
  from jsonb_array_elements(p_ties) e;

  update public.league_competitions
    set confronto_state = 'drawn', drawn_at = now()
    where id = p_lc_id;
end;
$$;
grant execute on function public.draw_confronto(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- get_confronto_ties — pontos por PERÍODO (não só matchday). Mantém W.O. e bye.
-- ---------------------------------------------------------------------------
drop function if exists public.get_confronto_ties(uuid);
create function public.get_confronto_ties(p_lc_id uuid)
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
    select competition_id from public.league_competitions where id = p_lc_id
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
  order by t.round_order, t.slot;
$$;
grant execute on function public.get_confronto_ties(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_confronto_standings — 3/1/0 por PERÍODO. Mantém W.O.
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
    select id, league_id, competition_id from public.league_competitions where id = p_lc_id
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
  where mem.league_id = (select league_id from lc) and mem.status = 'active'
  order by rank;
$$;
grant execute on function public.get_confronto_standings(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_tie_detail — jogos do PERÍODO do confronto (mantém anti-trapaça).
-- ---------------------------------------------------------------------------
drop function if exists public.get_tie_detail(uuid);
create function public.get_tie_detail(p_tie_id uuid)
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
    select competition_id from public.league_competitions
    where id = (select league_competition_id from t)
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
  order by m.kickoff_at;
$$;
grant execute on function public.get_tie_detail(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- undo_confronto_draw — checagem de "já começou" por período.
-- ---------------------------------------------------------------------------
create or replace function public.undo_confronto_draw(p_lc_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
  v_comp uuid;
  v_started boolean;
begin
  select league_id, competition_id into v_league, v_comp
  from public.league_competitions where id = p_lc_id;
  if v_league is null then
    raise exception 'Disputa não encontrada.';
  end if;
  if not (public.is_league_admin(v_league) or public.is_app_admin()) then
    raise exception 'Apenas administradores da federação podem desfazer.';
  end if;

  select exists (
    select 1
    from public.cup_ties t
    join public.matches m on m.competition_id = v_comp
      and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
    where t.league_competition_id = p_lc_id and m.status in ('live', 'finished')
  ) into v_started;
  if v_started then
    raise exception 'Os confrontos já começaram — não dá mais para desfazer.';
  end if;

  delete from public.cup_ties where league_competition_id = p_lc_id;
  delete from public.confronto_participants where league_competition_id = p_lc_id;
  update public.league_competitions
    set confronto_state = 'draft', drawn_at = null
    where id = p_lc_id;
end;
$$;
grant execute on function public.undo_confronto_draw(uuid) to authenticated;
