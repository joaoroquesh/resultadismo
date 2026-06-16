-- ============================================================================
-- Resultadismo · Sync — resiliência (anti-spam) + conflito resolvido = encerrado
-- ----------------------------------------------------------------------------
-- ADITIVO. (1) sync_fail_streak: só alertar/notificar quando a falha for
-- SUSTENTADA (a Edge usa o streak; blip transitório não vira alerta). (2)
-- Resolver manualmente (Definir placar / Travar) ENCERRA o conflito: zera
-- score_conflict e marca como resolvidos os alertas score_conflict pendentes
-- daquele jogo — sem o admin precisar "Marcar resolvido".
-- ============================================================================

alter table public.competitions
  add column if not exists sync_fail_streak int not null default 0;

comment on column public.competitions.sync_fail_streak is
  'Ciclos de sync consecutivos sem NENHUMA fonte entregar dados. A Edge só alerta/'
  'notifica quando passa do limiar (anti-spam de falha intermitente); zera ao voltar.';

-- ---------------------------------------------------------------------------
-- admin_override_match — agora ENCERRA o conflito: zera score_conflict e
-- resolve os alertas score_conflict pendentes do jogo. (decisão #8 + pedido João)
-- ---------------------------------------------------------------------------
create or replace function public.admin_override_match(
  p_match_id uuid,
  p_home_score int,
  p_away_score int,
  p_status text default null,
  p_lock boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.match_status;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem editar jogos.';
  end if;
  if p_status is not null then
    v_status := p_status::public.match_status;
  end if;

  update public.matches
    set home_score = p_home_score,
        away_score = p_away_score,
        status = coalesce(v_status, status),
        manual_lock = coalesce(p_lock, true),
        score_conflict = false,            -- resolvido na mão = sem divergência
        manually_edited_at = now(),
        manually_edited_by = auth.uid(),
        last_synced_at = now()
    where id = p_match_id;

  -- encerra os avisos de conflito pendentes deste jogo (caso encerrado)
  update public.sync_alerts
    set status = 'applied', resolved_at = now()
    where match_id = p_match_id and kind = 'score_conflict' and status = 'pending';

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'match_override', 'match', p_match_id,
          jsonb_build_object('home', p_home_score, 'away', p_away_score,
                             'status', p_status, 'lock', coalesce(p_lock, true)));
end;
$$;
revoke all on function public.admin_override_match(uuid, int, int, text, boolean) from public, anon;
grant execute on function public.admin_override_match(uuid, int, int, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- admin_set_match_lock — ao TRAVAR, também encerra o conflito (zera
-- score_conflict + resolve alertas pendentes). Destravar não mexe nisso (a
-- API/golden volta a decidir).
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_match_lock(p_match_id uuid, p_locked boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem travar jogos.';
  end if;
  update public.matches
    set manual_lock = coalesce(p_locked, false),
        score_conflict = case when p_locked then false else score_conflict end,
        manually_edited_at = case when p_locked then now() else manually_edited_at end,
        manually_edited_by = case when p_locked then auth.uid() else manually_edited_by end
    where id = p_match_id;

  if p_locked then
    update public.sync_alerts
      set status = 'applied', resolved_at = now()
      where match_id = p_match_id and kind = 'score_conflict' and status = 'pending';
  end if;

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'match_lock', 'match', p_match_id, jsonb_build_object('locked', p_locked));
end;
$$;
revoke all on function public.admin_set_match_lock(uuid, boolean) from public, anon;
grant execute on function public.admin_set_match_lock(uuid, boolean) to authenticated;
