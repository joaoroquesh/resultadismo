-- UF (estado) do Resultadista — coletado na personalização (opcional).
-- Aditivo e não-destrutivo. O próprio usuário atualiza via update em profiles
-- (RLS de self-update já cobre as colunas de perfil).
alter table public.profiles add column if not exists uf text;
