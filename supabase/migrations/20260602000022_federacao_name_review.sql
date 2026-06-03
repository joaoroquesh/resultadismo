-- ============================================================================
-- Resultadismo · 24 · Moderação só do NOME da federação
-- ----------------------------------------------------------------------------
-- Pagou → federação ativa NA HORA (já era). Agora: o NOME entra em revisão do
-- admin (name_approved = false). A federação funciona normal; só o nome fica
-- "pendente de aprovação" (disclaimer pro dono + lista no admin). Admin que
-- libera (comp) não cai em revisão (já confiou no nome).
-- ============================================================================

alter table public.leagues
  add column if not exists name_approved boolean not null default true;

-- Guard: só app_admin / service_role / contexto de liquidação muda status, pagamento E o name_approved.
create or replace function public.leagues_guard_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_settle_leagues()
     and coalesce(current_setting('app.settle_bypass', true), '') <> '1' then
    new.status := old.status;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.payment_status := old.payment_status;
    new.name_approved := old.name_approved;
  end if;
  return new;
end;
$$;

-- confirm_league_payment: ao confirmar pago, ativa E manda o nome p/ revisão.
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

  update public.leagues
  set payment_status = p_status,
      status      = case when p_status = 'paid' then 'active' else status end,
      approved_at = case when p_status = 'paid' then coalesce(approved_at, now()) else approved_at end,
      name_approved = case when p_status = 'paid' then false else name_approved end
  where id = p_league_id;
end;
$$;

-- simulate_league_payment (modo teste): mesmo comportamento — nome vai p/ revisão.
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
  select payment_mode into v_mode from public.app_settings where id = 1;
  if coalesce(v_mode, 'disabled') <> 'test' then
    raise exception 'Simulação disponível apenas no modo de teste.';
  end if;
  select owner_id into v_owner from public.leagues where id = p_league_id;
  if v_owner is null then
    raise exception 'Federação não encontrada.';
  end if;
  if v_owner <> auth.uid() and not public.is_app_admin() then
    raise exception 'Você não é o dono desta federação.';
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

-- RPC: admin aprova o nome de uma federação (tira o disclaimer).
create or replace function public.admin_approve_league_name(p_league_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem aprovar nomes.';
  end if;
  update public.leagues set name_approved = true where id = p_league_id;
end;
$$;

revoke all on function public.admin_approve_league_name(uuid) from public, anon;
grant execute on function public.admin_approve_league_name(uuid) to authenticated;
