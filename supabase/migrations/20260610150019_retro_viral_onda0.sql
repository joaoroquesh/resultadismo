-- Retrô — rodada 22 (viralização, Onda 0 — server bits):
-- 1) retro_run_summary devolve o TIME da Seleção do Dia (pra share dizer "#N · BRASIL").
-- 2) retro_rank_estimate: "você seria ~Nº" — posição hipotética de uma campanha no
--    ranking de hoje (pro anônimo no fim da run, gancho de login no auge).
-- 3) retro_yesterday_champion: coroar na home quem levou a Seleção do Dia de ontem.
-- 4) retro_daily_count: quantos já jogaram a Seleção do Dia hoje (prova social).

-- ---------- summary com o time do dia ----------
create or replace function public.retro_run_summary(p_share_code text) returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'format', r.format, 'pace', r.pace, 'status', r.status, 'level', r.level,
    'stage_reached', r.stage_reached, 'points', r.points, 'total_ms', r.total_ms,
    'is_daily', r.is_daily, 'daily_date', r.daily_date, 'finished_at', r.finished_at,
    'team_name_pt', d.team_name_pt, 'team_slug', d.team_slug,
    'player', case when r.user_id is not null
      then (select jsonb_build_object('display_name', p.display_name, 'avatar_url', p.avatar_url)
              from public.profiles p where p.id = r.user_id) end,
    'slots', (select jsonb_agg(jsonb_build_object(
        'slot', rm.slot, 'slot_label', public.retro_slot_label(rm.slot),
        'score_type', rm.score_type, 'points', rm.points, 'timeout', rm.is_timeout) order by rm.slot)
      from public.retro_run_matches rm where rm.run_id = r.id and rm.answered_at is not null))
  from public.retro_runs r
  left join public.retro_daily d on r.is_daily and d.daily_date = r.daily_date
  where r.share_code = p_share_code and r.status <> 'playing'
$$;
revoke execute on function public.retro_run_summary(text) from public;
grant execute on function public.retro_run_summary(text) to anon, authenticated;

-- ---------- "você seria ~Nº" no ranking de hoje (Seleção do Dia) ----------
-- conta quantas campanhas RANQUEADAS de hoje ficam ESTRITAMENTE à frente da campanha
-- dada (fase→pontos→tempo); a posição hipotética é esse total + 1.
create or replace function public.retro_rank_estimate(
  p_stage_rank int, p_points int, p_total_ms bigint
) returns jsonb
language sql security definer set search_path = '' as $$
  with hoje as (
    select coalesce(r.stage_rank, 0) sr, r.points pts, r.total_ms ms
      from public.retro_runs r join public.profiles p on p.id = r.user_id
     where r.ranked and r.status <> 'playing'
       and r.daily_date = (now() at time zone 'America/Sao_Paulo')::date
       and r.format = 'copa' and p.show_in_global_ranking
  )
  select jsonb_build_object(
    'pos', 1 + (select count(*) from hoje h
      where (h.sr, h.pts, -h.ms) > (coalesce(p_stage_rank,0), coalesce(p_points,0), -coalesce(p_total_ms,0))),
    'total', (select count(*) from hoje) + 1);
$$;
revoke execute on function public.retro_rank_estimate(int, int, bigint) from public;
grant execute on function public.retro_rank_estimate(int, int, bigint) to anon, authenticated;

-- ---------- campeão da Seleção do Dia de ONTEM (coroação na home) ----------
create or replace function public.retro_yesterday_champion() returns jsonb
language sql security definer set search_path = '' as $$
  select jsonb_build_object(
    'display_name', p.display_name, 'avatar_url', p.avatar_url,
    'team_name_pt', d.team_name_pt, 'points', r.points)
  from public.retro_runs r
  join public.profiles p on p.id = r.user_id
  left join public.retro_daily d on d.daily_date = r.daily_date
  where r.ranked and r.status <> 'playing' and r.format = 'copa'
    and r.daily_date = ((now() at time zone 'America/Sao_Paulo')::date - 1)
    and p.show_in_global_ranking
  order by coalesce(r.stage_rank, 0) desc, r.points desc, r.total_ms asc
  limit 1
$$;
revoke execute on function public.retro_yesterday_champion() from public;
grant execute on function public.retro_yesterday_champion() to anon, authenticated;

-- ---------- quantos jogaram a Seleção do Dia hoje (prova social) ----------
create or replace function public.retro_daily_count() returns int
language sql security definer set search_path = '' as $$
  select count(distinct coalesce(user_id::text, anon_token::text))::int
    from public.retro_runs
   where is_daily and daily_date = (now() at time zone 'America/Sao_Paulo')::date
     and status <> 'playing'
$$;
revoke execute on function public.retro_daily_count() from public;
grant execute on function public.retro_daily_count() to anon, authenticated;
