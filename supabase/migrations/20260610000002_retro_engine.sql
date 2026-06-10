-- Mini-jogo Resultadismo Retrô — Fase 2: o motor da run (100% no banco).
-- Espec: docs/planning/minijogo-historico/decisoes-fechadas.md (D3-D6, D12, D17).
-- Princípios: o GABARITO nunca desce ao client (retro_matches sem policy; estas RPCs
-- SECURITY DEFINER servem o confronto SEM placar e pontuam no servidor); tempo medido
-- no servidor (deadline por slot + tolerância de 2s de rede); runs permanentes só da
-- Copa do Dia de logados (D17) — o resto é efêmero e purgado por cron.

-- ============================================================ tabelas

-- O desafio do dia: os mesmos 7 jogos para todo mundo (criado lazy no 1º start do dia).
create table public.retro_daily (
  daily_date date primary key,
  match_ids uuid[] not null,
  created_at timestamptz not null default now()
);
alter table public.retro_daily enable row level security; -- sem policy: gabarito do dia não vaza

create table public.retro_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,    -- null = anônimo
  anon_token uuid,                                                   -- credencial do anônimo p/ retomar
  is_daily boolean not null default false,
  daily_date date,
  mode text not null check (mode in ('acerto','cravada')),
  pace text not null check (pace in ('resultadista','classico','sempressa')),
  status text not null default 'playing'
    check (status in ('playing','eliminated','champion')),
  current_slot int not null default 1 check (current_slot between 1 and 7),
  stage_reached text,
  stage_rank int,                  -- 1 grupos · 2 oitavas · 3 quartas · 4 semi · 5 vice · 6 campeão
  points int not null default 0,
  total_ms bigint,
  ranked boolean not null default false,      -- daily + logado + ritmo resultadista
  persistent boolean not null default false,  -- false = purga em 24h (D17)
  share_code text unique not null default encode(extensions.gen_random_bytes(6), 'hex'),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint retro_runs_identity check (user_id is not null or anon_token is not null),
  constraint retro_runs_daily_date check ((is_daily and daily_date is not null) or (not is_daily))
);
-- 1 Copa do Dia por conta por dia (qualquer modo/ritmo — a tentativa é única)
create unique index retro_runs_one_daily_per_user
  on public.retro_runs (user_id, daily_date) where is_daily and user_id is not null;
create index retro_runs_purge_idx on public.retro_runs (started_at) where not persistent;
create index retro_runs_board_idx on public.retro_runs (daily_date, mode)
  where ranked and status <> 'playing';
alter table public.retro_runs enable row level security; -- sem policy: tudo via RPC

create table public.retro_run_matches (
  run_id uuid not null references public.retro_runs(id) on delete cascade,
  slot int not null check (slot between 1 and 7),
  match_id uuid not null references public.retro_matches(id),
  served_at timestamptz not null default now(),
  deadline_at timestamptz,                    -- null = ritmo sem pressa
  guess_home int check (guess_home between 0 and 99),
  guess_away int check (guess_away between 0 and 99),
  answered_at timestamptz,
  is_timeout boolean not null default false,
  score_type public.score_type,
  points int,
  primary key (run_id, slot)
);
alter table public.retro_run_matches enable row level security; -- sem policy: tudo via RPC

-- Tempo de uso agregado de ANÔNIMOS (D14): 1 linha por dia, nunca log bruto.
create table public.retro_usage_daily (
  day date primary key,
  anon_seconds bigint not null default 0,
  anon_runs_started int not null default 0,
  anon_runs_finished int not null default 0
);
alter table public.retro_usage_daily enable row level security; -- sem policy

-- ============================================================ helpers internos

-- Rótulos e regras por slot da run (1..3 grupos · 4 oitavas · 5 quartas · 6 semi · 7 final)
create or replace function public.retro_slot_label(p_slot int) returns text
language sql immutable as $$
  select case p_slot
    when 1 then 'Fase de grupos · Jogo 1'
    when 2 then 'Fase de grupos · Jogo 2'
    when 3 then 'Fase de grupos · Jogo 3'
    when 4 then 'Oitavas de final'
    when 5 then 'Quartas de final'
    when 6 then 'Semifinal'
    when 7 then 'FINAL' end
$$;

create or replace function public.retro_timer_seconds(p_pace text, p_slot int) returns int
language sql immutable as $$
  select case p_pace
    when 'sempressa' then null
    when 'classico' then case when p_slot <= 3 then 14 when p_slot <= 5 then 12 else 10 end
    else case when p_slot <= 3 then 10 when p_slot <= 5 then 8 else 7 end
  end
$$;

-- Sorteio de um jogo para um slot: sorteia o NÍVEL primeiro (pesos por fase — grupos
-- puxam pra 1–2, ajuste do PO 09/06), depois um jogo aleatório do nível; 10% de chance
-- de fugir da janela. Exclui ids já vistos. SETOF para o caller travar a linha se quiser.
create or replace function public.retro_pick_match(p_slot int, p_exclude uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_lo int; v_hi int; v_lvl int; v_r numeric; v_id uuid;
begin
  select case when p_slot <= 3 then 1 when p_slot = 4 then 2 when p_slot = 5 then 3 when p_slot = 6 then 4 else 5 end,
         case when p_slot <= 3 then 3 when p_slot = 4 then 4 when p_slot = 5 then 5 when p_slot = 6 then 6 else 7 end
    into v_lo, v_hi;

  if random() < 0.10 then
    -- fora da janela (qualquer nível que não esteja nela)
    select id into v_id from public.retro_matches
     where (difficulty < v_lo or difficulty > v_hi) and id <> all(coalesce(p_exclude, '{}'))
     order by random() limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- nível primeiro: grupos 45/35/20 (fácil→difícil); demais fases ~uniforme por nível
  v_r := random() * 100;
  if p_slot <= 3 then
    v_lvl := case when v_r < 45 then v_lo when v_r < 80 then v_lo + 1 else v_hi end;
  else
    v_lvl := case when v_r < 34 then v_lo when v_r < 67 then v_lo + 1 else v_hi end;
  end if;

  select id into v_id from public.retro_matches
   where difficulty = v_lvl and id <> all(coalesce(p_exclude, '{}'))
   order by random() limit 1;
  if v_id is null then -- nível esgotado pelos excludes: cai pra janela inteira
    select id into v_id from public.retro_matches
     where difficulty between v_lo and v_hi and id <> all(coalesce(p_exclude, '{}'))
     order by random() limit 1;
  end if;
  return v_id;
end $$;
revoke execute on function public.retro_pick_match(int, uuid[]) from public, anon, authenticated;

-- Cria (lazy, 1x) o desafio do dia — mesmos 7 jogos pra todo mundo.
create or replace function public.retro_make_daily(p_date date) returns uuid[]
language plpgsql security definer set search_path = '' as $$
declare v_ids uuid[]; v_id uuid; v_slot int;
begin
  select match_ids into v_ids from public.retro_daily where daily_date = p_date;
  if v_ids is not null then return v_ids; end if;
  perform pg_advisory_xact_lock(hashtext('retro_daily_' || p_date::text));
  select match_ids into v_ids from public.retro_daily where daily_date = p_date;
  if v_ids is not null then return v_ids; end if;
  v_ids := '{}';
  for v_slot in 1..7 loop
    v_id := public.retro_pick_match(v_slot, v_ids);
    v_ids := v_ids || v_id;
  end loop;
  insert into public.retro_daily (daily_date, match_ids) values (p_date, v_ids);
  return v_ids;
end $$;
revoke execute on function public.retro_make_daily(date) from public, anon, authenticated;

-- Payload do confronto SEM o placar (o que o client pode saber antes do palpite).
create or replace function public.retro_match_payload(p_run public.retro_runs, p_slot int)
returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'slot', p_slot,
    'slot_label', public.retro_slot_label(p_slot),
    'timer_seconds', public.retro_timer_seconds(p_run.pace, p_slot),
    'deadline_at', rm.deadline_at,
    'served_at', rm.served_at,
    'match', jsonb_build_object(
      'wc_year', m.wc_year, 'wc_host', m.wc_host,
      'stage_label_pt', m.stage_label_pt, 'is_knockout', m.is_knockout,
      'home_name_pt', m.home_name_pt, 'away_name_pt', m.away_name_pt,
      'home_slug', m.home_slug, 'away_slug', m.away_slug
    ))
  from public.retro_run_matches rm
  join public.retro_matches m on m.id = rm.match_id
  where rm.run_id = p_run.id and rm.slot = p_slot
$$;
revoke execute on function public.retro_match_payload(public.retro_runs, int) from public, anon, authenticated;

-- Serve o slot seguinte: sorteia (ou pega do daily), grava served/deadline.
create or replace function public.retro_serve_slot(p_run public.retro_runs, p_slot int, p_seen uuid[])
returns void
language plpgsql security definer set search_path = '' as $$
declare v_match uuid; v_timer int; v_daily uuid[]; v_exclude uuid[];
begin
  if p_run.is_daily then
    v_daily := public.retro_make_daily(p_run.daily_date);
    v_match := v_daily[p_slot];
  else
    select coalesce(array_agg(match_id), '{}') into v_exclude
      from public.retro_run_matches where run_id = p_run.id;
    v_exclude := v_exclude || coalesce(p_seen, '{}');
    v_match := public.retro_pick_match(p_slot, v_exclude);
  end if;
  v_timer := public.retro_timer_seconds(p_run.pace, p_slot);
  insert into public.retro_run_matches (run_id, slot, match_id, deadline_at)
  values (p_run.id, p_slot, v_match,
          case when v_timer is null then null else now() + make_interval(secs => v_timer) end);
  update public.retro_matches set shown_count = shown_count + 1 where id = v_match;
end $$;
revoke execute on function public.retro_serve_slot(public.retro_runs, int, uuid[]) from public, anon, authenticated;

-- Autoriza o dono da run (logado por auth.uid(); anônimo por token).
create or replace function public.retro_run_owned(p_run public.retro_runs, p_anon_token uuid)
returns boolean
language sql immutable as $$
  select (p_run.user_id is not null and p_run.user_id = auth.uid())
      or (p_run.user_id is null and p_anon_token is not null and p_run.anon_token = p_anon_token)
$$;

-- ============================================================ RPCs públicas

-- Começa uma run (ou RETOMA a Copa do Dia em andamento do usuário logado).
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
revoke execute on function public.retro_start_run(text, text, boolean, uuid, uuid[]) from public;
grant execute on function public.retro_start_run(text, text, boolean, uuid, uuid[]) to anon, authenticated;

-- Responde o slot atual: valida a janela de tempo NO SERVIDOR, pontua com as funções
-- sagradas (compute_score_type/score_points), avança a campanha e serve o próximo jogo.
create or replace function public.retro_answer(
  p_run_id uuid,
  p_home int default null,
  p_away int default null,
  p_anon_token uuid default null,
  p_seen uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.retro_runs;
  v_rm public.retro_run_matches;
  v_m public.retro_matches;
  v_timeout boolean;
  v_type public.score_type;
  v_pts int := 0;
  v_passed boolean;
  v_group_passes int;
  v_need int;
  v_finish_status text := null;
  v_stage_reached text; v_stage_rank int;
  v_result jsonb; v_next jsonb := null;
begin
  select * into v_run from public.retro_runs where id = p_run_id for update;
  if not found or not public.retro_run_owned(v_run, p_anon_token) then
    raise exception 'run não encontrada';
  end if;
  if v_run.status <> 'playing' then raise exception 'run já encerrada'; end if;

  select * into v_rm from public.retro_run_matches
   where run_id = v_run.id and slot = v_run.current_slot for update;
  if v_rm.answered_at is not null then raise exception 'slot já respondido'; end if;

  select * into v_m from public.retro_matches where id = v_rm.match_id;

  -- janela de tempo no servidor (+2s de tolerância de rede); palpite vazio = erro
  v_timeout := (v_rm.deadline_at is not null and now() > v_rm.deadline_at + interval '2 seconds')
               or p_home is null or p_away is null;
  if v_timeout then
    v_type := 'erro'; v_pts := 0;
  else
    v_type := public.compute_score_type(p_home, p_away, v_m.home_score, v_m.away_score);
    v_pts := public.score_points(v_type);
  end if;

  update public.retro_run_matches
     set guess_home = case when v_timeout then null else p_home end,
         guess_away = case when v_timeout then null else p_away end,
         answered_at = now(), is_timeout = v_timeout,
         score_type = v_type, points = v_pts
   where run_id = v_run.id and slot = v_run.current_slot;
  if v_pts > 0 then
    update public.retro_matches set scored_count = scored_count + 1 where id = v_m.id;
  end if;
  update public.retro_runs set points = points + v_pts where id = v_run.id returning * into v_run;

  -- "passou" no slot? (D3: acerto ≥1 pt até as quartas, ≥2 na semi/final; Só Cravada = só cravada)
  v_need := case when v_run.mode = 'cravada' then 3 when v_run.current_slot >= 6 then 2 else 1 end;
  v_passed := case when v_run.mode = 'cravada' then v_type = 'cravada' else v_pts >= v_need end;

  -- progressão
  if v_run.current_slot < 3 then
    null; -- grupos: joga os 3 sempre (jogo de honra incluído)
  elsif v_run.current_slot = 3 then
    select count(*) into v_group_passes from public.retro_run_matches
     where run_id = v_run.id and slot <= 3
       and case when v_run.mode = 'cravada' then score_type = 'cravada' else points >= 1 end;
    if v_group_passes < 2 then
      v_finish_status := 'eliminated'; v_stage_reached := 'Fase de grupos'; v_stage_rank := 1;
    end if;
  elsif v_run.current_slot < 7 then
    if not v_passed then
      v_finish_status := 'eliminated';
      v_stage_reached := public.retro_slot_label(v_run.current_slot);
      v_stage_rank := v_run.current_slot - 2; -- oitavas 2 · quartas 3 · semi 4
    end if;
  else
    if v_passed then
      v_finish_status := 'champion'; v_stage_reached := 'Campeão 🏆'; v_stage_rank := 6;
    else
      v_finish_status := 'eliminated'; v_stage_reached := 'Vice-campeão'; v_stage_rank := 5;
    end if;
  end if;

  if v_finish_status is not null then
    update public.retro_runs
       set status = v_finish_status, stage_reached = v_stage_reached, stage_rank = v_stage_rank,
           finished_at = now(),
           total_ms = (select coalesce(sum(least(
                         extract(epoch from (rm2.answered_at - rm2.served_at)) * 1000,
                         coalesce(extract(epoch from (rm2.deadline_at - rm2.served_at)) * 1000 + 2000,
                                  extract(epoch from (rm2.answered_at - rm2.served_at)) * 1000)
                       ))::bigint, 0)
                       from public.retro_run_matches rm2
                       where rm2.run_id = v_run.id and rm2.answered_at is not null)
     where id = v_run.id returning * into v_run;
    if v_run.user_id is null then
      insert into public.retro_usage_daily as u (day, anon_runs_finished)
      values ((now() at time zone 'America/Sao_Paulo')::date, 1)
      on conflict (day) do update set anon_runs_finished = u.anon_runs_finished + 1;
    end if;
  else
    update public.retro_runs set current_slot = current_slot + 1
     where id = v_run.id returning * into v_run;
    perform public.retro_serve_slot(v_run, v_run.current_slot, p_seen);
    v_next := public.retro_match_payload(v_run, v_run.current_slot);
  end if;

  v_result := jsonb_build_object(
    'home_score', v_m.home_score, 'away_score', v_m.away_score,
    'pens_home', v_m.pens_home, 'pens_away', v_m.pens_away,
    'went_extra_time', v_m.went_extra_time,
    'score_type', v_type, 'points', v_pts, 'timeout', v_timeout, 'passed', v_passed);

  return jsonb_build_object(
    'result', v_result,
    'run', jsonb_build_object('id', v_run.id, 'status', v_run.status, 'points', v_run.points,
      'stage_reached', v_run.stage_reached, 'stage_rank', v_run.stage_rank,
      'total_ms', v_run.total_ms, 'share_code', v_run.share_code, 'slot', v_run.current_slot),
    'next', v_next);
end $$;
revoke execute on function public.retro_answer(uuid, int, int, uuid, uuid[]) from public;
grant execute on function public.retro_answer(uuid, int, int, uuid, uuid[]) to anon, authenticated;

-- Página pública do share: resumo da campanha SEM identidade dos jogos (anti-spoiler).
create or replace function public.retro_run_summary(p_share_code text) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'mode', r.mode, 'pace', r.pace, 'status', r.status,
    'stage_reached', r.stage_reached, 'points', r.points, 'total_ms', r.total_ms,
    'is_daily', r.is_daily, 'daily_date', r.daily_date, 'finished_at', r.finished_at,
    'player', case when r.user_id is not null
      then (select jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url)
              from public.profiles p where p.id = r.user_id) end,
    'slots', (select jsonb_agg(jsonb_build_object(
        'slot', rm.slot, 'slot_label', public.retro_slot_label(rm.slot),
        'score_type', rm.score_type, 'points', rm.points, 'timeout', rm.is_timeout)
        order by rm.slot)
      from public.retro_run_matches rm
      where rm.run_id = r.id and rm.answered_at is not null))
  from public.retro_runs r
  where r.share_code = p_share_code and r.status <> 'playing'
$$;
revoke execute on function public.retro_run_summary(text) from public;
grant execute on function public.retro_run_summary(text) to anon, authenticated;

-- Ranking da Copa do Dia (só runs ranqueadas: logado + ritmo resultadista), por modo.
-- Ordem: fase alcançada → pontos → tempo (D6). Respeita o opt-out do ranking global.
create or replace function public.retro_leaderboard(
  p_daily_date date default null,
  p_mode text default 'acerto',
  p_limit int default 50
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_date date := coalesce(p_daily_date, (now() at time zone 'America/Sao_Paulo')::date);
  v_rows jsonb; v_me jsonb;
begin
  select jsonb_agg(row_data) into v_rows from (
    select jsonb_build_object(
      'pos', row_number() over (order by r.stage_rank desc, r.points desc, r.total_ms asc),
      'display_name', p.display_name, 'avatar_url', p.avatar_url,
      'stage_reached', r.stage_reached, 'points', r.points, 'total_ms', r.total_ms,
      'is_me', r.user_id = auth.uid()) as row_data
    from public.retro_runs r
    join public.profiles p on p.id = r.user_id
    where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.mode = p_mode
      and p.show_in_global_ranking
    order by r.stage_rank desc, r.points desc, r.total_ms asc
    limit least(coalesce(p_limit, 50), 100)
  ) t;

  if auth.uid() is not null then
    select jsonb_build_object('pos', pos, 'stage_reached', stage_reached,
                              'points', points, 'total_ms', total_ms) into v_me
    from (select r.user_id, r.stage_reached, r.points, r.total_ms,
                 row_number() over (order by r.stage_rank desc, r.points desc, r.total_ms asc) as pos
            from public.retro_runs r
           where r.ranked and r.status <> 'playing' and r.daily_date = v_date and r.mode = p_mode) t
    where t.user_id = auth.uid();
  end if;

  return jsonb_build_object('daily_date', v_date, 'mode', p_mode,
                            'rows', coalesce(v_rows, '[]'::jsonb), 'me', v_me);
end $$;
revoke execute on function public.retro_leaderboard(date, text, int) from public;
grant execute on function public.retro_leaderboard(date, text, int) to anon, authenticated;

-- Tempo de uso de anônimos (D14): agrega segundos numa linha por dia (delta ≤ 60s).
create or replace function public.retro_touch_anon(p_seconds int) returns void
language sql security definer set search_path = '' as $$
  insert into public.retro_usage_daily as u (day, anon_seconds)
  values ((now() at time zone 'America/Sao_Paulo')::date, greatest(0, least(coalesce(p_seconds, 0), 60)))
  on conflict (day) do update set anon_seconds = u.anon_seconds + excluded.anon_seconds
$$;
revoke execute on function public.retro_touch_anon(int) from public;
grant execute on function public.retro_touch_anon(int) to anon, authenticated;

-- ============================================================ purga (D17) + cron

create or replace function public.retro_purge_ephemeral() returns int
language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  delete from public.retro_runs
   where not persistent and started_at < now() - interval '24 hours';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke execute on function public.retro_purge_ephemeral() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'retro-purge-ephemeral',
      '40 3 * * *',                       -- 03:40 UTC ≈ 00:40 BRT, fora de pico
      'select public.retro_purge_ephemeral()'
    );
  end if;
end $$;
