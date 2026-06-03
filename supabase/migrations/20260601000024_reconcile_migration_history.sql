-- Reconciliação do histórico de migrations (prod <-> repo).
--
-- O banco de produção registrou a migration de "name_review" sob o número ANTIGO
-- 20260601000024. Depois, em outra sessão, o arquivo foi renumerado para
-- 20260602000022 (commit d459677). Com isso, o prod ficou com uma versão
-- (20260601000024) que não tinha mais arquivo correspondente no repo.
--
-- O integration do Supabase (push -> main) faz um pré-check de histórico e falha
-- com "Remote migration versions not found in local migrations directory" quando
-- existe versão no remoto sem arquivo local — e isso BLOQUEAVA a aplicação de
-- TODAS as migrations seguintes (inclusive as do Confronto: 20260603000002..07).
--
-- Este arquivo restabelece a presença local da versão 20260601000024, destravando
-- o push. É idempotente e seguro:
--   - Em prod, a versão 20260601000024 já consta como aplicada -> o conteúdo abaixo
--     NÃO roda de novo (o integration só aplica versões ausentes no remoto).
--   - Caso a versão não exista no remoto, o ALTER abaixo é no-op (a coluna
--     name_approved já foi criada pela 20260602000022).

alter table public.leagues
  add column if not exists name_approved boolean not null default true;
