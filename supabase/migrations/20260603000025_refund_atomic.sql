-- ============================================================================
-- Resultadismo · Segurança (code review v2) · Reembolso atômico
-- ----------------------------------------------------------------------------
-- O reembolso fazia 2 updates soltos (league_payments + leagues) sem serialização.
-- refund_league trava a liga (for update), re-checa o estado e aplica tudo numa
-- transação só — idempotente (só refunda quem está 'paid'). Preserva o `raw` do
-- pagamento (ao contrário de reusar confirm_league_payment). A devolução no
-- Mercado Pago continua na Edge Function (com X-Idempotency-Key).
-- ============================================================================

create or replace function public.refund_league(p_league_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.payment_status;
begin
  if not public.can_settle_leagues() then
    raise exception 'Sem permissão para reembolsar.';
  end if;

  select payment_status into v_current
  from public.leagues where id = p_league_id
  for update;

  if v_current is distinct from 'paid' then
    return false; -- já reembolsada / não paga (idempotente)
  end if;

  update public.league_payments
     set status = 'refunded', updated_at = now()
   where league_id = p_league_id and status = 'paid';

  update public.leagues
     set payment_status = 'refunded',
         status = 'archived',
         deleted_at = coalesce(deleted_at, now())
   where id = p_league_id;

  return true;
end;
$$;

revoke all on function public.refund_league(uuid) from public, anon, authenticated;
grant execute on function public.refund_league(uuid) to service_role;
