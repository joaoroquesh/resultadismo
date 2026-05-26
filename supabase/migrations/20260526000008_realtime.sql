-- ============================================================================
-- Resultadismo · 08 · Realtime para placar ao vivo
-- Publica a tabela de jogos para que o app receba mudanças de placar/status.
-- ============================================================================

do $$
begin
  alter publication supabase_realtime add table public.matches;
exception
  when duplicate_object then null;
  when others then raise notice 'realtime publication: %', sqlerrm;
end $$;
