-- ============================================================================
-- Resultadismo · 21 · Ferramentas de admin pra competições
-- ----------------------------------------------------------------------------
-- - is_published: competição entra como rascunho (false), admin valida os jogos
--   e publica pra todo mundo só quando estiver OK.
-- - display_name: nome amigável em PT-BR sobrescreve o nome técnico vindo da API
--   (ex.: "Brazilian Serie A" -> "Brasileirão Série A").
-- - 3 RPCs admin: excluir, publicar/despublicar, renomear. Tudo SECURITY DEFINER
--   com checagem de is_app_admin.
--
-- Competições já existentes ficam publicadas (ninguém deveria perder o que já
-- adicionou). Novas inserções nascem como rascunho.
-- ============================================================================

alter table public.competitions
  add column if not exists is_published boolean not null default false;

alter table public.competitions
  add column if not exists display_name text;

-- Tudo que já existe fica publicado (não muda o que o usuário vê hoje).
update public.competitions set is_published = true where is_published = false;

create index if not exists competitions_published_idx
  on public.competitions (is_published)
  where is_published = true;

-- ---------------------------------------------------------------------------
-- RPCs admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_delete_competition(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem excluir competições.';
  end if;
  delete from public.competitions where id = p_id;
end;
$$;

create or replace function public.admin_set_competition_published(p_id uuid, p_value boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem publicar competições.';
  end if;
  update public.competitions set is_published = p_value where id = p_id;
end;
$$;

create or replace function public.admin_rename_competition(p_id uuid, p_display_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem renomear competições.';
  end if;
  update public.competitions
    set display_name = nullif(trim(p_display_name), '')
    where id = p_id;
end;
$$;

revoke all on function public.admin_delete_competition(uuid) from public, anon;
revoke all on function public.admin_set_competition_published(uuid, boolean) from public, anon;
revoke all on function public.admin_rename_competition(uuid, text) from public, anon;
grant execute on function public.admin_delete_competition(uuid) to authenticated;
grant execute on function public.admin_set_competition_published(uuid, boolean) to authenticated;
grant execute on function public.admin_rename_competition(uuid, text) to authenticated;
