-- ============================================================================
-- Resultadismo · Analytics first-party do app (admin)
-- ----------------------------------------------------------------------------
-- Objetivo:
--   - medir uso real por produto: app normal, Retrô e Manager;
--   - contar anônimos (landing/Retrô/Manager) sem PII;
--   - excluir app-admins da coleta e dos agregados;
--   - expor só RPCs agregadas para o painel admin.
-- ============================================================================

create table if not exists public.app_analytics_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text not null unique,
  visitor_key text not null,
  user_id uuid references public.profiles (id) on delete set null,
  product text not null check (product in ('app', 'retro', 'manager')),
  started_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  page_views int not null default 0 check (page_views >= 0),
  screen_seconds int not null default 0 check (screen_seconds >= 0)
);

create index if not exists app_analytics_sessions_product_started_idx
  on public.app_analytics_sessions (product, started_at desc);
create index if not exists app_analytics_sessions_user_idx
  on public.app_analytics_sessions (user_id, started_at desc);
create index if not exists app_analytics_sessions_visitor_idx
  on public.app_analytics_sessions (visitor_key, started_at desc);

alter table public.app_analytics_sessions enable row level security;

create table if not exists public.app_analytics_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  day date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  session_key text not null,
  visitor_key text not null,
  user_id uuid references public.profiles (id) on delete set null,
  product text not null check (product in ('app', 'retro', 'manager')),
  route text not null,
  event_type text not null check (event_type in ('page_view', 'heartbeat')),
  duration_seconds int not null default 0 check (duration_seconds >= 0),
  meta jsonb not null default '{}'::jsonb
);

create index if not exists app_analytics_events_day_product_idx
  on public.app_analytics_events (day desc, product);
create index if not exists app_analytics_events_user_idx
  on public.app_analytics_events (user_id, occurred_at desc);
create index if not exists app_analytics_events_route_idx
  on public.app_analytics_events (product, route, day desc);
create index if not exists app_analytics_events_session_idx
  on public.app_analytics_events (session_key, occurred_at desc);

alter table public.app_analytics_events enable row level security;

-- Coleta leve chamada pelo frontend. App-admin logado vira no-op: não entra nos
-- eventos, não atualiza sessão e portanto não distorce nenhum número.
create or replace function public.track_app_usage(
  p_session_key text,
  p_visitor_key text,
  p_product text,
  p_route text,
  p_event_type text default 'heartbeat',
  p_seconds int default 0,
  p_meta jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_is_admin boolean := false;
  v_product text := lower(nullif(btrim(coalesce(p_product, '')), ''));
  v_event text := lower(nullif(btrim(coalesce(p_event_type, 'heartbeat')), ''));
  v_session text := nullif(btrim(coalesce(p_session_key, '')), '');
  v_visitor text := nullif(btrim(coalesce(p_visitor_key, '')), '');
  v_route text := left(coalesce(nullif(btrim(coalesce(p_route, '/')), ''), '/'), 120);
  v_seconds int := greatest(0, least(coalesce(p_seconds, 0), 90));
  v_page_views int := 0;
begin
  if v_product not in ('app', 'retro', 'manager') then
    raise exception 'Produto de analytics inválido.';
  end if;
  if v_event not in ('page_view', 'heartbeat') then
    raise exception 'Evento de analytics inválido.';
  end if;
  if v_session is null or v_visitor is null then
    raise exception 'Sessão de analytics inválida.';
  end if;

  if v_user is not null then
    select coalesce(p.is_app_admin, false)
      into v_is_admin
      from public.profiles p
     where p.id = v_user;

    if coalesce(v_is_admin, false) then
      return jsonb_build_object('ok', true, 'skipped', 'admin');
    end if;
  end if;

  if v_event = 'page_view' then
    v_page_views := 1;
  end if;

  insert into public.app_analytics_sessions as s (
    session_key, visitor_key, user_id, product, started_at, last_seen_at, page_views, screen_seconds
  ) values (
    v_session, v_visitor, v_user, v_product, now(), now(), v_page_views, v_seconds
  )
  on conflict (session_key) do update set
    visitor_key = excluded.visitor_key,
    user_id = coalesce(excluded.user_id, s.user_id),
    product = excluded.product,
    last_seen_at = now(),
    page_views = s.page_views + excluded.page_views,
    screen_seconds = s.screen_seconds + excluded.screen_seconds;

  if v_event = 'page_view' or v_seconds > 0 then
    insert into public.app_analytics_events (
      session_key, visitor_key, user_id, product, route, event_type, duration_seconds, meta
    ) values (
      v_session, v_visitor, v_user, v_product, v_route, v_event, v_seconds, coalesce(p_meta, '{}'::jsonb)
    );
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.track_app_usage(text, text, text, text, text, int, jsonb) from public;
grant execute on function public.track_app_usage(text, text, text, text, text, int, jsonb) to anon, authenticated;

-- Painel completo de métricas do app-admin. Mantém tudo agregado e traz só a
-- lista operacional de usuários cadastrados inativos (com e-mail de auth.users)
-- para ação direta do João.
create or replace function public.admin_app_metrics(
  p_days int default 30,
  p_product text default 'all'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days int := greatest(1, least(coalesce(p_days, 30), 90));
  v_product text := lower(nullif(btrim(coalesce(p_product, 'all')), ''));
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_start date;
  v_summary jsonb;
  v_daily jsonb;
  v_pages jsonb;
  v_products jsonb;
  v_inactive jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  if v_product not in ('all', 'app', 'retro', 'manager') then
    raise exception 'Produto inválido.';
  end if;

  v_start := v_today - (v_days - 1);

  with days as (
    select generate_series(v_start, v_today, interval '1 day')::date as day
  ),
  events as (
    select *
      from public.app_analytics_events e
     where e.day between v_start and v_today
       and (v_product = 'all' or e.product = v_product)
  ),
  sessions as (
    select (s.started_at at time zone 'America/Sao_Paulo')::date as day, s.*
      from public.app_analytics_sessions s
     where (s.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_today
       and (v_product = 'all' or s.product = v_product)
  ),
  daily as (
    select
      d.day,
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as active_total,
      count(distinct e.user_id) filter (where e.user_id is not null)::int as active_logged,
      count(distinct e.visitor_key) filter (where e.user_id is null)::int as active_anon,
      count(*) filter (where e.event_type = 'page_view')::int as page_views,
      coalesce(sum(e.duration_seconds), 0)::int as screen_seconds,
      (select count(*)::int from sessions s where s.day = d.day) as sessions,
      (
        select count(*)::int
          from public.profiles p
         where coalesce(p.is_app_admin, false) = false
           and (p.created_at at time zone 'America/Sao_Paulo')::date = d.day
      ) as new_accounts,
      (
        select count(*)::int
          from public.predictions pr
          join public.profiles p on p.id = pr.user_id
         where v_product in ('all', 'app')
           and coalesce(p.is_app_admin, false) = false
           and (pr.created_at at time zone 'America/Sao_Paulo')::date = d.day
      ) as predictions,
      (
        select count(*)::int
          from public.leagues l
          join public.profiles p on p.id = l.owner_id
         where v_product in ('all', 'app')
           and coalesce(p.is_app_admin, false) = false
           and (l.created_at at time zone 'America/Sao_Paulo')::date = d.day
           and l.deleted_at is null
      ) as groups_created
    from days d
    left join events e on e.day = d.day
    group by d.day
    order by d.day
  ),
  daily_rates as (
    select
      coalesce(avg(active_total), 0) as avg_active,
      coalesce(avg(case when active_total > 0 then sessions::numeric / active_total else 0 end), 0) as avg_sessions_per_active_day,
      coalesce(avg(case when active_total > 0 then screen_seconds::numeric / active_total else 0 end), 0) as avg_seconds_per_active_day
    from daily
  ),
  active_period as (
    select
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as active_total,
      count(distinct e.user_id) filter (where e.user_id is not null)::int as active_logged,
      count(distinct e.visitor_key) filter (where e.user_id is null)::int as active_anon,
      count(*) filter (where e.event_type = 'page_view')::int as page_views,
      coalesce(sum(e.duration_seconds), 0)::int as screen_seconds
    from events e
  ),
  user_last as (
    select
      p.id,
      (
        select max(v)
          from (
            values
              (case when v_product in ('all', 'app') then p.last_active_at else null end),
              (case when v_product in ('all', 'retro') then p.retro_last_active_at else null end),
              ((select max(e.occurred_at)
                  from public.app_analytics_events e
                 where e.user_id = p.id
                   and (v_product = 'all' or e.product = v_product)))
          ) as x(v)
      ) as last_seen_at
    from public.profiles p
    where coalesce(p.is_app_admin, false) = false
  )
  select jsonb_build_object(
    'days', v_days,
    'product', v_product,
    'start_day', v_start,
    'end_day', v_today,
    'active_total', coalesce(ap.active_total, 0),
    'active_logged', coalesce(ap.active_logged, 0),
    'active_anon', coalesce(ap.active_anon, 0),
    'sessions_total', (select count(*)::int from sessions),
    'page_views_total', coalesce(ap.page_views, 0),
    'screen_seconds_total', coalesce(ap.screen_seconds, 0),
    'avg_daily_active', round(dr.avg_active, 1),
    'avg_sessions_per_active_day', round(dr.avg_sessions_per_active_day, 2),
    'avg_seconds_per_active_day', round(dr.avg_seconds_per_active_day, 0),
    'new_accounts', (
      select count(*)::int
        from public.profiles p
       where coalesce(p.is_app_admin, false) = false
         and (p.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_today
    ),
    'total_accounts', (
      select count(*)::int from public.profiles p where coalesce(p.is_app_admin, false) = false
    ),
    'predictions_total', (
      select count(*)::int
        from public.predictions pr
        join public.profiles p on p.id = pr.user_id
       where v_product in ('all', 'app')
         and coalesce(p.is_app_admin, false) = false
         and (pr.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_today
    ),
    'active_groups_total', (
      select count(*)::int
        from public.leagues l
        join public.profiles p on p.id = l.owner_id
       where v_product in ('all', 'app')
         and coalesce(p.is_app_admin, false) = false
         and l.status = 'active'
         and l.deleted_at is null
    ),
    'groups_with_predictions', (
      select count(distinct lm.league_id)::int
        from public.predictions pr
        join public.profiles p on p.id = pr.user_id
        join public.league_members lm on lm.user_id = pr.user_id and lm.status = 'active'
        join public.leagues l on l.id = lm.league_id and l.deleted_at is null
       where v_product in ('all', 'app')
         and coalesce(p.is_app_admin, false) = false
         and (pr.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_today
    ),
    'paid_leagues', (
      select count(*)::int
        from public.leagues l
        join public.profiles p on p.id = l.owner_id
       where v_product in ('all', 'app')
         and coalesce(p.is_app_admin, false) = false
         and l.payment_status = 'paid'
         and l.deleted_at is null
    ),
    'pot_enabled_leagues', (
      select count(distinct lc.league_id)::int
        from public.league_competitions lc
        join public.leagues l on l.id = lc.league_id
        join public.profiles p on p.id = l.owner_id
       where v_product in ('all', 'app')
         and coalesce(p.is_app_admin, false) = false
         and l.deleted_at is null
         and coalesce(lc.pot_enabled, false) = true
    ),
    'retro_runs_total', (
      select count(*)::int
        from public.retro_runs r
        left join public.profiles p on p.id = r.user_id
       where v_product in ('all', 'retro')
         and (r.user_id is null or coalesce(p.is_app_admin, false) = false)
         and (r.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_today
    ),
    'retro_logged_players', (
      select count(distinct r.user_id)::int
        from public.retro_runs r
        join public.profiles p on p.id = r.user_id
       where v_product in ('all', 'retro')
         and coalesce(p.is_app_admin, false) = false
         and (r.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_today
    ),
    'inactive_2d', (
      select count(*)::int from user_last u
       where u.last_seen_at is null or u.last_seen_at < now() - interval '2 days'
    ),
    'inactive_7d', (
      select count(*)::int from user_last u
       where u.last_seen_at is null or u.last_seen_at < now() - interval '7 days'
    ),
    'inactive_30d', (
      select count(*)::int from user_last u
       where u.last_seen_at is null or u.last_seen_at < now() - interval '30 days'
    )
  )
  into v_summary
  from active_period ap, daily_rates dr;

  with days as (
    select generate_series(v_start, v_today, interval '1 day')::date as day
  ),
  events as (
    select *
      from public.app_analytics_events e
     where e.day between v_start and v_today
       and (v_product = 'all' or e.product = v_product)
  ),
  sessions as (
    select (s.started_at at time zone 'America/Sao_Paulo')::date as day, s.*
      from public.app_analytics_sessions s
     where (s.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_today
       and (v_product = 'all' or s.product = v_product)
  ),
  daily as (
    select
      d.day,
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as active_total,
      count(distinct e.user_id) filter (where e.user_id is not null)::int as active_logged,
      count(distinct e.visitor_key) filter (where e.user_id is null)::int as active_anon,
      count(*) filter (where e.event_type = 'page_view')::int as page_views,
      coalesce(sum(e.duration_seconds), 0)::int as screen_seconds,
      (select count(*)::int from sessions s where s.day = d.day) as sessions,
      (
        select count(*)::int
          from public.profiles p
         where coalesce(p.is_app_admin, false) = false
           and (p.created_at at time zone 'America/Sao_Paulo')::date = d.day
      ) as new_accounts,
      (
        select count(*)::int
          from public.predictions pr
          join public.profiles p on p.id = pr.user_id
         where v_product in ('all', 'app')
           and coalesce(p.is_app_admin, false) = false
           and (pr.created_at at time zone 'America/Sao_Paulo')::date = d.day
      ) as predictions,
      (
        select count(*)::int
          from public.leagues l
          join public.profiles p on p.id = l.owner_id
         where v_product in ('all', 'app')
           and coalesce(p.is_app_admin, false) = false
           and (l.created_at at time zone 'America/Sao_Paulo')::date = d.day
           and l.deleted_at is null
      ) as groups_created
    from days d
    left join events e on e.day = d.day
    group by d.day
    order by d.day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', day,
    'active_total', active_total,
    'active_logged', active_logged,
    'active_anon', active_anon,
    'sessions', sessions,
    'page_views', page_views,
    'screen_seconds', screen_seconds,
    'new_accounts', new_accounts,
    'predictions', predictions,
    'groups_created', groups_created
  ) order by day), '[]'::jsonb)
  into v_daily
  from daily;

  with page_views as (
    select
      e.product,
      e.route,
      count(*) filter (where e.event_type = 'page_view')::int as views,
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as visitors,
      count(distinct e.session_key)::int as sessions
    from public.app_analytics_events e
    where e.day between v_start and v_today
      and (v_product = 'all' or e.product = v_product)
    group by e.product, e.route
  ),
  page_time as (
    select e.product, e.route, coalesce(sum(e.duration_seconds), 0)::int as seconds
    from public.app_analytics_events e
    where e.day between v_start and v_today
      and (v_product = 'all' or e.product = v_product)
    group by e.product, e.route
  ),
  ranked as (
    select
      pv.product,
      pv.route,
      pv.views,
      pv.visitors,
      pv.sessions,
      coalesce(pt.seconds, 0) as screen_seconds
    from page_views pv
    left join page_time pt on pt.product = pv.product and pt.route = pv.route
    order by pv.views desc, pv.visitors desc, pv.route
    limit 18
  )
  select coalesce(jsonb_agg(to_jsonb(ranked)), '[]'::jsonb)
  into v_pages
  from ranked;

  with product_rows as (
    select
      e.product,
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as active_total,
      count(distinct e.user_id) filter (where e.user_id is not null)::int as active_logged,
      count(distinct e.visitor_key) filter (where e.user_id is null)::int as active_anon,
      count(*) filter (where e.event_type = 'page_view')::int as page_views,
      coalesce(sum(e.duration_seconds), 0)::int as screen_seconds,
      (select count(*)::int
         from public.app_analytics_sessions s
        where s.product = e.product
          and (s.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_today) as sessions
    from public.app_analytics_events e
    where e.day between v_start and v_today
    group by e.product
  )
  select coalesce(jsonb_agg(to_jsonb(product_rows) order by product), '[]'::jsonb)
  into v_products
  from product_rows;

  with per_user as (
    select
      p.id,
      p.display_name,
      u.email::text,
      (
        select max(v)
          from (
            values
              (case when v_product in ('all', 'app') then p.last_active_at else null end),
              (case when v_product in ('all', 'retro') then p.retro_last_active_at else null end),
              ((select max(e.occurred_at)
                  from public.app_analytics_events e
                 where e.user_id = p.id
                   and (v_product = 'all' or e.product = v_product)))
          ) as x(v)
      ) as last_seen_at,
      (
        select count(*)::int
          from public.app_analytics_sessions s
         where s.user_id = p.id
           and (v_product = 'all' or s.product = v_product)
           and s.started_at >= now() - interval '30 days'
      ) as sessions_30d,
      (
        select coalesce(sum(s.screen_seconds), 0)::int
          from public.app_analytics_sessions s
         where s.user_id = p.id
           and (v_product = 'all' or s.product = v_product)
           and s.started_at >= now() - interval '30 days'
      ) as screen_seconds_30d,
      (
        select e.product
          from public.app_analytics_events e
         where e.user_id = p.id
           and (v_product = 'all' or e.product = v_product)
         order by e.occurred_at desc
         limit 1
      ) as last_product
    from public.profiles p
    join auth.users u on u.id = p.id
    where coalesce(p.is_app_admin, false) = false
  ),
  ordered as (
    select
      id,
      display_name,
      email,
      last_seen_at,
      case
        when last_seen_at is null then null
        else floor(extract(epoch from (now() - last_seen_at)) / 86400)::int
      end as inactive_days,
      sessions_30d,
      screen_seconds_30d,
      last_product
    from per_user
    where last_seen_at is null or last_seen_at < now() - interval '2 days'
    order by last_seen_at asc nulls first, display_name
    limit 60
  )
  select coalesce(jsonb_agg(to_jsonb(ordered)), '[]'::jsonb)
  into v_inactive
  from ordered;

  return jsonb_build_object(
    'summary', coalesce(v_summary, '{}'::jsonb),
    'daily', coalesce(v_daily, '[]'::jsonb),
    'pages', coalesce(v_pages, '[]'::jsonb),
    'products', coalesce(v_products, '[]'::jsonb),
    'inactive_users', coalesce(v_inactive, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_app_metrics(int, text) from public, anon;
grant execute on function public.admin_app_metrics(int, text) to authenticated;
