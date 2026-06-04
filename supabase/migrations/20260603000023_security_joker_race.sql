-- ============================================================================
-- Resultadismo · Segurança (code review v2) · Joker / Dobro — corrida (TOCTOU)
-- ----------------------------------------------------------------------------
-- O limite "2 dobros por semana" era checado por count() sem serialização: dois
-- updates concorrentes (mesma semana, jogos diferentes) liam o mesmo count e
-- ambos passavam → 3+ dobros. Agora pegamos um advisory lock transacional por
-- (usuário, competição, semana) ANTES da contagem, serializando a verificação.
-- ============================================================================

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

    -- Serializa a verificação para esta (user, competição, semana).
    perform pg_advisory_xact_lock(
      hashtext(new.user_id::text || ':' || coalesce(v_comp::text, '') || ':' || coalesce(v_week::text, ''))
    );

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
