-- ============================================================================
-- Resultadismo · Cutucada vinculada ao JOGO (só pra quem ainda não palpitou)
-- ----------------------------------------------------------------------------
-- Antes: nudge_member(league_id, to_user) — qualquer membro da liga, sem
-- validar se a pessoa já palpitou, e com botão na lista de membros da
-- federação.
--
-- Agora: nudge_for_match(match_id, to_user). A cutucada só passa se:
--   1) o jogo ainda não travou (kickoff_at > now()),
--   2) o alvo NÃO palpitou esse jogo,
--   3) sender e alvo compartilham uma federação ativa que dispute a
--      competição daquele jogo (mesma "vizinhança social" usada por
--      get_match_predict_status),
--   4) cooldown anti-spam de 30 min por par (sender, alvo) — regra antiga
--      mantida.
-- O frontend agora só oferece o botão dentro do "Quem já palpitou" do jogo.
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
  v_from_name text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;

  if p_to_user = auth.uid() then
    raise exception 'Você não pode cutucar a si mesmo.';
  end if;

  select m.competition_id, m.kickoff_at
    into v_comp, v_kickoff
  from public.matches m
  where m.id = p_match_id;

  if v_comp is null then
    raise exception 'Jogo não encontrado.';
  end if;
  if v_kickoff is null or v_kickoff <= now() then
    raise exception 'O jogo já começou — sem cutucada depois do apito.';
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

  select display_name into v_from_name from public.profiles where id = auth.uid();

  insert into public.notifications (user_id, type, title, body, data)
  values (
    p_to_user,
    'nudge',
    'Cutucada! 👉',
    coalesce(v_from_name, 'Alguém') || ' tá esperando seu palpite',
    jsonb_build_object(
      'from', auth.uid()::text,
      'match_id', p_match_id::text,
      'url', '/'
    )
  );
end;
$$;

revoke all on function public.nudge_for_match(uuid, uuid) from public, anon;
grant execute on function public.nudge_for_match(uuid, uuid) to authenticated;

-- A RPC antiga não é mais usada pelo cliente (frontend novo chama
-- nudge_for_match). Removida para deixar a superfície enxuta.
drop function if exists public.nudge_member(uuid, uuid);
