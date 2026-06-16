-- ============================================================================
-- Resultadismo · Dobro de Pontos (2×) por SEMANA GLOBAL (todas as competições)
-- ----------------------------------------------------------------------------
-- Pedido do João (2026-06-15): o limite de dobros deixa de ser por competição e
-- passa a ser por SEMANA, somando TODAS as competições. Antes: 2 por (usuário,
-- competição, semana). Agora: 2 por (usuário, semana) no total. A semana segue
-- civil (seg–dom) ancorada em America/Sao_Paulo. Redefine a função vigente
-- (20260603000023, com advisory lock anti-corrida) só trocando o escopo:
-- o lock e a contagem perdem a competição.
-- ============================================================================

create or replace function public.enforce_joker_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_week date;
  v_count int;
  c_limit constant int := 2;  -- limite GLOBAL de dobros por semana
begin
  if new.is_joker is true then
    select (date_trunc('week', (m.kickoff_at at time zone 'America/Sao_Paulo')))::date
      into v_week
    from public.matches m
    where m.id = new.match_id;

    -- Serializa a verificação por (usuário, semana) — agora SEM competição.
    perform pg_advisory_xact_lock(
      hashtext(new.user_id::text || ':' || coalesce(v_week::text, ''))
    );

    -- Conta os dobros do usuário na MESMA semana, em QUALQUER competição.
    select count(*) into v_count
    from public.predictions p
    join public.matches m on m.id = p.match_id
    where p.user_id = new.user_id
      and p.is_joker = true
      and p.id <> new.id
      and (date_trunc('week', (m.kickoff_at at time zone 'America/Sao_Paulo')))::date = v_week;

    if v_count >= c_limit then
      raise exception 'Você já usou seus % dobros nesta semana.', c_limit;
    end if;
  end if;
  return new;
end;
$$;

-- Contador de dobros usados por semana (do usuário logado, todas as competições)
-- — alimenta o badge "X/2 dobros nesta semana" em todas as abas da tela de Jogos.
-- A semana bate com o weekKey do front (segunda da semana BRT).
create or replace function public.my_joker_week_counts()
returns table (week date, n int)
language sql
stable
security definer
set search_path = ''
as $$
  select (date_trunc('week', (m.kickoff_at at time zone 'America/Sao_Paulo')))::date as week,
         count(*)::int as n
  from public.predictions p
  join public.matches m on m.id = p.match_id
  where p.user_id = auth.uid()
    and p.is_joker = true
  group by 1;
$$;
revoke all on function public.my_joker_week_counts() from public, anon;
grant execute on function public.my_joker_week_counts() to authenticated;
