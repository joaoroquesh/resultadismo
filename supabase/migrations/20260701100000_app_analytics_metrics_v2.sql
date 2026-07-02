-- ============================================================================
-- Resultadismo · Analytics first-party v2
-- ----------------------------------------------------------------------------
-- Complementa a primeira versão com:
--   - período flexível dentro dos últimos 30 dias;
--   - detalhamento diário por rota;
--   - evento de partida concluída no Manager;
--   - painel admin-only de métricas no perfil do jogador.
-- ============================================================================

alter table public.app_analytics_events
  drop constraint if exists app_analytics_events_event_type_check;

alter table public.app_analytics_events
  add constraint app_analytics_events_event_type_check
  check (event_type in ('page_view', 'heartbeat', 'manager_match_complete'));

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

  if v_event = 'page_view' or v_event = 'manager_match_complete' or v_seconds > 0 then
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

create or replace function public.admin_app_metrics_range(
  p_start_day date default null,
  p_end_day date default null,
  p_product text default 'all'
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_product text := lower(nullif(btrim(coalesce(p_product, 'all')), ''));
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_min_day date := (now() at time zone 'America/Sao_Paulo')::date - 29;
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

  v_end := least(coalesce(p_end_day, v_today), v_today);
  v_start := greatest(coalesce(p_start_day, v_end - 29), v_min_day);
  if v_start > v_end then
    v_start := v_end;
  end if;
  v_days := (v_end - v_start + 1);

  with days as (
    select generate_series(v_start, v_end, interval '1 day')::date as day
  ),
  events as (
    select e.*
      from public.app_analytics_events e
      left join public.profiles ep on ep.id = e.user_id
     where e.day between v_start and v_end
       and (v_product = 'all' or e.product = v_product)
       and coalesce(ep.is_app_admin, false) = false
  ),
  sessions as (
    select (s.started_at at time zone 'America/Sao_Paulo')::date as day, s.*
      from public.app_analytics_sessions s
      left join public.profiles sp on sp.id = s.user_id
     where (s.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
       and (v_product = 'all' or s.product = v_product)
       and coalesce(sp.is_app_admin, false) = false
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
      count(*) filter (where e.event_type = 'manager_match_complete')::int as manager_matches,
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
    'end_day', v_end,
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
         and (p.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
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
         and (pr.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
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
         and (pr.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
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
         and (r.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
    ),
    'retro_logged_players', (
      select count(distinct r.user_id)::int
        from public.retro_runs r
        join public.profiles p on p.id = r.user_id
       where v_product in ('all', 'retro')
         and coalesce(p.is_app_admin, false) = false
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
  from active_period ap, daily_rates dr;

  with days as (
    select generate_series(v_start, v_end, interval '1 day')::date as day
  ),
  events as (
    select e.*
      from public.app_analytics_events e
      left join public.profiles ep on ep.id = e.user_id
     where e.day between v_start and v_end
       and (v_product = 'all' or e.product = v_product)
       and coalesce(ep.is_app_admin, false) = false
  ),
  sessions as (
    select (s.started_at at time zone 'America/Sao_Paulo')::date as day, s.*
      from public.app_analytics_sessions s
      left join public.profiles sp on sp.id = s.user_id
     where (s.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_end
       and (v_product = 'all' or s.product = v_product)
       and coalesce(sp.is_app_admin, false) = false
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
       and coalesce(ep.is_app_admin, false) = false
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
     limit 30
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
       and coalesce(ep.is_app_admin, false) = false
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
         where (r.user_id is null or coalesce(p.is_app_admin, false) = false)
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

revoke execute on function public.admin_app_metrics_range(date, date, text) from public, anon;
grant execute on function public.admin_app_metrics_range(date, date, text) to authenticated;

create or replace function public.admin_player_metrics(
  p_user_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user uuid := p_user_id;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_start date := (now() at time zone 'America/Sao_Paulo')::date - 29;
  v_payload jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  if v_user is null then
    raise exception 'Usuário inválido.';
  end if;

  with target as (
    select p.id, p.display_name, u.email::text, p.is_app_admin, p.created_at
      from public.profiles p
      join auth.users u on u.id = p.id
     where p.id = v_user
  ),
  events as (
    select e.*
      from public.app_analytics_events e
     where e.user_id = v_user
       and e.day between v_start and v_today
  ),
  sessions as (
    select s.*
      from public.app_analytics_sessions s
     where s.user_id = v_user
       and (s.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_today
  ),
  product_dim(product) as (
    values ('app'::text), ('retro'::text), ('manager'::text)
  ),
  product_rows as (
    select
      pd.product,
      coalesce((select count(*)::int from sessions s where s.product = pd.product), 0) as sessions,
      coalesce((select count(*)::int from events e where e.product = pd.product and e.event_type = 'page_view'), 0) as page_views,
      coalesce((select sum(e.duration_seconds)::int from events e where e.product = pd.product), 0) as screen_seconds,
      (select min(e.occurred_at) from events e where e.product = pd.product) as first_seen_at,
      (select max(e.occurred_at) from events e where e.product = pd.product) as last_seen_at,
      coalesce((select count(*)::int from events e where e.product = pd.product and e.event_type = 'manager_match_complete'), 0) as manager_matches
    from product_dim pd
  ),
  groups as (
    select
      l.id,
      l.name,
      l.slug,
      lm.role,
      lm.status,
      lm.joined_at,
      l.owner_id,
      op.display_name as owner_name
    from public.league_members lm
    join public.leagues l on l.id = lm.league_id and l.deleted_at is null
    join public.profiles op on op.id = l.owner_id
    where lm.user_id = v_user
    order by lm.joined_at desc
  ),
  pred_base as (
    select pr.*
      from public.predictions pr
     where pr.user_id = v_user
  ),
  pred_30 as (
    select *
      from pred_base pr
     where (pr.created_at at time zone 'America/Sao_Paulo')::date between v_start and v_today
  ),
  pred_daily as (
    select (pr.created_at at time zone 'America/Sao_Paulo')::date as day, count(*)::int as predictions
      from pred_30 pr
     group by 1
     order by 1
  ),
  bursts_10m as (
    select count(*)::int as qty
      from pred_30 pr
     group by floor(extract(epoch from pr.created_at) / 600)
  ),
  bursts_1h as (
    select count(*)::int as qty
      from pred_30 pr
     group by floor(extract(epoch from pr.created_at) / 3600)
  ),
  retro as (
    select
      count(*)::int as runs_total,
      count(*) filter (where (r.started_at at time zone 'America/Sao_Paulo')::date between v_start and v_today)::int as runs_30d,
      count(*) filter (where r.status = 'champion')::int as champions,
      max(r.started_at) as last_run_at
    from public.retro_runs r
    where r.user_id = v_user
  ),
  manager as (
    select
      count(*)::int as matches_30d,
      max(e.occurred_at) as last_match_at
    from events e
    where e.product = 'manager'
      and e.event_type = 'manager_match_complete'
  )
  select jsonb_build_object(
    'user', (select to_jsonb(t) from target t),
    'products', (
      select coalesce(jsonb_agg(to_jsonb(pr) order by pr.product), '[]'::jsonb) from product_rows pr
    ),
    'groups', (
      select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb) from groups g
    ),
    'predictions', jsonb_build_object(
      'total_all', (select count(*)::int from pred_base),
      'total_30d', (select count(*)::int from pred_30),
      'active_days_30d', (select count(distinct (created_at at time zone 'America/Sao_Paulo')::date)::int from pred_30),
      'avg_per_active_day', (
        select round(
          case when count(distinct (created_at at time zone 'America/Sao_Paulo')::date) > 0
            then count(*)::numeric / count(distinct (created_at at time zone 'America/Sao_Paulo')::date)
            else 0 end,
          1
        )
        from pred_30
      ),
      'max_in_10m', (select coalesce(max(qty), 0)::int from bursts_10m),
      'max_in_1h', (select coalesce(max(qty), 0)::int from bursts_1h),
      'first_at', (select min(created_at) from pred_base),
      'last_at', (select max(created_at) from pred_base),
      'daily', (select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb) from pred_daily d)
    ),
    'mini_games', jsonb_build_object(
      'retro_runs_total', (select runs_total from retro),
      'retro_runs_30d', (select runs_30d from retro),
      'retro_champions', (select champions from retro),
      'retro_last_run_at', (select last_run_at from retro),
      'manager_matches_30d', (select matches_30d from manager),
      'manager_last_match_at', (select last_match_at from manager)
    )
  )
  into v_payload;

  if (v_payload -> 'user') = 'null'::jsonb then
    return null;
  end if;

  return v_payload;
end;
$$;

revoke execute on function public.admin_player_metrics(uuid) from public, anon;
grant execute on function public.admin_player_metrics(uuid) to authenticated;
