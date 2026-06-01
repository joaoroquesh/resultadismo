-- ============================================================================
-- Resultadismo · 21 · Configuração de pagamento (admin) + descontos + modo teste
-- ----------------------------------------------------------------------------
-- - app_settings: modo de pagamento (disabled/test/live) + preço, editável no admin
-- - discount_codes: cupons (% ou valor), usos/validade
-- - RPCs: admin_update_payment_settings, admin_comp_league (liberar grátis),
--         simulate_league_payment (modo teste, sem MP), validate_discount_code
-- - leagues_before_insert passa a respeitar o modo (disabled => federação gratuita)
-- - guard de status ganha bypass por GUC (setado só dentro de funções SECURITY DEFINER)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Configurações globais (singleton)
-- ---------------------------------------------------------------------------
create type public.payment_mode as enum ('disabled', 'test', 'live');

create table public.app_settings (
  id int primary key default 1,
  payment_mode public.payment_mode not null default 'test',
  league_price_cents int not null default 990,
  updated_at timestamptz not null default now(),
  constraint app_settings_singleton check (id = 1)
);

insert into public.app_settings (id, payment_mode, league_price_cents)
values (1, 'test', 990)
on conflict (id) do nothing;

alter table public.app_settings enable row level security;

-- Qualquer usuário logado lê (p/ saber o modo/preço); update só via RPC de admin.
create policy "app_settings_read" on public.app_settings
  for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Códigos de desconto
-- ---------------------------------------------------------------------------
create table public.discount_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  percent_off int,
  amount_off_cents int,
  max_uses int,
  used_count int not null default 0,
  active boolean not null default true,
  expires_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint discount_one_kind check (
    (percent_off is not null)::int + (amount_off_cents is not null)::int = 1
  ),
  constraint discount_percent_range check (percent_off is null or percent_off between 1 and 100),
  constraint discount_amount_pos check (amount_off_cents is null or amount_off_cents > 0)
);

create index discount_codes_code_idx on public.discount_codes (upper(code));

alter table public.discount_codes enable row level security;

-- Admin gerencia (CRUD). Usuários comuns validam um código via RPC (não leem a tabela).
create policy "discount_admin_all" on public.discount_codes
  for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- league_payments: registra o cupom usado + flag de contagem (idempotente)
-- ---------------------------------------------------------------------------
alter table public.league_payments add column if not exists discount_code text;
alter table public.league_payments add column if not exists discount_counted boolean not null default false;

-- Conta o uso do cupom exatamente uma vez, quando o pagamento vira 'paid'.
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
      where code = upper(new.discount_code);
    new.discount_counted := true;
  end if;
  return new;
end;
$$;

create trigger league_payments_discount_count
before insert or update on public.league_payments
for each row execute function public.league_payments_count_discount();

-- ---------------------------------------------------------------------------
-- Guard de status: bypass por GUC transacional (setado só dentro de SECURITY DEFINER).
-- Clientes não conseguem setar o GUC (set_config não é exposto via PostgREST).
-- ---------------------------------------------------------------------------
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
  end if;
  return new;
end;
$$;

-- Insert: respeita o modo de pagamento (disabled => federação gratuita, fluxo antigo).
create or replace function public.leagues_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode public.payment_mode;
begin
  if new.join_code is null then
    new.join_code := public.gen_join_code();
  end if;
  if not public.can_settle_leagues() then
    new.status := 'pending';
    select payment_mode into v_mode from public.app_settings where id = 1;
    if coalesce(v_mode, 'disabled') = 'disabled' then
      new.payment_status := 'none';    -- gratuito (aprovação do admin, como antes)
    else
      new.payment_status := 'pending'; -- exige pagamento (teste/Mercado Pago)
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: admin altera modo/preço de pagamento
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_payment_settings(
  p_mode public.payment_mode,
  p_price_cents int
)
returns public.app_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.app_settings;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem alterar o pagamento.';
  end if;
  update public.app_settings
    set payment_mode = p_mode,
        league_price_cents = greatest(0, coalesce(p_price_cents, league_price_cents)),
        updated_at = now()
    where id = 1
  returning * into v_row;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: admin libera (comp) uma federação sem pagamento
-- ---------------------------------------------------------------------------
create or replace function public.admin_comp_league(p_league_id uuid)
returns public.leagues
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.leagues;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem liberar federações.';
  end if;
  insert into public.league_payments (league_id, user_id, provider, payment_id, status, amount_cents)
  select p_league_id, l.owner_id, 'comp', 'comp-' || p_league_id::text, 'paid', 0
  from public.leagues l where l.id = p_league_id
  on conflict (provider, payment_id) where payment_id is not null do nothing;
  update public.leagues
    set payment_status = 'paid', status = 'active',
        approved_at = coalesce(approved_at, now()), approved_by = auth.uid()
    where id = p_league_id
  returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: simular pagamento (MODO TESTE) — sem Mercado Pago. Dono ou admin.
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

  perform set_config('app.settle_bypass', '1', true); -- libera o guard nesta transação

  insert into public.league_payments
    (league_id, user_id, provider, payment_id, status, amount_cents, discount_code)
  values
    (p_league_id, v_owner, 'test', 'test-' || p_league_id::text, 'paid', 0,
     upper(nullif(trim(coalesce(p_discount_code, '')), '')))
  on conflict (provider, payment_id) where payment_id is not null
  do update set status = 'paid';

  update public.leagues
    set payment_status = 'paid', status = 'active', approved_at = coalesce(approved_at, now())
    where id = p_league_id
  returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: validar um código de desconto (preview, não consome) — usuário logado
-- ---------------------------------------------------------------------------
create or replace function public.validate_discount_code(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.discount_codes;
begin
  select * into v from public.discount_codes where code = upper(trim(p_code)) limit 1;
  if v.id is null then
    return jsonb_build_object('valid', false, 'reason', 'Código não encontrado.');
  end if;
  if not v.active then
    return jsonb_build_object('valid', false, 'reason', 'Código inativo.');
  end if;
  if v.expires_at is not null and v.expires_at < now() then
    return jsonb_build_object('valid', false, 'reason', 'Código expirado.');
  end if;
  if v.max_uses is not null and v.used_count >= v.max_uses then
    return jsonb_build_object('valid', false, 'reason', 'Código esgotado.');
  end if;
  return jsonb_build_object(
    'valid', true,
    'code', v.code,
    'percent_off', v.percent_off,
    'amount_off_cents', v.amount_off_cents
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.admin_update_payment_settings(public.payment_mode, int) from public, anon;
revoke all on function public.admin_comp_league(uuid) from public, anon;
revoke all on function public.simulate_league_payment(uuid, text) from public, anon;
grant execute on function public.admin_update_payment_settings(public.payment_mode, int) to authenticated;
grant execute on function public.admin_comp_league(uuid) to authenticated;
grant execute on function public.simulate_league_payment(uuid, text) to authenticated;
grant execute on function public.validate_discount_code(text) to authenticated;
