-- ============================================================================
-- Resultadismo · Curadoria de jogos
-- ----------------------------------------------------------------------------
-- `hidden`: o admin pode ocultar jogos específicos de uma competição (ex.: um
-- amistoso que não quer no bolão). Jogo oculto não aparece para palpitar, mas
-- continua visível e gerenciável na tela admin "Ver jogos".
-- A escrita já é coberta pela policy matches_admin_write (app_admin = ALL).
-- ============================================================================

alter table public.matches
  add column if not exists hidden boolean not null default false;

-- índice parcial: a leitura pública filtra hidden = false
create index if not exists matches_visible_idx
  on public.matches (competition_id, kickoff_at)
  where hidden = false;
