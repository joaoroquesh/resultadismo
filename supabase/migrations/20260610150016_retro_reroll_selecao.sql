-- Retrô — rodada 20 (bug do PO, 11/06):
-- REROLL na Seleção do Dia trocava por jogo de OUTRA seleção. Causa: o reroll no
-- daily forçava sorteio no catálogo INTEIRO e ainda excluía os 7 jogos do tema —
-- então o jogo novo nunca era da seleção do dia.
-- Correção: no reroll do daily, troca por OUTRO jogo da MESMA seleção temática
-- (excluindo os 7 do dia, pra não colidir com slots futuros, + os já vistos), com a
-- dificuldade mais próxima da do jogo original do slot (mantém a curva fácil→difícil).
-- Borda (decisão do PO): se a seleção ESGOTAR os jogos (ex.: Egito e Coreia do Norte
-- têm exatamente 7 — zero sobrando), cai num jogo aleatório do catálogo E o payload
-- marca `random_fallback` pro front mostrar um aviso ("acabaram os jogos dessa seleção").
-- De brinde, conserta um bug latente: antes, se o sorteio voltasse vazio, o slot
-- ficava com match_id NULL (quebrado) e a ficha já tinha sido gasta.

create or replace function public.retro_serve_slot(
  p_run public.retro_runs, p_slot int, p_seen uuid[], p_force_random boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_match uuid; v_timer int; v_daily uuid[]; v_exclude uuid[];
  v_team text; v_target int;
begin
  if p_run.is_daily and not p_force_random then
    -- daily normal: o jogo pré-montado do array do dia (igual pra todos)
    v_daily := public.retro_make_daily(p_run.daily_date);
    v_match := v_daily[p_slot];

  elsif p_run.is_daily then
    -- REROLL no daily: OUTRO jogo da MESMA seleção do dia (não do pool global).
    v_daily := public.retro_make_daily(p_run.daily_date);
    select coalesce(array_agg(match_id), '{}') into v_exclude
      from public.retro_run_matches where run_id = p_run.id;
    -- exclui os 7 do dia (pra não roubar um jogo de slot futuro) + os já vistos
    v_exclude := v_exclude || coalesce(v_daily, '{}') || coalesce(p_seen, '{}');
    select team_slug into v_team from public.retro_daily where daily_date = p_run.daily_date;
    select difficulty into v_target from public.retro_matches where id = v_daily[p_slot];
    select id into v_match from public.retro_matches
     where (home_slug = v_team or away_slug = v_team) and id <> all(v_exclude)
     order by abs(difficulty - coalesce(v_target, difficulty)), random()
     limit 1;
    -- seleção esgotada (ex.: só tinha 7 jogos): cai num aleatório do catálogo
    if v_match is null then
      v_match := public.retro_pick_match(p_slot, v_exclude, p_run.level);
    end if;

  else
    -- Jogo livre (treino): sorteio por dificuldade no catálogo todo (inalterado)
    select coalesce(array_agg(match_id), '{}') into v_exclude
      from public.retro_run_matches where run_id = p_run.id;
    v_exclude := v_exclude || coalesce(p_seen, '{}');
    v_match := public.retro_pick_match(p_slot, v_exclude, p_run.level);
  end if;

  v_timer := public.retro_timer_seconds(p_run.pace, p_slot);
  insert into public.retro_run_matches (run_id, slot, match_id, deadline_at)
  values (p_run.id, p_slot, v_match,
          case when v_timer is null then null else now() + make_interval(secs => v_timer + 1.5) end);
  update public.retro_matches set shown_count = shown_count + 1 where id = v_match;
end $$;
revoke execute on function public.retro_serve_slot(public.retro_runs, int, uuid[], boolean) from public, anon, authenticated;

-- reroll: além de gastar a ficha e re-servir, devolve `random_fallback` quando, no
-- daily, a seleção esgotou e o jogo novo veio de outra Copa (pro front avisar).
create or replace function public.retro_reroll(
  p_run_id uuid, p_anon_token uuid default null, p_seen uuid[] default '{}'
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_run public.retro_runs; v_rm public.retro_run_matches; v_fallback boolean := false;
begin
  select * into v_run from public.retro_runs where id = p_run_id for update;
  if not found or not public.retro_run_owned(v_run, p_anon_token) then raise exception 'run não encontrada'; end if;
  if v_run.status <> 'playing' then raise exception 'run já encerrada'; end if;
  if v_run.rerolls < 1 then raise exception 'sem fichas de troca — crave um placar para ganhar 🎲'; end if;
  select * into v_rm from public.retro_run_matches
   where run_id = v_run.id and slot = v_run.current_slot for update;
  if not found then raise exception 'jogo ainda não servido — chame retro_next'; end if;
  if v_rm.answered_at is not null then raise exception 'slot já respondido'; end if;

  update public.retro_runs set rerolls = rerolls - 1 where id = v_run.id returning * into v_run;
  delete from public.retro_run_matches where run_id = v_run.id and slot = v_run.current_slot;
  perform public.retro_serve_slot(v_run, v_run.current_slot,
                                  coalesce(p_seen, '{}') || v_rm.match_id, true);

  -- no daily: o jogo novo é de OUTRA seleção? então a seleção do dia esgotou (fallback)
  if v_run.is_daily then
    select not (m.home_slug = d.team_slug or m.away_slug = d.team_slug) into v_fallback
      from public.retro_run_matches rm
      join public.retro_matches m on m.id = rm.match_id
      join public.retro_daily d on d.daily_date = v_run.daily_date
     where rm.run_id = v_run.id and rm.slot = v_run.current_slot;
  end if;

  return public.retro_match_payload(v_run, v_run.current_slot)
         || jsonb_build_object('rerolls', v_run.rerolls, 'random_fallback', coalesce(v_fallback, false));
end $$;
revoke execute on function public.retro_reroll(uuid, uuid, uuid[]) from public;
grant execute on function public.retro_reroll(uuid, uuid, uuid[]) to anon, authenticated;
