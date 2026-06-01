-- ============================================================================
-- Resultadismo · 20 · Pagamento de criação de ligas (Mercado Pago / Pix)
-- ----------------------------------------------------------------------------
-- Cobrança ÚNICA por liga criada. Fluxo:
--   1) usuário cria a liga      → status 'pending', payment_status 'pending'
--   2) Edge Function 'create-league-checkout' gera a preferência no Mercado Pago
--   3) usuário paga (Pix/cartão) no checkout hospedado do Mercado Pago
--   4) Edge Function 'mercadopago-webhook' confirma e chama confirm_league_payment,
--      que ativa a liga (status 'active', payment_status 'paid')
-- Segurança: só app_admin OU o service_role (a webhook) podem ativar/pagar liga.
-- ============================================================================

create type public.payment_status as enum ('none', 'pending', 'paid', 'failed', 'refunded');

-- Ligas já existentes ficam como 'none' (não exigem pagamento — grandfathering).
alter table public.leagues
  add column if not exists payment_status public.payment_status not null default 'none';

-- ---------------------------------------------------------------------------
-- league_payments — trilha de auditoria + idempotência por payment_id
-- ---------------------------------------------------------------------------
create table public.league_payments (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null default 'mercadopago',
  preference_id text,
  payment_id text,
  external_reference text,
  status public.payment_status not null default 'pending',
  amount_cents int not null default 0,
  currency text not null default 'BRL',
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index league_payments_league_idx on public.league_payments (league_id);
create index league_payments_user_idx on public.league_payments (user_id);
-- idempotência: um pagamento (provider+payment_id) entra uma única vez
create unique index league_payments_payment_uq
  on public.league_payments (provider, payment_id)
  where payment_id is not null;

create trigger league_payments_set_updated_at
before update on public.league_payments
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Quem pode liquidar (ativar/pagar) uma liga: app_admin OU service_role (webhook)
-- ---------------------------------------------------------------------------
create or replace function public.can_settle_leagues()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_app_admin() or coalesce(auth.role(), '') = 'service_role';
$$;

-- Reforço no INSERT: cliente comum não nasce já pago/ativo (força pending/pending).
-- (substitui o trigger de geração de join_code da migration 03, agora com a trava)
create or replace function public.leagues_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.join_code is null then
    new.join_code := public.gen_join_code();
  end if;
  if not public.can_settle_leagues() then
    new.status := 'pending';
    new.payment_status := 'pending';
  end if;
  return new;
end;
$$;

-- Reforço no UPDATE: protege status/aprovação E payment_status de não-privilegiados.
-- (substitui o guard da migration 05, somando a proteção do payment_status)
create or replace function public.leagues_guard_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_settle_leagues() then
    new.status := old.status;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.payment_status := old.payment_status;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- confirm_league_payment — chamada pela webhook (service_role). Idempotente.
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

  -- reflete o status na liga (ativa apenas quando 'paid')
  update public.leagues
  set payment_status = p_status,
      status      = case when p_status = 'paid' then 'active' else status end,
      approved_at = case when p_status = 'paid' then coalesce(approved_at, now()) else approved_at end
  where id = p_league_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS de league_payments (dono lê os seus; escrita só service_role, que bypassa)
-- ---------------------------------------------------------------------------
alter table public.league_payments enable row level security;

create policy "league_payments_select_own" on public.league_payments
  for select to authenticated
  using (user_id = auth.uid() or public.is_app_admin());

-- ---------------------------------------------------------------------------
-- Permissões
-- ---------------------------------------------------------------------------
revoke all on function public.confirm_league_payment(uuid, text, public.payment_status, int, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.confirm_league_payment(uuid, text, public.payment_status, int, text, jsonb)
  to service_role;

-- ---------------------------------------------------------------------------
-- Higiene: purga ligas não pagas e abandonadas (pending há > 24h, sem pagamento)
-- (no-op se pg_cron não existir — mesmo padrão da migration 19)
-- ---------------------------------------------------------------------------
do $$
begin
  perform cron.schedule(
    'resultadismo-purge-unpaid-leagues',
    '17 * * * *',
    $cron$delete from public.leagues l
          where l.payment_status = 'pending'
            and l.status = 'pending'
            and l.created_at < now() - interval '24 hours'
            and not exists (
              select 1 from public.league_payments p
              where p.league_id = l.id and p.status = 'paid'
            );$cron$
  );
exception when others then
  raise notice 'cron purge-unpaid-leagues indisponível: %', sqlerrm;
end $$;
