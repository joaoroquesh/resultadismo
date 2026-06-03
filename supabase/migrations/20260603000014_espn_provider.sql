-- ============================================================================
-- Resultadismo · Provedor ESPN
-- ----------------------------------------------------------------------------
-- ESPN expõe um JSON público (scoreboard por data) com agenda, status ao vivo,
-- placar, nomes e escudos — grátis e estável, cobrindo amistosos, ligas e Copa.
-- Adiciona 'espn' ao enum de provedores de dados.
-- (PG15 permite ADD VALUE dentro da migração desde que não seja usado nela.)
-- ============================================================================

alter type public.data_provider add value if not exists 'espn';
