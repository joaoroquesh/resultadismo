-- ============================================================================
-- Resultadismo · Admin v2 — saúde mais completa, jogo oculto fora do "ao vivo",
-- audit com nome da entidade.
-- ----------------------------------------------------------------------------
-- 1) "jogo oculto não existe": should_sync_scores() e o live_now do dashboard
--    passam a IGNORAR jogos ocultos (matches.hidden).
-- 2) Dashboard ganha: jogos de HOJE (BRT), grupos aguardando aprovação, e
--    mantém ao vivo / online / alertas / problemas de sync.
-- 3) admin_recent_audit resolve o NOME da entidade (qual competição/grupo/jogo).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- should_sync_scores: só vale a pena sincronizar por causa de jogo VISÍVEL
-- ---------------------------------------------------------------------------
create or replace function public.should_sync_scores()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.matches
    where hidden = false
      and (
        status = 'live'
        or (
          status = 'scheduled'
          and kickoff_at <= now() + interval '30 minutes'
          and kickoff_at >= now() - interval '180 minutes'
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Painel "Saúde do sistema" v2
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
      select count(*) from public.leagues
      where status = 'pending' and deleted_at is null
    ),
    'active_sessions', (select count(*) from public.access_sessions where state = 'active'),
    'maintenance_mode', (select maintenance_mode from public.app_settings where id = 1),
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
-- Alertas com o PROVEDOR da competição (qual API) — "me diz de qual API foi"
-- (DROP antes: ganhou a coluna competition_provider)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_list_sync_alerts(int);

create or replace function public.admin_list_sync_alerts(p_limit int default 50)
returns table (
  id uuid,
  competition_id uuid,
  competition_name text,
  competition_provider text,
  match_id uuid,
  kind text,
  status text,
  message text,
  payload jsonb,
  created_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem ver alertas de sincronização.';
  end if;
  return query
  select a.id, a.competition_id,
         coalesce(c.display_name, c.name) as competition_name,
         c.provider::text as competition_provider,
         a.match_id, a.kind, a.status, a.message, a.payload, a.created_at, a.resolved_at
  from public.sync_alerts a
  left join public.competitions c on c.id = a.competition_id
  order by (a.status = 'pending') desc, a.created_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit com nome legível da entidade (qual competição/grupo/jogo)
-- (DROP antes: a assinatura de retorno mudou — ganhou entity_label)
-- ---------------------------------------------------------------------------
drop function if exists public.admin_recent_audit(int);

create or replace function public.admin_recent_audit(p_limit int default 50)
returns table (
  id uuid, actor_name text, action text, entity_type text,
  entity_id uuid, entity_label text, detail jsonb, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem ver o histórico.';
  end if;
  return query
  select
    l.id,
    coalesce(p.display_name, 'Sistema') as actor_name,
    l.action,
    l.entity_type,
    l.entity_id,
    case l.entity_type
      when 'competition' then (
        select coalesce(c.display_name, c.name) from public.competitions c where c.id = l.entity_id
      )
      when 'league' then (select lg.name from public.leagues lg where lg.id = l.entity_id)
      when 'match' then (
        select m.home_team_name || ' x ' || m.away_team_name from public.matches m where m.id = l.entity_id
      )
      else null
    end as entity_label,
    l.detail,
    l.created_at
  from public.admin_audit_log l
  left join public.profiles p on p.id = l.actor
  order by l.created_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;
