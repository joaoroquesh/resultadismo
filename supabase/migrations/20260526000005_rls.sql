-- ============================================================================
-- Resultadismo · 05 · Row Level Security + gatilhos de proteção
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Gatilhos de proteção
-- ---------------------------------------------------------------------------

-- Impede que um usuário comum se promova a app_admin ou altere o email do perfil.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    new.is_app_admin := old.is_app_admin;
  end if;
  new.email := old.email;
  return new;
end;
$$;

create trigger profiles_protect
before update on public.profiles
for each row execute function public.profiles_guard();

-- Apenas app_admin altera status/aprovação de ligas.
create or replace function public.leagues_guard_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    new.status := old.status;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
  end if;
  return new;
end;
$$;

create trigger leagues_protect_status
before update on public.leagues
for each row execute function public.leagues_guard_status();

-- Protege o dono da liga de remoção/rebaixamento.
create or replace function public.protect_league_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from public.leagues where id = coalesce(new.league_id, old.league_id);
  if tg_op = 'DELETE' then
    if old.user_id = v_owner and not public.is_app_admin() then
      raise exception 'Não é possível remover o dono da liga.';
    end if;
    return old;
  else
    if old.user_id = v_owner and new.role <> 'owner' and not public.is_app_admin() then
      raise exception 'Não é possível alterar o papel do dono da liga.';
    end if;
    return new;
  end if;
end;
$$;

create trigger league_members_protect_owner
before update or delete on public.league_members
for each row execute function public.protect_league_owner();

-- ---------------------------------------------------------------------------
-- Habilita RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.competitions enable row level security;
alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.leagues enable row level security;
alter table public.league_members enable row level security;
alter table public.league_competitions enable row level security;
alter table public.cup_ties enable row level security;
alter table public.predictions enable row level security;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy "profiles_select_all" on public.profiles
  for select to authenticated using (true);

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- competitions / teams / matches  (leitura geral, escrita só app_admin)
-- ---------------------------------------------------------------------------
create policy "competitions_select_all" on public.competitions
  for select to authenticated using (true);
create policy "competitions_admin_write" on public.competitions
  for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

create policy "teams_select_all" on public.teams
  for select to authenticated using (true);
create policy "teams_admin_write" on public.teams
  for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

create policy "matches_select_all" on public.matches
  for select to authenticated using (true);
create policy "matches_admin_write" on public.matches
  for all to authenticated
  using (public.is_app_admin()) with check (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- leagues
-- ---------------------------------------------------------------------------
create policy "leagues_select_visible" on public.leagues
  for select to authenticated
  using (
    visibility = 'public'
    or owner_id = auth.uid()
    or public.is_league_member(id)
    or public.is_app_admin()
  );

create policy "leagues_insert_own" on public.leagues
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (status = 'pending' or public.is_app_admin())
  );

create policy "leagues_update_admin" on public.leagues
  for update to authenticated
  using (public.is_league_admin(id) or public.is_app_admin())
  with check (public.is_league_admin(id) or public.is_app_admin());

create policy "leagues_delete_owner" on public.leagues
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_app_admin());

-- ---------------------------------------------------------------------------
-- league_members
-- ---------------------------------------------------------------------------
create policy "league_members_select" on public.league_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_league_member(league_id)
    or public.is_app_admin()
    or exists (select 1 from public.leagues l where l.id = league_id and l.visibility = 'public')
  );

create policy "league_members_insert_admin" on public.league_members
  for insert to authenticated
  with check (public.is_league_admin(league_id) or public.is_app_admin());

create policy "league_members_update_admin" on public.league_members
  for update to authenticated
  using (public.is_league_admin(league_id) or public.is_app_admin())
  with check (public.is_league_admin(league_id) or public.is_app_admin());

create policy "league_members_delete" on public.league_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_league_admin(league_id)
    or public.is_app_admin()
  );

-- ---------------------------------------------------------------------------
-- league_competitions
-- ---------------------------------------------------------------------------
create policy "league_competitions_select" on public.league_competitions
  for select to authenticated
  using (
    public.is_league_member(league_id)
    or public.is_app_admin()
    or exists (select 1 from public.leagues l where l.id = league_id and l.visibility = 'public')
  );

create policy "league_competitions_write_admin" on public.league_competitions
  for all to authenticated
  using (public.is_league_admin(league_id) or public.is_app_admin())
  with check (public.is_league_admin(league_id) or public.is_app_admin());

-- ---------------------------------------------------------------------------
-- cup_ties
-- ---------------------------------------------------------------------------
create policy "cup_ties_select" on public.cup_ties
  for select to authenticated
  using (
    exists (
      select 1 from public.league_competitions lc
      join public.leagues l on l.id = lc.league_id
      where lc.id = league_competition_id
        and (public.is_league_member(l.id) or l.visibility = 'public' or public.is_app_admin())
    )
  );

create policy "cup_ties_write_admin" on public.cup_ties
  for all to authenticated
  using (
    exists (
      select 1 from public.league_competitions lc
      where lc.id = league_competition_id
        and (public.is_league_admin(lc.league_id) or public.is_app_admin())
    )
  )
  with check (
    exists (
      select 1 from public.league_competitions lc
      where lc.id = league_competition_id
        and (public.is_league_admin(lc.league_id) or public.is_app_admin())
    )
  );

-- ---------------------------------------------------------------------------
-- predictions  (próprios sempre; dos outros só após o kickoff)
-- ---------------------------------------------------------------------------
create policy "predictions_select" on public.predictions
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_app_admin()
    or public.match_is_locked(match_id)
  );

create policy "predictions_insert_own" on public.predictions
  for insert to authenticated
  with check (user_id = auth.uid() and not public.match_is_locked(match_id));

create policy "predictions_update_own" on public.predictions
  for update to authenticated
  using (user_id = auth.uid() and not public.match_is_locked(match_id))
  with check (user_id = auth.uid() and not public.match_is_locked(match_id));

create policy "predictions_delete_own" on public.predictions
  for delete to authenticated
  using (user_id = auth.uid() and not public.match_is_locked(match_id));
