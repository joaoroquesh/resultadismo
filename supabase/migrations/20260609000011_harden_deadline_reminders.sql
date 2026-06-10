-- ============================================================================
-- Resultadismo · Hardening: create_deadline_reminders só roda pelo cron
-- ----------------------------------------------------------------------------
-- A função nunca recebeu revoke (default do Postgres: EXECUTE para PUBLIC),
-- então QUALQUER cliente (até anon, via REST) podia invocá-la. O efeito é
-- benigno (cria lembretes legítimos, idempotente por jogo), mas é uma porta
-- de spam/carga desnecessária. O pg_cron roda como superuser e não é afetado.
-- ============================================================================
revoke all on function public.create_deadline_reminders() from public, anon, authenticated;
