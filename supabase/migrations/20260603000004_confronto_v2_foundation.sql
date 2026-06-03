-- ============================================================================
-- Confrontos v2 — fundação: estados da disputa, snapshot de participantes
-- (travados no sorteio) e RPCs transacionais de sortear/desfazer.
-- Modo Confronto: formato Liga ('liga') ou Copa ('cup'). Pontos = 'points'.
-- ============================================================================

-- Estado do confronto + período + quando foi sorteado.
alter table public.league_competitions
  add column if not exists confronto_state text not null default 'draft',
  add column if not exists period_kind text not null default 'phase',
  add column if not exists drawn_at timestamptz;

-- Participantes travados no momento do sorteio (snapshot).
create table if not exists public.confronto_participants (
  id uuid primary key default gen_random_uuid(),
  league_competition_id uuid not null references public.league_competitions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  seed int not null default 0,
  created_at timestamptz not null default now(),
  unique (league_competition_id, user_id)
);
create index if not exists confronto_participants_lc_idx
  on public.confronto_participants (league_competition_id);

alter table public.confronto_participants enable row level security;

-- SELECT: quem enxerga a federação enxerga os participantes.
drop policy if exists "confronto_participants_select" on public.confronto_participants;
create policy "confronto_participants_select" on public.confronto_participants
  for select using (
    exists (
      select 1
      from public.league_competitions lc
      join public.leagues l on l.id = lc.league_id
      where lc.id = league_competition_id
        and (l.visibility = 'public' or public.is_league_member(l.id) or public.is_app_admin())
    )
  );
-- Sem INSERT/UPDATE/DELETE direto: só via RPC (draw_confronto / undo).

-- ---------------------------------------------------------------------------
-- Sorteio: trava participantes + monta confrontos (cup_ties) atomicamente.
-- Permite refazer (limpa o anterior). Admin da federação ou app admin.
-- ---------------------------------------------------------------------------
create or replace function public.draw_confronto(
  p_lc_id uuid,
  p_participants jsonb,  -- [{ user_id, seed }]
  p_ties jsonb           -- [{ round_order, round_label, slot, member_a, member_b, matchday }]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
begin
  select league_id into v_league from public.league_competitions where id = p_lc_id;
  if v_league is null then
    raise exception 'Disputa não encontrada.';
  end if;
  if not (public.is_league_admin(v_league) or public.is_app_admin()) then
    raise exception 'Apenas administradores da federação podem sortear.';
  end if;

  -- substitui o que existia (refazer sorteio)
  delete from public.cup_ties where league_competition_id = p_lc_id;
  delete from public.confronto_participants where league_competition_id = p_lc_id;

  insert into public.confronto_participants (league_competition_id, user_id, seed)
  select p_lc_id, (e ->> 'user_id')::uuid, coalesce((e ->> 'seed')::int, 0)
  from jsonb_array_elements(p_participants) e;

  insert into public.cup_ties
    (league_competition_id, round_order, round_label, slot, member_a, member_b, matchday, status)
  select p_lc_id,
         (e ->> 'round_order')::int,
         e ->> 'round_label',
         (e ->> 'slot')::int,
         nullif(e ->> 'member_a', '')::uuid,
         nullif(e ->> 'member_b', '')::uuid,
         nullif(e ->> 'matchday', '')::int,
         'pending'
  from jsonb_array_elements(p_ties) e;

  update public.league_competitions
    set confronto_state = 'drawn', drawn_at = now()
    where id = p_lc_id;
end;
$$;
grant execute on function public.draw_confronto(uuid, jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Desfazer sorteio: só se nenhuma janela começou (nenhum jogo ao vivo/fim).
-- ---------------------------------------------------------------------------
create or replace function public.undo_confronto_draw(p_lc_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
  v_comp uuid;
  v_started boolean;
begin
  select league_id, competition_id into v_league, v_comp
  from public.league_competitions where id = p_lc_id;
  if v_league is null then
    raise exception 'Disputa não encontrada.';
  end if;
  if not (public.is_league_admin(v_league) or public.is_app_admin()) then
    raise exception 'Apenas administradores da federação podem desfazer.';
  end if;

  select exists (
    select 1
    from public.cup_ties t
    join public.matches m on m.competition_id = v_comp and m.matchday = t.matchday
    where t.league_competition_id = p_lc_id and m.status in ('live', 'finished')
  ) into v_started;
  if v_started then
    raise exception 'Os confrontos já começaram — não dá mais para desfazer.';
  end if;

  delete from public.cup_ties where league_competition_id = p_lc_id;
  delete from public.confronto_participants where league_competition_id = p_lc_id;
  update public.league_competitions
    set confronto_state = 'draft', drawn_at = null
    where id = p_lc_id;
end;
$$;
grant execute on function public.undo_confronto_draw(uuid) to authenticated;
