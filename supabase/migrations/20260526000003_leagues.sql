-- ============================================================================
-- Resultadismo · 03 · Ligas, membros e competições da liga
-- ============================================================================

-- ---------------------------------------------------------------------------
-- leagues (grupos sociais — "ligas próprias")
-- ---------------------------------------------------------------------------
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  logo_url text,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  visibility public.league_visibility not null default 'private',
  join_policy public.join_policy not null default 'invite',
  join_code text unique,
  status public.league_status not null default 'pending',
  max_members int,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leagues_owner_idx on public.leagues (owner_id);
create index leagues_status_idx on public.leagues (status);

create trigger leagues_set_updated_at
before update on public.leagues
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- league_members
-- ---------------------------------------------------------------------------
create table public.league_members (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null default 'member',
  status public.member_status not null default 'active',
  joined_at timestamptz not null default now(),
  unique (league_id, user_id)
);

create index league_members_user_idx on public.league_members (user_id);
create index league_members_league_idx on public.league_members (league_id);

-- ---------------------------------------------------------------------------
-- Helpers de associação (SECURITY DEFINER p/ evitar recursão de RLS)
-- ---------------------------------------------------------------------------
create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members lm
    where lm.league_id = p_league_id
      and lm.user_id = auth.uid()
      and lm.status = 'active'
  );
$$;

create or replace function public.is_league_admin(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.league_members lm
    where lm.league_id = p_league_id
      and lm.user_id = auth.uid()
      and lm.status = 'active'
      and lm.role in ('owner', 'admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- Código de convite + dono entra automaticamente como membro
-- ---------------------------------------------------------------------------
create or replace function public.gen_join_code()
returns text
language plpgsql
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.leagues_before_insert()
returns trigger
language plpgsql
as $$
begin
  if new.join_code is null then
    new.join_code := public.gen_join_code();
  end if;
  return new;
end;
$$;

create trigger leagues_set_join_code
before insert on public.leagues
for each row execute function public.leagues_before_insert();

create or replace function public.leagues_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.league_members (league_id, user_id, role, status)
  values (new.id, new.owner_id, 'owner', 'active')
  on conflict (league_id, user_id) do nothing;
  return new;
end;
$$;

create trigger leagues_add_owner_member
after insert on public.leagues
for each row execute function public.leagues_after_insert();

-- ---------------------------------------------------------------------------
-- league_competitions (a liga prevê um torneio real, num modo de disputa)
-- ---------------------------------------------------------------------------
create table public.league_competitions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  competition_id uuid not null references public.competitions (id) on delete cascade,
  name text not null,
  mode public.league_mode not null default 'table',
  settings jsonb not null default '{"points":{"cravada":3,"saldo":2,"acerto":1}}'::jsonb,
  starts_on date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_id, competition_id, name)
);

create index league_competitions_league_idx on public.league_competitions (league_id);
create index league_competitions_comp_idx on public.league_competitions (competition_id);

create trigger league_competitions_set_updated_at
before update on public.league_competitions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- cup_ties (mata-mata entre membros — modo 'cup'). Estrutura base.
-- ---------------------------------------------------------------------------
create table public.cup_ties (
  id uuid primary key default gen_random_uuid(),
  league_competition_id uuid not null references public.league_competitions (id) on delete cascade,
  round_order int not null,
  round_label text not null,
  slot int not null,
  member_a uuid references public.profiles (id),
  member_b uuid references public.profiles (id),
  points_a int not null default 0,
  points_b int not null default 0,
  winner_id uuid references public.profiles (id),
  window_start timestamptz,
  window_end timestamptz,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index cup_ties_lc_idx on public.cup_ties (league_competition_id, round_order, slot);

create trigger cup_ties_set_updated_at
before update on public.cup_ties
for each row execute function public.set_updated_at();
