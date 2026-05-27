-- ============================================================================
-- Resultadismo · 17 · Fase 1 de escala — índice de performance da classificação
-- ----------------------------------------------------------------------------
-- get_league_standings varre os palpites pontuados (score_type not null) dos
-- jogos finalizados de uma competição e agrega por membro. O caminho quente é
-- o join matches → predictions por match_id.
--
-- Índice COVERING + PARCIAL: a busca em predictions vira index-only (sem ir ao
-- heap) e já restrita aos palpites pontuados. Mantém a RPC on-the-fly, que é
-- exata. Para uma ÚNICA liga passar de ~milhares de membros, o próximo passo é
-- materializar (tabela league_standings atualizada por trigger/cron); até lá,
-- este índice resolve com risco zero e sem mudar o comportamento.
-- ============================================================================

create index if not exists predictions_scored_cover_idx
  on public.predictions (match_id)
  include (user_id, score_type, is_joker)
  where score_type is not null;

-- Acelera "achar os jogos finalizados de uma competição" (lado matches do join).
create index if not exists matches_comp_finished_idx
  on public.matches (competition_id)
  where status = 'finished';
