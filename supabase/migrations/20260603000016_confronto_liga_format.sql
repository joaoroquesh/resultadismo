-- Liga: formato turno parcial (pré-sorteado) OU suíço progressivo.
--   'partial' (padrão): sorteia todas as rodadas de uma vez (turno parcial/completo).
--   'swiss': sorteia só a 1ª rodada; as próximas são geradas por classificação a
--            cada fase resolvida (pareando por pontos, evitando revanches).

alter table public.league_competitions
  add column if not exists liga_format text not null default 'partial'; -- 'partial' | 'swiss'

-- Acrescenta confrontos (próxima rodada do suíço). Só admin; só em disputa sorteada.
create or replace function public.append_confronto_ties(p_lc_id uuid, p_ties jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
  v_state text;
  v_n int;
begin
  select league_id, confronto_state into v_league, v_state
  from public.league_competitions where id = p_lc_id;
  if v_league is null then
    raise exception 'Disputa não encontrada.';
  end if;
  if not (public.is_league_admin(v_league) or public.is_app_admin()) then
    raise exception 'Apenas administradores da federação podem gerar rodadas.';
  end if;
  if v_state <> 'drawn' then
    raise exception 'A disputa não está em andamento.';
  end if;

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
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.append_confronto_ties(uuid, jsonb) from public, anon;
grant execute on function public.append_confronto_ties(uuid, jsonb) to authenticated;
