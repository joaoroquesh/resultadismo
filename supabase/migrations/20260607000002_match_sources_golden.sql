-- ============================================================================
-- Resultadismo · Proveniência multi-fonte + golden record + freeze + override
-- ----------------------------------------------------------------------------
-- Robustez e QUALIDADE dos dados de jogos, 100% ADITIVO e NÃO-DESTRUTIVO:
--   • matches continua sendo a tabela canônica (golden) que o front lê. A
--     IDENTIDADE dos jogos NÃO muda (nada re-chaveado/excluído).
--   • match_sources: 1 observação por (jogo, fonte) — base do voto de placar e
--     da detecção de divergência. Fontes secundárias só VALIDAM/atualizam placar
--     de jogos já existentes; nunca inserem (a estrutura é da fonte primária).
--   • competition_sources: várias fontes por competição (cadeia de fallback F1 +
--     base do MDM F5/F6). Bootstrap: cada competição não-manual vira 1 'primary'.
--   • FREEZE (decisão #3): jogo finalizado, confirmado por >=2 fontes e com >1h
--     do início não é mais atualizado — resultado final fica travado no banco.
--   • OVERRIDE MANUAL + LOCK (decisão #8): admin edita placar/dados; com lock, a
--     API NÃO sobrescreve; admin pode destravar p/ a API sobrescrever na próxima.
--
-- As novas tabelas têm RLS ligado SEM policy (acesso só via RPC SECURITY DEFINER
-- com gate is_app_admin()). matches segue com as policies atuais.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- (1) Colunas de controle/golden em matches (aditivas, defaults seguros)
-- ---------------------------------------------------------------------------
alter table public.matches
  add column if not exists frozen boolean not null default false,
  add column if not exists frozen_at timestamptz,
  add column if not exists manual_lock boolean not null default false,
  add column if not exists manually_edited_at timestamptz,
  add column if not exists manually_edited_by uuid references public.profiles (id) on delete set null,
  add column if not exists score_sources_count int not null default 0,
  add column if not exists score_conflict boolean not null default false;

create index if not exists matches_conflict_idx
  on public.matches (kickoff_at desc) where score_conflict = true;
create index if not exists matches_manual_lock_idx
  on public.matches (kickoff_at desc) where manual_lock = true;

-- ---------------------------------------------------------------------------
-- (2) match_sources — proveniência por (jogo, fonte)
-- ---------------------------------------------------------------------------
create table if not exists public.match_sources (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  provider public.data_provider not null,
  provider_ref text,
  status text,
  home_score int,
  away_score int,
  home_pen int,
  away_pen int,
  kickoff_at timestamptz,
  fetched_at timestamptz not null default now(),
  unique (match_id, provider)
);
create index if not exists match_sources_match_idx on public.match_sources (match_id);
alter table public.match_sources enable row level security;
-- sem policy: acesso só via RPC (admin)

-- ---------------------------------------------------------------------------
-- (3) competition_sources — várias fontes por competição (fallback F1 / MDM)
-- ---------------------------------------------------------------------------
create table if not exists public.competition_sources (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references public.competitions (id) on delete cascade,
  provider public.data_provider not null,
  provider_code text,
  provider_season text,
  role text not null default 'secondary' check (role in ('primary', 'secondary')),
  priority int not null default 100,
  enabled boolean not null default true,
  last_sync_ok boolean,
  last_sync_error text,
  last_sync_checked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (competition_id, provider)
);
create index if not exists competition_sources_comp_idx on public.competition_sources (competition_id);
alter table public.competition_sources enable row level security;
-- sem policy: acesso só via RPC (admin)

-- Bootstrap NÃO-destrutivo: cada competição não-manual vira sua própria fonte
-- 'primary' (espelha provider/code atual). Mantém o comportamento de hoje e
-- abre a porta pra fontes secundárias sem mexer em competitions.
insert into public.competition_sources
  (competition_id, provider, provider_code, provider_season, role, priority, enabled)
select c.id, c.provider, c.provider_code, c.provider_season, 'primary', 0, c.sync_enabled
from public.competitions c
where c.provider <> 'manual'
on conflict (competition_id, provider) do nothing;

-- ============================================================================
-- RPCs de admin (SECURITY DEFINER, gate is_app_admin())
-- ============================================================================

-- Override manual de placar/status. p_lock=true (default) trava contra a API.
create or replace function public.admin_override_match(
  p_match_id uuid,
  p_home_score int,
  p_away_score int,
  p_status text default null,
  p_lock boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.match_status;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem editar jogos.';
  end if;
  if p_status is not null then
    v_status := p_status::public.match_status;
  end if;

  update public.matches
    set home_score = p_home_score,
        away_score = p_away_score,
        status = coalesce(v_status, status),
        manual_lock = coalesce(p_lock, true),
        manually_edited_at = now(),
        manually_edited_by = auth.uid(),
        last_synced_at = now()
    where id = p_match_id;

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'match_override', 'match', p_match_id,
          jsonb_build_object('home', p_home_score, 'away', p_away_score,
                             'status', p_status, 'lock', coalesce(p_lock, true)));
end;
$$;
revoke all on function public.admin_override_match(uuid, int, int, text, boolean) from public, anon;
grant execute on function public.admin_override_match(uuid, int, int, text, boolean) to authenticated;

-- Liga/desliga o lock manual. Destravar = deixar a API sobrescrever na próxima.
create or replace function public.admin_set_match_lock(p_match_id uuid, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem travar jogos.';
  end if;
  update public.matches
    set manual_lock = coalesce(p_locked, false),
        manually_edited_at = case when p_locked then now() else manually_edited_at end,
        manually_edited_by = case when p_locked then auth.uid() else manually_edited_by end
    where id = p_match_id;
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'match_lock', 'match', p_match_id, jsonb_build_object('locked', p_locked));
end;
$$;
revoke all on function public.admin_set_match_lock(uuid, boolean) from public, anon;
grant execute on function public.admin_set_match_lock(uuid, boolean) to authenticated;

-- Destrava o freeze de um jogo (raro: correção pós-congelamento). Audita.
create or replace function public.admin_unfreeze_match(p_match_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem descongelar jogos.';
  end if;
  update public.matches set frozen = false, frozen_at = null where id = p_match_id;
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'match_unfreeze', 'match', p_match_id, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_unfreeze_match(uuid) from public, anon;
grant execute on function public.admin_unfreeze_match(uuid) to authenticated;

-- Visão de conflitos: jogos onde as fontes divergem OU que estão sob lock manual,
-- com o valor de cada fonte (pra UI mostrar quem diverge de quem).
create or replace function public.admin_list_match_conflicts(p_limit int default 100)
returns table (
  id uuid,
  competition text,
  home_team_name text,
  away_team_name text,
  kickoff_at timestamptz,
  status public.match_status,
  home_score int,
  away_score int,
  frozen boolean,
  manual_lock boolean,
  score_conflict boolean,
  score_sources_count int,
  sources jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem ver conflitos de jogos.';
  end if;
  return query
  select m.id, c.name, m.home_team_name, m.away_team_name, m.kickoff_at, m.status,
         m.home_score, m.away_score, m.frozen, m.manual_lock, m.score_conflict,
         m.score_sources_count,
         coalesce(
           (select jsonb_agg(jsonb_build_object(
                     'provider', ms.provider, 'home', ms.home_score, 'away', ms.away_score,
                     'status', ms.status, 'fetched_at', ms.fetched_at) order by ms.provider)
            from public.match_sources ms where ms.match_id = m.id),
           '[]'::jsonb) as sources
  from public.matches m
  join public.competitions c on c.id = m.competition_id
  where m.score_conflict = true or m.manual_lock = true
  order by m.kickoff_at desc
  limit greatest(1, least(p_limit, 500));
end;
$$;
revoke all on function public.admin_list_match_conflicts(int) from public, anon;
grant execute on function public.admin_list_match_conflicts(int) to authenticated;

-- ---- Gestão de fontes por competição (F7) ----
create or replace function public.admin_list_competition_sources(p_competition_id uuid)
returns table (
  id uuid, provider public.data_provider, provider_code text, provider_season text,
  role text, priority int, enabled boolean,
  last_sync_ok boolean, last_sync_error text, last_sync_checked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem listar fontes.';
  end if;
  return query
  select s.id, s.provider, s.provider_code, s.provider_season, s.role, s.priority, s.enabled,
         s.last_sync_ok, s.last_sync_error, s.last_sync_checked_at
  from public.competition_sources s
  where s.competition_id = p_competition_id
  order by s.role <> 'primary', s.priority, s.provider;
end;
$$;
revoke all on function public.admin_list_competition_sources(uuid) from public, anon;
grant execute on function public.admin_list_competition_sources(uuid) to authenticated;

create or replace function public.admin_upsert_competition_source(
  p_competition_id uuid,
  p_provider text,
  p_provider_code text,
  p_provider_season text default null,
  p_role text default 'secondary',
  p_priority int default 100
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem configurar fontes.';
  end if;
  insert into public.competition_sources
    (competition_id, provider, provider_code, provider_season, role, priority, enabled)
  values (p_competition_id, p_provider::public.data_provider, p_provider_code, p_provider_season,
          coalesce(p_role, 'secondary'), coalesce(p_priority, 100), true)
  on conflict (competition_id, provider) do update
    set provider_code = excluded.provider_code,
        provider_season = excluded.provider_season,
        role = excluded.role,
        priority = excluded.priority
  returning id into v_id;
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'competition_source_upsert', 'competition', p_competition_id,
          jsonb_build_object('provider', p_provider, 'code', p_provider_code, 'role', p_role));
  return v_id;
end;
$$;
revoke all on function public.admin_upsert_competition_source(uuid, text, text, text, text, int) from public, anon;
grant execute on function public.admin_upsert_competition_source(uuid, text, text, text, text, int) to authenticated;

create or replace function public.admin_set_competition_source_enabled(p_id uuid, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem ligar/desligar fontes.';
  end if;
  update public.competition_sources set enabled = coalesce(p_enabled, true) where id = p_id;
end;
$$;
revoke all on function public.admin_set_competition_source_enabled(uuid, boolean) from public, anon;
grant execute on function public.admin_set_competition_source_enabled(uuid, boolean) to authenticated;

create or replace function public.admin_remove_competition_source(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem remover fontes.';
  end if;
  -- não remove a 'primary' (proteção: toda competição mantém sua fonte base)
  delete from public.competition_sources where id = p_id and role <> 'primary';
end;
$$;
revoke all on function public.admin_remove_competition_source(uuid) from public, anon;
grant execute on function public.admin_remove_competition_source(uuid) to authenticated;
