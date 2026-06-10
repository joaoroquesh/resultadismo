-- (1) BUG: set_personalization marcava personalization_done=true em TODA chamada
-- — o wizard persiste a cada passo, então avançar 1 tela já "concluía" a jornada
-- (recarregou no meio → nunca mais viu o resto). Agora done só é marcado quando
-- o front pede explicitamente (p_mark_done=true: Concluir / fim do fluxo).
drop function if exists public.set_personalization(text, text, uuid, uuid, uuid[], uuid[], boolean, jsonb);

create or replace function public.set_personalization(
  p_favorite_team_id text default null,
  p_national_team_id text default null,
  p_favorite_competition_id uuid default null,
  p_favorite_group_id uuid default null,
  p_followed_competition_ids uuid[] default null,
  p_followed_team_ids uuid[] default null,
  p_show_in_ranking boolean default null,
  p_followed_teams jsonb default null,
  p_mark_done boolean default false
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
         personalization_done = case when p_mark_done then true else personalization_done end
   where id = auth.uid();
end;
$$;
revoke all on function public.set_personalization(text, text, uuid, uuid, uuid[], uuid[], boolean, jsonb, boolean) from public;
grant execute on function public.set_personalization(text, text, uuid, uuid, uuid[], uuid[], boolean, jsonb, boolean) to authenticated;

-- (2) Reset pedido pelo PO: a jornada volta a aparecer pra todo mundo no próximo
-- acesso (de novo — agora sem o bug do done precoce).
update public.profiles
   set personalization_done = false,
       favorite_team_id = null,
       national_team_id = null,
       favorite_competition_id = null,
       followed_competition_ids = '{}',
       followed_team_ids = '{}',
       followed_teams = '{}'::jsonb;
