-- ============================================================================
-- Resultadismo · Grupos só com a Copa (por enquanto) + Amistosos só no público
-- ----------------------------------------------------------------------------
-- Decisões do João (2026-06-09):
--   • Só a Copa do Mundo pode ser competição de GRUPO agora (travada, sem remover);
--     todo grupo já nasce com ela.
--   • Amistosos Internacionais seguem palpitáveis no feed PÚBLICO, mas NÃO entram
--     em grupo.
--   • Os demais campeonatos voltam a rascunho (despublicados) por ora — reversível,
--     nada é apagado.
-- Segurança no banco (triggers em league_competitions); o front só espelha.
-- ============================================================================

-- 1) Flag: que competição pode ser competição de GRUPO. Só a Copa, por agora.
alter table public.competitions
  add column if not exists group_eligible boolean not null default false;

comment on column public.competitions.group_eligible is
  'Pode ser competição de um grupo. Hoje só a Copa do Mundo. Liberar mais campeonatos = virar a flag.';

-- Marca a Copa do Mundo (mesma heurística do front: findWorldCupCompetition).
update public.competitions set group_eligible = true
where upper(coalesce(provider_code, '')) in ('WC', '4429')
   or lower(coalesce(display_name, '') || ' ' || coalesce(name, '')) like '%copa do mundo%'
   or lower(coalesce(display_name, '') || ' ' || coalesce(name, '')) like '%world cup%';

-- 2) Publicação: só Copa (grupos + público) e Amistosos (palpite público) ficam no ar.
--    Despublica os demais (reversível; nenhuma linha é apagada).
update public.competitions set is_published = false
where status = 'active'
  and group_eligible = false
  and lower(coalesce(provider_code, '')) <> 'fifa.friendly'
  and lower(coalesce(display_name, '') || ' ' || coalesce(name, '')) not like '%amistoso%';

update public.competitions set is_published = true
where status = 'active'
  and ( group_eligible = true
     or lower(coalesce(provider_code, '')) = 'fifa.friendly'
     or lower(coalesce(display_name, '') || ' ' || coalesce(name, '')) like '%amistoso%' );

-- 3) Trigger (INSERT): só competição group_eligible entra num grupo.
create or replace function public.enforce_group_eligible_competition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_ok boolean;
begin
  select group_eligible into v_ok from public.competitions where id = new.competition_id;
  if not coalesce(v_ok, false) then
    raise exception 'Por enquanto, só a Copa do Mundo pode ser competição de um grupo.'
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;
revoke all on function public.enforce_group_eligible_competition() from public, anon;

drop trigger if exists trg_lc_group_eligible on public.league_competitions;
create trigger trg_lc_group_eligible
  before insert on public.league_competitions
  for each row execute function public.enforce_group_eligible_competition();

-- 4) Trigger (DELETE): a Copa é a base do grupo e não sai enquanto o grupo estiver
--    ativo (deleted_at is null). Em teardown da liga (soft-delete com deleted_at, ou
--    liga já removida) permite — não trava remoção legítima.
create or replace function public.protect_mandatory_group_competition()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_mandatory boolean; v_active boolean;
begin
  -- Protege só o BOLÃO base (mode points/table). Disputas de Confronto
  -- (mode liga/cup) também apontam pra Copa e continuam removíveis.
  if old.mode not in ('points', 'table') then
    return old;
  end if;
  select group_eligible into v_mandatory from public.competitions where id = old.competition_id;
  select (deleted_at is null) into v_active from public.leagues where id = old.league_id;
  if coalesce(v_mandatory, false) and coalesce(v_active, false) then
    raise exception 'A Copa do Mundo é a competição base do grupo e não pode ser removida.'
      using errcode = 'check_violation';
  end if;
  return old;
end; $$;
revoke all on function public.protect_mandatory_group_competition() from public, anon;

drop trigger if exists trg_lc_protect_mandatory on public.league_competitions;
create trigger trg_lc_protect_mandatory
  before delete on public.league_competitions
  for each row execute function public.protect_mandatory_group_competition();
