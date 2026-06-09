-- Favoritar Resultadistas: quem você marca aparece FIXADO no topo das listas
-- de "quem já palpitou" / "palpites da galera". Auto-gerido (RLS self).
create table public.user_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  fav_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, fav_user_id),
  constraint user_favorites_not_self check (user_id <> fav_user_id)
);

alter table public.user_favorites enable row level security;

create policy "user_favorites_select_own" on public.user_favorites
  for select using (user_id = auth.uid());
create policy "user_favorites_insert_own" on public.user_favorites
  for insert with check (user_id = auth.uid());
create policy "user_favorites_delete_own" on public.user_favorites
  for delete using (user_id = auth.uid());
