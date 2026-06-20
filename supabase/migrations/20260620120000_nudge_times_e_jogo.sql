-- ============================================================================
-- Resultadismo · Cutucada: diz QUAL jogo (times) e bloqueia sem times definidos
-- ----------------------------------------------------------------------------
-- Evolui nudge_for_match (ver 20260603000008): além das regras de antes
-- (jogo aberto, alvo não palpitou, par compartilha federação que dispute a
-- competição, anti-spam 30 min), agora:
--   • BLOQUEIA cutucar quando os times ainda não saíram (mata-mata com
--     marcação tipo "1º Grupo A": home_team_id / away_team_id nulos) — não faz
--     sentido cobrar palpite de um jogo sem adversários definidos.
--   • a notificação passa a citar OS TIMES no corpo ("Fulano quer seu palpite
--     em Portugal × Alemanha") e guarda home/away/kickoff_at no data, pro front
--     mostrar "começa em Xh" de forma DINÂMICA (o tempo certo na hora da leitura).
-- ============================================================================

create or replace function public.nudge_for_match(p_match_id uuid, p_to_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comp uuid;
  v_kickoff timestamptz;
  v_home_id uuid;
  v_away_id uuid;
  v_home text;
  v_away text;
  v_from_name text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if p_to_user = auth.uid() then
    raise exception 'Você não pode cutucar a si mesmo.';
  end if;

  select m.competition_id, m.kickoff_at, m.home_team_id, m.away_team_id
    into v_comp, v_kickoff, v_home_id, v_away_id
  from public.matches m
  where m.id = p_match_id;

  if v_comp is null then
    raise exception 'Jogo não encontrado.';
  end if;
  if v_kickoff is null or v_kickoff <= now() then
    raise exception 'O jogo já começou, sem cutucada depois do apito.';
  end if;

  -- Times ainda não definidos (marcação tipo "1º Grupo A"): sem cutucada.
  if v_home_id is null or v_away_id is null then
    raise exception 'Esse jogo ainda não tem os times definidos. Dá pra cutucar quando eles saírem.';
  end if;

  -- Compartilha alguma federação ativa que dispute esta competição
  if not exists (
    select 1
    from public.league_members lm_me
    join public.league_members lm_to on lm_to.league_id = lm_me.league_id
    join public.league_competitions lc on lc.league_id = lm_me.league_id
    where lm_me.user_id = auth.uid()
      and lm_me.status = 'active'
      and lm_to.user_id = p_to_user
      and lm_to.status = 'active'
      and lc.competition_id = v_comp
  ) then
    raise exception 'Vocês não compartilham nenhuma federação que dispute este jogo.';
  end if;

  -- Cutucada só faz sentido se o alvo ainda não palpitou
  if exists (
    select 1 from public.predictions
    where user_id = p_to_user and match_id = p_match_id
  ) then
    raise exception 'Essa pessoa já palpitou esse jogo.';
  end if;

  -- Anti-spam: 1 cutucada por par (sender, alvo) a cada 30 min
  if exists (
    select 1 from public.notifications
    where user_id = p_to_user
      and type = 'nudge'
      and (data ->> 'from') = auth.uid()::text
      and created_at > now() - interval '30 minutes'
  ) then
    raise exception 'Você já cutucou essa pessoa há pouco. Calma! 😄';
  end if;

  select coalesce(short_name, name) into v_home from public.teams where id = v_home_id;
  select coalesce(short_name, name) into v_away from public.teams where id = v_away_id;
  select display_name into v_from_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_to_user,
    'nudge',
    'Cutucada! 👉',
    coalesce(v_from_name, 'Alguém') || ' quer seu palpite em '
      || coalesce(v_home, 'um jogo') || ' × ' || coalesce(v_away, ''),
    jsonb_build_object(
      'from', auth.uid()::text,
      'match_id', p_match_id::text,
      'home', v_home,
      'away', v_away,
      'kickoff_at', v_kickoff,
      'url', '/'
    )
  );
end;
$$;

revoke all on function public.nudge_for_match(uuid, uuid) from public, anon;
grant execute on function public.nudge_for_match(uuid, uuid) to authenticated;
