-- ============================================================================
-- Resultadismo · 04 · Palpites, pontuação automática e classificação
-- ============================================================================

-- ---------------------------------------------------------------------------
-- predictions (um palpite por usuário por jogo real — global, conta em todas
-- as ligas que disputam aquela competição)
-- ---------------------------------------------------------------------------
create table public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  match_id uuid not null references public.matches (id) on delete cascade,
  home_pred int not null check (home_pred >= 0 and home_pred <= 99),
  away_pred int not null check (away_pred >= 0 and away_pred <= 99),
  score_type public.score_type,
  points int,
  scored_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, match_id)
);

create index predictions_match_idx on public.predictions (match_id);
create index predictions_user_idx on public.predictions (user_id);

create trigger predictions_set_updated_at
before update on public.predictions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pontua o palpite na escrita, se o jogo já estiver finalizado
-- ---------------------------------------------------------------------------
create or replace function public.predictions_score_on_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  m record;
begin
  select home_score, away_score, status into m
  from public.matches where id = new.match_id;

  if m.status = 'finished' and m.home_score is not null and m.away_score is not null then
    new.score_type := public.compute_score_type(new.home_pred, new.away_pred, m.home_score, m.away_score);
    new.points := public.score_points(new.score_type);
    new.scored_at := now();
  else
    new.score_type := null;
    new.points := null;
    new.scored_at := null;
  end if;
  return new;
end;
$$;

create trigger predictions_score
before insert or update of home_pred, away_pred on public.predictions
for each row execute function public.predictions_score_on_write();

-- ---------------------------------------------------------------------------
-- Recalcula os palpites quando o resultado do jogo muda
-- ---------------------------------------------------------------------------
create or replace function public.matches_rescore_predictions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'finished' and new.home_score is not null and new.away_score is not null then
    update public.predictions p
    set score_type = public.compute_score_type(p.home_pred, p.away_pred, new.home_score, new.away_score),
        points = public.score_points(public.compute_score_type(p.home_pred, p.away_pred, new.home_score, new.away_score)),
        scored_at = now()
    where p.match_id = new.id;
  else
    update public.predictions p
    set score_type = null, points = null, scored_at = null
    where p.match_id = new.id and p.points is not null;
  end if;
  return new;
end;
$$;

create trigger matches_rescore
after update of home_score, away_score, status on public.matches
for each row execute function public.matches_rescore_predictions();

-- ---------------------------------------------------------------------------
-- Classificação de uma liga-competição, com critérios de desempate:
-- pontos → cravadas → saldos → aproveitamento → acertividade → antiguidade
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

  select l.visibility into v_visibility from public.leagues l where l.id = v_league_id;

  -- guarda de acesso: liga privada só p/ membros ou app_admin
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
    select pr.user_id, pr.score_type
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
      sum(case s.score_type
            when 'cravada' then v_p_cravada
            when 'saldo' then v_p_saldo
            when 'acerto' then v_p_acerto
            else 0 end)::int as pontos,
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

revoke execute on function public.get_league_standings(uuid) from public;
grant execute on function public.get_league_standings(uuid) to authenticated;
