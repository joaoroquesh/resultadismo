-- ============================================================================
-- Resultadismo · Nomenclatura automática das disputas
-- ----------------------------------------------------------------------------
-- Regras:
--   • Bolão (mode='table')      → nome = nome do CAMPEONATO vinculado
--   • Liga (mode='liga')        → "Nª Liga {Grupo}"  (ordinal por grupo)
--   • Copa (mode='cup')         → "Nª Copa {Grupo}"  (ordinal por grupo)
--
-- O nome digitado pelo usuário deixou de existir — agora é determinístico:
--   • Confronto vê na hora qual é a próxima Nª.
--   • Bolão herda o campeonato.
--
-- Migration faz 3 coisas:
--   1. Função generate_disputa_name(p_league_id, p_mode, p_competition_id?)
--   2. Trigger BEFORE INSERT em league_competitions que sobrescreve `name`
--      com a regra (ignora o que o cliente mandou).
--   3. Renomeia disputas EXISTENTES seguindo a regra (overwrite).
-- ============================================================================

-- 1) Função pura (input → nome canônico)
create or replace function public.generate_disputa_name(
  p_league_id uuid,
  p_mode public.league_mode,
  p_competition_id uuid default null
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_grupo text;
  v_camp text;
  v_n int;
  v_label text;
begin
  if p_mode = 'table' then
    -- Bolão = nome do campeonato (display_name preferido; cai pro name)
    select coalesce(display_name, name) into v_camp
      from public.competitions where id = p_competition_id;
    return coalesce(v_camp, 'Bolão');
  end if;

  -- Liga / Copa: contar ordem dentro do grupo
  select coalesce(name, 'Grupo') into v_grupo
    from public.leagues where id = p_league_id;

  if p_mode = 'liga' then
    v_label := 'Liga';
    select count(*) + 1 into v_n
      from public.league_competitions
     where league_id = p_league_id and mode = 'liga';
  elsif p_mode = 'cup' then
    v_label := 'Copa';
    select count(*) + 1 into v_n
      from public.league_competitions
     where league_id = p_league_id and mode = 'cup';
  else
    return null;
  end if;

  return v_n::text || 'ª ' || v_label || ' ' || v_grupo;
end;
$$;

grant execute on function public.generate_disputa_name(uuid, public.league_mode, uuid) to authenticated;

-- 2) Trigger BEFORE INSERT — sobrescreve `name` com a regra
create or replace function public.league_competitions_force_canonical_name()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := coalesce(
    public.generate_disputa_name(new.league_id, new.mode, new.competition_id),
    new.name
  );
  return new;
end;
$$;

drop trigger if exists tg_league_competitions_canonical_name on public.league_competitions;
create trigger tg_league_competitions_canonical_name
  before insert on public.league_competitions
  for each row execute function public.league_competitions_force_canonical_name();

-- 3) Renomeia disputas EXISTENTES seguindo a regra (sobrescreve)
-- Bolões (table): vira nome do campeonato.
update public.league_competitions lc
   set name = coalesce(c.display_name, c.name, lc.name)
  from public.competitions c
 where lc.mode = 'table'
   and c.id = lc.competition_id;

-- Ligas/Copas: renumera por grupo, ordem de criação (mais antiga = 1ª).
with ranked as (
  select id, league_id, mode,
         row_number() over (partition by league_id, mode order by created_at) as n
    from public.league_competitions
   where mode in ('liga', 'cup')
)
update public.league_competitions lc
   set name = case lc.mode
                when 'liga' then r.n::text || 'ª Liga ' || l.name
                when 'cup'  then r.n::text || 'ª Copa ' || l.name
                else lc.name
              end
  from ranked r, public.leagues l
 where r.id = lc.id and l.id = lc.league_id;
