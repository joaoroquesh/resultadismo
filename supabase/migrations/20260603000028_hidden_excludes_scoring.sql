-- ============================================================================
-- Resultadismo · Jogo oculto NÃO conta para a pontuação
-- ----------------------------------------------------------------------------
-- `matches.hidden` (curadoria do admin) já tira o jogo dos palpites. Mas se
-- alguém palpitou ANTES de o jogo ser ocultado, o palpite continuava somando
-- pontos. Aqui as funções de pontuação passam a EXCLUIR jogos ocultos em todo
-- lugar que soma/decide pontos:
--   get_league_standings · get_player_profile · get_confronto_standings ·
--   get_confronto_ties · get_tie_detail · advance_confronto_cup
-- É filtro de leitura (`and m.hidden = false`): desocultar o jogo volta a
-- contar na hora, sem recomputar nada. Não muda 3/2/1 nem o desempate.
-- Defs reproduzidas a partir de pg_get_functiondef + a linha do filtro.
-- ============================================================================

-- ---------- get_league_standings ----------
CREATE OR REPLACE FUNCTION public.get_league_standings(p_lc_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, jogos integer, pontos integer, cravadas integer, saldos integer, acertos integer, erros integer, aproveitamento numeric, acertividade numeric, rank integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and m.status = 'finished' and m.hidden = false
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
$function$

;

-- ---------- get_player_profile ----------
CREATE OR REPLACE FUNCTION public.get_player_profile(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_name text;
  v_avatar text;
  v_since timestamptz;
  v_jogos int; v_pontos int; v_cravadas int; v_saldos int; v_acertos int; v_erros int;
  v_leagues jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  select display_name, avatar_url, created_at
    into v_name, v_avatar, v_since
  from public.profiles where id = p_user_id;
  if v_name is null then
    return null;
  end if;

  -- stats globais (jogos finalizados, pontuação padrão 3/2/1)
  select
    count(*)::int,
    coalesce(sum(case pr.score_type when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end), 0)::int,
    count(*) filter (where pr.score_type = 'cravada')::int,
    count(*) filter (where pr.score_type = 'saldo')::int,
    count(*) filter (where pr.score_type = 'acerto')::int,
    count(*) filter (where pr.score_type = 'erro')::int
    into v_jogos, v_pontos, v_cravadas, v_saldos, v_acertos, v_erros
  from public.predictions pr
  join public.matches m on m.id = pr.match_id
  where pr.user_id = p_user_id and m.status = 'finished' and m.hidden = false and pr.score_type is not null;

  -- ligas do jogador visíveis a quem consulta (pública, compartilhada ou admin)
  select coalesce(
    jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'slug', l.slug) order by l.name),
    '[]'::jsonb)
    into v_leagues
  from public.league_members lm
  join public.leagues l on l.id = lm.league_id
  where lm.user_id = p_user_id
    and lm.status = 'active'
    and l.deleted_at is null
    and (l.visibility = 'public' or public.is_app_admin() or public.is_league_member(l.id));

  return jsonb_build_object(
    'user_id', p_user_id,
    'display_name', v_name,
    'avatar_url', v_avatar,
    'member_since', v_since,
    'stats', jsonb_build_object(
      'jogos', coalesce(v_jogos, 0),
      'pontos', coalesce(v_pontos, 0),
      'cravadas', coalesce(v_cravadas, 0),
      'saldos', coalesce(v_saldos, 0),
      'acertos', coalesce(v_acertos, 0),
      'erros', coalesce(v_erros, 0),
      'aproveitamento', case when coalesce(v_jogos, 0) = 0 then 0
        else round(v_pontos::numeric / (3 * v_jogos) * 100, 1) end,
      'acertividade', case when coalesce(v_jogos, 0) = 0 then 0
        else round((v_cravadas + v_saldos + v_acertos)::numeric / v_jogos * 100, 1) end
    ),
    'leagues', v_leagues
  );
end;
$function$

;

-- ---------- get_confronto_standings ----------
CREATE OR REPLACE FUNCTION public.get_confronto_standings(p_lc_id uuid)
 RETURNS TABLE(user_id uuid, display_name text, avatar_url text, jogos integer, vitorias integer, empates integer, derrotas integer, pontos integer, gols_pro integer, gols_contra integer, rank integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      where m.competition_id = lc.competition_id and m.status = 'finished' and m.hidden = false
        and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
    ) a on true
    left join lateral (
      select sum(coalesce(public.score_points(pr.score_type), 0)
                 * (case when pr.is_joker then 2 else 1 end))::int as pts
      from public.matches m
      join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_b
      where m.competition_id = lc.competition_id and m.status = 'finished' and m.hidden = false
        and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
    ) b on true
    left join lateral (
      select exists (
        select 1 from public.matches m
        where m.competition_id = lc.competition_id and m.status = 'finished' and m.hidden = false
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
$function$

;

-- ---------- get_confronto_ties ----------
CREATE OR REPLACE FUNCTION public.get_confronto_ties(p_lc_id uuid)
 RETURNS TABLE(id uuid, round_order integer, round_label text, slot integer, matchday integer, member_a uuid, member_b uuid, name_a text, name_b text, avatar_a text, avatar_b text, pa integer, pb integer, winner uuid, resolved boolean, walkover boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    where m.status = 'finished' and m.hidden = false
      and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
  ) a on true
  left join lateral (
    select sum(coalesce(public.score_points(pr.score_type), 0)
               * (case when pr.is_joker then 2 else 1 end))::int as pts
    from public.matches m
    join comp on m.competition_id = comp.competition_id
    join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_b
    where m.status = 'finished' and m.hidden = false
      and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
  ) b on true
  left join lateral (
    select exists (
      select 1 from public.matches m
      join comp on m.competition_id = comp.competition_id
      where m.status = 'finished' and m.hidden = false
        and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
    ) as played
  ) pl on true
  where t.league_competition_id = p_lc_id
    and (select ok from gate)
  order by t.round_order, t.slot;
$function$

;

-- ---------- get_tie_detail ----------
CREATE OR REPLACE FUNCTION public.get_tie_detail(p_tie_id uuid)
 RETURNS TABLE(match_id uuid, kickoff_at timestamp with time zone, status match_status, home_name text, away_name text, home_score integer, away_score integer, a_home integer, a_away integer, a_pts integer, a_joker boolean, b_home integer, b_away integer, b_pts integer, b_joker boolean, a_palpitou boolean, b_palpitou boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and m.hidden = false
  order by m.kickoff_at;
$function$

;

-- ---------- advance_confronto_cup ----------
CREATE OR REPLACE FUNCTION public.advance_confronto_cup(p_lc_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_league uuid;
  v_comp uuid;
  v_total int := 0;
  v_n int;
  v_iter int := 0;
begin
  select league_id, competition_id into v_league, v_comp
  from public.league_competitions where id = p_lc_id;
  if v_league is null then
    return 0;
  end if;
  if not (public.is_league_member(v_league) or public.is_app_admin()) then
    return 0;
  end if;

  loop
    v_iter := v_iter + 1;
    exit when v_iter > 12; -- backstop: brackets têm poucas fases

    with seeds as (
      select user_id, seed from public.confronto_participants
      where league_competition_id = p_lc_id
    ),
    resolved as (
      select
        t.round_order, t.slot,
        case
          when t.member_b is null then t.member_a
          when t.walkover_user is not null then
            case when t.walkover_user = t.member_a then t.member_b else t.member_a end
          when not pl.played then null
          when coalesce(a.pts, 0) > coalesce(b.pts, 0) then t.member_a
          when coalesce(b.pts, 0) > coalesce(a.pts, 0) then t.member_b
          else case when coalesce(sa.seed, 2147483647) <= coalesce(sb.seed, 2147483647)
                    then t.member_a else t.member_b end
        end as winner
      from public.cup_ties t
      left join seeds sa on sa.user_id = t.member_a
      left join seeds sb on sb.user_id = t.member_b
      left join lateral (
        select sum(coalesce(public.score_points(pr.score_type), 0)
                   * (case when pr.is_joker then 2 else 1 end))::int as pts
        from public.matches m
        join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_a
        where m.competition_id = v_comp and m.status = 'finished' and m.hidden = false
          and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
      ) a on true
      left join lateral (
        select sum(coalesce(public.score_points(pr.score_type), 0)
                   * (case when pr.is_joker then 2 else 1 end))::int as pts
        from public.matches m
        join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_b
        where m.competition_id = v_comp and m.status = 'finished' and m.hidden = false
          and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
      ) b on true
      left join lateral (
        select exists (
          select 1 from public.matches m
          where m.competition_id = v_comp and m.status = 'finished' and m.hidden = false
            and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
        ) as played
      ) pl on true
      where t.league_competition_id = p_lc_id
    )
    update public.cup_ties pt
    set member_a = case when (r.slot % 2) = 1 then r.winner else pt.member_a end,
        member_b = case when (r.slot % 2) = 0 then r.winner else pt.member_b end
    from resolved r
    where pt.league_competition_id = p_lc_id
      and pt.round_order = r.round_order + 1
      and pt.slot = ((r.slot + 1) / 2)
      and r.winner is not null
      and (
        ((r.slot % 2) = 1 and pt.member_a is null)
        or ((r.slot % 2) = 0 and pt.member_b is null)
      );
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n = 0;
  end loop;

  return v_total;
end;
$function$

;

