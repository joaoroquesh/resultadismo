-- ============================================================================
-- Resultadismo · Grupos — backend do redesenho da /grupos
-- ----------------------------------------------------------------------------
-- 1. get_global_rank_window  → janela de 3 (você + vizinhos) no Resultadismo
--    The Best, sempre centrada no Resultadista logado (item 3 do pedido).
-- 2. list_public_leagues      → vitrine de grupos públicos, descobríveis por
--    qualquer Resultadista (item 4: "Grupos públicos").
-- 3. get_my_league_positions  → minha posição em cada grupo (batch), exata
--    porque delega ao get_league_standings (mesma regra de dentro do grupo).
-- 4. Modelo visibilidade↔entrada (item 4): privado ⇒ só convite; público ⇒
--    aberto OU por aprovação. Normaliza o que existe + trava com CHECK.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Janela do ranking global centrada em mim
-- ----------------------------------------------------------------------------
-- Replica a ordenação do get_global_standings (pontos desc, cravadas desc,
-- saldos desc, jogos asc) e devolve até (2*radius+1) linhas em volta da minha
-- posição. Nas pontas, desloca a janela pra sempre encher (ex.: 1º lugar →
-- mostra 1º,2º,3º). Vazio se eu não pontuei ou fiz opt-out (UI cai no top-N).
create or replace function public.get_global_rank_window(
  p_competition_id uuid default null,
  p_radius int default 1
)
returns table(
  rank int,
  user_id uuid,
  display_name text,
  avatar_url text,
  pontos int,
  jogos int,
  cravadas int,
  saldos int,
  acertos int,
  is_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  -- Sem tabela temporária (incompatível com search_path=''): tudo em CTE.
  with scored as (
    select pr.user_id, pr.score_type, pr.is_joker
    from public.predictions pr
    join public.matches m on m.id = pr.match_id
    where m.status = 'finished'
      and m.hidden = false
      and pr.score_type is not null
      and (p_competition_id is null or m.competition_id = p_competition_id)
  ),
  agg as (
    select
      s.user_id,
      sum(
        (case s.score_type
           when 'cravada' then 3 when 'saldo' then 2 when 'acerto' then 1 else 0 end)
        * (case when s.is_joker then 2 else 1 end)
      )::int as pontos,
      count(*)::int as jogos,
      count(*) filter (where s.score_type = 'cravada')::int as cravadas,
      count(*) filter (where s.score_type = 'saldo')::int as saldos,
      count(*) filter (where s.score_type = 'acerto')::int as acertos
    from scored s
    group by s.user_id
  ),
  ranked as (
    select
      (row_number() over (order by a.pontos desc, a.cravadas desc, a.saldos desc, a.jogos asc))::int as rk,
      a.user_id, p.display_name, p.avatar_url, a.pontos, a.jogos, a.cravadas, a.saldos, a.acertos
    from agg a
    join public.profiles p on p.id = a.user_id
    where coalesce(p.show_in_global_ranking, true) = true
  ),
  meta as (
    select
      (select rk from ranked where user_id = auth.uid()) as my,
      (select count(*)::int from ranked) as total,
      greatest(coalesce(p_radius, 1), 0) as radius
  ),
  bounds as (
    -- janela centrada, deslocada nas pontas pra sempre encher (2*radius+1)
    select
      greatest(1, least(my - radius, total - 2 * radius)) as lo,
      least(total, greatest(1, least(my - radius, total - 2 * radius)) + 2 * radius) as hi
    from meta
    where my is not null
  )
  select
    r.rk, r.user_id, r.display_name, r.avatar_url,
    r.pontos, r.jogos, r.cravadas, r.saldos, r.acertos,
    (r.user_id = auth.uid()) as is_me
  from ranked r, bounds b
  where r.rk between b.lo and b.hi
  order by r.rk;
$$;

grant execute on function public.get_global_rank_window(uuid, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. Vitrine de grupos públicos (descobríveis por qualquer Resultadista)
-- ----------------------------------------------------------------------------
create or replace function public.list_public_leagues(
  p_search text default null,
  p_limit int default 30,
  p_offset int default 0
)
returns table(
  id uuid,
  name text,
  slug text,
  description text,
  logo_url text,
  join_policy public.join_policy,
  member_count int,
  is_member boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    l.id, l.name, l.slug, l.description, l.logo_url, l.join_policy,
    (select count(*)::int from public.league_members lm
       where lm.league_id = l.id and lm.status = 'active') as member_count,
    public.is_league_member(l.id) as is_member,
    l.created_at
  from public.leagues l
  where l.visibility = 'public'
    and l.status = 'active'
    and l.deleted_at is null
    and (p_search is null or p_search = '' or l.name ilike '%' || p_search || '%')
  order by
    (select count(*) from public.league_members lm
       where lm.league_id = l.id and lm.status = 'active') desc,
    l.created_at desc
  limit greatest(coalesce(p_limit, 30), 1)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

grant execute on function public.list_public_leagues(text, int, int) to authenticated;

-- ----------------------------------------------------------------------------
-- 3. Minha posição em cada grupo (batch) — exata (delega ao standings interno)
-- ----------------------------------------------------------------------------
-- Para cada grupo, usa o Bolão principal (1ª competição em modo pontos/tabela)
-- e devolve meu rank + total de participantes. Como chama get_league_standings,
-- herda regra de pontos do grupo, jogos ocultos, starts_on e guarda de acesso.
create or replace function public.get_my_league_positions(p_league_ids uuid[])
returns table(
  league_id uuid,
  rank int,
  total int,
  pontos int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lid uuid;
  v_lc uuid;
begin
  if auth.uid() is null or p_league_ids is null then
    return;
  end if;

  foreach v_lid in array p_league_ids loop
    select lc.id into v_lc
    from public.league_competitions lc
    where lc.league_id = v_lid
      and lc.mode in ('points', 'table')
    order by lc.created_at asc
    limit 1;

    if v_lc is null then
      continue; -- grupo sem Bolão ainda
    end if;

    return query
    with st as (select * from public.get_league_standings(v_lc))
    select v_lid, s.rank, (select count(*)::int from st), s.pontos
    from st s
    where s.user_id = auth.uid();
  end loop;
end;
$$;

grant execute on function public.get_my_league_positions(uuid[]) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Modelo visibilidade ↔ política de entrada (regra de negócio)
-- ----------------------------------------------------------------------------
-- Privado  ⇒ só por convite (join_policy = 'invite').
-- Público  ⇒ aberto ('open') ou por aprovação ('approval'); nunca 'invite'.
-- Primeiro normaliza os grupos existentes, depois trava com CHECK.
update public.leagues
   set join_policy = 'invite'
 where visibility = 'private' and join_policy <> 'invite';

update public.leagues
   set join_policy = 'approval'
 where visibility = 'public' and join_policy = 'invite';

alter table public.leagues
  drop constraint if exists leagues_visibility_join_policy_ck;

alter table public.leagues
  add constraint leagues_visibility_join_policy_ck check (
    (visibility = 'private' and join_policy = 'invite')
    or (visibility = 'public' and join_policy in ('open', 'approval'))
  );
