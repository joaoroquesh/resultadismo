-- ============================================================================
-- Resultadismo · Resultadismo The Best (ranking global)
-- ----------------------------------------------------------------------------
-- Classificação global de todos os Resultadistas no app, em todas as
-- competições. Visível pra qualquer usuário autenticado. Cada Resultadista
-- pode SE TIRAR do ranking público (opt-out via show_in_global_ranking).
--
-- Funções:
--   get_global_standings(p_competition_id?, p_year?, p_team_id?, p_limit?)
--     → leaderboard global, com filtros opcionais.
--   get_my_global_rank(p_competition_id?)
--     → posição do Resultadista logado no recorte default (Copa, ano atual).
--   set_global_ranking_visibility(p_value)
--     → o próprio user liga/desliga sua aparição no ranking global.
--
-- Pontuação: replica fielmente a regra do banco (compute_score_type/
-- score_points) — cravada/saldo/acerto/erro com dobro do coringa. Ignora
-- jogos ocultos (matches.hidden=true), como o ...028.
-- ============================================================================

-- 1. Opt-out: default = aparece no ranking
alter table public.profiles
  add column if not exists show_in_global_ranking boolean not null default true;

-- 2. Ranking global — leaderboard
-- Retorna 1 linha por Resultadista que tem pelo menos 1 palpite pontuado no
-- recorte. Ordem: pontos desc, cravadas desc, saldos desc, jogos asc (menos
-- jogos com mesmos pontos = melhor aproveitamento).
create or replace function public.get_global_standings(
  p_competition_id uuid default null,
  p_year int default null,
  p_team_id uuid default null,
  p_limit int default 50
)
returns table(
  rank int,
  user_id uuid,
  display_name text,
  avatar_url text,
  pontos int,
  jogos int,
  cravadas int,
  saldos int,
  acertos int
)
language sql
stable
security definer
set search_path = ''
as $$
  with scored as (
    select
      pr.user_id, pr.score_type, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.status = 'finished'
      and m.hidden = false
      and pr.score_type is not null
      and (p_competition_id is null or m.competition_id = p_competition_id)
      and (p_year is null or extract(year from m.kickoff_at at time zone 'America/Sao_Paulo')::int = p_year)
      and (p_team_id is null or m.home_team_id = p_team_id or m.away_team_id = p_team_id)
  ),
  agg as (
    select
      s.user_id,
      sum(
        (case s.score_type
           when 'cravada' then 3
           when 'saldo' then 2
           when 'acerto' then 1
           else 0 end)
        * (case when s.is_joker then 2 else 1 end)
      )::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos,
      count(*) filter (where s.score_type = 'acerto')::int as acertos
    from scored s
    group by s.user_id
  )
  select
    (row_number() over (order by a.pontos desc, a.cravadas desc, a.saldos desc, a.jogos asc))::int as rank,
    a.user_id,
    p.display_name,
    p.avatar_url,
    a.pontos,
    a.jogos,
    a.cravadas,
    a.saldos,
    a.acertos
  from agg a
  join public.profiles p on p.id = a.user_id
  where coalesce(p.show_in_global_ranking, true) = true
  order by a.pontos desc, a.cravadas desc, a.saldos desc, a.jogos asc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

grant execute on function public.get_global_standings(uuid, int, uuid, int) to authenticated;

-- 3. Minha posição global (recorte default = Copa, ano atual)
-- Retorna NULL se o user fez opt-out ou ainda não pontuou.
create or replace function public.get_my_global_rank(
  p_competition_id uuid default null,
  p_year int default null
)
returns table(
  rank int,
  pontos int,
  jogos int,
  total_resultadistas int
)
language sql
stable
security definer
set search_path = ''
as $$
  with scored as (
    select pr.user_id, pr.score_type, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.status = 'finished'
      and m.hidden = false
      and pr.score_type is not null
      and (p_competition_id is null or m.competition_id = p_competition_id)
      and (p_year is null or extract(year from m.kickoff_at at time zone 'America/Sao_Paulo')::int = p_year)
  ),
  agg as (
    select
      s.user_id,
      sum(
        (case s.score_type
           when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
        * (case when s.is_joker then 2 else 1 end)
      )::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos
    from scored s
    group by s.user_id
  ),
  visible as (
    select a.*
    from agg a
    join public.profiles p on p.id = a.user_id
    where coalesce(p.show_in_global_ranking, true) = true
  ),
  ranked as (
    select user_id, pontos, jogos,
      row_number() over (order by pontos desc, cravadas desc, saldos desc, jogos asc)::int as rk
    from visible
  )
  select rk::int as rank, pontos, jogos, (select count(*)::int from visible) as total_resultadistas
  from ranked
  where user_id = auth.uid();
$$;

grant execute on function public.get_my_global_rank(uuid, int) to authenticated;

-- 4. Opt-out / opt-in do ranking global (o próprio user controla)
create or replace function public.set_global_ranking_visibility(p_value boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  update public.profiles
     set show_in_global_ranking = coalesce(p_value, true)
   where id = auth.uid();
  return coalesce(p_value, true);
end;
$$;

grant execute on function public.set_global_ranking_visibility(boolean) to authenticated;
