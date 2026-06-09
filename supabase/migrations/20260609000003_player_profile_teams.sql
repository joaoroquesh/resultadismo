-- get_player_profile passa a retornar time do coração + seleção (slugs do
-- catálogo) pra exibir no perfil público do jogador.
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
  v_fav text;
  v_nat text;
  v_jogos int; v_pontos int; v_cravadas int; v_saldos int; v_acertos int; v_erros int;
  v_leagues jsonb;
begin
  if auth.uid() is null then
    return null;
  end if;

  select display_name, avatar_url, created_at, favorite_team_id, national_team_id
    into v_name, v_avatar, v_since, v_fav, v_nat
  from public.profiles where id = p_user_id;
  if v_name is null then
    return null;
  end if;

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
    'favorite_team_id', v_fav,
    'national_team_id', v_nat,
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
