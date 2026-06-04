#!/usr/bin/env bash
# ============================================================================
# Homologação · puxa um SNAPSHOT READ-ONLY de PRODUÇÃO para o Supabase LOCAL.
# ----------------------------------------------------------------------------
# pg_dump SÓ LÊ produção — NUNCA escreve. Toda alteração sua acontece na cópia
# LOCAL; o banco de produção (onde todo mundo joga) jamais é tocado.
#
# Uso:
#   PROD_DB_URL="postgresql://USUARIO:SENHA@HOST:5432/postgres" npm run homolog:pull
#
# Onde achar a connection string (Supabase Dashboard):
#   botão "Connect" (topo) → aba "Direct · Connection string" → método
#   "Session pooler" (IPv4; necessário p/ pg_dump fora de rede IPv6).
#   A SENHA do banco NÃO é exibida após a criação do projeto — se você não a
#   guardou, use "Reset password" na mesma tela (Database settings). Resetar não
#   afeta o app (front usa anon key; functions usam service key/access token;
#   migrations sobem pela integração nativa do GitHub — nada usa a senha crua).
#   Prefira um usuário/role READ-ONLY. NÃO commite a URL.
#
# ⚠️ Os dados de produção contêm dados reais de usuários (nomes, e-mails em
# auth.users). Eles vão para a sua máquina local. Use com responsabilidade
# (LGPD — você é o controlador). Para anonimizar, rode com ANONYMIZE=1.
# ============================================================================
set -euo pipefail

PROD_DB_URL="${PROD_DB_URL:?Defina PROD_DB_URL com a connection string de PRODUÇÃO (read-only). pg_dump só LÊ prod.}"
DEV_PW="${HOMOLOG_DEV_PASSWORD:-resultadismo123}"
ANONYMIZE="${ANONYMIZE:-0}"
DB="supabase_db_resultadismo"
DUMP="/tmp/resultadismo-prod-snapshot.sql"

docker ps --format '{{.Names}}' | grep -q "^${DB}$" || {
  echo "❌ Stack local não está rodando. Rode primeiro:  npm run db:start"; exit 1;
}

echo "==> 1/4  Dump READ-ONLY de produção (pg_dump só lê)…"
# Usa o pg_dump do container local como CLIENTE apontando para PROD. --data-only.
# Dumpamos TODO o schema public + APENAS auth.users e auth.identities.
# NÃO dumpamos o schema `auth` inteiro de propósito: a nuvem tem tabelas de
# subsistema (oauth/mfa/saml/sso/webauthn/custom_oauth_providers/instances) que
# não batem com o Supabase local (versão diferente do GoTrue) e fariam a carga
# abortar. Para logar/impersonar localmente só precisamos de users + identities.
docker exec "$DB" pg_dump "$PROD_DB_URL" \
  --data-only --no-owner --no-privileges \
  --table='public.*' \
  --table='auth.users' \
  --table='auth.identities' \
  --exclude-table-data='public.rate_limits' \
  > "$DUMP"
echo "    snapshot salvo ($(wc -l < "$DUMP" | tr -d ' ') linhas)"

echo "==> 2/4  Reset do banco LOCAL (schema das migrations)…"
supabase db reset >/dev/null

echo "==> 3/4  Limpa o local e carrega o snapshot de produção…"
# Trunca TODO o schema public dinamicamente (não uma lista fixa): as migrations
# inserem linhas-padrão em access_control/app_settings que dariam conflito de PK
# com o snapshot. session_replication_role=replica desliga FKs e triggers
# (inclusive handle_new_user) durante a carga.
{
  cat <<'SQL'
set session_replication_role = replica;
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('truncate public.%I restart identity cascade', r.tablename);
  end loop;
end $$;
truncate auth.users, auth.identities cascade;
SQL
  cat "$DUMP"
} | docker exec -i "$DB" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1

echo "==> 4/4  Senha de dev em todos os usuários locais (login via DevPanel)…"
docker exec -i "$DB" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 <<SQL
update auth.users
  set encrypted_password = extensions.crypt('${DEV_PW}', extensions.gen_salt('bf')),
      email_confirmed_at  = coalesce(email_confirmed_at, now());
$( [ "$ANONYMIZE" = "1" ] && cat <<'ANON'
update public.profiles set display_name = 'Jogador ' || left(id::text, 4);
update auth.users set email = 'user_' || left(id::text, 8) || '@homolog.local';
update auth.identities set identity_data = jsonb_set(coalesce(identity_data,'{}'), '{email}', to_jsonb('user_' || left(user_id::text,8) || '@homolog.local'));
ANON
)
SQL

rm -f "$DUMP"
echo ""
echo "✅ Snapshot de produção carregado no LOCAL. Produção NÃO foi tocada (só leitura)."
echo "   Abra o app (npm run dev) e use o DevPanel → 'entrar como <e-mail>' p/ ver como qualquer usuário."
[ "$ANONYMIZE" = "1" ] && echo "   (dados anonimizados: nomes/e-mails substituídos)"
