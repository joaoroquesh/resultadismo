-- ============================================================================
-- Resultadismo · 12 · Cota máxima de Dobros (Joker) por competição
-- Troca o limite "1 por rodada" por uma cota total por competição.
-- ============================================================================

alter table public.competitions add column max_jokers int not null default 3;

drop trigger if exists predictions_single_joker on public.predictions;
drop function if exists public.enforce_single_joker();

create or replace function public.enforce_joker_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp uuid;
  v_max int;
  v_count int;
begin
  if new.is_joker is true then
    select m.competition_id into v_comp from public.matches m where m.id = new.match_id;
    select coalesce(max_jokers, 3) into v_max from public.competitions where id = v_comp;

    select count(*) into v_count
    from public.predictions p
    join public.matches m on m.id = p.match_id
    where p.user_id = new.user_id
      and p.is_joker = true
      and p.id <> new.id
      and m.competition_id = v_comp;

    if v_count >= v_max then
      raise exception 'Você já usou seus % dobros nesta competição.', v_max;
    end if;
  end if;
  return new;
end;
$$;

create trigger predictions_joker_limit
before insert or update of is_joker on public.predictions
for each row when (new.is_joker) execute function public.enforce_joker_limit();
