-- Participantes do confronto: admin seleciona OU cada um se inscreve (opt-in).
-- O admin escolhe o modo na criação da disputa.

alter table public.league_competitions
  add column if not exists participant_mode text not null default 'admin'; -- 'admin' | 'optin'

-- Inscrições (opt-in) — só valem enquanto a disputa está em rascunho.
create table if not exists public.confronto_optins (
  id uuid primary key default gen_random_uuid(),
  league_competition_id uuid not null references public.league_competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (league_competition_id, user_id)
);
create index if not exists confronto_optins_lc_idx
  on public.confronto_optins (league_competition_id);

alter table public.confronto_optins enable row level security;

drop policy if exists "confronto_optins_select" on public.confronto_optins;
create policy "confronto_optins_select" on public.confronto_optins
  for select using (
    exists (
      select 1
      from public.league_competitions lc
      join public.leagues l on l.id = lc.league_id
      where lc.id = league_competition_id
        and (l.visibility = 'public' or public.is_league_member(l.id) or public.is_app_admin())
    )
  );
-- Sem write direto: só via RPC.

-- Membro liga/desliga a própria inscrição (só em rascunho). Retorna o novo estado.
create or replace function public.toggle_confronto_optin(p_lc_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_league uuid;
  v_state text;
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'Não autenticado.';
  end if;
  select lc.league_id, lc.confronto_state into v_league, v_state
  from public.league_competitions lc where lc.id = p_lc_id;
  if v_league is null then
    raise exception 'Disputa não encontrada.';
  end if;
  if not public.is_league_member(v_league) then
    raise exception 'Você não é membro desta federação.';
  end if;
  if v_state <> 'draft' then
    raise exception 'A disputa já foi sorteada — as inscrições estão fechadas.';
  end if;

  select exists (
    select 1 from public.confronto_optins
    where league_competition_id = p_lc_id and user_id = v_uid
  ) into v_exists;

  if v_exists then
    delete from public.confronto_optins where league_competition_id = p_lc_id and user_id = v_uid;
    return false;
  else
    insert into public.confronto_optins (league_competition_id, user_id) values (p_lc_id, v_uid);
    return true;
  end if;
end;
$$;
revoke all on function public.toggle_confronto_optin(uuid) from public, anon;
grant execute on function public.toggle_confronto_optin(uuid) to authenticated;
