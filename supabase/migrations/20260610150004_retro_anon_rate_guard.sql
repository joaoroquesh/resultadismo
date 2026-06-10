-- Retrô — hardening AppSec (pendência da espec, D14/D17): anônimo é limitado a
-- 30 inícios de run por hora POR TOKEN. Junto com a purga diária das efêmeras e o
-- clamp do retro_touch_anon, fecha a superfície de abuso das RPCs anon sem fricção
-- para jogador real (30 runs/h ≈ 1 a cada 2 minutos, muito acima do uso humano).

create or replace function public.retro_start_run(
  p_mode text default 'acerto',
  p_pace text default 'resultadista',
  p_daily boolean default true,
  p_anon_token uuid default null,
  p_seen uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_run public.retro_runs;
begin
  if p_mode not in ('acerto','cravada') or p_pace not in ('resultadista','classico','sempressa') then
    raise exception 'modo ou ritmo inválido';
  end if;
  if v_user is null and p_anon_token is null then
    raise exception 'anônimo precisa de anon_token';
  end if;
  if array_length(p_seen, 1) > 60 then p_seen := p_seen[1:60]; end if;

  -- guarda anti-abuso (só anônimos; logado tem identidade e unicidade do daily)
  if v_user is null then
    if (select count(*) from public.retro_runs
         where anon_token = p_anon_token
           and started_at > now() - interval '1 hour') >= 30 then
      raise exception 'muitas partidas seguidas — respira, toma uma água e volta já 😉';
    end if;
  end if;

  if p_daily and v_user is not null then
    select * into v_run from public.retro_runs
     where user_id = v_user and is_daily and daily_date = v_today;
    if found then
      if v_run.status = 'playing' then
        return jsonb_build_object('run_id', v_run.id, 'share_code', v_run.share_code,
          'mode', v_run.mode, 'pace', v_run.pace, 'resumed', true, 'points', v_run.points,
          'current', public.retro_match_payload(v_run, v_run.current_slot));
      end if;
      raise exception 'você já jogou a Copa do Dia de hoje — volte amanhã (ou jogue o Treino)';
    end if;
  end if;

  insert into public.retro_runs (user_id, anon_token, is_daily, daily_date, mode, pace, ranked, persistent)
  values (v_user, case when v_user is null then p_anon_token end,
          p_daily, case when p_daily then v_today end, p_mode, p_pace,
          p_daily and v_user is not null and p_pace = 'resultadista',
          p_daily and v_user is not null)
  returning * into v_run;

  if v_user is null then
    insert into public.retro_usage_daily as u (day, anon_runs_started) values (v_today, 1)
    on conflict (day) do update set anon_runs_started = u.anon_runs_started + 1;
  end if;

  perform public.retro_serve_slot(v_run, 1, p_seen);
  return jsonb_build_object('run_id', v_run.id, 'share_code', v_run.share_code,
    'mode', v_run.mode, 'pace', v_run.pace, 'ranked', v_run.ranked, 'resumed', false,
    'points', 0, 'current', public.retro_match_payload(v_run, 1));
end $$;

-- índice de apoio à guarda (token + janela)
create index if not exists retro_runs_anon_guard_idx
  on public.retro_runs (anon_token, started_at) where anon_token is not null;
