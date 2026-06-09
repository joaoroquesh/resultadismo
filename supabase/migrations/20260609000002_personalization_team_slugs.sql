-- favorite_team_id / national_team_id passam a guardar o SLUG do catálogo curado
-- (text), não mais o uuid de public.teams. O catálogo de personalização é
-- slug-based; como uuid (FK), o slug não cabia e a escolha de time/seleção
-- NUNCA salvava. Corretivo (as colunas estavam sempre null).

alter table public.profiles drop constraint if exists profiles_favorite_team_id_fkey;
alter table public.profiles drop constraint if exists profiles_national_team_id_fkey;
alter table public.profiles alter column favorite_team_id type text using favorite_team_id::text;
alter table public.profiles alter column national_team_id type text using national_team_id::text;

-- A assinatura muda (uuid -> text nos 2 primeiros params); precisa dropar a antiga.
drop function if exists public.set_personalization(uuid, uuid, uuid, uuid, uuid[], uuid[], boolean, jsonb);

create or replace function public.set_personalization(
  p_favorite_team_id text default null,
  p_national_team_id text default null,
  p_favorite_competition_id uuid default null,
  p_favorite_group_id uuid default null,
  p_followed_competition_ids uuid[] default null,
  p_followed_team_ids uuid[] default null,
  p_show_in_ranking boolean default null,
  p_followed_teams jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  update public.profiles
     set favorite_team_id = coalesce(p_favorite_team_id, favorite_team_id),
         national_team_id = coalesce(p_national_team_id, national_team_id),
         favorite_competition_id = coalesce(p_favorite_competition_id, favorite_competition_id),
         favorite_group_id = coalesce(p_favorite_group_id, favorite_group_id),
         followed_competition_ids = coalesce(p_followed_competition_ids, followed_competition_ids),
         followed_team_ids = coalesce(p_followed_team_ids, followed_team_ids),
         followed_teams = coalesce(p_followed_teams, followed_teams),
         show_in_global_ranking = coalesce(p_show_in_ranking, show_in_global_ranking),
         personalization_done = true
   where id = auth.uid();
end;
$$;

revoke all on function public.set_personalization(text, text, uuid, uuid, uuid[], uuid[], boolean, jsonb) from public;
grant execute on function public.set_personalization(text, text, uuid, uuid, uuid[], uuid[], boolean, jsonb) to authenticated;
