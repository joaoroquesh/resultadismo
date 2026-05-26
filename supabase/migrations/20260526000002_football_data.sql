-- ============================================================================
-- Resultadismo · 02 · Dados reais de futebol (competições, times, jogos)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- competitions (torneios reais — dados globais, sincronizados)
-- ---------------------------------------------------------------------------
create table public.competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  short_name text,
  emblem_url text,
  area text,
  type text not null default 'LEAGUE',          -- LEAGUE | CUP
  provider public.data_provider not null default 'manual',
  provider_code text,                             -- ex.: "WC", "BSA"
  provider_season text,
  season_start date,
  season_end date,
  current_round text,
  status text not null default 'active',          -- active | archived
  is_featured boolean not null default false,
  sync_enabled boolean not null default true,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index competitions_provider_uk
  on public.competitions (provider, provider_code, provider_season)
  where provider <> 'manual';

create trigger competitions_set_updated_at
before update on public.competitions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- teams (globais)
-- ---------------------------------------------------------------------------
create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  tla text,
  crest_url text,
  local_crest text,                               -- override de /public/teams
  country text,
  provider public.data_provider not null default 'manual',
  provider_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index teams_provider_uk
  on public.teams (provider, provider_ref)
  where provider_ref is not null;

create trigger teams_set_updated_at
before update on public.teams
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- matches (jogos reais)
-- O placar usado para pontuação = 90' + prorrogação (sem pênaltis), conforme regra.
-- ---------------------------------------------------------------------------
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  provider public.data_provider not null default 'manual',
  provider_ref text,
  stage text,
  group_name text,
  round text,
  matchday int,
  home_team_id uuid references public.teams (id),
  away_team_id uuid references public.teams (id),
  home_team_name text,
  away_team_name text,
  kickoff_at timestamptz,
  status public.match_status not null default 'scheduled',
  home_score int,
  away_score int,
  home_pen int,
  away_pen int,
  winner text generated always as (
    case
      when home_score is null or away_score is null then null
      when home_score > away_score then 'HOME'
      when home_score < away_score then 'AWAY'
      else 'DRAW'
    end
  ) stored,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index matches_provider_uk
  on public.matches (provider, provider_ref)
  where provider <> 'manual' and provider_ref is not null;

create index matches_competition_idx on public.matches (competition_id, kickoff_at);
create index matches_kickoff_idx on public.matches (kickoff_at);
create index matches_status_idx on public.matches (status);

create trigger matches_set_updated_at
before update on public.matches
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Pontuação (funções puras)
-- ---------------------------------------------------------------------------
create or replace function public.compute_score_type(ph int, pa int, rh int, ra int)
returns public.score_type
language sql
immutable
as $$
  select case
    when ph is null or pa is null or rh is null or ra is null then null
    when ph = rh and pa = ra then 'cravada'::public.score_type
    when (ph - pa) = (rh - ra) then 'saldo'::public.score_type   -- mesmo vencedor + mesmo saldo (cobre empates)
    when sign(ph - pa) = sign(rh - ra) and (rh - ra) <> 0 then 'acerto'::public.score_type
    else 'erro'::public.score_type
  end;
$$;

create or replace function public.score_points(st public.score_type)
returns int
language sql
immutable
as $$
  select case st
    when 'cravada' then 3
    when 'saldo' then 2
    when 'acerto' then 1
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- Helper de jogo "travado" (kickoff já passou) — usado em RLS e UI.
-- ---------------------------------------------------------------------------
create or replace function public.match_is_locked(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.kickoff_at <= now() from public.matches m where m.id = p_match_id),
    false
  );
$$;
