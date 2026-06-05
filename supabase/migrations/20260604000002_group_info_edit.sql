-- Resultadismo · Editar grupo: nome + descrição (pelo dono/admin do grupo)
-- ----------------------------------------------------------------------------
-- O dono/admin já edita o escudo (leagues.logo_url via RLS). Faltava editar
-- NOME e DESCRIÇÃO depois de criado. Trocar o NOME (por quem não é app-admin)
-- RE-DISPARA a moderação (name_approved = false), igual à criação.
--
-- RPC SECURITY DEFINER + bypass do guard (GUC app.settle_bypass): o
-- leagues_guard_status só permite mexer em name_approved com esse GUC setado.
-- Permissão: dono/admin do grupo (is_league_admin) OU app-admin.

create or replace function public.update_group_info(
  p_league_id uuid,
  p_name text,
  p_description text
)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.leagues;
  v_old_name text;
begin
  if not (public.is_league_admin(p_league_id) or public.is_app_admin()) then
    raise exception 'Só o dono ou admin do grupo pode editar o grupo.';
  end if;

  select name into v_old_name from public.leagues where id = p_league_id;
  if v_old_name is null then
    raise exception 'Grupo não encontrado.';
  end if;

  p_name := trim(coalesce(p_name, ''));
  if char_length(p_name) < 2 then
    raise exception 'O nome do grupo precisa de pelo menos 2 caracteres.';
  end if;
  if char_length(p_name) > 60 then
    raise exception 'O nome do grupo pode ter no máximo 60 caracteres.';
  end if;

  -- Bypass do guard p/ marcar name_approved=false (re-moderação do nome).
  perform set_config('app.settle_bypass', '1', true);

  update public.leagues
    set name = p_name,
        description = nullif(trim(coalesce(p_description, '')), ''),
        name_approved = case
          when p_name is distinct from v_old_name and not public.is_app_admin()
          then false
          else name_approved
        end
    where id = p_league_id
  returning * into v;

  return v;
end;
$$;

revoke all on function public.update_group_info(uuid, text, text) from public, anon;
grant execute on function public.update_group_info(uuid, text, text) to authenticated;
