-- Resultadismo · Reembolso / direito de arrependimento (CDC art. 49)
-- ----------------------------------------------------------------------------
-- Fecha a lacuna do confirm_league_payment: quando um pagamento é REEMBOLSADO
-- ('refunded'), a federação deve ser ARQUIVADA (soft-delete), e não só marcada.
-- Vale para qualquer origem do reembolso: self-service (Edge Function), estorno
-- manual no painel do Mercado Pago (chega pela webhook) ou ação administrativa.
-- (Mantém o comportamento de 'paid' → ativa; demais status inalterados.)

create or replace function public.confirm_league_payment(
  p_league_id uuid,
  p_payment_id text,
  p_status public.payment_status,
  p_amount_cents int default null,
  p_preference_id text default null,
  p_raw jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  if not public.can_settle_leagues() then
    raise exception 'Sem permissão para confirmar pagamento.';
  end if;

  select owner_id into v_owner from public.leagues where id = p_league_id;
  if v_owner is null then
    raise exception 'Liga % não encontrada.', p_league_id;
  end if;

  -- registra/atualiza o pagamento (idempotente por provider+payment_id)
  insert into public.league_payments
    (league_id, user_id, payment_id, preference_id, external_reference,
     status, amount_cents, raw)
  values
    (p_league_id, v_owner, p_payment_id, p_preference_id, p_league_id::text,
     p_status, coalesce(p_amount_cents, 0), p_raw)
  on conflict (provider, payment_id) where payment_id is not null
  do update set status        = excluded.status,
                raw           = excluded.raw,
                amount_cents  = excluded.amount_cents,
                preference_id = coalesce(excluded.preference_id, league_payments.preference_id),
                updated_at    = now();

  -- reflete o status na federação:
  --   paid     → ativa
  --   refunded → arquiva (soft-delete) = reembolso/arrependimento
  update public.leagues
  set payment_status = p_status,
      status      = case
                      when p_status = 'paid' then 'active'
                      when p_status = 'refunded' then 'archived'
                      else status end,
      approved_at = case when p_status = 'paid' then coalesce(approved_at, now()) else approved_at end,
      deleted_at  = case when p_status = 'refunded' then coalesce(deleted_at, now()) else deleted_at end
  where id = p_league_id;
end;
$$;
