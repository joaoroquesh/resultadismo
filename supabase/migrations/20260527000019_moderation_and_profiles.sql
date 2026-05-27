-- ============================================================================
-- Resultadismo · 19 · Moderação do admin (soft-delete + desfazer) e perfil público
-- ----------------------------------------------------------------------------
-- 1) Excluir ligas com SEGURANÇA: soft-delete (deleted_at) + janela de 10 min
--    para desfazer (restaurar). Um cron purga de vez depois disso.
-- 2) get_player_profile: stats e ligas de um jogador, sem PII (e-mail saiu em 16).
-- (Migrations 16/17/18 são de outras frentes; aqui usamos 19 p/ não colidir.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Soft-delete de ligas
-- ---------------------------------------------------------------------------
alter table public.leagues add column if not exists deleted_at timestamptz;
alter table public.leagues add column if not exists deleted_by uuid
  references public.profiles (id) on delete set null;

create index if not exists leagues_deleted_idx on public.leagues (deleted_at)
  where deleted_at is not null;

-- Exclui (soft) uma liga — apenas app_admin. Guarda quem/quando p/ desfazer.
create or replace function public.admin_soft_delete_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores do app podem excluir ligas.';
  end if;
  update public.leagues
    set deleted_at = now(), deleted_by = auth.uid()
    where id = p_league_id and deleted_at is null;
end;
$$;

-- Restaura uma liga excluída (dentro da janela, antes da purga) — apenas app_admin.
create or replace function public.admin_restore_league(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores do app podem restaurar ligas.';
  end if;
  update public.leagues
    set deleted_at = null, deleted_by = null
    where id = p_league_id;
end;
$$;

-- Lista as ligas na "lixeira" (excluídas e ainda restauráveis) — apenas app_admin.
create or replace function public.admin_list_deleted_leagues()
returns table (
  id uuid,
  name text,
  slug text,
  deleted_at timestamptz,
  owner_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores do app podem ver a lixeira.';
  end if;
  return query
  select l.id, l.name, l.slug, l.deleted_at, p.display_name
  from public.leagues l
  left join public.profiles p on p.id = l.owner_id
  where l.deleted_at is not null
  order by l.deleted_at desc;
end;
$$;

revoke all on function public.admin_soft_delete_league(uuid) from public, anon;
revoke all on function public.admin_restore_league(uuid) from public, anon;
revoke all on function public.admin_list_deleted_leagues() from public, anon;
grant execute on function public.admin_soft_delete_league(uuid) to authenticated;
grant execute on function public.admin_restore_league(uuid) to authenticated;
grant execute on function public.admin_list_deleted_leagues() to authenticated;

-- Purga definitiva 10 min após o soft-delete (no-op se pg_cron não existir).
do $$
begin
  perform cron.schedule(
    'resultadismo-purge-deleted-leagues',
    '* * * * *',
    $cron$delete from public.leagues
          where deleted_at is not null
            and deleted_at < now() - interval '10 minutes';$cron$
  );
exception when others then
  raise notice 'cron purge-deleted-leagues indisponível: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Perfil público do jogador (stats globais + ligas visíveis ao solicitante)
-- ---------------------------------------------------------------------------
create or replace function public.get_player_profile(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_avatar text;
  v_since timestamptz;
  v_jogos int; v_pontos int; v_cravadas int; v_saldos int; v_acertos int; v_erros int;
  v_leagues jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  select display_name, avatar_url, created_at
    into v_name, v_avatar, v_since
  from public.profiles where id = p_user_id;
  if v_name is null then
    return null;
  end if;

  -- stats globais (jogos finalizados, pontuação padrão 3/2/1)
  select
    count(*)::int,
    coalesce(sum(case pr.score_type when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end), 0)::int,
    count(*) filter (where pr.score_type = 'cravada')::int,
    count(*) filter (where pr.score_type = 'saldo')::int,
    count(*) filter (where pr.score_type = 'acerto')::int,
    count(*) filter (where pr.score_type = 'erro')::int
    into v_jogos, v_pontos, v_cravadas, v_saldos, v_acertos, v_erros
  from public.predictions pr
  join public.matches m on m.id = pr.match_id
  where pr.user_id = p_user_id and m.status = 'finished' and pr.score_type is not null;

  -- ligas do jogador visíveis a quem consulta (pública, compartilhada ou admin)
  select coalesce(
    jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'slug', l.slug) order by l.name),
    '[]'::jsonb)
    into v_leagues
  from public.league_members lm
  join public.leagues l on l.id = lm.league_id
  where lm.user_id = p_user_id
    and lm.status = 'active'
    and l.deleted_at is null
    and (l.visibility = 'public' or public.is_app_admin() or public.is_league_member(l.id));

  return jsonb_build_object(
    'user_id', p_user_id,
    'display_name', v_name,
    'avatar_url', v_avatar,
    'member_since', v_since,
    'stats', jsonb_build_object(
      'jogos', coalesce(v_jogos, 0),
      'pontos', coalesce(v_pontos, 0),
      'cravadas', coalesce(v_cravadas, 0),
      'saldos', coalesce(v_saldos, 0),
      'acertos', coalesce(v_acertos, 0),
      'erros', coalesce(v_erros, 0),
      'aproveitamento', case when coalesce(v_jogos, 0) = 0 then 0
        else round(v_pontos::numeric / (3 * v_jogos) * 100, 1) end,
      'acertividade', case when coalesce(v_jogos, 0) = 0 then 0
        else round((v_cravadas + v_saldos + v_acertos)::numeric / v_jogos * 100, 1) end
    ),
    'leagues', v_leagues
  );
end;
$$;

revoke all on function public.get_player_profile(uuid) from public, anon;
grant execute on function public.get_player_profile(uuid) to authenticated;
