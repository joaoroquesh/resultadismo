-- Recorte de seleções acompanhadas pelo BOLÃO do grupo (decisão do PO):
-- na criação, o grupo escolhe se o ranking conta TODAS as seleções (null),
-- só o Brasil, ou um conjunto escolhido. Vale para a CONTAGEM de pontos do
-- grupo (standings); os palpites seguem abertos em todos os jogos.

-- 1) Slugifier SQL espelhando o do front (teamCrestSlug): minúsculo, sem
--    acento, só [a-z0-9]. O front grava o conjunto JÁ EXPANDIDO (nome, short,
--    TLA e aliases slugificados), então aqui basta normalizar e comparar.
create or replace function public.team_slug(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    lower(translate(coalesce(p, ''),
      'áàâãäåéêèëíìïîóòôõöúùüûçñÁÀÂÃÄÅÉÊÈËÍÌÏÎÓÒÔÕÖÚÙÜÛÇÑ',
      'aaaaaaeeeeiiiioooooouuuucnaaaaaaeeeeiiiioooooouuuucn')),
    '[^a-z0-9]', '', 'g');
$$;

-- 2) Conjunto de slugs acompanhados (null = todas as seleções/times).
alter table public.league_competitions
  add column if not exists followed_team_slugs text[];

-- 3) Standings: jogos fora do recorte não contam pro ranking do grupo.
create or replace function public.get_league_standings(p_lc_id uuid)
returns table (
  user_id uuid, display_name text, avatar_url text,
  jogos int, pontos int, cravadas int, saldos int, acertos int, erros int,
  aproveitamento numeric, acertividade numeric, rank int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_league_id uuid;
  v_competition_id uuid;
  v_starts_on date;
  v_visibility public.league_visibility;
  v_p_cravada int; v_p_saldo int; v_p_acerto int;
  v_scope text[];
begin
  select lc.league_id, lc.competition_id, lc.starts_on,
         coalesce((lc.settings -> 'points' ->> 'cravada')::int, 3),
         coalesce((lc.settings -> 'points' ->> 'saldo')::int, 2),
         coalesce((lc.settings -> 'points' ->> 'acerto')::int, 1),
         lc.followed_team_slugs
    into v_league_id, v_competition_id, v_starts_on, v_p_cravada, v_p_saldo, v_p_acerto, v_scope
  from public.league_competitions lc
  where lc.id = p_lc_id;

  if v_league_id is null then return; end if;
  if coalesce(v_p_cravada, 0) <= 0 then v_p_cravada := 3; end if;

  select l.visibility into v_visibility from public.leagues l where l.id = v_league_id;
  if not (public.is_app_admin() or public.is_league_member(v_league_id) or v_visibility = 'public') then
    return;
  end if;

  return query
  with members as (
    select lm.user_id, p.display_name, p.avatar_url, p.created_at
    from public.league_members lm
    join public.profiles p on p.id = lm.user_id
    where lm.league_id = v_league_id and lm.status = 'active'
  ),
  scored as (
    select pr.user_id, pr.score_type, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.competition_id = v_competition_id
      and m.status = 'finished'
      and pr.score_type is not null
      and (v_starts_on is null or m.kickoff_at::date >= v_starts_on)
      and (v_scope is null
           or public.team_slug(m.home_team_name) = any(v_scope)
           or public.team_slug(m.away_team_name) = any(v_scope))
  ),
  agg as (
    select s.user_id,
      count(*)::int as jogos,
      sum((case s.score_type when 'cravada' then v_p_cravada when 'saldo' then v_p_saldo when 'acerto' then v_p_acerto else 0 end)
          * (case when s.is_joker then 2 else 1 end))::int as pontos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos,
      count(*) filter (where s.score_type = 'acerto')::int as acertos,
      count(*) filter (where s.score_type = 'erro')::int as erros
    from scored s group by s.user_id
  )
  select
    mem.user_id, mem.display_name, mem.avatar_url,
    coalesce(a.jogos, 0), coalesce(a.pontos, 0), coalesce(a.cravadas, 0),
    coalesce(a.saldos, 0), coalesce(a.acertos, 0), coalesce(a.erros, 0),
    case when coalesce(a.jogos, 0) = 0 then 0
         else round(coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos) * 100, 1) end,
    case when coalesce(a.jogos, 0) = 0 then 0
         else round((a.cravadas + a.saldos + a.acertos)::numeric / a.jogos * 100, 1) end,
    (row_number() over (
      order by coalesce(a.pontos, 0) desc, coalesce(a.cravadas, 0) desc, coalesce(a.saldos, 0) desc,
        (case when coalesce(a.jogos, 0) = 0 then 0 else coalesce(a.pontos, 0)::numeric / (v_p_cravada * a.jogos) end) desc,
        (case when coalesce(a.jogos, 0) = 0 then 0 else (a.cravadas + a.saldos + a.acertos)::numeric / a.jogos end) desc,
        mem.created_at asc))::int as rank
  from members mem
  left join agg a on a.user_id = mem.user_id
  order by rank;
end;
$$;
