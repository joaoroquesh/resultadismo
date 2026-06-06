-- ============================================================================
-- Resultadismo · Sync — timeout do pg_net na chamada do cron (5s → 30s)
-- ----------------------------------------------------------------------------
-- O sync funciona (auth via CRON_SECRET ok, last_sync_ok=true), MAS a chamada
-- `net.http_post` do cron usava o timeout padrão do pg_net (5s). A edge function
-- leva ~5s (busca ESPN + football_data + grava no banco), então o pg_net registra
-- "Timeout of 5000 ms" e grava status_code NULL em net._http_response — apesar de
-- a função concluir o sync logo depois. Isso (a) deixa os logs do pg_net
-- ilegíveis (parece falha) — e foi por essa tabela que diagnosticamos o 403 —, e
-- (b) arrisca cortar a função no meio em dias com muito jogo.
--
-- Fix: 30s de timeout na chamada do cron. Só recria run_football_sync (idêntica,
-- + timeout_milliseconds). Não toca em should_sync_scores nem no cron.
-- ============================================================================

create or replace function public.run_football_sync(p_mode text default 'scores')
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
    return;  -- config ausente → no-op (cron não quebra)
  end if;

  -- Modo scores: só dispara se há jogo ao vivo / prestes / recém-terminado.
  if p_mode = 'scores' and not public.should_sync_scores() then
    return;
  end if;

  perform net.http_post(
    url := cfg.functions_url || '/sync-football',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cfg.service_key
    ),
    body := jsonb_build_object('mode', p_mode),
    timeout_milliseconds := 30000  -- a função leva ~5s; 5s (padrão) cortava cedo
  );
exception when others then
  raise notice 'run_football_sync(%) falhou: %', p_mode, sqlerrm;
end;
$$;

revoke all on function public.run_football_sync(text) from public, anon, authenticated;
