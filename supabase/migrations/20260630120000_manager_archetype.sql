-- Identidade de treinador do Maneiger (arquétipo escolhido no quiz).
-- Aditivo e não-destrutivo: coluna de texto anulável em profiles. O próprio usuário
-- atualiza via update em profiles (a RLS de self-update de perfil já cobre as colunas
-- de preferência do Resultadista). localStorage é a fonte da verdade client-side; esta
-- coluna é o espelho pra sincronizar entre dispositivos quando logado.
alter table public.profiles add column if not exists manager_archetype text;
