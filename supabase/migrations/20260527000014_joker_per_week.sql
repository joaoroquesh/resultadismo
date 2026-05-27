-- ============================================================================
-- Resultadismo · 14 · Dobro de Pontos por SEMANA (seg–dom)
-- Antes: cota total por competição (max_jokers). Agora: cota por semana civil.
-- A semana é ancorada no fuso America/São_Paulo (Mon–Sun) a partir do kickoff.
-- ============================================================================

alter table public.competitions
  add column if not exists jokers_per_week int not null default 2;

-- Reescreve a regra: no máximo `jokers_per_week` dobros por usuário, por
-- competição, dentro da MESMA semana civil do jogo jokerizado.
create or replace function public.enforce_joker_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp uuid;
  v_week date;
  v_per_week int;
  v_count int;
begin
  if new.is_joker is true then
    select m.competition_id,
           (date_trunc('week', (m.kickoff_at at time zone 'America/Sao_Paulo')))::date
      into v_comp, v_week
    from public.matches m
    where m.id = new.match_id;

    select coalesce(jokers_per_week, 2) into v_per_week
    from public.competitions
    where id = v_comp;

    select count(*) into v_count
    from public.predictions p
    join public.matches m on m.id = p.match_id
    where p.user_id = new.user_id
      and p.is_joker = true
      and p.id <> new.id
      and m.competition_id = v_comp
      and (date_trunc('week', (m.kickoff_at at time zone 'America/Sao_Paulo')))::date = v_week;

    if v_count >= v_per_week then
      raise exception 'Você já usou seus % dobros nesta semana.', v_per_week;
    end if;
  end if;
  return new;
end;
$$;

-- O trigger `predictions_joker_limit` (migration 12) continua válido, pois só a
-- função foi substituída.
