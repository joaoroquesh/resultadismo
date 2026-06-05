-- ============================================================================
-- Resultadismo · Admin v2 — Usuários: online, tempo de uso, dados pro perfil
-- ----------------------------------------------------------------------------
-- • profiles.usage_seconds / last_active_at: tempo ATIVO acumulado por usuário,
--   alimentado pelos heartbeats da sala de espera (que já batem a cada ~20s).
--   O delta é capado em 60s por batida pra não contar aba ociosa/fechada.
-- • admin_list_users v2: + is_online (sessão ativa agora) + usage_seconds +
--   last_active_at, pro painel ordenar e mostrar.
-- "Quem está online" só aparece pra app-admin (esta RPC já é app-admin only).
-- ============================================================================

alter table public.profiles
  add column if not exists usage_seconds bigint not null default 0;
alter table public.profiles
  add column if not exists last_active_at timestamptz;

-- ---------------------------------------------------------------------------
-- heartbeat_access: além de manter a sessão viva, acumula tempo de uso ativo
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat_access(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_user uuid;
  v_prev timestamptz;
  v_delta int;
begin
  select state, user_id, last_seen_at into v_state, v_user, v_prev
  from public.access_sessions where token = p_token;

  if v_state is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;

  update public.access_sessions set last_seen_at = now() where token = p_token;

  -- Acumula tempo de uso: só p/ usuário logado, sessão ativa, delta capado a
  -- 60s (heartbeat real ~20s; capar evita contar tempo ocioso/aba fechada).
  if v_user is not null and v_state = 'active' and v_prev is not null then
    v_delta := least(greatest(floor(extract(epoch from (now() - v_prev)))::int, 0), 60);
    if v_delta > 0 then
      update public.profiles
        set usage_seconds = usage_seconds + v_delta, last_active_at = now()
        where id = v_user;
    end if;
  end if;

  return jsonb_build_object('ok', v_state = 'active', 'state', v_state);
end;
$$;
revoke all on function public.heartbeat_access(uuid) from public;
grant execute on function public.heartbeat_access(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_users v2 (DROP: ganhou is_online / usage_seconds / last_active_at)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_users();

create or replace function public.admin_list_users()
returns table (
  id uuid,
  display_name text,
  avatar_url text,
  is_app_admin boolean,
  email text,
  created_at timestamptz,
  is_online boolean,
  usage_seconds bigint,
  last_active_at timestamptz
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
  select
    p.id, p.display_name, p.avatar_url, p.is_app_admin,
    u.email::text, p.created_at,
    exists (
      select 1 from public.access_sessions s
      where s.user_id = p.id and s.state = 'active'
    ) as is_online,
    p.usage_seconds, p.last_active_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.created_at;
end;
$$;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
