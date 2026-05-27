-- ============================================================================
-- Resultadismo · 15 · Privacidade: remove e-mail da tabela pública de perfis
-- ----------------------------------------------------------------------------
-- A policy `profiles_select_all` (using true) + a coluna `email` deixavam
-- QUALQUER usuário logado ler o e-mail de todos os outros via PostgREST
-- (select email from profiles). Vazamento de PII.
--
-- O e-mail é redundante: já vive em auth.users (e o cliente já lê o próprio via
-- session.user.email). Então removemos a coluna do schema público e expomos
-- e-mail apenas a app_admin, via RPC SECURITY DEFINER que lê de auth.users.
-- ============================================================================

-- 1) handle_new_user deixa de copiar o e-mail para o perfil
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

  insert into public.profiles (id, display_name, avatar_url, is_app_admin)
  values (
    new.id,
    v_name,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    v_is_first
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 2) profiles_guard não precisa mais blindar o e-mail (coluna deixa de existir)
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    new.is_app_admin := old.is_app_admin;
  end if;
  return new;
end;
$$;

-- 3) remove a coluna: a PII deixa de existir na superfície da API
alter table public.profiles drop column if exists email;

-- 4) admin enxerga e-mails via RPC (lê de auth.users), somente se for app_admin
create or replace function public.admin_list_users()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  is_app_admin boolean,
  email text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores do app podem listar usuários.';
  end if;

  return query
  select p.id, p.display_name, p.avatar_url, p.is_app_admin,
         u.email::text, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.created_at;
end;
$$;

revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
