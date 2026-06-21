-- Retrô — rodada 22 (Onda 3: retenção — lembrete diário da Seleção do Dia):
-- Opt-in (default OFF, sem spam): quem ligar recebe 1 push/dia se ainda não jogou a
-- Seleção do Dia. Reusa a infra de push do app-mãe: basta inserir em public.notifications
-- que o trigger notifications_send_push entrega o Web Push. No-op local (sem
-- functions_url); ativa em produção.

alter table public.profiles
  add column if not exists retro_daily_reminder boolean not null default false;

-- liga/desliga o lembrete do Retrô (jogador logado)
create or replace function public.retro_set_daily_reminder(p_on boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'precisa estar logado'; end if;
  update public.profiles set retro_daily_reminder = coalesce(p_on, false) where id = auth.uid();
end $$;
revoke execute on function public.retro_set_daily_reminder(boolean) from public, anon;
grant execute on function public.retro_set_daily_reminder(boolean) to authenticated;

create or replace function public.retro_get_daily_reminder() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select retro_daily_reminder from public.profiles where id = auth.uid()), false)
$$;
revoke execute on function public.retro_get_daily_reminder() from public, anon;
grant execute on function public.retro_get_daily_reminder() to authenticated;

-- cria os lembretes do dia (push sai pelo trigger). Só pra quem: optou, tem push
-- assinado, ainda NÃO jogou a Seleção do Dia de hoje, e ainda não recebeu hoje.
create or replace function public.retro_create_daily_reminders() returns int
language plpgsql security definer set search_path = '' as $$
declare v_count int; v_today date := (now() at time zone 'America/Sao_Paulo')::date; v_team text;
begin
  perform public.retro_make_daily(v_today);
  select team_name_pt into v_team from public.retro_daily where daily_date = v_today;
  with novos as (
    insert into public.notifications (user_id, type, title, body, data)
    select pr.id, 'retro_daily', '🕹️ Seleção do Dia te espera',
      coalesce('Hoje é a Copa da ' || v_team || ' — mantenha sua sequência 🔥', 'Jogue a Seleção do Dia de hoje 🔥'),
      jsonb_build_object('url', '/retro')
    from public.profiles pr
    where pr.retro_daily_reminder
      and exists (select 1 from public.push_subscriptions ps where ps.user_id = pr.id)
      and not exists (select 1 from public.retro_runs r
                       where r.user_id = pr.id and r.is_daily and r.daily_date = v_today)
      and not exists (select 1 from public.notifications n
                       where n.user_id = pr.id and n.type = 'retro_daily'
                         and n.created_at >= v_today::timestamptz)
    returning 1
  )
  select count(*) into v_count from novos;
  return v_count;
end $$;
revoke execute on function public.retro_create_daily_reminders() from public, anon, authenticated;

-- 1x/dia às 21:00 UTC (18:00 de Brasília) — horário de boa pra um lembrete.
do $$
begin
  perform cron.schedule('retro-daily-reminders', '0 21 * * *',
    'select public.retro_create_daily_reminders();');
exception when others then
  raise notice 'cron retro-daily-reminders indisponível: %', sqlerrm;
end $$;
