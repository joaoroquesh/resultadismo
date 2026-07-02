-- ============================================================================
-- Resultadismo · Analytics first-party v3
-- ----------------------------------------------------------------------------
-- Corrige as médias operacionais do painel admin:
--   - remove o limite fixo de 30 dias;
--   - marca app-admin na coleta para permitir toggle no painel;
--   - separa média por usuário ativo no período de média por usuário-dia ativo;
--   - deixa explícitos totais, ativos, inativos e janela real de coleta.
-- ============================================================================

alter table public.app_analytics_sessions
  add column if not exists is_app_admin boolean not null default false;

alter table public.app_analytics_events
  add column if not exists is_app_admin boolean not null default false;

update public.app_analytics_sessions s
   set is_app_admin = coalesce(p.is_app_admin, false)
  from public.profiles p
 where s.user_id = p.id
   and s.is_app_admin is distinct from coalesce(p.is_app_admin, false);

update public.app_analytics_events e
   set is_app_admin = coalesce(p.is_app_admin, false)
  from public.profiles p
 where e.user_id = p.id
   and e.is_app_admin is distinct from coalesce(p.is_app_admin, false);

create index if not exists app_analytics_sessions_admin_started_idx
  on public.app_analytics_sessions (is_app_admin, product, started_at desc);

create index if not exists app_analytics_events_admin_day_product_idx
  on public.app_analytics_events (is_app_admin, day desc, product);

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
  if v_event not in ('page_view', 'heartbeat', 'manager_match_complete') then
    raise exception 'Evento de analytics inválido.';
  end if;
  if v_session is null or v_visitor is null then
    raise exception 'Sessão de analytics inválida.';
  end if;

  if v_user is not null then
    select coalesce((select p.is_app_admin from public.profiles p where p.id = v_user), false)
      into v_is_admin;
  end if;

  if v_event = 'page_view' then
    v_page_views := 1;
  end if;

  insert into public.app_analytics_sessions as s (
    session_key,
    visitor_key,
    user_id,
    product,
    started_at,
    last_seen_at,
    page_views,
    screen_seconds,
    is_app_admin
  ) values (
    v_session,
    v_visitor,
    v_user,
    v_product,
    now(),
    now(),
    v_page_views,
    v_seconds,
    v_is_admin
  )
  on conflict (session_key) do update set
    visitor_key = excluded.visitor_key,
    user_id = coalesce(excluded.user_id, s.user_id),
    product = excluded.product,
    last_seen_at = now(),
    page_views = s.page_views + excluded.page_views,
    screen_seconds = s.screen_seconds + excluded.screen_seconds,
    is_app_admin = s.is_app_admin or excluded.is_app_admin;

  if v_event = 'page_view' or v_event = 'manager_match_complete' or v_seconds > 0 then
    insert into public.app_analytics_events (
      session_key,
      visitor_key,
      user_id,
      product,
      route,
      event_type,
      duration_seconds,
      meta,
      is_app_admin
    ) values (
      v_session,
      v_visitor,
      v_user,
      v_product,
      v_route,
      v_event,
      v_seconds,
      coalesce(p_meta, '{}'::jsonb),
      v_is_admin
    );
  end if;

  return jsonb_build_object('ok', true, 'is_app_admin', v_is_admin);
end;
$$;

revoke execute on function public.track_app_usage(text, text, text, text, text, int, jsonb) from public;
grant execute on function public.track_app_usage(text, text, text, text, text, int, jsonb) to anon, authenticated;

drop function if exists public.admin_app_metrics_range(date, date, text);

create or replace function public.admin_app_metrics_range(
  p_start_day date default null,
  p_end_day date default null,
  p_product text default 'all',
  p_include_admins boolean default false
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product text := lower(nullif(btrim(coalesce(p_product, 'all')), ''));
  v_include_admins boolean := coalesce(p_include_admins, false);
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_oldest_day date;
  v_collection_started_day date;
  v_start date;
  v_end date;
  v_days int;
  v_summary jsonb;
  v_daily jsonb;
  v_pages jsonb;
  v_products jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  if v_product not in ('all', 'app', 'retro', 'manager') then
    raise exception 'Produto inválido.';
  end if;

  select min(src.day)
    into v_oldest_day
    from (
      select (p.created_at at time zone 'America/Sao_Paulo')::date as day
        from public.profiles p
       where v_product in ('all', 'app')
         and (v_include_admins or coalesce(p.is_app_admin, false) = false)
      union all
      select (pr.created_at at time zone 'America/Sao_Paulo')::date as day
        from public.predictions pr
        join public.profiles p on p.id = pr.user_id
       where v_product in ('all', 'app')
         and (v_include_admins or coalesce(p.is_app_admin, false) = false)
      union all
      select (l.created_at at time zone 'America/Sao_Paulo')::date as day
        from public.leagues l
        join public.profiles p on p.id = l.owner_id
       where v_product in ('all', 'app')
         and l.deleted_at is null
         and (v_include_admins or coalesce(p.is_app_admin, false) = false)
      union all
      select (r.started_at at time zone 'America/Sao_Paulo')::date as day
        from public.retro_runs r
        left join public.profiles p on p.id = r.user_id
       where v_product in ('all', 'retro')
         and (r.user_id is null or v_include_admins or coalesce(p.is_app_admin, false) = false)
      union all
      select e.day
        from public.app_analytics_events e
        left join public.profiles p on p.id = e.user_id
       where (v_product = 'all' or e.product = v_product)
         and (v_include_admins or (coalesce(e.is_app_admin, false) = false and coalesce(p.is_app_admin, false) = false))
    ) src
   where src.day is not null
     and src.day <= v_today;

  select min(e.day)
    into v_collection_started_day
    from public.app_analytics_events e
    left join public.profiles p on p.id = e.user_id
   where (v_product = 'all' or e.product = v_product)
     and (v_include_admins or (coalesce(e.is_app_admin, false) = false and coalesce(p.is_app_admin, false) = false));

  v_oldest_day := coalesce(v_oldest_day, v_collection_started_day, v_today);
  v_end := least(coalesce(p_end_day, v_today), v_today);
  v_start := greatest(coalesce(p_start_day, v_end - 29), v_oldest_day);
  if v_start > v_end then
    v_start := v_end;
  end if;
  v_days := (v_end - v_start + 1);

  with days as (
    select generate_series(v_start, v_end, interval '1 day')::date as day
  ),
  profile_scope as (
    select p.*
      from public.profiles p
     where v_include_admins or coalesce(p.is_app_admin, false) = false
  ),
  events as (
    select e.*
      from public.app_analytics_events e
      left join public.profiles ep on ep.id = e.user_id
     where e.day between v_start and v_end
       and (v_product = 'all' or e.product = v_product)
       and (v_include_admins or (coalesce(e.is_app_admin, false) = false and coalesce(ep.is_app_admin, false) = false))
  ),
  sessions as (
    select (s.started_at at time zone 'America/Sao_Paulo')::date as day, s.*
      from public.app_analytics_sessions s
      left join public.profiles sp on sp.id = s.user_id
     where (s.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
       and (v_product = 'all' or s.product = v_product)
       and (v_include_admins or (coalesce(s.is_app_admin, false) = false and coalesce(sp.is_app_admin, false) = false))
  ),
  daily as (
    select
      d.day,
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as active_total,
      count(distinct e.user_id) filter (where e.user_id is not null)::int as active_logged,
      count(distinct e.visitor_key) filter (where e.user_id is null)::int as active_anon,
      count(*) filter (where e.event_type = 'page_view')::int as page_views,
      count(*) filter (where e.event_type = 'manager_match_complete')::int as manager_matches,
      coalesce(sum(e.duration_seconds), 0)::int as screen_seconds,
      (select count(*)::int from sessions s where s.day = d.day) as sessions,
      (
        select count(*)::int
          from profile_scope p
         where v_product in ('all', 'app')
           and (p.created_at at time zone 'America/Sao_Paulo')::date = d.day
      ) as new_accounts,
      (
        select count(*)::int
          from public.predictions pr
          join profile_scope p on p.id = pr.user_id
         where v_product in ('all', 'app')
           and (pr.created_at at time zone 'America/Sao_Paulo')::date = d.day
      ) as predictions,
      (
        select count(*)::int
          from public.leagues l
          join profile_scope p on p.id = l.owner_id
         where v_product in ('all', 'app')
           and (l.created_at at time zone 'America/Sao_Paulo')::date = d.day
           and l.deleted_at is null
      ) as groups_created
    from days d
    left join events e on e.day = d.day
    group by d.day
    order by d.day
  ),
  identity_days as (
    select
      e.day,
      coalesce(e.user_id::text, 'anon:' || e.visitor_key) as identity_key,
      coalesce(sum(e.duration_seconds), 0)::numeric as screen_seconds
    from events e
    group by e.day, coalesce(e.user_id::text, 'anon:' || e.visitor_key)
  ),
  identity_period as (
    select
      identity_key,
      coalesce(sum(screen_seconds), 0)::numeric as screen_seconds
    from identity_days
    group by identity_key
  ),
  daily_rates as (
    select
      count(*) filter (where active_total > 0)::int as days_with_activity,
      coalesce(avg(active_total) filter (where active_total > 0), 0) as avg_active,
      coalesce(
        (sum(sessions) filter (where active_total > 0))::numeric /
        nullif(sum(active_total) filter (where active_total > 0), 0),
        0
      ) as avg_sessions_per_active_user_day,
      coalesce(avg(predictions) filter (where predictions > 0), 0) as avg_predictions_per_prediction_day,
      count(*) filter (where predictions > 0)::int as prediction_days
    from daily
  ),
  active_period as (
    select
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as active_total,
      count(distinct e.user_id) filter (where e.user_id is not null)::int as active_logged,
      count(distinct e.visitor_key) filter (where e.user_id is null)::int as active_anon,
      count(*) filter (where e.event_type = 'page_view')::int as page_views,
      count(*) filter (where e.event_type = 'manager_match_complete')::int as manager_matches,
      coalesce(sum(e.duration_seconds), 0)::int as screen_seconds
    from events e
  ),
  period_rates as (
    select
      coalesce((select count(*)::numeric from sessions) / nullif(ap.active_total, 0), 0) as avg_sessions_per_active_user,
      coalesce((select avg(ip.screen_seconds) from identity_period ip), 0) as avg_seconds_per_active_user,
      coalesce((select avg(id.screen_seconds) from identity_days id), 0) as avg_seconds_per_active_user_day
    from active_period ap
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
                  from events e
                 where e.user_id = p.id))
          ) as x(v)
      ) as last_seen_at
    from profile_scope p
  )
  select jsonb_build_object(
    'days', v_days,
    'product', v_product,
    'include_admins', v_include_admins,
    'start_day', v_start,
    'end_day', v_end,
    'oldest_day_available', v_oldest_day,
    'collection_started_day', v_collection_started_day,
    'active_total', coalesce(ap.active_total, 0),
    'active_logged', coalesce(ap.active_logged, 0),
    'active_anon', coalesce(ap.active_anon, 0),
    'sessions_total', (select count(*)::int from sessions),
    'page_views_total', coalesce(ap.page_views, 0),
    'screen_seconds_total', coalesce(ap.screen_seconds, 0),
    'days_with_activity', coalesce(dr.days_with_activity, 0),
    'avg_daily_active', round(dr.avg_active, 1),
    'avg_sessions_per_active_user', round(pr.avg_sessions_per_active_user, 2),
    'avg_sessions_per_active_user_day', round(dr.avg_sessions_per_active_user_day, 2),
    'avg_seconds_per_active_user', round(pr.avg_seconds_per_active_user, 0),
    'avg_seconds_per_active_user_day', round(pr.avg_seconds_per_active_user_day, 0),
    'avg_sessions_per_active_day', round(dr.avg_sessions_per_active_user_day, 2),
    'avg_seconds_per_active_day', round(pr.avg_seconds_per_active_user_day, 0),
    'avg_daily_predictions', round(dr.avg_predictions_per_prediction_day, 1),
    'prediction_days', coalesce(dr.prediction_days, 0),
    'new_accounts', (
      select count(*)::int
        from profile_scope p
       where v_product in ('all', 'app')
         and (p.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
    ),
    'total_accounts', (select count(*)::int from profile_scope),
    'inactive_in_period', greatest(
      (select count(*)::int from profile_scope) - coalesce(ap.active_logged, 0),
      0
    ),
    'predictions_total', (
      select count(*)::int
        from public.predictions prd
        join profile_scope p on p.id = prd.user_id
       where v_product in ('all', 'app')
         and (prd.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
    ),
    'active_groups_total', (
      select count(*)::int
        from public.leagues l
        join profile_scope p on p.id = l.owner_id
       where v_product in ('all', 'app')
         and l.status = 'active'
         and l.deleted_at is null
    ),
    'groups_with_predictions', (
      select count(distinct lm.league_id)::int
        from public.predictions prd
        join profile_scope p on p.id = prd.user_id
        join public.league_members lm on lm.user_id = prd.user_id and lm.status = 'active'
        join public.leagues l on l.id = lm.league_id and l.deleted_at is null
       where v_product in ('all', 'app')
         and (prd.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
    ),
    'paid_leagues', (
      select count(*)::int
        from public.leagues l
        join profile_scope p on p.id = l.owner_id
       where v_product in ('all', 'app')
         and l.payment_status = 'paid'
         and l.deleted_at is null
    ),
    'pot_enabled_leagues', (
      select count(distinct lc.league_id)::int
        from public.league_competitions lc
        join public.leagues l on l.id = lc.league_id
        join profile_scope p on p.id = l.owner_id
       where v_product in ('all', 'app')
         and l.deleted_at is null
         and coalesce(lc.pot_enabled, false) = true
    ),
    'retro_runs_total', (
      select count(*)::int
        from public.retro_runs r
        left join public.profiles p on p.id = r.user_id
       where v_product in ('all', 'retro')
         and (r.user_id is null or v_include_admins or coalesce(p.is_app_admin, false) = false)
         and (r.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
    ),
    'retro_logged_players', (
      select count(distinct r.user_id)::int
        from public.retro_runs r
        join public.profiles p on p.id = r.user_id
       where v_product in ('all', 'retro')
         and (v_include_admins or coalesce(p.is_app_admin, false) = false)
         and (r.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
    ),
    'manager_matches_total', coalesce(ap.manager_matches, 0),
    'manager_logged_players', (
      select count(distinct e.user_id)::int
        from events e
       where e.product = 'manager'
         and e.event_type = 'manager_match_complete'
         and e.user_id is not null
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
  from active_period ap, daily_rates dr, period_rates pr;

  with days as (
    select generate_series(v_start, v_end, interval '1 day')::date as day
  ),
  profile_scope as (
    select p.*
      from public.profiles p
     where v_include_admins or coalesce(p.is_app_admin, false) = false
  ),
  events as (
    select e.*
      from public.app_analytics_events e
      left join public.profiles ep on ep.id = e.user_id
     where e.day between v_start and v_end
       and (v_product = 'all' or e.product = v_product)
       and (v_include_admins or (coalesce(e.is_app_admin, false) = false and coalesce(ep.is_app_admin, false) = false))
  ),
  sessions as (
    select (s.started_at at time zone 'America/Sao_Paulo')::date as day, s.*
      from public.app_analytics_sessions s
      left join public.profiles sp on sp.id = s.user_id
     where (s.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
       and (v_product = 'all' or s.product = v_product)
       and (v_include_admins or (coalesce(s.is_app_admin, false) = false and coalesce(sp.is_app_admin, false) = false))
  ),
  daily as (
    select
      d.day,
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as active_total,
      count(distinct e.user_id) filter (where e.user_id is not null)::int as active_logged,
      count(distinct e.visitor_key) filter (where e.user_id is null)::int as active_anon,
      count(*) filter (where e.event_type = 'page_view')::int as page_views,
      count(*) filter (where e.event_type = 'manager_match_complete')::int as manager_matches,
      coalesce(sum(e.duration_seconds), 0)::int as screen_seconds,
      (select count(*)::int from sessions s where s.day = d.day) as sessions,
      (
        select count(*)::int
          from profile_scope p
         where v_product in ('all', 'app')
           and (p.created_at at time zone 'America/Sao_Paulo')::date = d.day
      ) as new_accounts,
      (
        select count(*)::int
          from public.predictions pr
          join profile_scope p on p.id = pr.user_id
         where v_product in ('all', 'app')
           and (pr.created_at at time zone 'America/Sao_Paulo')::date = d.day
      ) as predictions,
      (
        select count(*)::int
          from public.leagues l
          join profile_scope p on p.id = l.owner_id
         where v_product in ('all', 'app')
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
    'groups_created', groups_created,
    'manager_matches', manager_matches
  ) order by day), '[]'::jsonb)
  into v_daily
  from daily;

  with events as (
    select e.*
      from public.app_analytics_events e
      left join public.profiles ep on ep.id = e.user_id
     where e.day between v_start and v_end
       and (v_product = 'all' or e.product = v_product)
       and (v_include_admins or (coalesce(e.is_app_admin, false) = false and coalesce(ep.is_app_admin, false) = false))
  ),
  page_daily as (
    select
      e.product,
      e.route,
      e.day,
      count(*) filter (where e.event_type = 'page_view')::int as views,
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as visitors,
      count(distinct e.session_key)::int as sessions,
      coalesce(sum(e.duration_seconds), 0)::int as screen_seconds,
      count(*) filter (where e.event_type = 'manager_match_complete')::int as manager_matches
    from events e
    group by e.product, e.route, e.day
  ),
  page_totals as (
    select
      product,
      route,
      sum(views)::int as views,
      sum(visitors)::int as visitors,
      sum(sessions)::int as sessions,
      sum(screen_seconds)::int as screen_seconds,
      sum(manager_matches)::int as manager_matches
    from page_daily
    group by product, route
  ),
  best_day as (
    select distinct on (product, route)
      product,
      route,
      day as best_day,
      views as best_day_views
    from page_daily
    order by product, route, views desc, visitors desc, day desc
  ),
  ranked as (
    select *
      from page_totals
     order by views desc, visitors desc, screen_seconds desc, route
     limit 50
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product', r.product,
    'route', r.route,
    'views', r.views,
    'visitors', r.visitors,
    'sessions', r.sessions,
    'screen_seconds', r.screen_seconds,
    'manager_matches', r.manager_matches,
    'best_day', b.best_day,
    'best_day_views', b.best_day_views,
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'day', pd.day,
        'views', pd.views,
        'visitors', pd.visitors,
        'sessions', pd.sessions,
        'screen_seconds', pd.screen_seconds,
        'manager_matches', pd.manager_matches
      ) order by pd.day), '[]'::jsonb)
      from page_daily pd
      where pd.product = r.product and pd.route = r.route
    )
  ) order by r.views desc, r.visitors desc, r.screen_seconds desc, r.route), '[]'::jsonb)
  into v_pages
  from ranked r
  left join best_day b on b.product = r.product and b.route = r.route;

  with product_dim(product) as (
    values ('app'::text), ('retro'::text), ('manager'::text)
  ),
  events as (
    select e.*
      from public.app_analytics_events e
      left join public.profiles ep on ep.id = e.user_id
     where e.day between v_start and v_end
       and (v_include_admins or (coalesce(e.is_app_admin, false) = false and coalesce(ep.is_app_admin, false) = false))
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'product', pd.product,
    'active_total', coalesce(x.active_total, 0),
    'active_logged', coalesce(x.active_logged, 0),
    'active_anon', coalesce(x.active_anon, 0),
    'page_views', coalesce(x.page_views, 0),
    'screen_seconds', coalesce(x.screen_seconds, 0),
    'sessions', coalesce(x.sessions, 0),
    'matches', case
      when pd.product = 'retro' then (
        select count(*)::int
          from public.retro_runs r
          left join public.profiles p on p.id = r.user_id
         where (r.user_id is null or v_include_admins or coalesce(p.is_app_admin, false) = false)
           and (r.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
      )
      when pd.product = 'manager' then coalesce(x.manager_matches, 0)
      else 0
    end
  ) order by pd.product), '[]'::jsonb)
  into v_products
  from product_dim pd
  left join lateral (
    select
      count(distinct coalesce(e.user_id::text, 'anon:' || e.visitor_key))::int as active_total,
      count(distinct e.user_id) filter (where e.user_id is not null)::int as active_logged,
      count(distinct e.visitor_key) filter (where e.user_id is null)::int as active_anon,
      count(*) filter (where e.event_type = 'page_view')::int as page_views,
      coalesce(sum(e.duration_seconds), 0)::int as screen_seconds,
      count(distinct e.session_key)::int as sessions,
      count(*) filter (where e.event_type = 'manager_match_complete')::int as manager_matches
    from events e
    where e.product = pd.product
  ) x on true;

  return jsonb_build_object(
    'summary', coalesce(v_summary, '{}'::jsonb),
    'daily', coalesce(v_daily, '[]'::jsonb),
    'pages', coalesce(v_pages, '[]'::jsonb),
    'products', coalesce(v_products, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.admin_app_metrics_range(date, date, text, boolean) from public, anon;
grant execute on function public.admin_app_metrics_range(date, date, text, boolean) to authenticated;
