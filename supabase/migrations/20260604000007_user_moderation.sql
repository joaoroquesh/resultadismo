-- ============================================================================
-- Resultadismo · Admin v2 — moderação de usuários (3 níveis), só app-admin
-- ----------------------------------------------------------------------------
-- Três ações, da mais leve à mais dura (todas com dupla verificação na UI):
--   1) SUSPENDER (reversível): bloqueia o login (auth.users.banned_until),
--      mantém dados. admin_set_user_suspended(user_id, on/off).
--   2) EXCLUIR: apaga a conta e os dados (cascade). O e-mail PODE recadastrar.
--      admin_delete_user(user_id).
--   3) EXCLUIR + BLOQUEAR e-mail: apaga e impede aquele e-mail de criar conta
--      de novo (blocked_emails + handle_new_user rejeita). admin_block_email(user_id).
--
-- Guardas: só app-admin; nunca pode mirar a si mesmo nem outro app-admin
-- (evita lockout/acidente). Modifica auth.users via SECURITY DEFINER (owner
-- postgres tem privilégio).
-- ============================================================================

create table if not exists public.blocked_emails (
  email extensions.citext primary key,
  reason text,
  blocked_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.blocked_emails enable row level security;
-- Sem policies de cliente: só as RPCs/trigger (SECURITY DEFINER) tocam.

-- ---------------------------------------------------------------------------
-- handle_new_user: rejeita e-mail bloqueado (aborta o signup), senão cria perfil
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
  if new.email is not null and exists (
    select 1 from public.blocked_emails b where b.email = new.email
  ) then
    raise exception 'Este e-mail está bloqueado.' using errcode = 'check_violation';
  end if;

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

-- ---------------------------------------------------------------------------
-- Guard comum: caller é app-admin e o alvo não é ele mesmo nem outro app-admin
-- ---------------------------------------------------------------------------
create or replace function private.assert_can_moderate(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores do app podem moderar usuários.';
  end if;
  if p_target = auth.uid() then
    raise exception 'Você não pode aplicar isso na sua própria conta.';
  end if;
  if exists (select 1 from public.profiles where id = p_target and is_app_admin) then
    raise exception 'Não dá pra moderar outro administrador.';
  end if;
end;
$$;

-- 1) Suspender / reativar (reversível) — bloqueia/desbloqueia o login
create or replace function public.admin_set_user_suspended(p_user_id uuid, p_suspended boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_moderate(p_user_id);
  update auth.users
    set banned_until = case when p_suspended then now() + interval '100 years' else null end
    where id = p_user_id;
  -- encerra sessões da fila de acesso (não bloqueia login sozinho, mas limpa presença)
  delete from public.access_sessions where user_id = p_user_id;
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), case when p_suspended then 'user_suspend' else 'user_unsuspend' end,
          'user', p_user_id, '{}'::jsonb);
end;
$$;

-- 2) Excluir conta + dados (e-mail pode recadastrar)
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.assert_can_moderate(p_user_id);
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user_delete', 'user', p_user_id, '{}'::jsonb);
  delete from auth.users where id = p_user_id; -- cascata apaga profile e dados
end;
$$;

-- 3) Excluir + bloquear o e-mail (não recadastra)
create or replace function public.admin_block_email(p_user_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext;
begin
  perform private.assert_can_moderate(p_user_id);
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if v_email is not null then
    insert into public.blocked_emails (email, reason, blocked_by)
    values (v_email, nullif(trim(coalesce(p_reason, '')), ''), auth.uid())
    on conflict (email) do nothing;
  end if;
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'user_block_email', 'user', p_user_id,
          jsonb_build_object('email', v_email::text));
  delete from auth.users where id = p_user_id;
end;
$$;

-- Status de moderação de UM usuário (pro perfil/admin saber se está suspenso)
create or replace function public.admin_user_moderation(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  select jsonb_build_object(
    'suspended', (select banned_until is not null and banned_until > now() from auth.users where id = p_user_id),
    'usage_seconds', (select usage_seconds from public.profiles where id = p_user_id),
    'last_active_at', (select last_active_at from public.profiles where id = p_user_id),
    'is_online', (select exists (select 1 from public.access_sessions s where s.user_id = p_user_id and s.state = 'active'))
  ) into v;
  return v;
end;
$$;

revoke all on function public.admin_set_user_suspended(uuid, boolean) from public, anon;
revoke all on function public.admin_delete_user(uuid) from public, anon;
revoke all on function public.admin_block_email(uuid, text) from public, anon;
revoke all on function public.admin_user_moderation(uuid) from public, anon;
grant execute on function public.admin_set_user_suspended(uuid, boolean) to authenticated;
grant execute on function public.admin_delete_user(uuid) to authenticated;
grant execute on function public.admin_block_email(uuid, text) to authenticated;
grant execute on function public.admin_user_moderation(uuid) to authenticated;
