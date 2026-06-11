-- ============================================================================
-- Resultadismo · Grupos favoritos (prévia de classificação no topo da /grupos)
-- ----------------------------------------------------------------------------
-- Na /grupos o usuário pode FAVORITAR um ou mais grupos (ordem = ordem de
-- favoritar). A prévia da classificação (janela de 3: você + vizinhos de cima e
-- de baixo) de cada grupo favoritado vai pro topo; o Resultadismo The Best vira
-- um card pequeno. A prévia de um grupo SÓ aparece quando ele já tem alguma
-- pontuação na competição-bolão dele (senão fica de fora — ver §3).
--
--   1. profiles.favorite_group_ids  → array ORDENADO de league_id favoritados.
--   2. toggle_favorite_group(league) → adiciona/remove (valida ser membro).
--   3. get_group_rank_window(league) → janela de 3 da classificação do grupo
--      (visão Pontos), centrada em mim; VAZIA se o grupo não tem pontuação.
-- ============================================================================

-- 1. coluna ------------------------------------------------------------------
alter table public.profiles
  add column if not exists favorite_group_ids uuid[] not null default '{}'::uuid[];

comment on column public.profiles.favorite_group_ids is
  'Grupos (league_id) favoritados pelo usuário, na ordem de favoritar. A prévia da classificação de cada um aparece no topo da /grupos.';

-- 2. toggle favoritar --------------------------------------------------------
-- Adiciona no fim (preserva a ordem de favoritar) ou remove. Só dá pra
-- favoritar grupo de que você participa. Devolve o array atualizado.
create or replace function public.toggle_favorite_group(p_league_id uuid)
returns uuid[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if not public.is_league_member(p_league_id) then
    raise exception 'not a league member';
  end if;

  select coalesce(p.favorite_group_ids, '{}') into v_ids
  from public.profiles p where p.id = auth.uid();

  if p_league_id = any(v_ids) then
    v_ids := array_remove(v_ids, p_league_id);   -- desfavorita
  else
    v_ids := v_ids || p_league_id;               -- favorita (no fim = ordem)
  end if;

  update public.profiles
     set favorite_group_ids = v_ids
   where id = auth.uid();

  return v_ids;
end;
$$;

grant execute on function public.toggle_favorite_group(uuid) to authenticated;

-- Leitura dos meus favoritos (RPC pra não depender dos tipos gerados em
-- database.ts, regenerado por outra frente do projeto).
create or replace function public.get_my_favorite_groups()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.favorite_group_ids from public.profiles p where p.id = auth.uid()),
    '{}'::uuid[]
  );
$$;

grant execute on function public.get_my_favorite_groups() to authenticated;

-- 3. janela da classificação do grupo (você + vizinhos) ----------------------
-- Espelha get_global_rank_window, mas pra um grupo: usa o Bolão principal
-- (mesma escolha do get_my_league_positions) e o get_league_standings — que já
-- guarda acesso, jogos ocultos, starts_on e a regra de pontos do grupo.
-- VAZIO quando o grupo ainda não tem nenhuma pontuação (todos com jogos = 0):
-- é o gate "só aparece quando o grupo tiver pontuação na competição dele".
create or replace function public.get_group_rank_window(
  p_league_id uuid,
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_lc uuid;
begin
  if auth.uid() is null or p_league_id is null then
    return;
  end if;

  -- Bolão principal do grupo (1ª competição em modo pontos/tabela)
  select lc.id into v_lc
  from public.league_competitions lc
  where lc.league_id = p_league_id
    and lc.mode in ('points', 'table')
  order by lc.created_at asc
  limit 1;

  if v_lc is null then
    return; -- grupo sem Bolão ainda
  end if;

  return query
  with st as (
    select * from public.get_league_standings(v_lc)
  ),
  meta as (
    select
      (select s.rank from st s where s.user_id = auth.uid()) as my,
      (select count(*)::int from st) as total,
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
    s.rank, s.user_id, s.display_name, s.avatar_url,
    s.pontos, s.jogos, s.cravadas, s.saldos, s.acertos,
    (s.user_id = auth.uid()) as is_me
  from st s, bounds b
  where s.rank between b.lo and b.hi
    and exists (select 1 from st x where x.jogos > 0)  -- gate: grupo tem pontuação
  order by s.rank;
end;
$$;

grant execute on function public.get_group_rank_window(uuid, int) to authenticated;
