-- Retrô — apoio à UI (Fase 3): payload ganha match_id (anti-repetição local do Treino,
-- D9) e difficulty (badge "nível" no card); nova RPC retro_my_stats (streak + melhor
-- campanha, motor do D7/retenção). Saber o match_id NÃO vaza placar: retro_matches
-- segue RLS-on sem policy.

create or replace function public.retro_match_payload(p_run public.retro_runs, p_slot int)
returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'slot', p_slot,
    'slot_label', public.retro_slot_label(p_slot),
    'timer_seconds', public.retro_timer_seconds(p_run.pace, p_slot),
    'deadline_at', rm.deadline_at,
    'served_at', rm.served_at,
    'match_id', rm.match_id,
    'match', jsonb_build_object(
      'wc_year', m.wc_year, 'wc_host', m.wc_host,
      'stage_label_pt', m.stage_label_pt, 'is_knockout', m.is_knockout,
      'difficulty', m.difficulty,
      'home_name_pt', m.home_name_pt, 'away_name_pt', m.away_name_pt,
      'home_slug', m.home_slug, 'away_slug', m.away_slug
    ))
  from public.retro_run_matches rm
  join public.retro_matches m on m.id = rm.match_id
  where rm.run_id = p_run.id and rm.slot = p_slot
$$;
revoke execute on function public.retro_match_payload(public.retro_runs, int) from public, anon, authenticated;

-- Streak de Copas do Dia + melhor campanha do usuário logado (anônimo recebe zeros).
create or replace function public.retro_my_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_streak int := 0;
  v_d date;
  v_best jsonb;
  v_played_today boolean;
begin
  if v_user is null then
    return jsonb_build_object('streak', 0, 'best', null, 'played_today', false);
  end if;

  select exists (select 1 from public.retro_runs
    where user_id = v_user and is_daily and daily_date = v_today) into v_played_today;

  -- streak: dias consecutivos com Copa do Dia (hoje conta mesmo em andamento;
  -- dias passados só contam concluídos — run 'playing' antiga = abandonada)
  v_d := case when v_played_today then v_today else v_today - 1 end;
  while exists (select 1 from public.retro_runs
    where user_id = v_user and is_daily and daily_date = v_d
      and (status <> 'playing' or daily_date = v_today)) loop
    v_streak := v_streak + 1;
    v_d := v_d - 1;
  end loop;

  select jsonb_build_object('stage_reached', stage_reached, 'stage_rank', stage_rank,
                            'points', points, 'total_ms', total_ms, 'daily_date', daily_date)
    into v_best
  from public.retro_runs
  where user_id = v_user and is_daily and status <> 'playing'
  order by stage_rank desc, points desc, total_ms asc
  limit 1;

  return jsonb_build_object('streak', v_streak, 'best', v_best, 'played_today', v_played_today);
end $$;
revoke execute on function public.retro_my_stats() from public;
grant execute on function public.retro_my_stats() to anon, authenticated;
