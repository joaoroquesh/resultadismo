-- ============================================================================
-- Resultadismo · Admin — redesign da gestão de campeonatos/APIs + painel Visão
-- ----------------------------------------------------------------------------
-- ADITIVO e não-destrutivo. Quatro RPCs novas (3 de leitura + 1 escrita segura),
-- todas SECURITY DEFINER + gate is_app_admin(), seguindo o padrão das demais
-- RPCs admin_*. Nenhuma tabela/coluna é alterada; nada é apagado.
--   1) admin_usage_stats()                         — KPIs da aba Visão (curta)
--   2) admin_list_competitions_full()              — competições + fontes + saúde
--   3) admin_match_sources_for_competition(uuid,int) — jogos × o que cada fonte traz
--   4) admin_set_primary_source(uuid, uuid)        — promover/rebaixar a primária
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) admin_usage_stats — números centrais de saúde/uso pra administrar o app.
-- Aproximações declaradas: "active_24h"/"accessed_today" usam last_active_at
-- (único timestamp, sobrescrito a cada heartbeat) — bom como termômetro, não é
-- série histórica de DAU. "groups_gestao_active" = grupos com a Gestão do Bolão
-- ligada (league_competitions.pot_enabled=true; é informativa, ADR 0008).
-- ---------------------------------------------------------------------------
create or replace function public.admin_usage_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*) from public.profiles),
    'online_now', (
      select count(*) from public.profiles
      where last_active_at is not null and last_active_at > now() - interval '90 seconds'
    ),
    'active_24h', (
      select count(*) from public.profiles
      where last_active_at is not null and last_active_at > now() - interval '24 hours'
    ),
    'accessed_today', (
      select count(*) from public.profiles
      where last_active_at is not null
        and (last_active_at at time zone 'America/Sao_Paulo')::date = v_today
    ),
    'new_users_today', (
      select count(*) from public.profiles
      where (created_at at time zone 'America/Sao_Paulo')::date = v_today
    ),
    'usage_seconds_total', (select coalesce(sum(usage_seconds), 0) from public.profiles),
    'usage_seconds_avg', (
      select coalesce(round(avg(usage_seconds) filter (where usage_seconds > 0)), 0)
      from public.profiles
    ),
    'predictions_today', (
      select count(*) from public.predictions
      where (created_at at time zone 'America/Sao_Paulo')::date = v_today
    ),
    'groups_total', (
      select count(*) from public.leagues where deleted_at is null and status = 'active'
    ),
    'groups_pending', (
      select count(*) from public.leagues where status = 'pending' and deleted_at is null
    ),
    'groups_gestao_active', (
      select count(distinct l.id)
      from public.leagues l
      join public.league_competitions lc on lc.league_id = l.id
      where lc.pot_enabled = true and l.deleted_at is null and l.status = 'active'
    ),
    'groups_paid', (
      select count(*) from public.leagues
      where payment_status = 'paid' and status = 'active' and deleted_at is null
    )
  ) into v;

  return v;
end;
$$;
revoke all on function public.admin_usage_stats() from public, anon;
grant execute on function public.admin_usage_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- (2) admin_list_competitions_full — uma leitura só com a competição + a pilha
-- de fontes + saúde + contadores. Substitui os 3 reads ad-hoc de hoje
-- (full-row / lite / health). Não filtra por status: o admin gere tudo.
-- ---------------------------------------------------------------------------
create or replace function public.admin_list_competitions_full()
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

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', c.id,
      'name', coalesce(c.display_name, c.name),
      'raw_name', c.name,
      'slug', c.slug,
      'provider', c.provider,
      'provider_code', c.provider_code,
      'provider_season', c.provider_season,
      'type', c.type,
      'area', c.area,
      'status', c.status,
      'is_published', c.is_published,
      'in_personalization', c.in_personalization,
      'sync_enabled', c.sync_enabled,
      'last_sync_ok', c.last_sync_ok,
      'last_sync_error', c.last_sync_error,
      'last_synced_at', c.last_synced_at,
      'matches_count', (
        select count(*) from public.matches m
        where m.competition_id = c.id and m.hidden = false
      ),
      'conflicts_count', (
        select count(*) from public.matches m
        where m.competition_id = c.id and (m.score_conflict = true or m.manual_lock = true)
      ),
      'sources', (
        select coalesce(jsonb_agg(
          jsonb_build_object(
            'id', s.id, 'provider', s.provider, 'provider_code', s.provider_code,
            'provider_season', s.provider_season, 'role', s.role, 'priority', s.priority,
            'enabled', s.enabled, 'last_sync_ok', s.last_sync_ok,
            'last_sync_error', s.last_sync_error, 'last_sync_checked_at', s.last_sync_checked_at
          ) order by s.role <> 'primary', s.priority, s.provider
        ), '[]'::jsonb)
        from public.competition_sources s where s.competition_id = c.id
      )
    ) order by coalesce(c.display_name, c.name)
  ), '[]'::jsonb)
  into v
  from public.competitions c;

  return v;
end;
$$;
revoke all on function public.admin_list_competitions_full() from public, anon;
grant execute on function public.admin_list_competitions_full() to authenticated;

-- ---------------------------------------------------------------------------
-- (3) admin_match_sources_for_competition — TODOS os jogos da competição com o
-- que CADA fonte reporta (não só os conflitos, ao contrário de
-- admin_list_match_conflicts). Alimenta a tela "Ver jogos / comparar fontes".
-- ---------------------------------------------------------------------------
create or replace function public.admin_match_sources_for_competition(
  p_competition_id uuid,
  p_limit int default 500
)
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

  select coalesce(jsonb_agg(t.row order by t.k desc nulls last), '[]'::jsonb)
  into v
  from (
    select
      m.kickoff_at as k,
      jsonb_build_object(
        'id', m.id,
        'home_team_name', m.home_team_name,
        'away_team_name', m.away_team_name,
        'kickoff_at', m.kickoff_at,
        'status', m.status,
        'home_score', m.home_score,
        'away_score', m.away_score,
        'frozen', m.frozen,
        'manual_lock', m.manual_lock,
        'score_conflict', m.score_conflict,
        'score_sources_count', m.score_sources_count,
        'hidden', m.hidden,
        'sources', coalesce((
          select jsonb_agg(jsonb_build_object(
            'provider', ms.provider, 'home', ms.home_score, 'away', ms.away_score,
            'status', ms.status, 'kickoff_at', ms.kickoff_at, 'fetched_at', ms.fetched_at
          ) order by ms.provider)
          from public.match_sources ms where ms.match_id = m.id
        ), '[]'::jsonb)
      ) as row
    from public.matches m
    where m.competition_id = p_competition_id
    order by m.kickoff_at desc nulls last
    limit greatest(1, least(p_limit, 1000))
  ) t;

  return v;
end;
$$;
revoke all on function public.admin_match_sources_for_competition(uuid, int) from public, anon;
grant execute on function public.admin_match_sources_for_competition(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- (4) admin_set_primary_source — promove uma fonte a primária (dona do
-- calendário) e rebaixa a primária atual a secundária. Atômico + auditado.
-- NÃO mexe em matches nem apaga nada; a segurança de não duplicar jogos ao
-- trocar a primária vem do reconcilePrimary casar por nome+dia (sync-football).
-- competitions.provider fica como está (a verdade das fontes é competition_sources).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_primary_source(
  p_competition_id uuid,
  p_source_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_belongs boolean;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem definir a fonte primária.';
  end if;

  select exists(
    select 1 from public.competition_sources
    where id = p_source_id and competition_id = p_competition_id
  ) into v_belongs;
  if not v_belongs then
    raise exception 'Esta fonte não pertence à competição informada.';
  end if;

  -- rebaixa a(s) primária(s) atual(is) — mantém habilitada como secundária
  update public.competition_sources
    set role = 'secondary', priority = greatest(priority, 50)
    where competition_id = p_competition_id and role = 'primary' and id <> p_source_id;

  -- promove a escolhida (sempre habilitada — primária desligada = sem calendário)
  update public.competition_sources
    set role = 'primary', priority = 0, enabled = true
    where id = p_source_id;

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'competition_set_primary', 'competition', p_competition_id,
          jsonb_build_object('source_id', p_source_id));
end;
$$;
revoke all on function public.admin_set_primary_source(uuid, uuid) from public, anon;
grant execute on function public.admin_set_primary_source(uuid, uuid) to authenticated;
