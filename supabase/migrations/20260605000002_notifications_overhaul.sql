-- ============================================================================
-- Resultadismo · Overhaul de notificações
-- ----------------------------------------------------------------------------
-- Junta tudo que faltava na camada de notificação:
--   • Preferências por usuário (notif_prefs em profiles): cada pessoa liga/
--     desliga lembretes de prazo, cutucadas e avisos do app. Vale pra conta
--     toda (in-app + push). Admin alert NÃO respeita preferência (é operação).
--   • Broadcasts do admin: aviso direcionado por segmento (todo mundo, quem não
--     palpitou hoje, quem tá online agora, um grupo, ou o topo de um grupo).
--     Cada segmento já desconta quem desativou avisos. Grava no histórico.
--   • Alertas pro admin: trigger quando entra alerta de sync pendente e quando
--     uma federação ativa fica com nome pendente de revisão. Dedupe de 6h.
--   • get_unread_count(): badge do sininho / app badge.
--
-- Tudo SECURITY DEFINER com search_path vazio. Funções internas têm execute
-- revogado de todo mundo (só rodam via outras funções/triggers); as chamáveis
-- pelo cliente ganham grant pra authenticated, sempre com gate de permissão.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- profiles.notif_prefs — preferências de notificação por usuário
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists notif_prefs jsonb not null
    default '{"deadline":true,"nudge":true,"broadcast":true}'::jsonb;

-- A coluna é gravável direto via RLS (profiles_update_own). O front só escreve
-- booleanos (set_notification_pref), mas garantimos no banco que notif_prefs é
-- sempre um objeto com chaves booleanas — senão um usuário poderia gravar lixo
-- (ex.: "maybe") e quebrar o cast em wants_notification pra todo o broadcast.
alter table public.profiles
  drop constraint if exists profiles_notif_prefs_valid;
alter table public.profiles
  add constraint profiles_notif_prefs_valid check (
    jsonb_typeof(notif_prefs) = 'object'
    and (not notif_prefs ? 'deadline'  or jsonb_typeof(notif_prefs -> 'deadline')  = 'boolean')
    and (not notif_prefs ? 'nudge'     or jsonb_typeof(notif_prefs -> 'nudge')     = 'boolean')
    and (not notif_prefs ? 'broadcast' or jsonb_typeof(notif_prefs -> 'broadcast') = 'boolean')
  );

-- ---------------------------------------------------------------------------
-- notification_broadcasts — histórico dos avisos enviados pelo admin
-- (RLS ligado, sem policy: acesso só via RPC SECURITY DEFINER)
-- ---------------------------------------------------------------------------
create table if not exists public.notification_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  url text,
  segment text,
  segment_league_id uuid references public.leagues (id) on delete set null,
  segment_lc_id uuid references public.league_competitions (id) on delete set null,
  segment_top_n int,
  sent_count int,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists notification_broadcasts_recent_idx
  on public.notification_broadcasts (created_at desc);

alter table public.notification_broadcasts enable row level security;
-- Sem policy: admin lê via admin_list_broadcasts. (RLS ligado = nega por padrão.)

-- ============================================================================
-- Helper interno: o usuário quer este tipo de notificação?
-- ============================================================================
-- admin_alert é operação interna do app: sempre verdadeiro (ignora prefs).
-- Para os demais tipos, lê notif_prefs (default true se a chave não existir).
create or replace function public.wants_notification(p_user uuid, p_type text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Cast tolerante: só respeita a preferência se ela for um booleano JSON de
  -- verdade. Chave ausente, string, objeto ou notif_prefs corrompido caem no
  -- default "true" (opt-in) em vez de estourar 22P02 — blinda o broadcast.
  select case
    when p_type = 'admin_alert' then true
    else coalesce(
      (select case jsonb_typeof(p.notif_prefs -> p_type)
                when 'boolean' then (p.notif_prefs -> p_type)::boolean
                else true
              end
         from public.profiles p where p.id = p_user),
      true
    )
  end;
$$;

revoke all on function public.wants_notification(uuid, text) from public, anon, authenticated;

-- ============================================================================
-- RPCs de preferência (chamáveis pelo usuário)
-- ============================================================================

-- Lê as preferências do usuário atual (ou o default se ainda não tiver perfil).
create or replace function public.get_notification_prefs()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.notif_prefs from public.profiles p where p.id = auth.uid()),
    '{"deadline":true,"nudge":true,"broadcast":true}'::jsonb
  );
$$;

revoke all on function public.get_notification_prefs() from public, anon;
grant execute on function public.get_notification_prefs() to authenticated;

-- Liga/desliga uma preferência específica do usuário atual.
create or replace function public.set_notification_pref(p_type text, p_enabled boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado';
  end if;
  if p_type not in ('deadline', 'nudge', 'broadcast') then
    raise exception 'Tipo de notificação inválido.';
  end if;

  update public.profiles
    set notif_prefs = jsonb_set(
          coalesce(notif_prefs, '{}'::jsonb),
          array[p_type],
          to_jsonb(coalesce(p_enabled, true)),
          true
        )
    where id = auth.uid()
    returning notif_prefs into v;

  return v;
end;
$$;

revoke all on function public.set_notification_pref(text, boolean) from public, anon;
grant execute on function public.set_notification_pref(text, boolean) to authenticated;

-- Contagem de não lidas (badge do sininho / app badge).
create or replace function public.get_unread_count()
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.notifications n
  where n.user_id = auth.uid()
    and n.read_at is null;
$$;

revoke all on function public.get_unread_count() from public, anon;
grant execute on function public.get_unread_count() to authenticated;

-- ============================================================================
-- create_deadline_reminders — idêntica + respeita a preferência 'deadline'
-- ============================================================================
create or replace function public.create_deadline_reminders()
returns int
language plpgsql
security definer
set search_path = ''
as $$
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
      and public.wants_notification(lm.user_id, 'deadline')
    returning 1
  )
  select count(*) into v_count from novos;
  return v_count;
end;
$$;

-- ============================================================================
-- nudge_for_match — validações atuais + respeita a preferência 'nudge'
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

  -- Respeita quem desligou cutucadas (sai sem erro: a UI não precisa saber)
  if not public.wants_notification(p_to_user, 'nudge') then
    return;
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

-- ============================================================================
-- private.broadcast_recipients — quem recebe um aviso, por segmento
-- ----------------------------------------------------------------------------
-- Interna: só roda dentro de admin_broadcast_preview / admin_send_broadcast,
-- ambas com gate de admin. Cada segmento já filtra wants_notification(_,'broadcast').
-- ============================================================================
create or replace function private.broadcast_recipients(p_segment text, p_arg jsonb)
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_segment = 'all' then
    return query
      select p.id as user_id
      from public.profiles p
      where public.wants_notification(p.id, 'broadcast');

  elsif p_segment = 'no_prediction' then
    return query
      select distinct lm.user_id
      from public.matches m
      join public.league_competitions lc
        on lc.competition_id = m.competition_id and lc.status = 'active'
      join public.league_members lm
        on lm.league_id = lc.league_id and lm.status = 'active'
      where m.status = 'scheduled'
        and m.hidden = false
        and m.kickoff_at > now()
        and (m.kickoff_at at time zone 'America/Sao_Paulo')::date
            = (now() at time zone 'America/Sao_Paulo')::date
        and not exists (
          select 1 from public.predictions pr
          where pr.user_id = lm.user_id and pr.match_id = m.id
        )
        and public.wants_notification(lm.user_id, 'broadcast');

  elsif p_segment = 'online' then
    return query
      select p.id
      from public.profiles p
      where p.last_active_at is not null
        and p.last_active_at > now() - interval '90 seconds'
        and public.wants_notification(p.id, 'broadcast');

  elsif p_segment = 'group' then
    return query
      select lm.user_id
      from public.league_members lm
      where lm.league_id = (p_arg ->> 'league_id')::uuid
        and lm.status = 'active'
        and public.wants_notification(lm.user_id, 'broadcast');

  elsif p_segment = 'group_top' then
    return query
      select s.user_id
      from public.get_league_standings((p_arg ->> 'lc_id')::uuid) s
      where s.rank <= greatest(1, least(coalesce((p_arg ->> 'top_n')::int, 1), 50))
        and public.wants_notification(s.user_id, 'broadcast');

  else
    raise exception 'Segmento inválido: %', p_segment;
  end if;
end;
$$;

revoke all on function private.broadcast_recipients(text, jsonb) from public, anon, authenticated;

-- ============================================================================
-- admin_broadcast_preview — "esse aviso vai pra quantas pessoas?"
-- ============================================================================
create or replace function public.admin_broadcast_preview(p_segment text, p_arg jsonb default '{}'::jsonb)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem enviar avisos.';
  end if;
  select count(*)::int into v_count
  from private.broadcast_recipients(p_segment, coalesce(p_arg, '{}'::jsonb));
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.admin_broadcast_preview(text, jsonb) from public, anon;
grant execute on function public.admin_broadcast_preview(text, jsonb) to authenticated;

-- ============================================================================
-- admin_send_broadcast — dispara o aviso pro segmento e grava no histórico
-- ----------------------------------------------------------------------------
-- 1) registra em notification_broadcasts; 2) insere uma notification por
-- destinatário (o trigger notifications_send_push empurra o push de cada uma);
-- 3) atualiza o sent_count; 4) audita. Retorna quantos receberam.
-- ============================================================================
create or replace function public.admin_send_broadcast(
  p_title text,
  p_body text,
  p_url text,
  p_segment text,
  p_arg jsonb default '{}'::jsonb
)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_broadcast_id uuid;
  v_sent int;
  v_url text;
  v_arg jsonb := coalesce(p_arg, '{}'::jsonb);
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem enviar avisos.';
  end if;
  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'O título do aviso não pode ficar vazio.';
  end if;

  v_url := coalesce(nullif(trim(coalesce(p_url, '')), ''), '/');

  insert into public.notification_broadcasts
    (title, body, url, segment, segment_league_id, segment_lc_id, segment_top_n, created_by)
  values (
    trim(p_title),
    nullif(trim(coalesce(p_body, '')), ''),
    v_url,
    p_segment,
    nullif(v_arg ->> 'league_id', '')::uuid,
    nullif(v_arg ->> 'lc_id', '')::uuid,
    nullif(v_arg ->> 'top_n', '')::int,
    auth.uid()
  )
  returning id into v_broadcast_id;

  insert into public.notifications (user_id, type, title, body, data)
  select r.user_id, 'broadcast', trim(p_title),
         nullif(trim(coalesce(p_body, '')), ''),
         jsonb_build_object('url', v_url, 'broadcast_id', v_broadcast_id)
  from private.broadcast_recipients(p_segment, v_arg) r;

  get diagnostics v_sent = row_count;

  update public.notification_broadcasts
    set sent_count = v_sent
    where id = v_broadcast_id;

  insert into public.admin_audit_log (actor, action, entity_type, entity_id, detail)
  values (auth.uid(), 'broadcast_send', 'notification_broadcast', v_broadcast_id,
          jsonb_build_object('segment', p_segment, 'sent', v_sent));

  return v_sent;
end;
$$;

revoke all on function public.admin_send_broadcast(text, text, text, text, jsonb) from public, anon;
grant execute on function public.admin_send_broadcast(text, text, text, text, jsonb) to authenticated;

-- ============================================================================
-- admin_list_broadcasts — histórico de avisos enviados
-- ============================================================================
create or replace function public.admin_list_broadcasts(p_limit int default 50)
returns table (
  id uuid,
  title text,
  body text,
  url text,
  segment text,
  segment_label text,
  sent_count int,
  author_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem ver o histórico de avisos.';
  end if;
  return query
  select b.id, b.title, b.body, b.url, b.segment,
         coalesce(l.name, lc.name) as segment_label,
         b.sent_count,
         coalesce(p.display_name, 'Admin') as author_name,
         b.created_at
  from public.notification_broadcasts b
  left join public.leagues l on l.id = b.segment_league_id
  left join public.league_competitions lc on lc.id = b.segment_lc_id
  left join public.profiles p on p.id = b.created_by
  order by b.created_at desc
  limit greatest(1, least(p_limit, 200));
end;
$$;

revoke all on function public.admin_list_broadcasts(int) from public, anon;
grant execute on function public.admin_list_broadcasts(int) to authenticated;

-- ============================================================================
-- admin_list_group_targets — grupos/competições ativos pros selects 'group'/'group_top'
-- ============================================================================
create or replace function public.admin_list_group_targets()
returns table (
  league_id uuid,
  lc_id uuid,
  league_name text,
  competition_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'Apenas administradores podem listar grupos.';
  end if;
  return query
  select l.id as league_id,
         lc.id as lc_id,
         l.name as league_name,
         lc.name as competition_name
  from public.leagues l
  join public.league_competitions lc
    on lc.league_id = l.id and lc.status = 'active'
  where l.status = 'active'
  order by l.name asc, lc.name asc;
end;
$$;

revoke all on function public.admin_list_group_targets() from public, anon;
grant execute on function public.admin_list_group_targets() to authenticated;

-- ============================================================================
-- fan_notify_admins — alerta interno pros app-admins (só triggers usam)
-- ----------------------------------------------------------------------------
-- Dedupe: se já existe um admin_alert com o mesmo kind+ref nas últimas 6h,
-- não faz nada (evita spam). Senão, insere 1 notification por app-admin.
-- ============================================================================
create or replace function public.fan_notify_admins(
  p_title text,
  p_body text,
  p_url text,
  p_kind text,
  p_ref text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Dedupe por kind+ref nas últimas 6h (qualquer admin já notificado conta)
  if exists (
    select 1 from public.notifications
    where type = 'admin_alert'
      and (data ->> 'kind') = p_kind
      and (data ->> 'ref') = p_ref
      and created_at > now() - interval '6 hours'
  ) then
    return;
  end if;

  insert into public.notifications (user_id, type, title, body, data)
  select p.id, 'admin_alert', p_title, p_body,
         jsonb_build_object(
           'kind', p_kind,
           'ref', p_ref,
           'url', coalesce(nullif(p_url, ''), '/')
         )
  from public.profiles p
  where p.is_app_admin = true;
end;
$$;

revoke all on function public.fan_notify_admins(text, text, text, text, text)
  from public, anon, authenticated;

-- ============================================================================
-- Trigger: novo alerta de sync pendente → avisa os admins
-- ============================================================================
create or replace function public.notify_admins_sync_alert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pending' then
    perform public.fan_notify_admins(
      'Tem alerta de sincronização',
      'Um jogo do calendário precisa da sua decisão.',
      '/admin',
      'sync_alert',
      new.id::text
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_admins_sync_alert on public.sync_alerts;
create trigger notify_admins_sync_alert
after insert on public.sync_alerts
for each row execute function public.notify_admins_sync_alert();

-- ============================================================================
-- Trigger: federação ativa com nome pendente de revisão → avisa os admins
-- ----------------------------------------------------------------------------
-- name_approved=false AND status='active' (NÃO 'pending': todo grupo nasce
-- pending e geraria spam). Dispara na criação (insert) e na liquidação que
-- ativa + manda o nome pra revisão (update de name_approved).
-- ============================================================================
create or replace function public.notify_admins_name_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Só na criação ou numa transição real de name_approved (a RPC update_group_info
  -- sempre inclui name_approved no SET, então sem este guard uma simples edição de
  -- descrição dispararia o alerta de revisão de nome).
  if new.name_approved = false and new.status = 'active'
     and (tg_op = 'INSERT' or new.name_approved is distinct from old.name_approved) then
    perform public.fan_notify_admins(
      'Nome de federação pra revisar',
      coalesce(new.name, 'Uma federação') || ' tá esperando aprovação do nome.',
      '/admin',
      'name_review',
      new.id::text
    );
  end if;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists notify_admins_name_review on public.leagues;
create trigger notify_admins_name_review
after insert or update of name_approved on public.leagues
for each row execute function public.notify_admins_name_review();
