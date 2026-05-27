-- ============================================================================
-- Resultadismo · 13 · Índices únicos completos p/ upsert do sync
-- O upsert do supabase-js usa ON CONFLICT (provider, provider_ref), que NÃO
-- casa com índice único PARCIAL. Troca por índices únicos completos
-- (NULLs continuam distintos, então múltiplas linhas 'manual' seguem válidas).
-- ============================================================================

drop index if exists public.teams_provider_uk;
drop index if exists public.matches_provider_uk;

create unique index teams_provider_uk on public.teams (provider, provider_ref);
create unique index matches_provider_uk on public.matches (provider, provider_ref);
