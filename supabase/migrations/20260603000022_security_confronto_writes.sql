-- ============================================================================
-- Resultadismo · Segurança (code review v2) · Escrita de confronto (cup_ties)
-- ----------------------------------------------------------------------------
-- C4: a policy cup_ties_write_admin dava INSERT/UPDATE/DELETE direto na tabela a
--     qualquer admin de liga (que TAMBÉM compete) — dava p/ forjar walkover,
--     reescrever pares/placar depois dos jogos, apagar confrontos perdidos,
--     burlando as RPCs. Removemos a escrita direta: tudo passa a ser só via RPC
--     SECURITY DEFINER (draw/undo/append/leave/advance), que validam estado e papel.
-- H4: draw_confronto / append_confronto_ties passam a VALIDAR os confrontos —
--     só participantes/membros ativos, sem jogador contra si mesmo.
-- H5: Copa (mata-mata) — advance_confronto_cup promove o vencedor de cada chave
--     para a próxima fase (antes os slots ficavam vazios p/ sempre). Desempate de
--     mata-mata pelo melhor seed.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- C4 — remove a escrita direta na tabela (mantém só a leitura via policy).
-- ---------------------------------------------------------------------------
drop policy if exists "cup_ties_write_admin" on public.cup_ties;

-- ---------------------------------------------------------------------------
-- H4 — draw_confronto com validação (membros ativos, sem auto-pareamento).
-- ---------------------------------------------------------------------------
create or replace function public.draw_confronto(
  p_lc_id uuid,
  p_participants jsonb,
  p_ties jsonb,
  p_liga_format text default null,
  p_period_kind text default null,
  p_scheduled_draw_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
  v_scheduled boolean := p_scheduled_draw_at is not null and p_scheduled_draw_at > now();
begin
  select league_id into v_league from public.league_competitions where id = p_lc_id;
  if v_league is null then
    raise exception 'Disputa não encontrada.';
  end if;
  if not (public.is_league_admin(v_league) or public.is_app_admin()) then
    raise exception 'Apenas administradores da federação podem sortear.';
  end if;

  -- Validação: todo participante precisa ser membro ATIVO da federação.
  if exists (
    select 1 from jsonb_array_elements(p_participants) e
    where not exists (
      select 1 from public.league_members lm
      where lm.league_id = v_league and lm.status = 'active'
        and lm.user_id = (e ->> 'user_id')::uuid
    )
  ) then
    raise exception 'Há participante que não é membro ativo da federação.';
  end if;

  -- Validação: ninguém joga contra si mesmo.
  if exists (
    select 1 from jsonb_array_elements(p_ties) e
    where nullif(e ->> 'member_a', '') is not null
      and nullif(e ->> 'member_b', '') is not null
      and (e ->> 'member_a') = (e ->> 'member_b')
  ) then
    raise exception 'Confronto inválido: jogador contra si mesmo.';
  end if;

  -- Validação: confrontos só entre participantes do sorteio.
  if exists (
    select 1
    from jsonb_array_elements(p_ties) e
    cross join lateral (values (nullif(e ->> 'member_a', '')), (nullif(e ->> 'member_b', ''))) as m(uid)
    where m.uid is not null
      and not exists (
        select 1 from jsonb_array_elements(p_participants) p
        where p ->> 'user_id' = m.uid
      )
  ) then
    raise exception 'Confronto com jogador fora da lista de participantes.';
  end if;

  delete from public.cup_ties where league_competition_id = p_lc_id;
  delete from public.confronto_participants where league_competition_id = p_lc_id;

  insert into public.confronto_participants (league_competition_id, user_id, seed)
  select p_lc_id, (e ->> 'user_id')::uuid, coalesce((e ->> 'seed')::int, 0)
  from jsonb_array_elements(p_participants) e;

  insert into public.cup_ties
    (league_competition_id, round_order, round_label, slot, member_a, member_b,
     matchday, period_kind, period_value, status)
  select p_lc_id,
         (e ->> 'round_order')::int,
         e ->> 'round_label',
         (e ->> 'slot')::int,
         nullif(e ->> 'member_a', '')::uuid,
         nullif(e ->> 'member_b', '')::uuid,
         nullif(e ->> 'matchday', '')::int,
         nullif(e ->> 'period_kind', ''),
         nullif(e ->> 'period_value', ''),
         'pending'
  from jsonb_array_elements(p_ties) e;

  update public.league_competitions
     set confronto_state = case when v_scheduled then 'scheduled' else 'drawn' end,
         drawn_at = case when v_scheduled then null else now() end,
         scheduled_draw_at = case when v_scheduled then p_scheduled_draw_at else null end,
         liga_format = coalesce(p_liga_format, liga_format),
         period_kind = coalesce(p_period_kind, period_kind)
   where id = p_lc_id;
end;
$$;
grant execute on function public.draw_confronto(uuid, jsonb, jsonb, text, text, timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- H4 — append_confronto_ties com validação (só participantes; sem auto-pareamento).
-- ---------------------------------------------------------------------------
create or replace function public.append_confronto_ties(p_lc_id uuid, p_ties jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
  v_state text;
  v_n int;
begin
  select league_id, confronto_state into v_league, v_state
  from public.league_competitions where id = p_lc_id;
  if v_league is null then
    raise exception 'Disputa não encontrada.';
  end if;
  if not (public.is_league_admin(v_league) or public.is_app_admin()) then
    raise exception 'Apenas administradores da federação podem gerar rodadas.';
  end if;
  if v_state <> 'drawn' then
    raise exception 'A disputa não está em andamento.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_ties) e
    where nullif(e ->> 'member_a', '') is not null
      and nullif(e ->> 'member_b', '') is not null
      and (e ->> 'member_a') = (e ->> 'member_b')
  ) then
    raise exception 'Confronto inválido: jogador contra si mesmo.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_ties) e
    cross join lateral (values (nullif(e ->> 'member_a', '')), (nullif(e ->> 'member_b', ''))) as m(uid)
    where m.uid is not null
      and not exists (
        select 1 from public.confronto_participants cp
        where cp.league_competition_id = p_lc_id and cp.user_id = m.uid::uuid
      )
  ) then
    raise exception 'Confronto com jogador fora dos participantes.';
  end if;

  insert into public.cup_ties
    (league_competition_id, round_order, round_label, slot, member_a, member_b,
     matchday, period_kind, period_value, status)
  select p_lc_id,
         (e ->> 'round_order')::int,
         e ->> 'round_label',
         (e ->> 'slot')::int,
         nullif(e ->> 'member_a', '')::uuid,
         nullif(e ->> 'member_b', '')::uuid,
         nullif(e ->> 'matchday', '')::int,
         nullif(e ->> 'period_kind', ''),
         nullif(e ->> 'period_value', ''),
         'pending'
  from jsonb_array_elements(p_ties) e;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.append_confronto_ties(uuid, jsonb) from public, anon;
grant execute on function public.append_confronto_ties(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- H5 — Copa: avança o vencedor de cada chave para a fase seguinte.
-- Idempotente (só preenche slot vazio). Bye avança na hora. Empate no mata-mata
-- é desempatado pelo melhor seed (menor número). Chamada de forma "lazy" pelo
-- front ao abrir o chaveamento + pelo backstop de release.
-- ---------------------------------------------------------------------------
create or replace function public.advance_confronto_cup(p_lc_id uuid)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_league uuid;
  v_comp uuid;
  v_total int := 0;
  v_n int;
  v_iter int := 0;
begin
  select league_id, competition_id into v_league, v_comp
  from public.league_competitions where id = p_lc_id;
  if v_league is null then
    return 0;
  end if;
  if not (public.is_league_member(v_league) or public.is_app_admin()) then
    return 0;
  end if;

  loop
    v_iter := v_iter + 1;
    exit when v_iter > 12; -- backstop: brackets têm poucas fases

    with seeds as (
      select user_id, seed from public.confronto_participants
      where league_competition_id = p_lc_id
    ),
    resolved as (
      select
        t.round_order, t.slot,
        case
          when t.member_b is null then t.member_a
          when t.walkover_user is not null then
            case when t.walkover_user = t.member_a then t.member_b else t.member_a end
          when not pl.played then null
          when coalesce(a.pts, 0) > coalesce(b.pts, 0) then t.member_a
          when coalesce(b.pts, 0) > coalesce(a.pts, 0) then t.member_b
          else case when coalesce(sa.seed, 2147483647) <= coalesce(sb.seed, 2147483647)
                    then t.member_a else t.member_b end
        end as winner
      from public.cup_ties t
      left join seeds sa on sa.user_id = t.member_a
      left join seeds sb on sb.user_id = t.member_b
      left join lateral (
        select sum(coalesce(public.score_points(pr.score_type), 0)
                   * (case when pr.is_joker then 2 else 1 end))::int as pts
        from public.matches m
        join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_a
        where m.competition_id = v_comp and m.status = 'finished'
          and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
      ) a on true
      left join lateral (
        select sum(coalesce(public.score_points(pr.score_type), 0)
                   * (case when pr.is_joker then 2 else 1 end))::int as pts
        from public.matches m
        join public.predictions pr on pr.match_id = m.id and pr.user_id = t.member_b
        where m.competition_id = v_comp and m.status = 'finished'
          and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
      ) b on true
      left join lateral (
        select exists (
          select 1 from public.matches m
          where m.competition_id = v_comp and m.status = 'finished'
            and public.match_in_period(t.period_kind, t.period_value, t.matchday, m.matchday, m.stage, m.kickoff_at)
        ) as played
      ) pl on true
      where t.league_competition_id = p_lc_id
    )
    update public.cup_ties pt
    set member_a = case when (r.slot % 2) = 1 then r.winner else pt.member_a end,
        member_b = case when (r.slot % 2) = 0 then r.winner else pt.member_b end
    from resolved r
    where pt.league_competition_id = p_lc_id
      and pt.round_order = r.round_order + 1
      and pt.slot = ((r.slot + 1) / 2)
      and r.winner is not null
      and (
        ((r.slot % 2) = 1 and pt.member_a is null)
        or ((r.slot % 2) = 0 and pt.member_b is null)
      );
    get diagnostics v_n = row_count;
    v_total := v_total + v_n;
    exit when v_n = 0;
  end loop;

  return v_total;
end;
$$;
revoke all on function public.advance_confronto_cup(uuid) from public, anon;
grant execute on function public.advance_confronto_cup(uuid) to authenticated;
