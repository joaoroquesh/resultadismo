-- ============================================================================
-- Resultadismo · Personalização — time em vários campeonatos
-- ----------------------------------------------------------------------------
-- get_teams_by_competition passa a devolver, por time, TODOS os campeonatos
-- da personalização em que ele aparece (in_competitions). Assim a UI consegue
-- oferecer "seguir só neste campeonato" vs "seguir em todos onde ele estiver"
-- (ex.: um clube que joga a liga E a copa).
--
-- Drop + recreate (muda o tipo de retorno). Função é minha (migration ...0008);
-- só o front consome (via rpcCall). Forward-only.
-- ============================================================================

drop function if exists public.get_teams_by_competition(uuid);

create function public.get_teams_by_competition(p_competition_id uuid)
returns table(
  id uuid,
  name text,
  short_name text,
  crest_url text,
  local_crest text,
  in_competitions uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with comp_teams as (
    select distinct t.id
    from public.teams t
    join public.matches m on (m.home_team_id = t.id or m.away_team_id = t.id)
    where m.competition_id = p_competition_id
  ),
  team_comps as (
    select ct.id as team_id, array_agg(distinct m.competition_id) as in_comps
    from comp_teams ct
    join public.matches m on (m.home_team_id = ct.id or m.away_team_id = ct.id)
    join public.competitions c on c.id = m.competition_id and c.in_personalization = true
    group by ct.id
  )
  select t.id, t.name, t.short_name, t.crest_url, t.local_crest,
         coalesce(tc.in_comps, array[p_competition_id])
  from public.teams t
  join comp_teams ct on ct.id = t.id
  left join team_comps tc on tc.team_id = t.id
  order by t.name;
$$;

grant execute on function public.get_teams_by_competition(uuid) to authenticated;
