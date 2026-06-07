-- ============================================================================
-- Resultadismo · Fim da cascata destrutiva ao excluir competição
-- ----------------------------------------------------------------------------
-- Incidente: excluir uma competição apagava em cascata matches → PALPITES →
-- pontos → league_competitions (uso em grupo). Irreversível sem backup.
--
-- Novo modelo (defesa no banco, não só na RPC):
--   • predictions → matches  : CASCADE → RESTRICT  (palpite é dado precioso: bloqueia)
--   • league_competitions → competitions : CASCADE → RESTRICT (uso em grupo: bloqueia)
--   • matches → competitions : continua CASCADE (jogo é descartável/re-sincronizável)
--
-- Efeito ao `delete from competitions`:
--   - tem palpite ou está em grupo → o banco RECUSA (RESTRICT). Pra excluir, o
--     admin limpa manualmente os vínculos no Supabase (como o João pediu).
--   - sem palpite e sem grupo → os jogos (descartáveis) saem em cascata e a
--     competição é removida.
-- 100% aditivo em dados (só troca a AÇÃO do FK; nenhuma linha é apagada aqui).
-- ============================================================================

-- palpites: bloqueiam a remoção do jogo (e, por consequência, da competição)
alter table public.predictions drop constraint if exists predictions_match_id_fkey;
alter table public.predictions
  add constraint predictions_match_id_fkey
  foreign key (match_id) references public.matches (id) on delete restrict;

-- uso em grupo: bloqueia a remoção da competição
alter table public.league_competitions drop constraint if exists league_competitions_competition_id_fkey;
alter table public.league_competitions
  add constraint league_competitions_competition_id_fkey
  foreign key (competition_id) references public.competitions (id) on delete restrict;

-- (matches → competitions segue CASCADE; match_sources/cup_ties seguem CASCADE — descartáveis)

-- ---- admin_delete_competition: bloqueia EM USO com mensagem clara ----
create or replace function public.admin_delete_competition(p_id uuid, p_confirm_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text; v_preds int; v_groups int; v_matches int;
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
  select count(*) into v_matches from public.matches where competition_id = p_id;

  -- Dado precioso (palpites ou uso em grupo): NÃO apaga em cascata. Bloqueia.
  if v_preds > 0 or v_groups > 0 then
    raise exception
      'Competição EM USO: % palpite(s) e % grupo(s) vinculados. Por segurança ela NÃO é apagada em cascata. Limpe os vínculos no Supabase (remova do(s) grupo(s) e/ou apague os palpites) antes de excluir.',
      v_preds, v_groups
      using errcode = 'raise_exception';
  end if;

  -- Só jogos sincronizados (descartáveis), sem palpite/grupo: confirma pelo nome.
  if v_matches > 0 and (p_confirm_name is null or btrim(p_confirm_name) <> btrim(v_name)) then
    raise exception
      'Competição com % jogo(s) sincronizado(s) (sem palpites/grupos). Os jogos saem junto. Para confirmar, digite o nome exato: "%".',
      v_matches, v_name;
  end if;

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'competition_delete', 'competition', p_id,
          jsonb_build_object('name', v_name, 'matches', v_matches));

  delete from public.competitions where id = p_id;
end;
$$;
revoke all on function public.admin_delete_competition(uuid, text) from public, anon;
grant execute on function public.admin_delete_competition(uuid, text) to authenticated;
