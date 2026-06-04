-- ============================================================================
-- Resultadismo · Performance (code review v2) · Índice de cobertura de palpites
-- ----------------------------------------------------------------------------
-- H8: get_confronto_ties/standings e usePlayerStats/useAllMyPredictions fazem
-- lookups por (user_id, match_id) lendo score_type/is_joker. O índice único já
-- existe em (user_id, match_id), mas sem cobrir essas colunas força heap fetch.
-- INCLUDE deixa as somas de pontos por período/jogador index-only.
-- ============================================================================

create index if not exists predictions_user_match_cover_idx
  on public.predictions (user_id, match_id)
  include (score_type, is_joker);
