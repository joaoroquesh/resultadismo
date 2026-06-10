-- Retrô — correção de bug achado na homologação do PO (09/06): o slot seguinte era
-- servido DENTRO do retro_answer, então o cronômetro do próximo jogo corria enquanto
-- o jogador lia o reveal → "tempo esgotado" injusto. Agora o answer só avança o
-- ponteiro (current_slot) e o jogo é servido SOB DEMANDA pela nova RPC retro_next
-- (deadline nasce quando o jogador pede o próximo jogo).

-- retro_answer: mesma lógica de pontuação/progressão; remove o serve do próximo.
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
  v_result jsonb;
begin
  select * into v_run from public.retro_runs where id = p_run_id for update;
  if not found or not public.retro_run_owned(v_run, p_anon_token) then
    raise exception 'run não encontrada';
  end if;
  if v_run.status <> 'playing' then raise exception 'run já encerrada'; end if;

  select * into v_rm from public.retro_run_matches
   where run_id = v_run.id and slot = v_run.current_slot for update;
  if not found then raise exception 'jogo ainda não servido — chame retro_next'; end if;
  if v_rm.answered_at is not null then raise exception 'slot já respondido'; end if;

  select * into v_m from public.retro_matches where id = v_rm.match_id;

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

  v_need := case when v_run.mode = 'cravada' then 3 when v_run.current_slot >= 6 then 2 else 1 end;
  v_passed := case when v_run.mode = 'cravada' then v_type = 'cravada' else v_pts >= v_need end;

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
      v_stage_rank := v_run.current_slot - 2;
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
    -- avança o ponteiro; o jogo seguinte será servido por retro_next (sob demanda)
    update public.retro_runs set current_slot = current_slot + 1
     where id = v_run.id returning * into v_run;
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
    'next', null);
end $$;

-- Serve o jogo do slot atual quando o jogador pede (deadline nasce AGORA).
-- Idempotente: se o slot já foi servido e não respondido, devolve o mesmo payload
-- (duplo clique não re-sorteia nem renova o tempo).
create or replace function public.retro_next(
  p_run_id uuid,
  p_anon_token uuid default null,
  p_seen uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.retro_runs;
  v_exists boolean;
begin
  select * into v_run from public.retro_runs where id = p_run_id for update;
  if not found or not public.retro_run_owned(v_run, p_anon_token) then
    raise exception 'run não encontrada';
  end if;
  if v_run.status <> 'playing' then raise exception 'run já encerrada'; end if;

  select exists (select 1 from public.retro_run_matches
    where run_id = v_run.id and slot = v_run.current_slot) into v_exists;
  if not v_exists then
    if array_length(p_seen, 1) > 60 then p_seen := p_seen[1:60]; end if;
    perform public.retro_serve_slot(v_run, v_run.current_slot, p_seen);
  end if;
  return public.retro_match_payload(v_run, v_run.current_slot);
end $$;
revoke execute on function public.retro_next(uuid, uuid, uuid[]) from public;
grant execute on function public.retro_next(uuid, uuid, uuid[]) to anon, authenticated;
