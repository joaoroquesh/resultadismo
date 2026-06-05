-- ============================================================================
-- Resultadismo · Correções pós-v2.7.0
--   (1) Presença "online" e tempo de uso DESACOPLADOS da sala de espera.
--   (2) Placar ao vivo sincroniza com mais frequência (cron de scores a cada 1 min).
-- ----------------------------------------------------------------------------
-- PROBLEMA (bugs 2 e 3, mesma raiz): toda a presença ("online", last_active_at,
-- usage_seconds) era PARASITA da fila de acesso — só era alimentada quando havia
-- linha em access_sessions(state='active'). Mas com a sala de espera DESLIGADA
-- (estado normal do dia a dia), request_access admite SEM criar sessão. Resultado:
--   • o heartbeat batia num token órfão → {ok:false} → o front piscava a tela de
--     espera a cada 20s (bug 2, corrigido no front);
--   • ninguém aparecia "online" e o tempo de uso não acumulava (bug 3).
--
-- CORREÇÃO: a presença passa a ser um conceito próprio, sempre ligado para todo
-- usuário autenticado, gravado por uma RPC leve `touch_presence()` (independente
-- da fila). "Online" = profiles.last_active_at recente (mesmo limiar em todo lugar).
-- O heartbeat da fila volta a ser SÓ "mantém a vaga viva" (sem acumular uso, pra
-- não contar em dobro quando a fila está ligada).
--
-- Todas as funções aqui são CREATE OR REPLACE (assinatura preservada) — seguro
-- rodar sobre o que já está em produção (migrations 000004–000007).
-- ============================================================================

-- Limiar único de "online" (heartbeat do front é 30s → 90s tolera ~2 faltas).
-- Mantido idêntico nas três funções (dashboard, lista, perfil) pra não divergir.

-- ---------------------------------------------------------------------------
-- touch_presence(): presença + tempo de uso de QUALQUER usuário logado.
-- Independente da sala de espera. Só toca a PRÓPRIA linha (id = auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function public.touch_presence()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_prev timestamptz;
  v_delta int;
begin
  if v_user is null then
    return;  -- anônimo não tem presença
  end if;

  select last_active_at into v_prev from public.profiles where id = v_user;

  -- Acumula tempo ATIVO: delta desde o último toque, capado a 90s pra não contar
  -- aba ociosa/fechada (o front bate ~30s só com a aba visível).
  if v_prev is not null then
    v_delta := least(greatest(floor(extract(epoch from (now() - v_prev)))::int, 0), 90);
  else
    v_delta := 0;  -- primeira batida: só marca presença, não inventa tempo
  end if;

  update public.profiles
    set last_active_at = now(),
        usage_seconds = usage_seconds + v_delta
    where id = v_user;
end;
$$;
revoke all on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- ---------------------------------------------------------------------------
-- heartbeat_access volta a ser ENXUTO: só mantém a vaga da fila viva.
-- (O tempo de uso saiu daqui — agora é do touch_presence — pra não contar em
-- dobro quando a sala está ligada.)
-- ---------------------------------------------------------------------------
create or replace function public.heartbeat_access(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
begin
  update public.access_sessions
    set last_seen_at = now()
    where token = p_token
    returning state into v_state;

  if v_state is null then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  return jsonb_build_object('ok', v_state = 'active', 'state', v_state);
end;
$$;
revoke all on function public.heartbeat_access(uuid) from public;
grant execute on function public.heartbeat_access(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- admin_list_users: is_online agora deriva de last_active_at (presença real),
-- não de access_sessions. Mesma assinatura → CREATE OR REPLACE.
-- ---------------------------------------------------------------------------
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
    (p.last_active_at is not null and p.last_active_at > now() - interval '90 seconds') as is_online,
    p.usage_seconds, p.last_active_at
  from public.profiles p
  join auth.users u on u.id = p.id
  order by p.created_at;
end;
$$;
revoke execute on function public.admin_list_users() from public, anon;
grant execute on function public.admin_list_users() to authenticated;

-- ---------------------------------------------------------------------------
-- admin_user_moderation: is_online também por last_active_at (coerência no perfil)
-- ---------------------------------------------------------------------------
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
    'is_online', (select last_active_at is not null and last_active_at > now() - interval '90 seconds'
                  from public.profiles where id = p_user_id)
  ) into v;
  return v;
end;
$$;
revoke all on function public.admin_user_moderation(uuid) from public, anon;
grant execute on function public.admin_user_moderation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_system_health v4: reproduz TODOS os campos da v3 (000005) e adiciona
-- `online_now` (presença real). `active_sessions` continua (métrica da fila),
-- mas o KPI "Online" do painel passa a usar online_now.
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
    'online_now', (
      select count(*) from public.profiles
      where last_active_at is not null and last_active_at > now() - interval '90 seconds'
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
-- Cron: placar ao vivo a cada 1 min (era */5). should_sync_scores() continua
-- sendo o guarda — fora de jogo, run_football_sync('scores') retorna sem chamar
-- a API, então o custo extra só existe DURANTE partidas. No-op se pg_cron ausente.
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('resultadismo-sync-scores');
exception when others then
  raise notice 'unschedule sync-scores: %', sqlerrm;
end $$;

do $$
begin
  perform cron.schedule(
    'resultadismo-sync-scores', '* * * * *',
    $cron$select public.run_football_sync('scores');$cron$
  );
exception when others then
  raise notice 'cron.schedule sync-scores (1min) indisponível: %', sqlerrm;
end $$;
