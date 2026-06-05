-- ============================================================================
-- Resultadismo · Admin v2 — parâmetros operacionais editáveis pelo painel
-- ----------------------------------------------------------------------------
-- O que é "config" sai do código e vira ajustável pelo admin:
--   • online_alert_threshold (app_settings): a partir de quantos online o
--     dashboard alerta pico (antes fixo em 100 no front).
--   • sala de espera (access_control): ligar/desligar a fila + limite de
--     simultâneos (max_active) — antes só dava pra mudar via SQL.
-- admin_system_health passa a devolver esses valores pro painel renderizar os
-- controles já preenchidos.
-- ============================================================================

alter table public.app_settings
  add column if not exists online_alert_threshold int not null default 100;

-- ---------------------------------------------------------------------------
-- admin_system_health v3: inclui os parâmetros configuráveis
-- ---------------------------------------------------------------------------
create or replace function public.admin_system_health()
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
    'live_now', (
      select count(*) from public.matches
      where hidden = false
        and (status = 'live'
             or (status = 'scheduled' and kickoff_at <= now() and kickoff_at >= now() - interval '180 minutes'))
    ),
    'today', (
      select count(*) from public.matches
      where hidden = false
        and (kickoff_at at time zone 'America/Sao_Paulo')::date
            = (now() at time zone 'America/Sao_Paulo')::date
    ),
    'next_24h', (
      select count(*) from public.matches
      where hidden = false and status = 'scheduled'
        and kickoff_at between now() and now() + interval '24 hours'
    ),
    'pending_alerts', (select count(*) from public.sync_alerts where status = 'pending'),
    'pending_leagues', (
      select count(*) from public.leagues where status = 'pending' and deleted_at is null
    ),
    'active_sessions', (select count(*) from public.access_sessions where state = 'active'),
    'maintenance_mode', (select maintenance_mode from public.app_settings where id = 1),
    'online_alert_threshold', (select online_alert_threshold from public.app_settings where id = 1),
    'access_enabled', (select enabled from public.access_control where id = 1),
    'access_max_active', (select max_active from public.access_control where id = 1),
    'sync_problems', (
      select count(*) from public.competitions
      where status = 'active' and sync_enabled and last_sync_ok is false
    ),
    'competitions', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id,
               'name', coalesce(c.display_name, c.name),
               'provider', c.provider,
               'sync_enabled', c.sync_enabled,
               'last_synced_at', c.last_synced_at,
               'last_sync_ok', c.last_sync_ok,
               'last_sync_error', c.last_sync_error,
               'last_sync_checked_at', c.last_sync_checked_at
             ) order by (c.last_sync_ok is false) desc, c.last_synced_at desc nulls last), '[]'::jsonb)
      from public.competitions c
      where c.status = 'active'
    )
  ) into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Atualiza o limiar de alerta de online (1..100000)
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_online_threshold(p_value int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  update public.app_settings
    set online_alert_threshold = greatest(1, least(coalesce(p_value, 100), 100000)),
        updated_at = now()
    where id = 1;
  insert into public.admin_audit_log (actor, action, entity_type, detail)
  values (auth.uid(), 'online_threshold_set', 'app_settings', jsonb_build_object('value', p_value));
end;
$$;

-- ---------------------------------------------------------------------------
-- Atualiza a sala de espera: liga/desliga + limite de simultâneos
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_access(p_enabled boolean, p_max_active int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  update public.access_control
    set enabled = coalesce(p_enabled, enabled),
        max_active = greatest(1, least(coalesce(p_max_active, max_active), 100000)),
        updated_at = now()
    where id = 1;
  insert into public.admin_audit_log (actor, action, entity_type, detail)
  values (auth.uid(), 'access_config_set', 'access_control',
          jsonb_build_object('enabled', p_enabled, 'max_active', p_max_active));
end;
$$;

revoke all on function public.admin_set_online_threshold(int) from public, anon;
revoke all on function public.admin_update_access(boolean, int) from public, anon;
grant execute on function public.admin_set_online_threshold(int) to authenticated;
grant execute on function public.admin_update_access(boolean, int) to authenticated;
