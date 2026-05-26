-- ============================================================================
-- Resultadismo · 07 · Sincronização automática (pg_cron + pg_net)
-- Resiliente: se as extensões não existirem (ambiente local), vira no-op.
-- Em produção, basta inserir a config (URL + service_key) para ativar.
-- ============================================================================

do $$
begin
  create extension if not exists pg_cron;
exception when others then
  raise notice 'pg_cron indisponível: %', sqlerrm;
end $$;

do $$
begin
  create extension if not exists pg_net;
exception when others then
  raise notice 'pg_net indisponível: %', sqlerrm;
end $$;

-- Config em schema privado (não exposto na API)
create schema if not exists private;

create table if not exists private.sync_config (
  id int primary key default 1 check (id = 1),
  functions_url text, -- ex.: https://<project-ref>.supabase.co/functions/v1
  service_key text
);

-- Dispara a edge function de sincronização. No-op se config ausente.
create or replace function public.run_football_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cfg private.sync_config;
begin
  select * into cfg from private.sync_config where id = 1;
  if cfg.functions_url is null or cfg.service_key is null then
    return;
  end if;
  perform net.http_post(
    url := cfg.functions_url || '/sync-football',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_key
    ),
    body := '{}'::jsonb
  );
exception when others then
  raise notice 'run_football_sync falhou: %', sqlerrm;
end;
$$;

revoke all on function public.run_football_sync() from public, anon, authenticated;

-- Agenda a cada 15 minutos (guardado caso pg_cron não exista)
do $$
begin
  perform cron.schedule(
    'resultadismo-sync-football',
    '*/15 * * * *',
    'select public.run_football_sync();'
  );
exception when others then
  raise notice 'cron.schedule indisponível: %', sqlerrm;
end $$;
