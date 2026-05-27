-- ============================================================================
-- Resultadismo · 11 · Notificação → Web Push + lembrete de prazo automático
-- (no-op local; ativa em produção com private.sync_config + secrets VAPID)
-- ============================================================================

-- Toda notificação criada dispara um Web Push (via edge function send-push)
create or replace function public.notifications_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.sync_config;
begin
  select * into cfg from private.sync_config where id = 1;
  if cfg.functions_url is null or cfg.service_key is null then
    return new;
  end if;
  perform net.http_post(
    url := cfg.functions_url || '/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_key
    ),
    body := jsonb_build_object(
      'user_id', new.user_id,
      'title', new.title,
      'body', coalesce(new.body, ''),
      'url', coalesce(new.data ->> 'url', '/')
    )
  );
  return new;
exception when others then
  return new;
end;
$$;

create trigger notifications_send_push
after insert on public.notifications
for each row execute function public.notifications_push();

-- ---------------------------------------------------------------------------
-- Lembrete de prazo: cria notificação para quem ainda não palpitou em jogos
-- que começam em até 90 min (uma vez por jogo). O push sai pelo trigger acima.
-- ---------------------------------------------------------------------------
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
    where m.status = 'scheduled'
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
$$;

do $$
begin
  perform cron.schedule(
    'resultadismo-deadline-reminders',
    '*/15 * * * *',
    'select public.create_deadline_reminders();'
  );
exception when others then
  raise notice 'cron deadline indisponível: %', sqlerrm;
end $$;
