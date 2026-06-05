-- ============================================================================
-- Resultadismo · Jogo oculto NÃO gera nem aparece em notificação
-- ----------------------------------------------------------------------------
-- Complementa a ...028 (oculto fora da pontuação): jogo com matches.hidden=true
-- também não cria lembrete de palpite ("Não esquece de palpitar! ⏰") nem aceita
-- cutucada, e as notificações JÁ EXISTENTES desses jogos somem da leitura.
--
-- Mudanças:
--   1) create_deadline_reminders: filtro m.hidden = false ao gerar lembretes.
--   2) nudge_for_match: filtro m.hidden = false na busca do jogo → cutucada
--      de jogo oculto cai em "Jogo não encontrado.".
--   3) get_my_notifications(int): RPC nova de leitura que exclui notificações
--      cujo data->>'match_id' aponta pra jogo oculto. Reversível: desocultar o
--      jogo faz a notificação voltar a aparecer (filtro de leitura, sem delete).
-- ============================================================================

-- ---------- create_deadline_reminders ----------
CREATE OR REPLACE FUNCTION public.create_deadline_reminders()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count int;
begin
  with novos as (
    insert into public.notifications (user_id, type, title, body, data)
    select distinct lm.user_id, 'deadline', 'Não esquece de palpitar! ⏰',
      m.home_team_name || ' x ' || m.away_team_name || ' começa logo',
      jsonb_build_object('match_id', m.id, 'url', '/')
    from public.matches m
    join public.league_competitions lc
      on lc.competition_id = m.competition_id and lc.status = 'active'
    join public.league_members lm
      on lm.league_id = lc.league_id and lm.status = 'active'
    where m.status = 'scheduled' and m.hidden = false
      and m.kickoff_at between now() and now() + interval '90 minutes'
      and not exists (
        select 1 from public.predictions p
        where p.user_id = lm.user_id and p.match_id = m.id
      )
      and not exists (
        select 1 from public.notifications n
        where n.user_id = lm.user_id and n.type = 'deadline'
          and (n.data ->> 'match_id') = m.id::text
      )
    returning 1
  )
  select count(*) into v_count from novos;
  return v_count;
end;
$function$

;

-- ---------- nudge_for_match ----------
CREATE OR REPLACE FUNCTION public.nudge_for_match(p_match_id uuid, p_to_user uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  where m.id = p_match_id and m.hidden = false;

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
$function$

;

-- ---------- get_my_notifications (nova RPC de leitura) ----------
-- Retorna as notificações do usuário em ordem decrescente, FILTRANDO aquelas
-- cujo `data->>'match_id'` aponta pra um jogo oculto (matches.hidden=true).
-- - notif sem match_id → não há match correspondente → passa
-- - notif com match_id de jogo visível → passa
-- - notif com match_id de jogo oculto → escondida
-- Filtro de leitura: desocultar o jogo a faz reaparecer. O client passa a
-- chamar esta RPC em vez de SELECT direto na tabela.
create or replace function public.get_my_notifications(p_limit int default 30)
returns setof public.notifications
language sql stable security definer set search_path = ''
as $$
  select n.*
  from public.notifications n
  where n.user_id = auth.uid()
    and not exists (
      select 1 from public.matches m
      where m.id::text = (n.data ->> 'match_id')
        and m.hidden = true
    )
  order by n.created_at desc
  limit p_limit;
$$;
grant execute on function public.get_my_notifications(int) to authenticated;
