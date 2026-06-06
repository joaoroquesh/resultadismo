-- ============================================================================
-- Resultadismo · Personalização v2 (página multi-tela)
-- ----------------------------------------------------------------------------
-- Amplia a personalização do Resultadista pra além do modal:
--   • followed_competition_ids  — campeonatos que ele quer acompanhar
--   • followed_team_ids         — times que ele quer acompanhar
-- set_personalization passa a aceitar esses arrays + o opt-in do RTB.
--
-- Catálogo de personalização (RPCs):
--   list_personalization_competitions() → campeonatos do catálogo (mesmo em
--     rascunho) pra montar as listas de interesse.
--   get_teams_by_competition(comp)      → clubes/seleções de um campeonato
--     (distintos dos jogos), pra o acordeão "times que acompanha".
--
-- Seed: cria como RASCUNHO (is_published=false → não aparecem em Jogos) os
-- campeonatos de clube + copas, com sync_enabled=true pra o sync ESPN popular
-- os times (teams.crest_url). Idempotente (não duplica por provider_code).
-- ============================================================================

-- 1. Preferências em array ---------------------------------------------------
alter table public.profiles
  add column if not exists followed_competition_ids uuid[] not null default '{}',
  add column if not exists followed_team_ids uuid[] not null default '{}';

-- 2. set_personalization unificado (sem overload — caller controla tudo) -----
drop function if exists public.set_personalization(uuid, uuid, uuid, uuid);

create or replace function public.set_personalization(
  p_favorite_team_id uuid default null,
  p_national_team_id uuid default null,
  p_favorite_competition_id uuid default null,
  p_favorite_group_id uuid default null,
  p_followed_competition_ids uuid[] default null,
  p_followed_team_ids uuid[] default null,
  p_show_in_ranking boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  -- Regra: null = não mexe no campo; arrays vazios ('{}') LIMPAM (a tela
  -- engajada manda o array, a pulada manda null).
  update public.profiles
     set favorite_team_id = coalesce(p_favorite_team_id, favorite_team_id),
         national_team_id = coalesce(p_national_team_id, national_team_id),
         favorite_competition_id = coalesce(p_favorite_competition_id, favorite_competition_id),
         favorite_group_id = coalesce(p_favorite_group_id, favorite_group_id),
         followed_competition_ids = coalesce(p_followed_competition_ids, followed_competition_ids),
         followed_team_ids = coalesce(p_followed_team_ids, followed_team_ids),
         show_in_global_ranking = coalesce(p_show_in_ranking, show_in_global_ranking),
         personalization_done = true
   where id = auth.uid();
end;
$$;

grant execute on function public.set_personalization(uuid, uuid, uuid, uuid, uuid[], uuid[], boolean)
  to authenticated;

-- 3. Catálogo de campeonatos da personalização (inclui rascunhos) ------------
create or replace function public.list_personalization_competitions()
returns table(
  id uuid,
  name text,
  display_name text,
  provider_code text,
  type text,
  area text
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.display_name, c.provider_code, c.type, c.area
  from public.competitions c
  where c.status = 'active'
    and (
      c.provider_code in (
        'bra.1','bra.2','bra.3','bra.copa_do_brazil',
        'conmebol.libertadores','conmebol.sudamericana',
        'eng.1','esp.1','ita.1','ger.1','fra.1',
        'fifa.world'
      )
    )
  order by c.name;
$$;

grant execute on function public.list_personalization_competitions() to authenticated;

-- 4. Times de um campeonato (distintos dos jogos) ----------------------------
create or replace function public.get_teams_by_competition(p_competition_id uuid)
returns table(
  id uuid,
  name text,
  short_name text,
  crest_url text,
  local_crest text
)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct t.id, t.name, t.short_name, t.crest_url, t.local_crest
  from public.teams t
  where exists (
    select 1 from public.matches m
    where m.competition_id = p_competition_id
      and (m.home_team_id = t.id or m.away_team_id = t.id)
  )
  order by t.name;
$$;

grant execute on function public.get_teams_by_competition(uuid) to authenticated;

-- 5. Seed dos campeonatos (rascunho + sync ESPN liga os times) ---------------
insert into public.competitions
  (name, slug, display_name, provider, provider_code, type, area,
   status, is_published, is_featured, sync_enabled, catalog_seeded)
select
  v.name, v.slug, v.display_name, 'espn'::public.data_provider, v.provider_code,
  v.type, v.area, 'active', false, false, true, false
from (values
  ('Brasileirão Série A','brasileirao-serie-a','Brasileirão Série A','bra.1','LEAGUE','Brasil'),
  ('Brasileirão Série B','brasileirao-serie-b','Brasileirão Série B','bra.2','LEAGUE','Brasil'),
  ('Brasileirão Série C','brasileirao-serie-c','Brasileirão Série C','bra.3','LEAGUE','Brasil'),
  ('Copa do Brasil','copa-do-brasil','Copa do Brasil','bra.copa_do_brazil','CUP','Brasil'),
  ('Libertadores','libertadores','Libertadores','conmebol.libertadores','CUP','América do Sul'),
  ('Sul-Americana','sul-americana','Sul-Americana','conmebol.sudamericana','CUP','América do Sul'),
  ('Premier League','premier-league','Premier League','eng.1','LEAGUE','Inglaterra'),
  ('La Liga','la-liga','La Liga','esp.1','LEAGUE','Espanha'),
  ('Serie A (Itália)','serie-a-italia','Serie A (Itália)','ita.1','LEAGUE','Itália'),
  ('Bundesliga','bundesliga','Bundesliga','ger.1','LEAGUE','Alemanha'),
  ('Ligue 1','ligue-1','Ligue 1','fra.1','LEAGUE','França')
) as v(name, slug, display_name, provider_code, type, area)
where not exists (
  select 1 from public.competitions c
  where c.provider = 'espn'::public.data_provider
    and c.provider_code = v.provider_code
);
