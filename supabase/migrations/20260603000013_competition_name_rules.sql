-- Regra de nome por tipo de disputa (governança leve, editável pelo app admin):
--   Copa   -> nome começa com "Copa ..."
--   Liga   -> nome começa com "Liga ..."
--   Pontos -> nome começa com "Bolão ..." (campeonato por pontos)
-- Os prefixos ficam em app_settings e podem ser ajustados pelo admin.

alter table public.app_settings
  add column if not exists name_prefix_cup text not null default 'Copa',
  add column if not exists name_prefix_liga text not null default 'Liga',
  add column if not exists name_prefix_points text not null default 'Bolão';

create or replace function public.admin_set_name_prefixes(
  p_cup text,
  p_liga text,
  p_points text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem ajustar as regras de nome.';
  end if;

  update public.app_settings
     set name_prefix_cup = coalesce(nullif(btrim(p_cup), ''), 'Copa'),
         name_prefix_liga = coalesce(nullif(btrim(p_liga), ''), 'Liga'),
         name_prefix_points = coalesce(nullif(btrim(p_points), ''), 'Bolão'),
         updated_at = now()
   where id = (select id from public.app_settings order by id limit 1);
end;
$$;

revoke all on function public.admin_set_name_prefixes(text, text, text) from public, anon;
grant execute on function public.admin_set_name_prefixes(text, text, text) to authenticated;
