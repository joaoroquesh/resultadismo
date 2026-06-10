-- Retrô — rodada 7 (decisão do PO): SAIR de uma run em andamento ENCERRA a run.
-- O jogo atual vira W.O. (erro), a campanha fica como está (stage = onde parou) e
-- NÃO há retomada — na Copa do Dia, a pessoa perde o ranking do dia (a unicidade
-- 1/dia continua valendo: já jogou). A UI confirma antes (alerta só no daily).

create or replace function public.retro_abandon(
  p_run_id uuid,
  p_anon_token uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_run public.retro_runs;
  v_stage text; v_rank int;
begin
  select * into v_run from public.retro_runs where id = p_run_id for update;
  if not found or not public.retro_run_owned(v_run, p_anon_token) then
    raise exception 'run não encontrada';
  end if;
  if v_run.status <> 'playing' then raise exception 'run já encerrada'; end if;

  -- jogo atual (se servido e sem resposta) vira W.O.
  update public.retro_run_matches
     set answered_at = now(), is_timeout = true, score_type = 'erro', points = 0
   where run_id = v_run.id and slot = v_run.current_slot and answered_at is null;

  -- campanha para onde estava: eliminação na fase do slot atual
  if v_run.current_slot <= 3 then
    v_stage := 'Fase de grupos'; v_rank := 1;
  elsif v_run.current_slot < 7 then
    v_stage := public.retro_slot_label(v_run.current_slot); v_rank := v_run.current_slot - 2;
  else
    v_stage := 'Vice-campeão'; v_rank := 5;
  end if;

  update public.retro_runs
     set status = 'eliminated', stage_reached = v_stage, stage_rank = v_rank,
         finished_at = now(),
         total_ms = (select coalesce(sum(least(
                       extract(epoch from (rm.answered_at - rm.served_at)) * 1000,
                       coalesce(extract(epoch from (rm.deadline_at - rm.served_at)) * 1000 + 2000,
                                extract(epoch from (rm.answered_at - rm.served_at)) * 1000)
                     ))::bigint, 0)
                     from public.retro_run_matches rm
                     where rm.run_id = v_run.id and rm.answered_at is not null)
   where id = v_run.id returning * into v_run;

  if v_run.user_id is null then
    insert into public.retro_usage_daily as u (day, anon_runs_finished)
    values ((now() at time zone 'America/Sao_Paulo')::date, 1)
    on conflict (day) do update set anon_runs_finished = u.anon_runs_finished + 1;
  end if;

  return jsonb_build_object('status', v_run.status, 'stage_reached', v_run.stage_reached,
                            'points', v_run.points, 'share_code', v_run.share_code);
end $$;
revoke execute on function public.retro_abandon(uuid, uuid) from public;
grant execute on function public.retro_abandon(uuid, uuid) to anon, authenticated;
