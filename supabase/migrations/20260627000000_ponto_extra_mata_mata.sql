-- ============================================================================
-- Resultadismo · Ponto Extra "quem passa" (mata-mata) — branch dedicada
-- ----------------------------------------------------------------------------
-- Segunda dimensão de pontuação, PARALELA ao 3/2/1 do placar: +1 por acertar
-- QUEM SE CLASSIFICA num jogo de mata-mata. O avanço pode ser decidido em
-- 90'+prorrogação OU nos pênaltis — sem ferir a Regra Central nº1 (pênaltis NÃO
-- contam para o placar 3/2/1; aqui contam só para o bônus).
--
-- AUTOMAÇÃO (pedido do João): "é mata-mata?" é derivado da FASE (stage) que as
-- APIs já retornam — via trigger no banco, sem depender do admin. Os pênaltis já
-- vêm do sync (matches.home_pen/away_pen). O "quem avançou" cai no resolved_advancer
-- (placar→pênaltis), então o +1 calcula sozinho. Admin só precisa intervir em
-- casos sem fase (jogo manual) ou W.O.
--
-- Decisões do PO: +1 fixo; vitória → classificado implícito (vencedor previsto);
-- empate → predictions.advance_team_id (seletor "Quem passa?"). Vale no Bolão e no
-- Confronto; NÃO dobra com coringa; soma nos pontos; entra no APROVEITAMENTO (teto
-- +1 por jogo de mata-mata pontuado); NÃO vira novo critério de desempate. Retrô fora.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colunas
-- ---------------------------------------------------------------------------
alter table public.matches
  add column if not exists is_knockout boolean not null default false,
  add column if not exists advanced_team_id uuid references public.teams (id);

comment on column public.matches.is_knockout is
  'Jogo de mata-mata. Derivado automaticamente da fase (stage) por trigger; habilita o bônus "quem passa" +1.';
comment on column public.matches.advanced_team_id is
  'Quem AVANÇOU de fato (override canônico p/ W.O. etc.). Null = usa o fallback placar/pênalti (resolved_advancer).';

alter table public.predictions
  add column if not exists advance_team_id uuid references public.teams (id),
  add column if not exists advance_bonus int;

comment on column public.predictions.advance_team_id is
  'Escolha "quem passa" SÓ no palpite de empate em jogo de mata-mata. Em vitória/não-eliminatório fica null (trigger normaliza).';
comment on column public.predictions.advance_bonus is
  'Bônus +1 já apurado pelo motor (idempotente). Null antes de pontuar / fora do mata-mata; 0 ou 1 depois.';

-- ---------------------------------------------------------------------------
-- 2. Automação: a FASE define se é mata-mata (sync e admin escrevem stage)
-- ---------------------------------------------------------------------------
create or replace function public.is_knockout_stage(p_stage text)
returns boolean
language sql
immutable
as $$
  select case
    when p_stage is null or btrim(p_stage) = '' then false
    when upper(p_stage) ~ '(GROUP|REGULAR|LEAGUE_STAGE|LEAGUE_PHASE)' then false
    else upper(p_stage) ~ '(LAST_[0-9]+|QUARTER|SEMI|FINAL|THIRD|PLAYOFF)'
  end;
$$;

-- Pontos do bônus "quem passa" POR FASE (decisão do João 2026-06-21): 16-avos 1,
-- oitavas 2, quartas 3, semi/3º 4, final 5. Mata-mata sem fase reconhecida → 1;
-- não-mata-mata → 0 (segurança: a função só é chamada em jogo de mata-mata).
create or replace function public.knockout_phase_points(p_stage text)
returns int
language sql
immutable
as $$
  select case
    when not public.is_knockout_stage(p_stage) then 0
    when upper(p_stage) = 'LAST_32' then 1
    when upper(p_stage) = 'LAST_16' then 2
    when upper(p_stage) in ('QUARTER_FINALS', 'QUARTER_FINAL') then 3
    when upper(p_stage) in ('SEMI_FINALS', 'SEMI_FINAL', 'THIRD_PLACE') then 4
    when upper(p_stage) = 'FINAL' then 5
    else 1
  end;
$$;
grant execute on function public.knockout_phase_points(text) to authenticated, anon;

-- Trigger: quando há FASE, ela manda em is_knockout (automação). Sem fase
-- (jogo manual stageless), preserva o valor atual (permite override do admin).
create or replace function public.matches_set_knockout()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.stage is not null and btrim(new.stage) <> '' then
    new.is_knockout := public.is_knockout_stage(new.stage);
  end if;
  return new;
end;
$$;

drop trigger if exists matches_set_knockout on public.matches;
create trigger matches_set_knockout
before insert or update on public.matches
for each row execute function public.matches_set_knockout();

-- Backfill: marca os jogos já sincronizados com fase de mata-mata.
update public.matches set is_knockout = public.is_knockout_stage(stage)
where stage is not null and btrim(stage) <> ''
  and is_knockout is distinct from public.is_knockout_stage(stage);

-- ---------------------------------------------------------------------------
-- 3. Funções puras: avançador real + bônus
-- ---------------------------------------------------------------------------
create or replace function public.resolved_advancer(m public.matches)
returns uuid
language sql
immutable
as $$
  select coalesce(
    m.advanced_team_id,
    case
      when m.home_score is null or m.away_score is null then null
      when m.home_score > m.away_score then m.home_team_id
      when m.home_score < m.away_score then m.away_team_id
      when m.home_pen is not null and m.away_pen is not null and m.home_pen > m.away_pen then m.home_team_id
      when m.home_pen is not null and m.away_pen is not null and m.home_pen < m.away_pen then m.away_team_id
      else null
    end
  );
$$;

create or replace function public.advance_bonus(
  p_home_pred int, p_away_pred int,
  p_pred_advance uuid,
  p_home_team uuid, p_away_team uuid,
  p_real_advance uuid
)
returns int
language sql
immutable
as $$
  select case
    when p_real_advance is null then null
    when p_home_pred is null or p_away_pred is null then null
    when p_home_pred > p_away_pred then (case when p_home_team = p_real_advance then 1 else 0 end)
    when p_home_pred < p_away_pred then (case when p_away_team = p_real_advance then 1 else 0 end)
    when p_pred_advance is null then 0
    else (case when p_pred_advance = p_real_advance then 1 else 0 end)
  end;
$$;

grant execute on function public.is_knockout_stage(text) to authenticated, anon;
grant execute on function public.resolved_advancer(public.matches) to authenticated;
grant execute on function public.advance_bonus(int, int, uuid, uuid, uuid, uuid) to authenticated;

-- Bônus "quem passa" PROVISÓRIO ao vivo: durante o jogo o classificado é deduzido do
-- PLACAR ATUAL (sem pênaltis — empate ao vivo = ninguém definido), escalado pela fase.
-- As funções _live usam isto enquanto o jogo está 'live'; no encerrado vale a coluna
-- predictions.advance_bonus (que aí já considera os pênaltis). Decisão do João 2026-06-27.
create or replace function public.provisional_advance_bonus(
  p_home_pred int, p_away_pred int, p_pred_advance uuid,
  p_home_team uuid, p_away_team uuid,
  p_home_score int, p_away_score int, p_stage text
)
returns int
language sql
immutable
as $$
  select coalesce(public.advance_bonus(
    p_home_pred, p_away_pred, p_pred_advance, p_home_team, p_away_team,
    case
      when p_home_score is null or p_away_score is null then null
      when p_home_score > p_away_score then p_home_team
      when p_away_score > p_home_score then p_away_team
      else null
    end
  ), 0) * public.knockout_phase_points(p_stage);
$$;
grant execute on function public.provisional_advance_bonus(int, int, uuid, uuid, uuid, int, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Triggers de pontuação ganham o ramo do bônus (idempotente, re-pontua)
-- ---------------------------------------------------------------------------
create or replace function public.predictions_score_on_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare m public.matches;
begin
  select * into m from public.matches where id = new.match_id;

  -- normaliza "quem passa": só vale em mata-mata + palpite de empate
  if not coalesce(m.is_knockout, false) or new.home_pred <> new.away_pred then
    new.advance_team_id := null;
  elsif new.advance_team_id is not null
        and m.home_team_id is not null and m.away_team_id is not null
        and new.advance_team_id <> m.home_team_id and new.advance_team_id <> m.away_team_id then
    raise exception 'advance_team_id deve ser um dos times do jogo';
  end if;

  if m.status = 'finished' and m.home_score is not null and m.away_score is not null then
    new.score_type := public.compute_score_type(new.home_pred, new.away_pred, m.home_score, m.away_score);
    new.points := public.score_points(new.score_type);
    new.scored_at := now();
    new.advance_bonus := case when coalesce(m.is_knockout, false) then public.advance_bonus(
      new.home_pred, new.away_pred, new.advance_team_id, m.home_team_id, m.away_team_id, public.resolved_advancer(m))
      * public.knockout_phase_points(m.stage)
      else null end;
  else
    new.score_type := null;
    new.points := null;
    new.scored_at := null;
    new.advance_bonus := null;
  end if;
  return new;
end;
$$;

drop trigger if exists predictions_score on public.predictions;
create trigger predictions_score
before insert or update of home_pred, away_pred, advance_team_id on public.predictions
for each row execute function public.predictions_score_on_write();

create or replace function public.matches_rescore_predictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_real uuid;
begin
  if new.status = 'finished' and new.home_score is not null and new.away_score is not null then
    v_real := public.resolved_advancer(new);
    update public.predictions p
    set score_type = public.compute_score_type(p.home_pred, p.away_pred, new.home_score, new.away_score),
        points = public.score_points(public.compute_score_type(p.home_pred, p.away_pred, new.home_score, new.away_score)),
        advance_bonus = case when coalesce(new.is_knockout, false) then public.advance_bonus(
          p.home_pred, p.away_pred, p.advance_team_id, new.home_team_id, new.away_team_id, v_real)
          * public.knockout_phase_points(new.stage) else null end,
        scored_at = now()
    where p.match_id = new.id;
  else
    update public.predictions p
    set score_type = null, points = null, advance_bonus = null, scored_at = null
    where p.match_id = new.id and (p.points is not null or p.advance_bonus is not null);
  end if;
  return new;
end;
$$;

drop trigger if exists matches_rescore on public.matches;
create trigger matches_rescore
after update of home_score, away_score, status, is_knockout, advanced_team_id, home_pen, away_pen
on public.matches
for each row execute function public.matches_rescore_predictions();

-- ---------------------------------------------------------------------------
-- 5. Classificação OFICIAL: +bônus nos pontos; entra no aproveitamento (teto
--    +1 por jogo de mata-mata); desempate fixo inalterado. Base: 20260615190000.
-- ---------------------------------------------------------------------------
create or replace function public.get_league_standings(p_lc_id uuid)
returns table (
  user_id uuid, display_name text, avatar_url text,
  jogos int, pontos int, cravadas int, saldos int, acertos int, erros int,
  aproveitamento numeric, acertividade numeric, rank int
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

  return query
  with members as (
    select lm.user_id, p.display_name, p.avatar_url, p.created_at
    from public.league_members lm
    join public.profiles p on p.id = lm.user_id
    where lm.league_id = v_league_id and lm.status = 'active'
  ),
  scored as (
    select pr.user_id, pr.score_type, pr.is_joker,
           coalesce(pr.advance_bonus, 0) as bonus,
           public.knockout_phase_points(m.stage) as bonus_max
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.competition_id = v_competition_id
      and m.status = 'finished'
      and pr.score_type is not null
      and (v_starts_on is null
           or (m.kickoff_at at time zone 'America/Sao_Paulo')::date >= v_starts_on)
      and (v_scope is null
           or public.team_slug(m.home_team_name) = any(v_scope)
           or public.team_slug(m.away_team_name) = any(v_scope))
  ),
  agg as (
    select s.user_id,
      count(*)::int as jogos,
      (sum((case s.score_type when 'cravada' then v_p_cravada when 'saldo' then v_p_saldo when 'acerto' then v_p_acerto else 0 end)
           * (case when s.is_joker then 2 else 1 end)) + sum(s.bonus))::int as pontos,
      coalesce(sum(s.bonus_max), 0)::int as bonus_teto,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos,
      count(*) filter (where s.score_type = 'acerto')::int as acertos,
      count(*) filter (where s.score_type = 'erro')::int as erros
    from scored s group by s.user_id
  )
  select
    mem.user_id, mem.display_name, mem.avatar_url,
    coalesce(a.jogos, 0), coalesce(a.pontos, 0), coalesce(a.cravadas, 0),
    coalesce(a.saldos, 0), coalesce(a.acertos, 0), coalesce(a.erros, 0),
    case when coalesce(a.jogos, 0) = 0 then 0
         else round(coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos + coalesce(a.bonus_teto, 0)) * 100, 1) end,
    case when coalesce(a.jogos, 0) = 0 then 0
         else round((a.cravadas + a.saldos + a.acertos)::numeric / a.jogos * 100, 1) end,
    (row_number() over (
      order by coalesce(a.pontos, 0) desc, coalesce(a.cravadas, 0) desc, coalesce(a.saldos, 0) desc,
        (case when coalesce(a.jogos, 0) = 0 then 0 else coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos + coalesce(a.bonus_teto, 0)) end) desc,
        (case when coalesce(a.jogos, 0) = 0 then 0 else (a.cravadas + a.saldos + a.acertos)::numeric / a.jogos end) desc,
        mem.created_at asc))::int as rank
  from members mem
  left join agg a on a.user_id = mem.user_id
  order by rank;
end;
$$;
revoke execute on function public.get_league_standings(uuid) from public;
grant execute on function public.get_league_standings(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Classificação AO VIVO: +bônus dos jogos JÁ ENCERRADOS (ao vivo o avançador
--    é indeterminado). Base: 20260616140000_standings_ao_vivo.sql.
-- ---------------------------------------------------------------------------
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
  v_block_start timestamptz;
  v_has_baseline boolean;
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
  from blk b where b.block_id = (select max(block_id) from blk);

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
  cur_scored as (
    select pr.user_id,
      (case when m.status = 'finished' then pr.score_type
            else public.compute_score_type(pr.home_pred, pr.away_pred, m.home_score, m.away_score) end) as st,
      pr.is_joker,
      (m.status = 'live') as is_live,
      case when m.status = 'finished' then coalesce(pr.advance_bonus, 0)
           when coalesce(m.is_knockout, false) then public.provisional_advance_bonus(
             pr.home_pred, pr.away_pred, pr.advance_team_id, m.home_team_id, m.away_team_id,
             m.home_score, m.away_score, m.stage)
           else 0 end as bonus,
      case when coalesce(m.is_knockout, false) and m.status in ('finished', 'live')
           then public.knockout_phase_points(m.stage) else 0 end as bonus_max
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
      (sum((case cs.st when 'cravada' then v_p_cravada when 'saldo' then v_p_saldo when 'acerto' then v_p_acerto else 0 end)
          * (case when cs.is_joker then 2 else 1 end)) + sum(cs.bonus))::int as pontos,
      coalesce(sum(cs.bonus_max), 0)::int as bonus_teto,
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
      coalesce(a.bonus_teto, 0) as bonus_teto,
      coalesce(a.ao_vivo, false) as ao_vivo,
      coalesce(a.live_scoring, false) as live_scoring,
      (row_number() over (
        order by coalesce(a.pontos, 0) desc, coalesce(a.cravadas, 0) desc, coalesce(a.saldos, 0) desc,
          (case when coalesce(a.jogos, 0) = 0 then 0 else coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos + coalesce(a.bonus_teto, 0)) end) desc,
          (case when coalesce(a.jogos, 0) = 0 then 0 else (a.cravadas + a.saldos + a.acertos)::numeric / a.jogos end) desc,
          mem.created_at asc))::int as rank
    from members mem left join cur_agg a on a.user_id = mem.user_id
  ),
  base_scored as (
    select pr.user_id, pr.score_type as st, pr.is_joker,
      coalesce(pr.advance_bonus, 0) as bonus,
      public.knockout_phase_points(m.stage) as bonus_max
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
      (sum((case bs.st when 'cravada' then v_p_cravada when 'saldo' then v_p_saldo when 'acerto' then v_p_acerto else 0 end)
          * (case when bs.is_joker then 2 else 1 end)) + sum(bs.bonus))::int as pontos,
      coalesce(sum(bs.bonus_max), 0)::int as bonus_teto,
      count(*) filter (where bs.st = 'cravada')::int as cravadas,
      count(*) filter (where bs.st = 'saldo')::int as saldos,
      count(*) filter (where bs.st = 'acerto')::int as acertos
    from base_scored bs group by bs.user_id
  ),
  base_ranked as (
    select mem.user_id,
      (row_number() over (
        order by coalesce(a.pontos, 0) desc, coalesce(a.cravadas, 0) desc, coalesce(a.saldos, 0) desc,
          (case when coalesce(a.jogos, 0) = 0 then 0 else coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos + coalesce(a.bonus_teto, 0)) end) desc,
          (case when coalesce(a.jogos, 0) = 0 then 0 else (a.cravadas + a.saldos + a.acertos)::numeric / a.jogos end) desc,
          mem.created_at asc))::int as rank_anterior
    from members mem left join base_agg a on a.user_id = mem.user_id
  )
  select
    c.user_id, c.display_name, c.avatar_url,
    c.jogos, c.pontos, c.cravadas, c.saldos, c.acertos, c.erros,
    case when c.jogos = 0 then 0 else round(c.pontos::numeric / (v_p_cravada * c.jogos + c.bonus_teto) * 100, 1) end,
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

-- ===========================================================================
-- 7. Coerência do +1 nas demais superfícies (reproduz as definições VIGENTES da
--    2.5.0 e soma coalesce(advance_bonus,0)). As posições de grupo ao vivo
--    (get_my_league_positions_live / get_group_rank_window_live) já herdam o +1
--    porque delegam a get_league_standings_live.
-- ===========================================================================

-- 7.1 Ranking global OFICIAL (base 20260606000002) + bônus
create or replace function public.get_global_standings(
  p_competition_id uuid default null, p_year int default null,
  p_team_id uuid default null, p_limit int default 50
)
returns table(rank int, user_id uuid, display_name text, avatar_url text,
  pontos int, jogos int, cravadas int, saldos int, acertos int)
language sql stable security definer set search_path = '' as $$
  with scored as (
    select pr.user_id, pr.score_type, pr.is_joker, coalesce(pr.advance_bonus, 0) as bonus
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.status = 'finished' and m.hidden = false and pr.score_type is not null
      and (p_competition_id is null or m.competition_id = p_competition_id)
      and (p_year is null or extract(year from m.kickoff_at at time zone 'America/Sao_Paulo')::int = p_year)
      and (p_team_id is null or m.home_team_id = p_team_id or m.away_team_id = p_team_id)
  ),
  agg as (
    select s.user_id,
      (sum((case s.score_type when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
        * (case when s.is_joker then 2 else 1 end)) + sum(s.bonus))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos,
      count(*) filter (where s.score_type = 'acerto')::int as acertos
    from scored s group by s.user_id
  )
  select (row_number() over (order by a.pontos desc, a.cravadas desc, a.saldos desc, a.jogos asc))::int as rank,
    a.user_id, p.display_name, p.avatar_url, a.pontos, a.jogos, a.cravadas, a.saldos, a.acertos
  from agg a join public.profiles p on p.id = a.user_id
  where coalesce(p.show_in_global_ranking, true) = true
  order by a.pontos desc, a.cravadas desc, a.saldos desc, a.jogos asc
  limit greatest(coalesce(p_limit, 50), 1);
$$;
grant execute on function public.get_global_standings(uuid, int, uuid, int) to authenticated;

-- 7.2 Minha posição global OFICIAL + bônus
create or replace function public.get_my_global_rank(
  p_competition_id uuid default null, p_year int default null
)
returns table(rank int, pontos int, jogos int, total_resultadistas int)
language sql stable security definer set search_path = '' as $$
  with scored as (
    select pr.user_id, pr.score_type, pr.is_joker, coalesce(pr.advance_bonus, 0) as bonus
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.status = 'finished' and m.hidden = false and pr.score_type is not null
      and (p_competition_id is null or m.competition_id = p_competition_id)
      and (p_year is null or extract(year from m.kickoff_at at time zone 'America/Sao_Paulo')::int = p_year)
  ),
  agg as (
    select s.user_id,
      (sum((case s.score_type when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
        * (case when s.is_joker then 2 else 1 end)) + sum(s.bonus))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos
    from scored s group by s.user_id
  ),
  visible as (select a.* from agg a join public.profiles p on p.id = a.user_id where coalesce(p.show_in_global_ranking, true) = true),
  ranked as (select user_id, pontos, jogos, row_number() over (order by pontos desc, cravadas desc, saldos desc, jogos asc)::int as rk from visible)
  select rk::int as rank, pontos, jogos, (select count(*)::int from visible) as total_resultadistas
  from ranked where user_id = auth.uid();
$$;
grant execute on function public.get_my_global_rank(uuid, int) to authenticated;

-- 7.3 Ranking global AO VIVO (base 20260619120000) + bônus (só dos encerrados)
drop function if exists public.get_global_standings_live(uuid[], int);
create or replace function public.get_global_standings_live(
  p_competition_ids uuid[] default null, p_limit int default 50
)
returns table(rank int, user_id uuid, display_name text, avatar_url text,
  pontos int, jogos int, cravadas int, saldos int, acertos int,
  rank_anterior int, ao_vivo boolean, live_scoring boolean)
language sql stable security definer set search_path = '' as $$
  with cur_scored as (
    select pr.user_id,
      (case when m.status = 'finished' then pr.score_type
            else public.compute_score_type(pr.home_pred, pr.away_pred, m.home_score, m.away_score) end) as st,
      pr.is_joker, (m.status = 'live') as is_live,
      case when m.status = 'finished' then coalesce(pr.advance_bonus, 0)
           when coalesce(m.is_knockout, false) then public.provisional_advance_bonus(
             pr.home_pred, pr.away_pred, pr.advance_team_id, m.home_team_id, m.away_team_id,
             m.home_score, m.away_score, m.stage)
           else 0 end as bonus
    from public.predictions pr join public.matches m on m.id = pr.match_id
    where m.hidden = false
      and (p_competition_ids is null or m.competition_id = any(p_competition_ids))
      and ((m.status = 'finished' and pr.score_type is not null) or (m.status = 'live' and m.home_score is not null and m.away_score is not null))
  ),
  cur_agg as (
    select cs.user_id,
      (sum((case cs.st when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end) * (case when cs.is_joker then 2 else 1 end)) + sum(cs.bonus))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where cs.st = 'cravada')::int as cravadas,
      count(*) filter (where cs.st = 'saldo')::int as saldos,
      count(*) filter (where cs.st = 'acerto')::int as acertos,
      bool_or(cs.is_live) as ao_vivo,
      bool_or(cs.is_live and cs.st <> 'erro') as live_scoring
    from cur_scored cs group by cs.user_id
  ),
  cur_vis as (select a.*, p.display_name, p.avatar_url from cur_agg a join public.profiles p on p.id = a.user_id where coalesce(p.show_in_global_ranking, true) = true),
  cur_ranked as (select cv.*, (row_number() over (order by cv.pontos desc, cv.cravadas desc, cv.saldos desc, cv.jogos asc))::int as rank from cur_vis cv),
  base_scored as (
    select pr.user_id, pr.score_type as st, pr.is_joker, coalesce(pr.advance_bonus, 0) as bonus
    from public.predictions pr join public.matches m on m.id = pr.match_id
    where m.status = 'finished' and m.hidden = false and pr.score_type is not null
      and (p_competition_ids is null or m.competition_id = any(p_competition_ids))
  ),
  base_agg as (
    select bs.user_id,
      (sum((case bs.st when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end) * (case when bs.is_joker then 2 else 1 end)) + sum(bs.bonus))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where bs.st = 'cravada')::int as cravadas,
      count(*) filter (where bs.st = 'saldo')::int as saldos
    from base_scored bs group by bs.user_id
  ),
  base_vis as (select a.* from base_agg a join public.profiles p on p.id = a.user_id where coalesce(p.show_in_global_ranking, true) = true),
  base_ranked as (select bv.user_id, (row_number() over (order by bv.pontos desc, bv.cravadas desc, bv.saldos desc, bv.jogos asc))::int as rank_anterior from base_vis bv)
  select c.rank, c.user_id, c.display_name, c.avatar_url, c.pontos, c.jogos, c.cravadas, c.saldos, c.acertos,
    coalesce(b.rank_anterior, c.rank) as rank_anterior, c.ao_vivo, c.live_scoring
  from cur_ranked c left join base_ranked b on b.user_id = c.user_id
  order by c.rank limit greatest(coalesce(p_limit, 50), 1);
$$;
revoke all on function public.get_global_standings_live(uuid[], int) from public, anon;
grant execute on function public.get_global_standings_live(uuid[], int) to authenticated;

-- 7.4 Minha posição global AO VIVO + bônus (só dos encerrados)
drop function if exists public.get_my_global_rank_live(uuid[]);
create or replace function public.get_my_global_rank_live(p_competition_ids uuid[] default null)
returns table(rank int, pontos int, jogos int, total_resultadistas int, rank_anterior int, ao_vivo boolean, live_scoring boolean)
language sql stable security definer set search_path = '' as $$
  with cur_scored as (
    select pr.user_id,
      (case when m.status = 'finished' then pr.score_type
            else public.compute_score_type(pr.home_pred, pr.away_pred, m.home_score, m.away_score) end) as st,
      pr.is_joker, (m.status = 'live') as is_live,
      case when m.status = 'finished' then coalesce(pr.advance_bonus, 0)
           when coalesce(m.is_knockout, false) then public.provisional_advance_bonus(
             pr.home_pred, pr.away_pred, pr.advance_team_id, m.home_team_id, m.away_team_id,
             m.home_score, m.away_score, m.stage)
           else 0 end as bonus
    from public.predictions pr join public.matches m on m.id = pr.match_id
    where m.hidden = false
      and (p_competition_ids is null or m.competition_id = any(p_competition_ids))
      and ((m.status = 'finished' and pr.score_type is not null) or (m.status = 'live' and m.home_score is not null and m.away_score is not null))
  ),
  cur_agg as (
    select cs.user_id,
      (sum((case cs.st when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end) * (case when cs.is_joker then 2 else 1 end)) + sum(cs.bonus))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where cs.st = 'cravada')::int as cravadas,
      count(*) filter (where cs.st = 'saldo')::int as saldos,
      bool_or(cs.is_live) as ao_vivo,
      bool_or(cs.is_live and cs.st <> 'erro') as live_scoring
    from cur_scored cs group by cs.user_id
  ),
  cur_vis as (select a.* from cur_agg a join public.profiles p on p.id = a.user_id where coalesce(p.show_in_global_ranking, true) = true),
  cur_ranked as (select cv.user_id, cv.pontos, cv.jogos, cv.ao_vivo, cv.live_scoring, (row_number() over (order by cv.pontos desc, cv.cravadas desc, cv.saldos desc, cv.jogos asc))::int as rk from cur_vis cv),
  base_scored as (
    select pr.user_id, pr.score_type as st, pr.is_joker, coalesce(pr.advance_bonus, 0) as bonus
    from public.predictions pr join public.matches m on m.id = pr.match_id
    where m.status = 'finished' and m.hidden = false and pr.score_type is not null
      and (p_competition_ids is null or m.competition_id = any(p_competition_ids))
  ),
  base_agg as (
    select bs.user_id,
      (sum((case bs.st when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end) * (case when bs.is_joker then 2 else 1 end)) + sum(bs.bonus))::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where bs.st = 'cravada')::int as cravadas,
      count(*) filter (where bs.st = 'saldo')::int as saldos
    from base_scored bs group by bs.user_id
  ),
  base_vis as (select a.* from base_agg a join public.profiles p on p.id = a.user_id where coalesce(p.show_in_global_ranking, true) = true),
  base_ranked as (select bv.user_id, (row_number() over (order by bv.pontos desc, bv.cravadas desc, bv.saldos desc, bv.jogos asc))::int as rank_anterior from base_vis bv)
  select c.rk::int as rank, c.pontos, c.jogos, (select count(*)::int from cur_vis) as total_resultadistas,
    coalesce(b.rank_anterior, c.rk)::int as rank_anterior, c.ao_vivo, c.live_scoring
  from cur_ranked c left join base_ranked b on b.user_id = c.user_id
  where c.user_id = auth.uid();
$$;
revoke all on function public.get_my_global_rank_live(uuid[]) from public, anon;
grant execute on function public.get_my_global_rank_live(uuid[]) to authenticated;

-- 7.5 Perfil público (base 20260609000003) + bônus (teto do aproveitamento +1/jogo de mata-mata)
create or replace function public.get_player_profile(p_user_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_name text; v_avatar text; v_since timestamptz; v_fav text; v_nat text;
  v_jogos int; v_pontos int; v_cravadas int; v_saldos int; v_acertos int; v_erros int; v_bonus_teto int;
  v_leagues jsonb;
begin
  if auth.uid() is null then return null; end if;
  select display_name, avatar_url, created_at, favorite_team_id, national_team_id
    into v_name, v_avatar, v_since, v_fav, v_nat
  from public.profiles where id = p_user_id;
  if v_name is null then return null; end if;

  select
    count(*)::int,
    coalesce(sum(case pr.score_type when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
             + sum(coalesce(pr.advance_bonus, 0)), 0)::int,
    count(*) filter (where pr.score_type = 'cravada')::int,
    count(*) filter (where pr.score_type = 'saldo')::int,
    count(*) filter (where pr.score_type = 'acerto')::int,
    count(*) filter (where pr.score_type = 'erro')::int,
    coalesce(sum(public.knockout_phase_points(m.stage)), 0)::int
    into v_jogos, v_pontos, v_cravadas, v_saldos, v_acertos, v_erros, v_bonus_teto
  from public.predictions pr join public.matches m on m.id = pr.match_id
  where pr.user_id = p_user_id and m.status = 'finished' and pr.score_type is not null;

  select coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'slug', l.slug) order by l.name), '[]'::jsonb)
    into v_leagues
  from public.league_members lm join public.leagues l on l.id = lm.league_id
  where lm.user_id = p_user_id and lm.status = 'active' and l.deleted_at is null
    and (l.visibility = 'public' or public.is_app_admin() or public.is_league_member(l.id));

  return jsonb_build_object(
    'user_id', p_user_id, 'display_name', v_name, 'avatar_url', v_avatar, 'member_since', v_since,
    'favorite_team_id', v_fav, 'national_team_id', v_nat,
    'stats', jsonb_build_object(
      'jogos', coalesce(v_jogos, 0), 'pontos', coalesce(v_pontos, 0),
      'cravadas', coalesce(v_cravadas, 0), 'saldos', coalesce(v_saldos, 0),
      'acertos', coalesce(v_acertos, 0), 'erros', coalesce(v_erros, 0),
      'aproveitamento', case when coalesce(v_jogos, 0) = 0 then 0
        else round(v_pontos::numeric / (3 * v_jogos + coalesce(v_bonus_teto, 0)) * 100, 1) end,
      'acertividade', case when coalesce(v_jogos, 0) = 0 then 0
        else round((v_cravadas + v_saldos + v_acertos)::numeric / v_jogos * 100, 1) end
    ),
    'leagues', v_leagues);
end;
$$;

-- 7.6 Confronto: ties + standings + detalhe somam o +1 (base 20260603000020, mantém gate)
create or replace function public.get_confronto_ties(p_lc_id uuid)
returns table (
  id uuid, round_order int, round_label text, slot int, matchday int,
  member_a uuid, member_b uuid, name_a text, name_b text, avatar_a text, avatar_b text,
  pa int, pb int, winner uuid, resolved boolean, walkover boolean
)
language sql stable security definer set search_path = '' as $$
  with comp as (
    select lc.competition_id, lc.league_id, lc.confronto_state, l.visibility
    from public.league_competitions lc join public.leagues l on l.id = lc.league_id
    where lc.id = p_lc_id
  ),
  gate as (
    select ((public.is_app_admin() or public.is_league_member(c.league_id) or c.visibility = 'public')
      and (c.confronto_state is distinct from 'scheduled' or public.is_league_admin(c.league_id) or public.is_app_admin())) as ok
    from comp c
  )
  select
    t.id, t.round_order, t.round_label, t.slot, t.matchday,
    t.member_a, t.member_b,
    pa_p.display_name, pb_p.display_name, pa_p.avatar_url, pb_p.avatar_url,
    coalesce(a.pts, 0)::int as pa, coalesce(b.pts, 0)::int as pb,
    case
      when t.member_b is null then t.member_a
      when t.walkover_user is not null then case when t.walkover_user = t.member_a then t.member_b else t.member_a end
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
    select sum(coalesce(public.score_points(pr.score_type), 0) * (case when pr.is_joker then 2 else 1 end)
               + coalesce(pr.advance_bonus, 0))::int as pts
    from public.matches m
    join comp on m.competition_id = comp.competition_id
    join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_a
    where m.status = 'finished'
      and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
  ) a on true
  left join lateral (
    select sum(coalesce(public.score_points(pr.score_type), 0) * (case when pr.is_joker then 2 else 1 end)
               + coalesce(pr.advance_bonus, 0))::int as pts
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
  where t.league_competition_id = p_lc_id and (select ok from gate)
  order by t.round_order, t.slot;
$$;
grant execute on function public.get_confronto_ties(uuid) to anon, authenticated;

create or replace function public.get_confronto_standings(p_lc_id uuid)
returns table (
  user_id uuid, display_name text, avatar_url text,
  jogos int, vitorias int, empates int, derrotas int,
  pontos int, gols_pro int, gols_contra int, rank int
)
language sql stable security definer set search_path = '' as $$
  with lc as (
    select lc.id, lc.league_id, lc.competition_id, lc.confronto_state, l.visibility
    from public.league_competitions lc join public.leagues l on l.id = lc.league_id
    where lc.id = p_lc_id
  ),
  gate as (
    select ((public.is_app_admin() or public.is_league_member(lc.league_id) or lc.visibility = 'public')
      and (lc.confronto_state is distinct from 'scheduled' or public.is_league_admin(lc.league_id) or public.is_app_admin())) as ok
    from lc
  ),
  scored as (
    select t.member_a, t.member_b, t.walkover_user,
      coalesce(a.pts, 0) as pa, coalesce(b.pts, 0) as pb, pl.played
    from public.cup_ties t
    join lc on t.league_competition_id = lc.id
    left join lateral (
      select sum(coalesce(public.score_points(pr.score_type), 0) * (case when pr.is_joker then 2 else 1 end)
                 + coalesce(pr.advance_bonus, 0))::int as pts
      from public.matches m
      join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_a
      where m.competition_id = lc.competition_id and m.status = 'finished'
        and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
    ) a on true
    left join lateral (
      select sum(coalesce(public.score_points(pr.score_type), 0) * (case when pr.is_joker then 2 else 1 end)
                 + coalesce(pr.advance_bonus, 0))::int as pts
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
    select t.member_a as uid from public.cup_ties t
    join lc on t.league_competition_id = lc.id
    where t.member_b is null and t.member_a is not null
  ),
  ties as (select member_a, member_b, pa, pb from scored where walkover_user is null and played),
  wo as (select case when walkover_user = member_a then member_b else member_a end as winner_uid from scored where walkover_user is not null),
  results as (
    select member_a as uid, case when pa > pb then 3 when pa = pb then 1 else 0 end as pts,
           (pa > pb)::int as v, (pa = pb)::int as e, (pa < pb)::int as d, pa as gp, pb as gc from ties
    union all
    select member_b as uid, case when pb > pa then 3 when pa = pb then 1 else 0 end as pts,
           (pb > pa)::int as v, (pa = pb)::int as e, (pb < pa)::int as d, pb as gp, pa as gc from ties
    union all
    select winner_uid as uid, 3 as pts, 1 as v, 0 as e, 0 as d, 1 as gp, 0 as gc from wo
    union all
    select uid, 3 as pts, 1 as v, 0 as e, 0 as d, 1 as gp, 0 as gc from byes
  ),
  agg as (
    select uid, count(*)::int as jogos, sum(v)::int as vitorias, sum(e)::int as empates,
           sum(d)::int as derrotas, sum(pts)::int as pontos, sum(gp)::int as gols_pro, sum(gc)::int as gols_contra
    from results group by uid
  )
  select
    mem.user_id, pr.display_name, pr.avatar_url,
    coalesce(a.jogos, 0), coalesce(a.vitorias, 0), coalesce(a.empates, 0),
    coalesce(a.derrotas, 0), coalesce(a.pontos, 0), coalesce(a.gols_pro, 0), coalesce(a.gols_contra, 0),
    (row_number() over (order by coalesce(a.pontos, 0) desc,
       (coalesce(a.gols_pro, 0) - coalesce(a.gols_contra, 0)) desc,
       coalesce(a.gols_pro, 0) desc, mem.joined_at asc))::int as rank
  from public.league_members mem
  join public.profiles pr on pr.id = mem.user_id
  left join agg a on a.uid = mem.user_id
  where mem.league_id = (select league_id from lc) and mem.status = 'active' and (select ok from gate)
  order by rank;
$$;
grant execute on function public.get_confronto_standings(uuid) to anon, authenticated;

create or replace function public.get_tie_detail(p_tie_id uuid)
returns table (
  match_id uuid, kickoff_at timestamptz, status public.match_status,
  home_name text, away_name text, home_score int, away_score int,
  a_home int, a_away int, a_pts int, a_joker boolean,
  b_home int, b_away int, b_pts int, b_joker boolean,
  a_palpitou boolean, b_palpitou boolean
)
language sql stable security definer set search_path = '' as $$
  with t as (
    select league_competition_id, matchday, period_kind, period_value, member_a, member_b
    from public.cup_ties where id = p_tie_id
  ),
  lc as (
    select lc.competition_id, lc.league_id, lc.confronto_state, l.visibility
    from public.league_competitions lc join public.leagues l on l.id = lc.league_id
    where lc.id = (select league_competition_id from t)
  ),
  gate as (
    select ((public.is_app_admin() or public.is_league_member(lc.league_id) or lc.visibility = 'public')
      and (lc.confronto_state is distinct from 'scheduled' or public.is_league_admin(lc.league_id) or public.is_app_admin())) as ok
    from lc
  )
  select
    m.id, m.kickoff_at, m.status,
    coalesce(ht.short_name, m.home_team_name), coalesce(at.short_name, m.away_team_name),
    m.home_score, m.away_score,
    case when r.rev_a then pa.home_pred end,
    case when r.rev_a then pa.away_pred end,
    case when r.rev_a then (coalesce(public.score_points(pa.score_type), 0) * (case when pa.is_joker then 2 else 1 end) + coalesce(pa.advance_bonus, 0)) end,
    case when r.rev_a then coalesce(pa.is_joker, false) else false end,
    case when r.rev_b then pb.home_pred end,
    case when r.rev_b then pb.away_pred end,
    case when r.rev_b then (coalesce(public.score_points(pb.score_type), 0) * (case when pb.is_joker then 2 else 1 end) + coalesce(pb.advance_bonus, 0)) end,
    case when r.rev_b then coalesce(pb.is_joker, false) else false end,
    (pa.home_pred is not null), (pb.home_pred is not null)
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
  where public.match_in_period((select period_kind from t), (select period_value from t), (select matchday from t),
          m.matchday, m.stage, m.kickoff_at)
    and (select ok from gate)
  order by m.kickoff_at;
$$;
grant execute on function public.get_tie_detail(uuid) to anon, authenticated;

-- 7.7 Avanço do confronto-copa decide o período COM o +1 (base 20260603000022)
create or replace function public.advance_confronto_cup(p_lc_id uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_league uuid; v_comp uuid; v_total int := 0; v_n int; v_iter int := 0;
begin
  select league_id, competition_id into v_league, v_comp from public.league_competitions where id = p_lc_id;
  if v_league is null then return 0; end if;
  if not (public.is_league_member(v_league) or public.is_app_admin()) then return 0; end if;

  loop
    v_iter := v_iter + 1;
    exit when v_iter > 12;
    with seeds as (
      select user_id, seed from public.confronto_participants where league_competition_id = p_lc_id
    ),
    resolved as (
      select t.round_order, t.slot,
        case
          when t.member_b is null then t.member_a
          when t.walkover_user is not null then case when t.walkover_user = t.member_a then t.member_b else t.member_a end
          when not pl.played then null
          when coalesce(a.pts, 0) > coalesce(b.pts, 0) then t.member_a
          when coalesce(b.pts, 0) > coalesce(a.pts, 0) then t.member_b
          else case when coalesce(sa.seed, 2147483647) <= coalesce(sb.seed, 2147483647) then t.member_a else t.member_b end
        end as winner
      from public.cup_ties t
      left join seeds sa on sa.user_id = t.member_a
      left join seeds sb on sb.user_id = t.member_b
      left join lateral (
        select sum(coalesce(public.score_points(pr.score_type), 0) * (case when pr.is_joker then 2 else 1 end)
                   + coalesce(pr.advance_bonus, 0))::int as pts
        from public.matches m
        join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_a
        where m.competition_id = v_comp and m.status = 'finished'
          and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
      ) a on true
      left join lateral (
        select sum(coalesce(public.score_points(pr.score_type), 0) * (case when pr.is_joker then 2 else 1 end)
                   + coalesce(pr.advance_bonus, 0))::int as pts
        from public.matches m
        join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_b
        where m.competition_id = v_comp and m.status = 'finished'
          and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
      ) b on true
      left join lateral (
        select exists (
          select 1 from public.matches m
          where m.competition_id = v_comp and m.status = 'finished'
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
      and (((r.slot % 2) = 1 and pt.member_a is null) or ((r.slot % 2) = 0 and pt.member_b is null));
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n = 0;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.advance_confronto_cup(uuid) from public, anon;
grant execute on function public.advance_confronto_cup(uuid) to authenticated;
