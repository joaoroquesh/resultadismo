-- ============================================================================
-- Resultadismo · Admin competições — iteração 2 (feedback do João, homologação)
-- ----------------------------------------------------------------------------
-- ADITIVO. (1) novo provedor `fifawc` (API aberta da Copa, sem chave — fonte de
-- validação). (2) Excluir campeonato em uso = ARQUIVAR preservando os placares
-- já puxados (jogos + match_sources NÃO somem), com confirmação por nome.
-- (3) Restaurar arquivado. (4) admin_list_competitions_full agora traz a
-- contagem de jogos POR FONTE (quantos jogos cada API trouxe).
-- ============================================================================

-- (1) Novo valor de enum (forward-only; fora de uso na mesma migration).
alter type public.data_provider add value if not exists 'fifawc';

-- ---------------------------------------------------------------------------
-- (2) Arquivar preservando placares (exclusão "segura" de campeonato em uso).
-- NÃO apaga matches nem match_sources — os placares já puxados ficam no banco.
-- Exige o nome exato (p_confirm_name) como confirmação.
-- ---------------------------------------------------------------------------
create or replace function public.admin_archive_competition(
  p_id uuid,
  p_confirm_name text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  select coalesce(display_name, name) into v_name from public.competitions where id = p_id;
  if v_name is null then
    raise exception 'Competição não encontrada.';
  end if;
  if p_confirm_name is distinct from v_name then
    raise exception 'Confirmação não confere: digite o nome exato do campeonato.';
  end if;

  -- arquiva: sai das listas ativas e para de sincronizar; jogos/placares ficam.
  update public.competitions
    set status = 'archived', sync_enabled = false, is_published = false, updated_at = now()
    where id = p_id;
  update public.competition_sources set enabled = false where competition_id = p_id;

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'competition_archive', 'competition', p_id, jsonb_build_object('name', v_name));
end;
$$;
revoke all on function public.admin_archive_competition(uuid, text) from public, anon;
grant execute on function public.admin_archive_competition(uuid, text) to authenticated;

-- (3) Restaurar um campeonato arquivado (volta a 'active'; fontes seguem como
-- estiverem — o admin religa o sync se quiser). Não toca em jogos.
create or replace function public.admin_restore_competition(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores.';
  end if;
  update public.competitions set status = 'active', updated_at = now() where id = p_id;
  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'competition_restore', 'competition', p_id, '{}'::jsonb);
end;
$$;
revoke all on function public.admin_restore_competition(uuid) from public, anon;
grant execute on function public.admin_restore_competition(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- (4) admin_list_competitions_full — agora com matches_count POR FONTE
-- (quantos jogos da competição cada provedor já observou em match_sources).
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
            'last_sync_error', s.last_sync_error, 'last_sync_checked_at', s.last_sync_checked_at,
            'matches_count', (
              select count(*) from public.match_sources ms
              join public.matches m2 on m2.id = ms.match_id
              where m2.competition_id = c.id and ms.provider = s.provider
            )
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
