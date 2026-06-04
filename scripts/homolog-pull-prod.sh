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
# Pegue a connection string em: Supabase Dashboard → Project Settings → Database
# → Connection string. Prefira um usuário/role READ-ONLY (mais seguro ainda —
# garante leitura mesmo se algo der errado). NÃO commite a URL.
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
docker exec -e U="$PROD_DB_URL" "$DB" pg_dump "$PROD_DB_URL" \
  --data-only --no-owner --no-privileges --disable-triggers \
  --schema=public --schema=auth \
  --exclude-table-data='auth.schema_migrations' \
  --exclude-table-data='auth.audit_log_entries' \
  --exclude-table-data='auth.flow_state' \
  --exclude-table-data='auth.sessions' \
  --exclude-table-data='auth.refresh_tokens' \
  --exclude-table-data='auth.one_time_tokens' \
  --exclude-table-data='public.rate_limits' \
  > "$DUMP"
echo "    snapshot salvo ($(wc -l < "$DUMP" | tr -d ' ') linhas)"

echo "==> 2/4  Reset do banco LOCAL (schema das migrations)…"
supabase db reset >/dev/null

echo "==> 3/4  Limpa o seed local e carrega o snapshot de produção…"
docker exec -i "$DB" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1 <<'SQL'
set session_replication_role = replica;
truncate
  public.predictions, public.cup_ties, public.confronto_participants, public.confronto_optins,
  public.league_competitions, public.league_members, public.leagues, public.league_payments,
  public.matches, public.teams, public.competitions, public.notifications,
  public.push_subscriptions, public.discount_codes, public.profiles
  restart identity cascade;
delete from auth.identities;
delete from auth.users;
SQL
{ echo "set session_replication_role = replica;"; cat "$DUMP"; } \
  | docker exec -i "$DB" psql -U postgres -d postgres -q -v ON_ERROR_STOP=1

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
