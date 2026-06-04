-- ============================================================================
-- Resultadismo · Segurança (code review v2) · Pagamentos / reembolso
-- ----------------------------------------------------------------------------
-- C2: confirm_league_payment não tinha guarda de estado terminal — um evento
--     'paid' reentregue/fora de ordem DEPOIS de um reembolso reativava a federação
--     (dinheiro já devolvido + federação ativa de graça). Agora:
--       - trava a linha da liga (select ... for update) → serializa com o reembolso;
--       - uma vez 'refunded', NÃO volta para 'paid' (idempotente).
-- H3: simulate_league_payment (pagamento fake do modo teste) passa a exigir
--     is_app_admin() — no modo 'live' o front usa o checkout real; em test/dev só
--     admins simulam. Fecha o buraco de "modo teste em prod = federação grátis".
-- Medium: cupom (max_uses) contado de forma atômica (não estoura o limite).
-- Medium: league_payments.amount_cents >= 0.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- confirm_league_payment — guarda de estado terminal + lock da linha.
-- ---------------------------------------------------------------------------
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
  v_current public.payment_status;
begin
  if not public.can_settle_leagues() then
    raise exception 'Sem permissão para confirmar pagamento.';
  end if;

  -- trava a liga: serializa com reembolso concorrente / webhooks fora de ordem
  select owner_id, payment_status into v_owner, v_current
  from public.leagues where id = p_league_id
  for update;

  if v_owner is null then
    raise exception 'Liga % não encontrada.', p_league_id;
  end if;

  -- ESTADO TERMINAL: já reembolsada não volta a 'paid' (idempotente).
  -- Só registra o evento bruto p/ auditoria, sem reativar a federação.
  if v_current = 'refunded' and p_status = 'paid' then
    update public.league_payments
      set raw = coalesce(p_raw, raw), updated_at = now()
      where league_id = p_league_id and payment_id = p_payment_id;
    return;
  end if;

  -- registra/atualiza o pagamento (idempotente por provider+payment_id)
  insert into public.league_payments
    (league_id, user_id, payment_id, preference_id, external_reference,
     status, amount_cents, raw)
  values
    (p_league_id, v_owner, p_payment_id, p_preference_id, p_league_id::text,
     p_status, coalesce(p_amount_cents, 0), p_raw)
  on conflict (provider, payment_id) where payment_id is not null
  do update set status        = case
                                  when public.league_payments.status = 'refunded' and excluded.status = 'paid'
                                  then public.league_payments.status
                                  else excluded.status end,
                raw           = excluded.raw,
                amount_cents  = excluded.amount_cents,
                preference_id = coalesce(excluded.preference_id, public.league_payments.preference_id),
                updated_at    = now();

  -- reflete o status na federação:
  --   paid     → ativa (e manda o nome p/ revisão)
  --   refunded → arquiva (soft-delete) = reembolso/arrependimento
  update public.leagues
  set payment_status = case when v_current = 'refunded' and p_status = 'paid' then v_current else p_status end,
      status      = case
                      when p_status = 'paid' and v_current <> 'refunded' then 'active'
                      when p_status = 'refunded' then 'archived'
                      else status end,
      approved_at = case when p_status = 'paid' then coalesce(approved_at, now()) else approved_at end,
      name_approved = case when p_status = 'paid' and v_current <> 'refunded' then false else name_approved end,
      deleted_at  = case when p_status = 'refunded' then coalesce(deleted_at, now()) else deleted_at end
  where id = p_league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- simulate_league_payment — agora exige is_app_admin() (além do modo teste).
-- ---------------------------------------------------------------------------
create or replace function public.simulate_league_payment(
  p_league_id uuid,
  p_discount_code text default null
)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.leagues;
  v_owner uuid;
  v_mode public.payment_mode;
begin
  -- só administradores do app podem simular pagamento (evita "modo teste = grátis")
  if not public.is_app_admin() then
    raise exception 'Simulação de pagamento disponível apenas para administradores.';
  end if;

  select payment_mode into v_mode from public.app_settings where id = 1;
  if coalesce(v_mode, 'disabled') <> 'test' then
    raise exception 'Simulação disponível apenas no modo de teste.';
  end if;
  select owner_id into v_owner from public.leagues where id = p_league_id;
  if v_owner is null then
    raise exception 'Federação não encontrada.';
  end if;

  perform set_config('app.settle_bypass', '1', true);

  insert into public.league_payments
    (league_id, user_id, provider, payment_id, status, amount_cents, discount_code)
  values
    (p_league_id, v_owner, 'test', 'test-' || p_league_id::text, 'paid', 0,
     upper(nullif(trim(coalesce(p_discount_code, '')), '')))
  on conflict (provider, payment_id) where payment_id is not null
  do update set status = 'paid';

  update public.leagues
    set payment_status = 'paid', status = 'active', approved_at = coalesce(approved_at, now()),
        name_approved = false
    where id = p_league_id
  returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cupom: conta o uso de forma ATÔMICA — nunca passa de max_uses.
-- ---------------------------------------------------------------------------
create or replace function public.league_payments_count_discount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'paid' and new.discount_code is not null and not new.discount_counted then
    update public.discount_codes
      set used_count = used_count + 1
      where code = upper(new.discount_code)
        and (max_uses is null or used_count < max_uses);
    new.discount_counted := true;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Integridade: valor do pagamento não pode ser negativo.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'league_payments_amount_nonneg'
  ) then
    alter table public.league_payments
      add constraint league_payments_amount_nonneg check (amount_cents >= 0);
  end if;
end
$$;
