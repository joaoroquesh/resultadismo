-- ============================================================================
-- Resultadismo · 01 · Extensões, enums, perfis e helpers base
-- ============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.data_provider as enum ('manual', 'football_data', 'thesportsdb');
create type public.match_status as enum ('scheduled', 'live', 'finished', 'postponed', 'cancelled');
create type public.league_status as enum ('pending', 'active', 'rejected', 'archived');
create type public.league_visibility as enum ('public', 'private');
create type public.join_policy as enum ('open', 'approval', 'invite');
create type public.member_role as enum ('owner', 'admin', 'member');
create type public.member_status as enum ('active', 'pending', 'banned');
create type public.league_mode as enum ('table', 'cup', 'points');
create type public.score_type as enum ('cravada', 'saldo', 'acerto', 'erro');

-- ---------------------------------------------------------------------------
-- updated_at automático
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (espelha auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text not null default 'Jogador',
  avatar_url text,
  favorite_team text,
  is_app_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

comment on table public.profiles is 'Perfil público do jogador, vinculado a auth.users.';

-- ---------------------------------------------------------------------------
-- Helper: usuário atual é admin do app?
-- SECURITY DEFINER para evitar recursão de RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_app_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- Cria perfil ao registrar usuário. O primeiro usuário vira app_admin
-- (bootstrap do dono do app).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_first boolean;
  v_name text;
begin
  select count(*) = 0 into v_is_first from public.profiles;

  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Jogador'
  );

  insert into public.profiles (id, email, display_name, avatar_url, is_app_admin)
  values (
    new.id,
    new.email,
    v_name,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    v_is_first
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();
