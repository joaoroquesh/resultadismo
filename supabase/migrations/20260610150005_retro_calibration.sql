-- Retrô — calibragem da rodada 3 (feedback dos amigos do PO, 10/06):
-- 1) Semi e final estavam DIFÍCEIS demais: janelas de dificuldade descem um degrau
--    (SF 4-6 → 3-5 · F 5-7 → 4-6) e o mata-mata ganha peso pro lado fácil (40/35/25).
--    A barra de avanço (≥2 pts na semi/final, D3) fica como está — é o mecanismo de
--    raridade do título (alvo Q2: 5-10% de campeões); recalibrar de novo se preciso.
-- 2) Escudos demorando: o deadline ganha +1,5s de "respiro de leitura" no servidor —
--    o client mostra o confronto por ~1,2s (bandeiras pré-carregadas na home) antes
--    de rodar o cronômetro visual com o tempo nominal.

create or replace function public.retro_pick_match(p_slot int, p_exclude uuid[])
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_lo int; v_hi int; v_lvl int; v_r numeric; v_id uuid;
begin
  -- janelas por slot (rodada 3): G 1-3 · 8ª 2-4 · 4ª 3-5 · SF 3-5 · F 4-6
  select case when p_slot <= 3 then 1 when p_slot = 4 then 2 when p_slot in (5, 6) then 3 else 4 end,
         case when p_slot <= 3 then 3 when p_slot = 4 then 4 when p_slot in (5, 6) then 5 else 6 end
    into v_lo, v_hi;

  if random() < 0.10 then
    select id into v_id from public.retro_matches
     where (difficulty < v_lo or difficulty > v_hi) and id <> all(coalesce(p_exclude, '{}'))
     order by random() limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  -- nível primeiro: grupos 45/35/20; mata-mata 40/35/25 (sempre puxando pro fácil)
  v_r := random() * 100;
  if p_slot <= 3 then
    v_lvl := case when v_r < 45 then v_lo when v_r < 80 then v_lo + 1 else v_hi end;
  else
    v_lvl := case when v_r < 40 then v_lo when v_r < 75 then v_lo + 1 else v_hi end;
  end if;

  select id into v_id from public.retro_matches
   where difficulty = v_lvl and id <> all(coalesce(p_exclude, '{}'))
   order by random() limit 1;
  if v_id is null then
    select id into v_id from public.retro_matches
     where difficulty between v_lo and v_hi and id <> all(coalesce(p_exclude, '{}'))
     order by random() limit 1;
  end if;
  return v_id;
end $$;
revoke execute on function public.retro_pick_match(int, uuid[]) from public, anon, authenticated;

-- respiro de leitura: +1,5s no deadline do servidor (o tempo nominal exibido não muda)
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
          case when v_timer is null then null else now() + make_interval(secs => v_timer + 1.5) end);
  update public.retro_matches set shown_count = shown_count + 1 where id = v_match;
end $$;
revoke execute on function public.retro_serve_slot(public.retro_runs, int, uuid[]) from public, anon, authenticated;
