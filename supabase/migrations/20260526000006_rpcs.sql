-- ============================================================================
-- Resultadismo · 06 · RPCs (fluxos com lógica/autorização interna)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Entrar em liga por código de convite
-- ---------------------------------------------------------------------------
create or replace function public.join_league_by_code(p_code text)
returns public.league_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league public.leagues;
  v_status public.member_status;
  v_member public.league_members;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  select * into v_league
  from public.leagues
  where upper(join_code) = upper(trim(p_code)) and status = 'active';

  if v_league.id is null then
    raise exception 'Liga não encontrada ou ainda não foi aprovada.';
  end if;

  select * into v_member
  from public.league_members
  where league_id = v_league.id and user_id = auth.uid();
  if v_member.id is not null then
    return v_member;
  end if;

  if v_league.max_members is not null then
    if (select count(*) from public.league_members
        where league_id = v_league.id and status = 'active') >= v_league.max_members then
      raise exception 'Esta liga já atingiu o limite de membros.';
    end if;
  end if;

  v_status := case when v_league.join_policy = 'approval' then 'pending' else 'active' end;

  insert into public.league_members (league_id, user_id, role, status)
  values (v_league.id, auth.uid(), 'member', v_status)
  returning * into v_member;

  return v_member;
end;
$$;

-- ---------------------------------------------------------------------------
-- Entrar em liga pública (listada)
-- ---------------------------------------------------------------------------
create or replace function public.join_public_league(p_league_id uuid)
returns public.league_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league public.leagues;
  v_status public.member_status;
  v_member public.league_members;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  select * into v_league
  from public.leagues
  where id = p_league_id and status = 'active' and visibility = 'public';

  if v_league.id is null then
    raise exception 'Liga não encontrada.';
  end if;

  if v_league.join_policy = 'invite' then
    raise exception 'Esta liga é apenas por convite.';
  end if;

  select * into v_member
  from public.league_members
  where league_id = v_league.id and user_id = auth.uid();
  if v_member.id is not null then
    return v_member;
  end if;

  v_status := case when v_league.join_policy = 'approval' then 'pending' else 'active' end;

  insert into public.league_members (league_id, user_id, role, status)
  values (v_league.id, auth.uid(), 'member', v_status)
  returning * into v_member;

  return v_member;
end;
$$;

-- ---------------------------------------------------------------------------
-- App admin: aprovar / rejeitar ligas
-- ---------------------------------------------------------------------------
create or replace function public.approve_league(p_league_id uuid)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores do app podem aprovar ligas.';
  end if;
  update public.leagues
  set status = 'active', approved_at = now(), approved_by = auth.uid()
  where id = p_league_id
  returning * into v_league;
  return v_league;
end;
$$;

create or replace function public.reject_league(p_league_id uuid)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league public.leagues;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores do app podem rejeitar ligas.';
  end if;
  update public.leagues
  set status = 'rejected'
  where id = p_league_id
  returning * into v_league;
  return v_league;
end;
$$;

-- ---------------------------------------------------------------------------
-- App admin: conceder/revogar papel de app_admin
-- ---------------------------------------------------------------------------
create or replace function public.set_app_admin(p_user_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores do app podem alterar papéis.';
  end if;
  update public.profiles set is_app_admin = p_value where id = p_user_id;
end;
$$;

grant execute on function public.join_league_by_code(text) to authenticated;
grant execute on function public.join_public_league(uuid) to authenticated;
grant execute on function public.approve_league(uuid) to authenticated;
grant execute on function public.reject_league(uuid) to authenticated;
grant execute on function public.set_app_admin(uuid, boolean) to authenticated;
