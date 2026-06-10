-- ============================================================================
-- Resultadismo · Recorte de seleções do grupo EDITÁVEL até a Copa começar
-- ----------------------------------------------------------------------------
-- Pedido do João (2026-06-10): quem criou o grupo sem perceber o recorte
-- ("Todas" × "Só o Brasil" × escolhidas) pode AJUSTAR antes de a Copa começar.
-- Janela: enquanto NENHUM jogo da competição tiver iniciado (todos 'scheduled'
-- com kickoff futuro). Depois disso o recorte TRAVA — mudar no meio da Copa
-- retroagiria o ranking do grupo. (Palpites não entram na janela: são globais
-- por usuário e não são afetados pelo recorte; só a CONTAGEM do grupo muda.)
-- A RLS já restringe o UPDATE ao admin do grupo; o trigger adiciona a janela.
-- ============================================================================

-- Guarda: followed_team_slugs só muda antes do 1º jogo da competição começar.
create or replace function public.guard_team_scope_window()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.followed_team_slugs is distinct from old.followed_team_slugs then
    if exists (
      select 1 from public.matches m
      where m.competition_id = new.competition_id
        and m.hidden = false
        and (m.status <> 'scheduled' or m.kickoff_at <= now())
    ) then
      raise exception 'A competição já começou: o recorte de seleções do grupo está travado.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end; $$;
revoke all on function public.guard_team_scope_window() from public, anon;

drop trigger if exists trg_lc_team_scope_window on public.league_competitions;
create trigger trg_lc_team_scope_window
  before update of followed_team_slugs on public.league_competitions
  for each row execute function public.guard_team_scope_window();

-- Status da janela pro front (espelho; quem manda é o trigger).
create or replace function public.team_scope_window(p_lc_id uuid)
returns table (editable boolean, reason text)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_league_id uuid; v_competition_id uuid; v_started boolean;
begin
  select lc.league_id, lc.competition_id into v_league_id, v_competition_id
  from public.league_competitions lc where lc.id = p_lc_id;
  if v_league_id is null then return; end if;
  if not (public.is_app_admin() or public.is_league_member(v_league_id)) then return; end if;

  select exists (
    select 1 from public.matches m
    where m.competition_id = v_competition_id
      and m.hidden = false
      and (m.status <> 'scheduled' or m.kickoff_at <= now())
  ) into v_started;

  return query select (not v_started),
    case when v_started then 'A competição já começou: o recorte está travado.' else null end;
end; $$;
revoke all on function public.team_scope_window(uuid) from public, anon;
grant execute on function public.team_scope_window(uuid) to authenticated;
