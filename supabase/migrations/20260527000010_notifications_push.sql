-- ============================================================================
-- Resultadismo · 10 · Notificações in-app + Web Push + Cutucar
-- ============================================================================

-- ---------------------------------------------------------------------------
-- notifications (in-app)
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,              -- 'nudge' | 'result' | 'deadline' | ...
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- push_subscriptions (Web Push)
-- ---------------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_manage_own" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Cutucar: cria uma notificação para um membro da mesma liga
-- ---------------------------------------------------------------------------
create or replace function public.nudge_member(p_league_id uuid, p_to_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from_name text;
  v_league_name text;
begin
  if not public.is_league_member(p_league_id) then
    raise exception 'Você não é membro desta liga.';
  end if;
  if not exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = p_to_user and status = 'active'
  ) then
    raise exception 'Destinatário não está nesta liga.';
  end if;

  -- anti-spam: 1 cutucada por par a cada 30 min
  if exists (
    select 1 from public.notifications
    where user_id = p_to_user and type = 'nudge'
      and (data ->> 'from') = auth.uid()::text
      and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'Você já cutucou essa pessoa há pouco. Calma! 😄';
  end if;

  select display_name into v_from_name from public.profiles where id = auth.uid();
  select name into v_league_name from public.leagues where id = p_league_id;

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_to_user, 'nudge', 'Cutucada! 👉',
    coalesce(v_from_name, 'Alguém') || ' tá esperando seu palpite em ' || coalesce(v_league_name, 'sua liga'),
    jsonb_build_object('from', auth.uid()::text, 'league_id', p_league_id)
  );
end;
$$;

grant execute on function public.nudge_member(uuid, uuid) to authenticated;

alter publication supabase_realtime add table public.notifications;
