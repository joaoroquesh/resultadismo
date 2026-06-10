-- Retrô — rodada 15: presença e tempo de uso SEPARADOS por jogo (pedido do PO p/ admin).
-- O app-mãe já tem profiles.last_active_at (online) + usage_seconds (tempo). O Retrô
-- roda em shell próprio (sem PresenceTracker), então a presença no Retrô é distinta.
-- Aqui: profiles ganha retro_last_active_at + retro_usage_seconds (logados no Retrô);
-- retro_touch passa a alimentar isso e o agregado diário; retro_admin_stats compara os 2.

alter table public.profiles
  add column if not exists retro_last_active_at timestamptz,
  add column if not exists retro_usage_seconds bigint not null default 0;

-- heartbeat do Retrô: agrega o total do dia (todos) e, se logado, marca presença +
-- tempo de uso do próprio Retrô (delta limitado a 60s/batida).
create or replace function public.retro_touch(p_seconds int) returns void
language plpgsql security definer set search_path = '' as $$
declare v_s int := greatest(0, least(coalesce(p_seconds, 0), 60));
begin
  insert into public.retro_usage_daily as u (day, screen_seconds)
  values ((now() at time zone 'America/Sao_Paulo')::date, v_s)
  on conflict (day) do update set screen_seconds = u.screen_seconds + excluded.screen_seconds;

  if auth.uid() is not null then
    update public.profiles
       set retro_last_active_at = now(),
           retro_usage_seconds = retro_usage_seconds + v_s
     where id = auth.uid();
  end if;
end $$;
revoke execute on function public.retro_touch(int) from public;
grant execute on function public.retro_touch(int) to anon, authenticated;

-- comparativo p/ o admin: online agora e tempo total, Retrô vs app-mãe.
create or replace function public.retro_admin_stats() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not public.is_app_admin() then raise exception 'só admin'; end if;
  return jsonb_build_object(
    'online_retro', (select count(*) from public.profiles where retro_last_active_at > now() - interval '90 seconds'),
    'online_main',  (select count(*) from public.profiles where last_active_at > now() - interval '90 seconds'),
    'retro_seconds_total', (select coalesce(sum(screen_seconds), 0) from public.retro_usage_daily),
    'main_seconds_total',  (select coalesce(sum(usage_seconds), 0) from public.profiles),
    'retro_seconds_today', (select coalesce(screen_seconds, 0) from public.retro_usage_daily where day = v_today),
    'retro_anon_runs_today', (select coalesce(anon_runs_started, 0) from public.retro_usage_daily where day = v_today),
    'retro_players_total', (select count(*) from public.profiles where retro_usage_seconds > 0)
  );
end $$;
revoke execute on function public.retro_admin_stats() from public, anon;
grant execute on function public.retro_admin_stats() to authenticated;
