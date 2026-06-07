-- ============================================================================
-- Resultadismo · Personalização — seguir TIME por CAMPEONATO + Amistosos
-- ----------------------------------------------------------------------------
-- (1) profiles.followed_teams jsonb — mapa competition_id → [team_id,...].
--     Permite "acompanhar um time numa liga, mas não no mata-mata": o follow
--     de time é POR campeonato (o array plano followed_team_ids não cobria).
-- (2) set_personalization passa a aceitar p_followed_teams jsonb.
-- (3) Seed de "Amistosos Internacionais" (fifa.friendly) na personalização —
--     mesmas seleções da Copa, mas follow independente. Idempotente.
--
-- Depende do catálogo da sessão de Dados (competitions.in_personalization,
-- list_personalization_competitions por flag). Forward-only, 100% aditivo.
-- ============================================================================

-- 1. Coluna de follow por (campeonato × time) -------------------------------
alter table public.profiles
  add column if not exists followed_teams jsonb not null default '{}'::jsonb;

-- 2. set_personalization com p_followed_teams (sem overload) -----------------
drop function if exists public.set_personalization(uuid, uuid, uuid, uuid, uuid[], uuid[], boolean);

create or replace function public.set_personalization(
  p_favorite_team_id uuid default null,
  p_national_team_id uuid default null,
  p_favorite_competition_id uuid default null,
  p_favorite_group_id uuid default null,
  p_followed_competition_ids uuid[] default null,
  p_followed_team_ids uuid[] default null,
  p_show_in_ranking boolean default null,
  p_followed_teams jsonb default null
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
  -- null = não mexe; arrays/jsonb vazios ('{}') LIMPAM (tela engajada manda o
  -- valor; tela pulada manda null).
  update public.profiles
     set favorite_team_id = coalesce(p_favorite_team_id, favorite_team_id),
         national_team_id = coalesce(p_national_team_id, national_team_id),
         favorite_competition_id = coalesce(p_favorite_competition_id, favorite_competition_id),
         favorite_group_id = coalesce(p_favorite_group_id, favorite_group_id),
         followed_competition_ids = coalesce(p_followed_competition_ids, followed_competition_ids),
         followed_team_ids = coalesce(p_followed_team_ids, followed_team_ids),
         followed_teams = coalesce(p_followed_teams, followed_teams),
         show_in_global_ranking = coalesce(p_show_in_ranking, show_in_global_ranking),
         personalization_done = true
   where id = auth.uid();
end;
$$;

grant execute on function public.set_personalization(
  uuid, uuid, uuid, uuid, uuid[], uuid[], boolean, jsonb
) to authenticated;

-- 3. Amistosos Internacionais (mesmas seleções da Copa, follow independente) -
-- Só insere se ainda não existir (por provider_code OU slug — slug é unique).
insert into public.competitions
  (name, display_name, slug, provider, provider_code, type, area,
   status, is_published, sync_enabled, in_personalization)
select
  'Amistosos Internacionais', 'Amistosos', 'amistosos-internacionais',
  'espn'::public.data_provider, 'fifa.friendly', 'CUP', 'Mundo',
  'active', false, true, true
where not exists (
  select 1 from public.competitions c
  where (c.provider = 'espn'::public.data_provider and c.provider_code = 'fifa.friendly')
     or c.slug = 'amistosos-internacionais'
);
