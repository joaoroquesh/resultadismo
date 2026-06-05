-- ============================================================================
-- Resultadismo · Sincronização inteligente de jogos + alertas + saúde do admin
-- ----------------------------------------------------------------------------
-- O sync vira duas modalidades, decididas pela edge function pelo `mode`:
--   • scores  — só ATUALIZA placar/status de jogos JÁ existentes (frequente,
--               leve). O cron roda */5, mas a função SQL `should_sync_scores()`
--               só dispara a chamada HTTP quando há jogo ao vivo / prestes a
--               começar / recém-terminado. Sem jogo = sem requisição.
--   • catalog — reconcilia o calendário (1x/dia). NÃO insere jogo novo cego:
--               cria um ALERTA pro admin decidir. Cancelamento idem. Jogo de
--               mata-mata que existia como "A definir" e ganhou time real é
--               atualizado direto (+ alerta informativo).
--
-- Primeira vez que uma competição é adicionada (catalog_seeded = false) o
-- catalog INSERE tudo (o admin revisa/oculta). Depois disso, jogo novo vira
-- alerta.
--
-- Também: tabela de alertas, log de auditoria, modo manutenção, e RPCs de
-- gestão (saúde do sistema, resolver alerta, toggles) — tudo SECURITY DEFINER
-- com checagem de is_app_admin.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- competitions: flag de "já semeou o catálogo"
-- ---------------------------------------------------------------------------
alter table public.competitions
  add column if not exists catalog_seeded boolean not null default false;

-- Competições que já têm jogos (anteriores a este recurso) entram já semeadas:
-- jogo genuinamente novo a partir de agora vira alerta, não re-insere o que existe.
update public.competitions c
  set catalog_seeded = true
  where exists (select 1 from public.matches m where m.competition_id = c.id);

-- Saúde da sincronização por competição (a API da ESPN é não-oficial e pode
-- quebrar sem aviso — registramos o último resultado pra alertar, não falhar
-- em silêncio).
alter table public.competitions
  add column if not exists last_sync_ok boolean;
alter table public.competitions
  add column if not exists last_sync_error text;
alter table public.competitions
  add column if not exists last_sync_checked_at timestamptz;

-- ---------------------------------------------------------------------------
-- app_settings: modo manutenção (banner global)
-- ---------------------------------------------------------------------------
alter table public.app_settings
  add column if not exists maintenance_mode boolean not null default false;
alter table public.app_settings
  add column if not exists maintenance_message text;

-- ---------------------------------------------------------------------------
-- sync_alerts — fila de decisões do admin sobre o catálogo
-- kind: 'new_match' | 'cancelled'      → acionável (status 'pending')
--       'team_resolved' | 'kickoff_changed' → informativo (status 'applied')
-- ---------------------------------------------------------------------------
create table if not exists public.sync_alerts (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions (id) on delete cascade,
  match_id uuid references public.matches (id) on delete set null,
  provider_ref text,                       -- ref do jogo no provedor (dedupe)
  kind text not null,
  status text not null default 'pending',  -- pending | approved | rejected | applied
  message text,
  payload jsonb not null default '{}'::jsonb,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sync_alerts_pending_idx
  on public.sync_alerts (created_at desc)
  where status = 'pending';

-- Evita alerta duplicado pro mesmo jogo do provedor enquanto está pendente.
create unique index if not exists sync_alerts_dedupe_idx
  on public.sync_alerts (competition_id, provider_ref, kind)
  where status = 'pending' and provider_ref is not null;

alter table public.sync_alerts enable row level security;
-- Sem policy de SELECT direto: admin lê via RPC. (RLS ligado = nega por padrão.)

-- ---------------------------------------------------------------------------
-- admin_audit_log — histórico do que o sync/admin fez
-- ---------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor uuid references public.profiles (id) on delete set null,  -- null = sistema/cron
  action text not null,
  entity_type text,
  entity_id uuid,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_recent_idx
  on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;

-- ---------------------------------------------------------------------------
-- should_sync_scores() — vale a pena gastar uma requisição agora?
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
    where status = 'live'
       or (
         status = 'scheduled'
         and kickoff_at <= now() + interval '30 minutes'
         and kickoff_at >= now() - interval '180 minutes'
       )
  );
$$;

-- ---------------------------------------------------------------------------
-- Dispara a edge function com o modo. scores pula se não há jogo (economia).
-- ---------------------------------------------------------------------------
create or replace function public.run_football_sync(p_mode text default 'scores')
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.sync_config;
begin
  select * into cfg from private.sync_config where id = 1;
  if cfg.functions_url is null or cfg.service_key is null then
    return;  -- config ausente → no-op (cron não quebra)
  end if;

  -- Modo scores: só dispara se há jogo ao vivo / prestes / recém-terminado.
  if p_mode = 'scores' and not public.should_sync_scores() then
    return;
  end if;

  perform net.http_post(
    url := cfg.functions_url || '/sync-football',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_key
    ),
    body := jsonb_build_object('mode', p_mode)
  );
exception when others then
  raise notice 'run_football_sync(%) falhou: %', p_mode, sqlerrm;
end;
$$;

revoke all on function public.run_football_sync(text) from public, anon, authenticated;
revoke all on function public.should_sync_scores() from public, anon;
grant execute on function public.should_sync_scores() to authenticated;

-- ---------------------------------------------------------------------------
-- Reagenda o cron: scores */5 (guardado) + catalog diário 09:00 UTC (06:00 BRT)
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.unschedule('resultadismo-sync-football');
exception when others then
  raise notice 'unschedule sync-football: %', sqlerrm;
end $$;

do $$
begin
  perform cron.schedule(
    'resultadismo-sync-scores', '*/5 * * * *',
    $cron$select public.run_football_sync('scores');$cron$
  );
  perform cron.schedule(
    'resultadismo-sync-catalog', '0 9 * * *',
    $cron$select public.run_football_sync('catalog');$cron$
  );
exception when others then
  raise notice 'cron.schedule (scores/catalog) indisponível: %', sqlerrm;
end $$;

-- ============================================================================
-- RPCs de admin
-- ============================================================================

-- Lista alertas (pendentes primeiro, depois recentes).
create or replace function public.admin_list_sync_alerts(p_limit int default 50)
returns table (
  id uuid,
  competition_id uuid,
  competition_name text,
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
         a.match_id, a.kind, a.status, a.message, a.payload, a.created_at, a.resolved_at
  from public.sync_alerts a
  left join public.competitions c on c.id = a.competition_id
  order by (a.status = 'pending') desc, a.created_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;

-- Resolve um alerta acionável (new_match / cancelled).
-- p_action: 'approve' aplica a sugestão; 'reject' descarta.
create or replace function public.admin_resolve_sync_alert(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.sync_alerts;
  pl jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem resolver alertas.';
  end if;

  select * into a from public.sync_alerts where id = p_id;
  if a.id is null then
    raise exception 'Alerta não encontrado.';
  end if;
  if a.status <> 'pending' then
    raise exception 'Este alerta já foi resolvido.';
  end if;

  pl := a.payload;

  if p_action = 'approve' then
    if a.kind = 'new_match' then
      insert into public.matches (
        competition_id, provider, provider_ref, stage, group_name, round, matchday,
        home_team_id, away_team_id, home_team_name, away_team_name, kickoff_at, status
      ) values (
        a.competition_id,
        coalesce(pl->>'provider', 'manual')::public.data_provider,
        pl->>'provider_ref',
        pl->>'stage', pl->>'group_name', pl->>'round', (pl->>'matchday')::int,
        nullif(pl->>'home_team_id','')::uuid, nullif(pl->>'away_team_id','')::uuid,
        coalesce(pl->>'home_team_name','A definir'),
        coalesce(pl->>'away_team_name','A definir'),
        nullif(pl->>'kickoff_at','')::timestamptz,
        'scheduled'
      )
      on conflict (provider, provider_ref) do nothing;
    elsif a.kind = 'cancelled' and a.match_id is not null then
      update public.matches set status = 'cancelled' where id = a.match_id;
    end if;
  end if;

  update public.sync_alerts
    set status = case when p_action = 'approve' then 'approved' else 'rejected' end,
        resolved_by = auth.uid(),
        resolved_at = now()
    where id = p_id;

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'alert_' || p_action, 'sync_alert', p_id,
          jsonb_build_object('kind', a.kind, 'competition_id', a.competition_id));
end;
$$;

-- Liga/desliga o sync automático de uma competição.
create or replace function public.admin_set_competition_sync(p_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem alterar o sync.';
  end if;
  update public.competitions set sync_enabled = p_value where id = p_id;
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'competition_sync_toggle', 'competition', p_id,
          jsonb_build_object('sync_enabled', p_value));
end;
$$;

-- Modo manutenção (banner global pra todo mundo).
create or replace function public.admin_set_maintenance(p_on boolean, p_message text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem ativar manutenção.';
  end if;
  update public.app_settings
    set maintenance_mode = p_on,
        maintenance_message = nullif(trim(coalesce(p_message,'')), ''),
        updated_at = now()
    where id = 1;
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'maintenance_toggle', 'app_settings', null,
          jsonb_build_object('on', p_on));
end;
$$;

-- Reabre a janela de palpite de um jogo por X minutos (emergência: jogo adiado).
-- Empurra o kickoff_at pra frente — a RLS de predictions usa kickoff_at como trava.
create or replace function public.admin_reopen_match(p_match_id uuid, p_minutes int default 15)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem reabrir palpites.';
  end if;
  update public.matches
    set kickoff_at = now() + make_interval(mins => greatest(1, least(p_minutes, 240))),
        status = 'scheduled'
    where id = p_match_id;
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'match_reopen', 'match', p_match_id,
          jsonb_build_object('minutes', p_minutes));
end;
$$;

-- Histórico recente de ações (sync + admin).
create or replace function public.admin_recent_audit(p_limit int default 50)
returns table (
  id uuid, actor_name text, action text, entity_type text,
  entity_id uuid, detail jsonb, created_at timestamptz
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
  select l.id, coalesce(p.display_name, 'Sistema') as actor_name,
         l.action, l.entity_type, l.entity_id, l.detail, l.created_at
  from public.admin_audit_log l
  left join public.profiles p on p.id = l.actor
  order by l.created_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;

-- Painel "Saúde do sistema": um retrato do app num glance.
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
      where status = 'live'
         or (status = 'scheduled' and kickoff_at <= now() and kickoff_at >= now() - interval '180 minutes')
    ),
    'next_24h', (
      select count(*) from public.matches
      where status = 'scheduled' and kickoff_at between now() and now() + interval '24 hours'
    ),
    'pending_alerts', (select count(*) from public.sync_alerts where status = 'pending'),
    'active_sessions', (select count(*) from public.access_sessions where state = 'active'),
    'maintenance_mode', (select maintenance_mode from public.app_settings where id = 1),
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
    ),
    'sync_problems', (
      select count(*) from public.competitions
      where status = 'active' and sync_enabled and last_sync_ok is false
    )
  ) into v;
  return v;
end;
$$;

revoke all on function public.admin_list_sync_alerts(int) from public, anon;
revoke all on function public.admin_resolve_sync_alert(uuid, text) from public, anon;
revoke all on function public.admin_set_competition_sync(uuid, boolean) from public, anon;
revoke all on function public.admin_set_maintenance(boolean, text) from public, anon;
revoke all on function public.admin_reopen_match(uuid, int) from public, anon;
revoke all on function public.admin_recent_audit(int) from public, anon;
revoke all on function public.admin_system_health() from public, anon;
grant execute on function public.admin_list_sync_alerts(int) to authenticated;
grant execute on function public.admin_resolve_sync_alert(uuid, text) to authenticated;
grant execute on function public.admin_set_competition_sync(uuid, boolean) to authenticated;
grant execute on function public.admin_set_maintenance(boolean, text) to authenticated;
grant execute on function public.admin_reopen_match(uuid, int) to authenticated;
grant execute on function public.admin_recent_audit(int) to authenticated;
grant execute on function public.admin_system_health() to authenticated;
