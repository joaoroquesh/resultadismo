-- Sorteio instantâneo OU agendado (data/hora ou 1º jogo). E o formato da Liga
-- (turno/returno/suíço) passa a ser definido no sorteio (grava liga_format).

alter table public.league_competitions
  add column if not exists scheduled_draw_at timestamptz;

-- draw_confronto agora: grava liga_format + period_kind e suporta agendamento.
-- Se p_scheduled_draw_at no futuro -> estado 'scheduled' (revelado no horário pelo
-- cron). Senão -> 'drawn' na hora. Os confrontos (cup_ties) são montados já.
drop function if exists public.draw_confronto(uuid, jsonb, jsonb);
create or replace function public.draw_confronto(
  p_lc_id uuid,
  p_participants jsonb,
  p_ties jsonb,
  p_liga_format text default null,
  p_period_kind text default null,
  p_scheduled_draw_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
  v_scheduled boolean := p_scheduled_draw_at is not null and p_scheduled_draw_at > now();
begin
  select league_id into v_league from public.league_competitions where id = p_lc_id;
  if v_league is null then
    raise exception 'Disputa não encontrada.';
  end if;
  if not (public.is_league_admin(v_league) or public.is_app_admin()) then
    raise exception 'Apenas administradores da federação podem sortear.';
  end if;

  delete from public.cup_ties where league_competition_id = p_lc_id;
  delete from public.confronto_participants where league_competition_id = p_lc_id;

  insert into public.confronto_participants (league_competition_id, user_id, seed)
  select p_lc_id, (e ->> 'user_id')::uuid, coalesce((e ->> 'seed')::int, 0)
  from jsonb_array_elements(p_participants) e;

  insert into public.cup_ties
    (league_competition_id, round_order, round_label, slot, member_a, member_b,
     matchday, period_kind, period_value, status)
  select p_lc_id,
         (e ->> 'round_order')::int,
         e ->> 'round_label',
         (e ->> 'slot')::int,
         nullif(e ->> 'member_a', '')::uuid,
         nullif(e ->> 'member_b', '')::uuid,
         nullif(e ->> 'matchday', '')::int,
         nullif(e ->> 'period_kind', ''),
         nullif(e ->> 'period_value', ''),
         'pending'
  from jsonb_array_elements(p_ties) e;

  update public.league_competitions
     set confronto_state = case when v_scheduled then 'scheduled' else 'drawn' end,
         drawn_at = case when v_scheduled then null else now() end,
         scheduled_draw_at = case when v_scheduled then p_scheduled_draw_at else null end,
         liga_format = coalesce(p_liga_format, liga_format),
         period_kind = coalesce(p_period_kind, period_kind)
   where id = p_lc_id;
end;
$$;
grant execute on function public.draw_confronto(uuid, jsonb, jsonb, text, text, timestamptz) to authenticated;

-- Libera (revela) as disputas agendadas cujo horário chegou.
create or replace function public.release_scheduled_confrontos()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  update public.league_competitions
     set confronto_state = 'drawn', drawn_at = now()
   where confronto_state = 'scheduled'
     and scheduled_draw_at is not null
     and scheduled_draw_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- Versão pontual (gatilho lazy do client ao abrir uma disputa agendada vencida).
create or replace function public.release_confronto_if_due(p_lc_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_done boolean := false;
begin
  update public.league_competitions
     set confronto_state = 'drawn', drawn_at = now()
   where id = p_lc_id
     and confronto_state = 'scheduled'
     and scheduled_draw_at is not null
     and scheduled_draw_at <= now();
  get diagnostics v_done = row_count;
  return v_done;
end;
$$;
grant execute on function public.release_confronto_if_due(uuid) to anon, authenticated;

-- Cron: a cada 5 min, libera as agendadas vencidas (backstop).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'release-scheduled-confrontos') then
    perform cron.unschedule('release-scheduled-confrontos');
  end if;
  perform cron.schedule(
    'release-scheduled-confrontos',
    '*/5 * * * *',
    'select public.release_scheduled_confrontos()'
  );
exception when undefined_table or undefined_function then
  -- pg_cron pode não estar disponível em ambiente local minimal; ignora.
  null;
end
$$;
