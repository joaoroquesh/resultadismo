-- ============================================================================
-- Resultadismo · Segurança na exclusão/despublicação de competições EM USO
-- ----------------------------------------------------------------------------
-- Causa-raiz do incidente: admin_delete_competition fazia `delete from
-- competitions` direto. A cascata (on delete cascade) levou junto matches →
-- predictions (palpites + pontos) → league_competitions (link do grupo) →
-- cup_ties. Irreversível sem backup.
--
-- Proteção (3ª confirmação): para EXCLUIR — ou DESPUBLICAR — uma competição
-- EM USO (tem palpites e/ou é usada por algum grupo), agora é OBRIGATÓRIO passar
-- o nome EXATO da competição em p_confirm_name. Sem isso, a RPC recusa. Como a
-- defesa é no banco (SECURITY DEFINER), protege mesmo que a UI falhe.
-- ============================================================================

-- Quanto a competição é usada (pra UI avisar + saber se exige o nome digitado).
create or replace function public.admin_competition_usage(p_id uuid)
returns table (name text, matches int, predictions int, groups int, in_use boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_name text; v_matches int; v_preds int; v_groups int;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem consultar uso de competições.';
  end if;
  select c.name into v_name from public.competitions c where c.id = p_id;
  select count(*)::int into v_matches from public.matches m where m.competition_id = p_id;
  select count(*)::int into v_preds
    from public.predictions pr join public.matches m on m.id = pr.match_id
    where m.competition_id = p_id;
  select count(*)::int into v_groups from public.league_competitions lc where lc.competition_id = p_id;
  return query select v_name, v_matches, v_preds, v_groups, (v_preds > 0 or v_groups > 0);
end;
$$;
revoke all on function public.admin_competition_usage(uuid) from public, anon;
grant execute on function public.admin_competition_usage(uuid) to authenticated;

-- ---- EXCLUSÃO com 3ª confirmação por nome quando EM USO ----
-- DROP da assinatura antiga (uuid) — senão CREATE OR REPLACE viraria overload e
-- a versão sem guarda continuaria chamável.
drop function if exists public.admin_delete_competition(uuid);
create function public.admin_delete_competition(p_id uuid, p_confirm_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text; v_preds int; v_groups int;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem excluir competições.';
  end if;
  select name into v_name from public.competitions where id = p_id;
  if v_name is null then raise exception 'Competição não encontrada.'; end if;

  select count(*) into v_preds
    from public.predictions pr join public.matches m on m.id = pr.match_id
    where m.competition_id = p_id;
  select count(*) into v_groups from public.league_competitions where competition_id = p_id;

  if (v_preds > 0 or v_groups > 0)
     and (p_confirm_name is null or btrim(p_confirm_name) <> btrim(v_name)) then
    raise exception
      'Competição EM USO (% palpite(s), % grupo(s)). Excluir apaga TUDO em cascata. Para confirmar, digite o nome exato: "%".',
      v_preds, v_groups, v_name;
  end if;

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'competition_delete', 'competition', p_id,
          jsonb_build_object('name', v_name, 'predictions', v_preds, 'groups', v_groups));

  delete from public.competitions where id = p_id;
end;
$$;
revoke all on function public.admin_delete_competition(uuid, text) from public, anon;
grant execute on function public.admin_delete_competition(uuid, text) to authenticated;

-- ---- DESPUBLICAÇÃO com 3ª confirmação por nome quando EM USO (publicar é livre) ----
drop function if exists public.admin_set_competition_published(uuid, boolean);
create function public.admin_set_competition_published(p_id uuid, p_value boolean, p_confirm_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text; v_preds int; v_groups int;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem publicar competições.';
  end if;
  select name into v_name from public.competitions where id = p_id;
  if v_name is null then raise exception 'Competição não encontrada.'; end if;

  if p_value = false then -- só DESPUBLICAR exige confirmação
    select count(*) into v_preds
      from public.predictions pr join public.matches m on m.id = pr.match_id
      where m.competition_id = p_id;
    select count(*) into v_groups from public.league_competitions where competition_id = p_id;
    if (v_preds > 0 or v_groups > 0)
       and (p_confirm_name is null or btrim(p_confirm_name) <> btrim(v_name)) then
      raise exception
        'Competição EM USO (% palpite(s), % grupo(s)). Para DESPUBLICAR, digite o nome exato: "%".',
        v_preds, v_groups, v_name;
    end if;
  end if;

  update public.competitions set is_published = p_value where id = p_id;
end;
$$;
revoke all on function public.admin_set_competition_published(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_competition_published(uuid, boolean, text) to authenticated;
