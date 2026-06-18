-- ============================================================================
-- Resultadismo · Classificação AO VIVO + setas de movimentação
-- ----------------------------------------------------------------------------
-- ADITIVA: nova RPC get_league_standings_live (NÃO altera get_league_standings,
-- que segue sendo a oficial — prêmio/pote/confronto/ranking global continuam no
-- placar FINAL). A live é só pra EXIBIÇÃO da aba Classificação.
--
-- Devolve as mesmas colunas + rank_anterior + ao_vivo:
--   • pontos AO VIVO: projeta os jogos status='live' do bloco atual com
--     compute_score_type sobre o placar corrente (golden), pesos da liga e joker.
--   • rank_anterior: posição no PLACAR-BASE = antes do BLOCO de jogos atual.
--     Bloco = jogos que se sobrepõem no tempo (gaps-and-islands; novo bloco
--     quando o intervalo entre kickoffs > 150 min). Bloco atual = o mais recente
--     (contém os jogos ao vivo, ou o último lote encerrado). Sem jogos antes do
--     bloco → sem seta (rank_anterior = rank).
-- ============================================================================
-- drop antes do create: a RPC é nova nesta migration; o drop deixa idempotente
-- e permite evoluir o RETURNS TABLE sem o erro "cannot change return type".
drop function if exists public.get_league_standings_live(uuid);
create or replace function public.get_league_standings_live(p_lc_id uuid)
returns table (
  user_id uuid, display_name text, avatar_url text,
  jogos int, pontos int, cravadas int, saldos int, acertos int, erros int,
  aproveitamento numeric, acertividade numeric, rank int,
  rank_anterior int, ao_vivo boolean, live_scoring boolean
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
  v_p_cravada int; v_p_saldo int; v_p_acerto int;
  v_scope text[];
  v_block_start timestamptz;   -- início do bloco atual (placar-base)
  v_has_baseline boolean;      -- há jogo encerrado antes do bloco? (senão, sem seta)
begin
  select lc.league_id, lc.competition_id, lc.starts_on,
         coalesce((lc.settings -> 'points' ->> 'cravada')::int, 3),
         coalesce((lc.settings -> 'points' ->> 'saldo')::int, 2),
         coalesce((lc.settings -> 'points' ->> 'acerto')::int, 1),
         lc.followed_team_slugs
    into v_league_id, v_competition_id, v_starts_on, v_p_cravada, v_p_saldo, v_p_acerto, v_scope
  from public.league_competitions lc
  where lc.id = p_lc_id;

  if v_league_id is null then return; end if;
  if coalesce(v_p_cravada, 0) <= 0 then v_p_cravada := 3; end if;

  select l.visibility into v_visibility from public.leagues l where l.id = v_league_id;
  if not (public.is_app_admin() or public.is_league_member(v_league_id) or v_visibility = 'public') then
    return;
  end if;

  -- Início do BLOCO atual (gaps-and-islands sobre os jogos relevantes finished+live).
  with rel as (
    select m.kickoff_at
    from public.matches m
    where m.competition_id = v_competition_id
      and m.status in ('finished', 'live')
      and m.hidden = false
      and m.kickoff_at is not null
      and (v_starts_on is null or (m.kickoff_at at time zone 'America/Sao_Paulo')::date >= v_starts_on)
      and (v_scope is null
           or public.team_slug(m.home_team_name) = any(v_scope)
           or public.team_slug(m.away_team_name) = any(v_scope))
  ),
  flagged as (
    select kickoff_at,
      case when lag(kickoff_at) over (order by kickoff_at) is null
             or kickoff_at - lag(kickoff_at) over (order by kickoff_at) > interval '150 minutes'
           then 1 else 0 end as newblk
    from rel
  ),
  blk as (
    select kickoff_at,
      sum(newblk) over (order by kickoff_at rows between unbounded preceding and current row) as block_id
    from flagged
  )
  select min(b.kickoff_at) into v_block_start
  from blk b
  where b.block_id = (select max(block_id) from blk);

  v_has_baseline := v_block_start is not null and exists (
    select 1 from public.matches m
    where m.competition_id = v_competition_id and m.status = 'finished' and m.hidden = false
      and m.kickoff_at < v_block_start
      and (v_starts_on is null or (m.kickoff_at at time zone 'America/Sao_Paulo')::date >= v_starts_on)
      and (v_scope is null
           or public.team_slug(m.home_team_name) = any(v_scope)
           or public.team_slug(m.away_team_name) = any(v_scope))
  );

  return query
  with members as (
    select lm.user_id, p.display_name, p.avatar_url, p.created_at
    from public.league_members lm
    join public.profiles p on p.id = lm.user_id
    where lm.league_id = v_league_id and lm.status = 'active'
  ),
  -- AGORA: encerrados (score_type guardado) + ao vivo do bloco (projetado na hora)
  cur_scored as (
    select pr.user_id,
      (case when m.status = 'finished' then pr.score_type
            else public.compute_score_type(pr.home_pred, pr.away_pred, m.home_score, m.away_score) end) as st,
      pr.is_joker,
      (m.status = 'live') as is_live
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.competition_id = v_competition_id
      and m.hidden = false
      and (v_starts_on is null or (m.kickoff_at at time zone 'America/Sao_Paulo')::date >= v_starts_on)
      and (v_scope is null
           or public.team_slug(m.home_team_name) = any(v_scope)
           or public.team_slug(m.away_team_name) = any(v_scope))
      and (
        (m.status = 'finished' and pr.score_type is not null)
        or (m.status = 'live' and m.home_score is not null and m.away_score is not null)
      )
  ),
  cur_agg as (
    select cs.user_id,
      count(*)::int as jogos,
      sum((case cs.st when 'cravada' then v_p_cravada when 'saldo' then v_p_saldo when 'acerto' then v_p_acerto else 0 end)
          * (case when cs.is_joker then 2 else 1 end))::int as pontos,
      count(*) filter (where cs.st = 'cravada')::int as cravadas,
      count(*) filter (where cs.st = 'saldo')::int as saldos,
      count(*) filter (where cs.st = 'acerto')::int as acertos,
      count(*) filter (where cs.st = 'erro')::int as erros,
      bool_or(cs.is_live) as ao_vivo,
      bool_or(cs.is_live and cs.st <> 'erro') as live_scoring
    from cur_scored cs group by cs.user_id
  ),
  cur_ranked as (
    select mem.user_id, mem.display_name, mem.avatar_url,
      coalesce(a.jogos, 0) as jogos, coalesce(a.pontos, 0) as pontos,
      coalesce(a.cravadas, 0) as cravadas, coalesce(a.saldos, 0) as saldos,
      coalesce(a.acertos, 0) as acertos, coalesce(a.erros, 0) as erros,
      coalesce(a.ao_vivo, false) as ao_vivo,
      coalesce(a.live_scoring, false) as live_scoring,
      (row_number() over (
        order by coalesce(a.pontos, 0) desc, coalesce(a.cravadas, 0) desc, coalesce(a.saldos, 0) desc,
          (case when coalesce(a.jogos, 0) = 0 then 0 else coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos) end) desc,
          (case when coalesce(a.jogos, 0) = 0 then 0 else (a.cravadas + a.saldos + a.acertos)::numeric / a.jogos end) desc,
          mem.created_at asc))::int as rank
    from members mem left join cur_agg a on a.user_id = mem.user_id
  ),
  -- PLACAR-BASE: só encerrados ANTES do início do bloco atual
  base_scored as (
    select pr.user_id, pr.score_type as st, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.competition_id = v_competition_id
      and m.status = 'finished'
      and pr.score_type is not null
      and m.hidden = false
      and m.kickoff_at < v_block_start
      and (v_starts_on is null or (m.kickoff_at at time zone 'America/Sao_Paulo')::date >= v_starts_on)
      and (v_scope is null
           or public.team_slug(m.home_team_name) = any(v_scope)
           or public.team_slug(m.away_team_name) = any(v_scope))
  ),
  base_agg as (
    select bs.user_id,
      count(*)::int as jogos,
      sum((case bs.st when 'cravada' then v_p_cravada when 'saldo' then v_p_saldo when 'acerto' then v_p_acerto else 0 end)
          * (case when bs.is_joker then 2 else 1 end))::int as pontos,
      count(*) filter (where bs.st = 'cravada')::int as cravadas,
      count(*) filter (where bs.st = 'saldo')::int as saldos,
      count(*) filter (where bs.st = 'acerto')::int as acertos
    from base_scored bs group by bs.user_id
  ),
  base_ranked as (
    select mem.user_id,
      (row_number() over (
        order by coalesce(a.pontos, 0) desc, coalesce(a.cravadas, 0) desc, coalesce(a.saldos, 0) desc,
          (case when coalesce(a.jogos, 0) = 0 then 0 else coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos) end) desc,
          (case when coalesce(a.jogos, 0) = 0 then 0 else (a.cravadas + a.saldos + a.acertos)::numeric / a.jogos end) desc,
          mem.created_at asc))::int as rank_anterior
    from members mem left join base_agg a on a.user_id = mem.user_id
  )
  select
    c.user_id, c.display_name, c.avatar_url,
    c.jogos, c.pontos, c.cravadas, c.saldos, c.acertos, c.erros,
    case when c.jogos = 0 then 0 else round(c.pontos::numeric / (v_p_cravada * c.jogos) * 100, 1) end,
    case when c.jogos = 0 then 0 else round((c.cravadas + c.saldos + c.acertos)::numeric / c.jogos * 100, 1) end,
    c.rank,
    case when v_has_baseline then b.rank_anterior else c.rank end as rank_anterior,
    c.ao_vivo,
    c.live_scoring
  from cur_ranked c
  join base_ranked b on b.user_id = c.user_id
  order by c.rank;
end;
$$;
revoke all on function public.get_league_standings_live(uuid) from public, anon;
grant execute on function public.get_league_standings_live(uuid) to authenticated;
