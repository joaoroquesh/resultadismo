-- ============================================================================
-- Resultadismo · Gestão do Bolão (caixinha organizada PELO grupo) — ADR 0008
-- ----------------------------------------------------------------------------
-- Decisão do João (2026-06-10): o app NÃO recebe, NÃO guarda e NÃO repassa
-- dinheiro. É ferramenta de ORGANIZAÇÃO do bolão que os grupos já fazem por
-- fora: o admin registra o valor combinado, marca quem pagou e o app calcula
-- o rateio (1º/2º/3º). Trava manual: o DONO congela/descongela as definições.
-- Visível só para membros do grupo. Termos atualizados na mesma mudança.
-- ============================================================================

-- 1) Definições do bolão no próprio league_competition (o bolão base do grupo).
alter table public.league_competitions
  add column if not exists pot_enabled boolean not null default false,
  add column if not exists pot_entry_cents int check (pot_entry_cents is null or pot_entry_cents > 0),
  add column if not exists pot_split jsonb,
  add column if not exists pot_locked boolean not null default false;

comment on column public.league_competitions.pot_entry_cents is
  'Valor combinado por pessoa (organização interna do grupo; o app não movimenta dinheiro).';
comment on column public.league_competitions.pot_split is
  'Rateio em % por colocação, ex {"1":60,"2":30,"3":10}. Soma <= 100; sobra fica no caixa do grupo.';

-- 2) Quem o admin marcou como pagante (registro, não transação).
create table if not exists public.league_pot_payers (
  id uuid primary key default gen_random_uuid(),
  lc_id uuid not null references public.league_competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz not null default now(),
  unique (lc_id, user_id)
);
create index if not exists league_pot_payers_lc_idx on public.league_pot_payers (lc_id);

alter table public.league_pot_payers enable row level security;

-- membro do grupo vê (transparência); admin do grupo marca/desmarca.
create policy "pot_payers_select_member" on public.league_pot_payers
for select using (
  exists (
    select 1 from public.league_competitions lc
    where lc.id = lc_id and (public.is_league_member(lc.league_id) or public.is_app_admin())
  )
);
create policy "pot_payers_write_admin" on public.league_pot_payers
for all using (
  exists (
    select 1 from public.league_competitions lc
    where lc.id = lc_id and (public.is_league_admin(lc.league_id) or public.is_app_admin())
  )
) with check (
  exists (
    select 1 from public.league_competitions lc
    where lc.id = lc_id and (public.is_league_admin(lc.league_id) or public.is_app_admin())
  )
);

-- 3) Trava manual do DONO: com pot_locked, definições e pagantes congelam.
--    Mudar o próprio pot_locked é exclusivo do dono do grupo (ou app_admin).
create or replace function public.guard_pot_settings()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_owner uuid;
begin
  if new.pot_locked is distinct from old.pot_locked then
    select l.owner_id into v_owner from public.leagues l where l.id = new.league_id;
    if not (v_owner = auth.uid() or public.is_app_admin()) then
      raise exception 'Só o dono do grupo trava ou destrava a Gestão do Bolão.'
        using errcode = 'check_violation';
    end if;
  end if;
  if old.pot_locked and new.pot_locked and (
       new.pot_enabled is distinct from old.pot_enabled
    or new.pot_entry_cents is distinct from old.pot_entry_cents
    or new.pot_split is distinct from old.pot_split
  ) then
    raise exception 'A Gestão do Bolão está travada pelo dono do grupo.'
      using errcode = 'check_violation';
  end if;
  return new;
end; $$;
revoke all on function public.guard_pot_settings() from public, anon;

drop trigger if exists trg_lc_pot_guard on public.league_competitions;
create trigger trg_lc_pot_guard
  before update of pot_enabled, pot_entry_cents, pot_split, pot_locked
  on public.league_competitions
  for each row execute function public.guard_pot_settings();

create or replace function public.guard_pot_payers_lock()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_locked boolean;
begin
  select pot_locked into v_locked from public.league_competitions
  where id = coalesce(new.lc_id, old.lc_id);
  if coalesce(v_locked, false) then
    raise exception 'A Gestão do Bolão está travada pelo dono do grupo.'
      using errcode = 'check_violation';
  end if;
  return coalesce(new, old);
end; $$;
revoke all on function public.guard_pot_payers_lock() from public, anon;

drop trigger if exists trg_pot_payers_lock on public.league_pot_payers;
create trigger trg_pot_payers_lock
  before insert or update or delete on public.league_pot_payers
  for each row execute function public.guard_pot_payers_lock();
