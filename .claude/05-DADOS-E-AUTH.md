# 05 — Dados, banco e autenticação

> Como os dados são tratados: tabelas, segurança (RLS), funções (RPCs), triggers/cron, e o fluxo de
> **login/logout**. A **fonte de verdade é `supabase/migrations/*.sql`** — este documento é o mapa,
> a migration é a lei. Regras de negócio sobre esses dados → [`06`](06-REGRAS-DE-NEGOCIO.md).

## 1. Princípios de tratamento de dados

1. **Segurança no banco (RLS-first).** Todo acesso é controlado por **Row Level Security** e por
   funções `SECURITY DEFINER`. O frontend nunca é a fronteira de segurança.
2. **Uma verdade só.** E-mail vive em `auth.users` (não em `public.profiles` — a coluna foi
   **removida** por privacidade; o app lê o próprio via `session.user.email`, e o admin via RPC).
3. **Pontuação/classificação são computadas no banco** (triggers + `get_league_standings`), nunca
   no client.
4. **Migrations são aditivas e ordenadas por número.** Deploy aplica em produção no push à `main`.
   Numeração colide entre sessões paralelas → ver [`09`](09-PARALELISMO.md).
5. **Tipos gerados.** `src/types/database.ts` vem de `supabase gen types` (`npm run db:types`).
   Não editar à mão.

## 2. Catálogo de tabelas (schema `public`, salvo indicado)

> Estado final consolidado das ~40 migrations. Colunas-chave; veja a migration para o detalhe.

| Tabela | Para que serve | Colunas/relacionamentos importantes |
|---|---|---|
| `profiles` | Perfil público do jogador (espelha `auth.users`) | `id`(=auth.users), `display_name`, `avatar_url` (escudo `crest:…`), `favorite_team`, **`is_app_admin`**. Sem `email`. |
| `competitions` | Campeonatos reais sincronizados | `name`, `slug`, `type` (LEAGUE/CUP), `provider` (manual/football_data/espn/thesportsdb), `provider_code` (ex.: WC, BSA), `is_published`, `display_name`, `sync_enabled`, **`catalog_seeded`** (1ª sync já feita), **`last_sync_ok`/`last_sync_error`/`last_sync_checked_at`** (saúde), datas, limite de dobros |
| `teams` | Times | `name`, `tla`, `crest_url`/`local_crest`, `country`, `provider_ref` |
| `matches` | Jogos reais | `competition_id`, times, `kickoff_at`, `status` (scheduled/live/finished/…), `home_score`/`away_score`, pênaltis (informativo), **`hidden`** (curadoria) |
| `predictions` | **1 palpite por usuário por jogo** (global — vale em toda liga que disputa aquela competição) | `user_id`,`match_id` (único), `home_pred`/`away_pred` (0–99), `score_type`, `points`, `is_joker` (dobro) |
| `leagues` | **Grupos** (grupos sociais) | `name`, `slug`, `owner_id`, `visibility`, `join_policy`, `join_code`, `status` (pending/active/rejected/archived), **`payment_status`**, **`name_approved`**, **`confronto_enabled`**, `deleted_at` (soft-delete) |
| `league_members` | Membros do grupo | `league_id`,`user_id` (único), `role` (owner/admin/member), `status` |
| `league_competitions` | Uma competição disputada no grupo, num **modo** | `league_id`,`competition_id`, `mode` (table/points/liga/cup), `settings` (jsonb — pontos por tipo), `starts_on`, `confronto_state`, `period_kind`, `participant_mode`, `liga_format`, `scheduled_draw_at` |
| `cup_ties` | Confronto A×B (Liga/Copa) | `league_competition_id`, `round_order`/`round_label`/`slot`, `member_a`/`member_b`, `points_a`/`points_b`, `winner_id`, `matchday`, `period_kind`/`period_value`, `walkover_user` |
| `confronto_participants` | Snapshot de quem entrou no sorteio | `league_competition_id`,`user_id`,`seed` |
| `confronto_optins` | Inscrições (modo opt-in) | `league_competition_id`,`user_id` (válidas só em `draft`) |
| `notifications` | Notificações in-app | `user_id`, `type` (nudge/deadline/result/…), `title`/`body`/`data`, `read_at` |
| `push_subscriptions` | Inscrições de Web Push | `user_id`, `endpoint` (único), `p256dh`, `auth` |
| `app_settings` | **Singleton (id=1)** de config global | `payment_mode`, `league_price_cents`, `promo_price_cents`/`promo_until`, prefixos de nome, **`maintenance_mode`/`maintenance_message`** |
| `sync_alerts` | Fila de decisões do admin sobre o catálogo — **2.5.0** | `competition_id`, `match_id`, `provider_ref`, `kind` (new_match/cancelled/api_error = acionável; team_resolved/kickoff_changed = informativo), `status` (pending/approved/rejected/applied), `payload`. Sem acesso de cliente; só RPCs `admin_*`. |
| `admin_audit_log` | Histórico de ações sync/admin — **2.5.0** | `actor` (null = sistema/cron), `action`, `entity_type`/`entity_id`, `detail` |
| `discount_codes` | Cupons | `code`, `percent_off` **ou** `amount_off_cents`, `max_uses`/`used_count`, `active`, `expires_at` |
| `league_payments` | Trilha de pagamentos (auditoria/idempotência) | `league_id`,`user_id`, `provider` (mercadopago/comp/test), `payment_id` (único), `status`, `amount_cents`, `discount_code` |
| `access_control` / `access_sessions` | Sala de espera (fila FIFO) | config singleton + 1 linha por aba (`state` active/waiting) |
| `rate_limits` | Rate limit das Edge Functions (janela fixa por bucket) — **2.1.0** | `bucket` (pk), `window_start`, `count`. Sem acesso de cliente; só `service_role`/`rate_limit_hit`. |
| `private.sync_config` | Config server-side do sync (URL das functions + service_key) | schema **`private`** — não exposto na API |

## 3. RLS — regras de acesso (resumo)

Padrão geral: **app-admin sempre pode**; o resto depende de propriedade/papel/visibilidade.

- **`profiles`**: todos autenticados leem; cada um edita só o seu. Trigger `profiles_guard` impede
  auto-elevação a admin.
- **`competitions` / `teams` / `matches`**: leitura para todos (inclusive **anônimo**, p/ a landing);
  escrita só app-admin. Helper `match_is_locked(id)` = `kickoff_at <= now()`.
- **`predictions`**: você lê **os seus** sempre; lê os dos **outros só após o `kickoff_at`**
  (`match_is_locked`). Inserir/editar/excluir **só antes** do jogo travar.
- **`leagues`**: vê se é pública, ou dono, ou membro, ou app-admin. Status/`payment_status`/
  `name_approved` são protegidos por trigger — só mudam via `service_role`/admin ou pelo contexto de
  liquidação (GUC `app.settle_bypass`). `confronto_enabled` protegido por trigger próprio.
- **`league_members`**: membros se veem; só admin do grupo adiciona/edita; o **dono é
  protegido** (`protect_league_owner`).
- **`league_competitions` / `cup_ties` / `confronto_*`**: visíveis a quem vê o grupo; escrita
  **só via RPC** `SECURITY DEFINER` — a policy de escrita direta em `cup_ties` foi **removida em
  2.1.0** (não há mais `INSERT/UPDATE/DELETE` direto via PostgREST; tudo passa por `draw_confronto`/
  `append_confronto_ties`/`advance_confronto_cup`/`leave_league`).
- **`league_payments`**: dono lê os seus; escrita só `service_role` (webhook).
- **`app_settings`**: todos leem (modo/preço); escrita só via RPC de admin. **`discount_codes`**:
  CRUD só admin (usuário valida via `validate_discount_code`).

## 4. RPCs (funções) — as que importam

**Pontuação & classificação**
- `compute_score_type(ph,pa,rh,ra)` → enum (`cravada`/`saldo`/`acerto`/`erro`) — IMMUTABLE.
- `score_points(score_type)` → int (3/2/1/0).
- `get_league_standings(lc_id)` → classificação com o **desempate fixo** (ver §6). `SECURITY
  DEFINER`, com guarda de acesso (membro/público/admin).
- `get_confronto_standings` / `get_confronto_ties` / `get_tie_detail` / `get_competition_periods` —
  confronto por período. **Guarda de visibilidade desde 2.1.0** (membro/público/admin — não vazam
  liga privada p/ anon); `ties`/`tie_detail` retornam vazio enquanto o sorteio está `scheduled`. →
  [`06`](06-REGRAS-DE-NEGOCIO.md).
- `advance_confronto_cup(lc_id)` — Copa: promove o vencedor de cada chave p/ a fase seguinte
  (idempotente; empate desempata por seed). Chamada "lazy" pelo client ao abrir o chaveamento.

**Grupo**
- `join_league_by_code(code)` / `join_public_league(id)` — entrar (respeita `join_policy`).
- `approve_league` / `reject_league` / `set_app_admin` — admin. → [`04`](04-ADMIN.md).
- `draw_confronto` / `undo_confronto_draw` / `toggle_confronto_optin` / `leave_league` — confronto.

**Pagamento** (detalhe em [`06`](06-REGRAS-DE-NEGOCIO.md))
- `confirm_league_payment` (webhook, idempotente; `paid`→ativa, `refunded`→arquiva). **2.1.0:**
  trava a liga (`for update`) e tem **guarda de estado terminal** (`refunded` não volta a `paid`).
- `simulate_league_payment` (modo teste — **só app-admin** desde 2.1.0), `refund_league` (reembolso
  atômico, `for update`, só `service_role`), `rate_limit_hit` (janela fixa por bucket, só
  `service_role`), `validate_discount_code`, `admin_*` de pagamento.

**Helpers de segurança**: `is_app_admin()`, `is_league_member(id)`, `is_league_admin(id)`,
`can_settle_leagues()`, `match_is_locked(id)`.

**Acesso/notificação**: `request_access`/`heartbeat_access`/`release_access` (fila, **só RPC, nunca
Realtime**); `nudge_member` (cutucar, anti-spam 30 min).

## 5. Triggers e cron

**Triggers-chave**
- `handle_new_user` (AFTER INSERT em `auth.users`): cria o `profile`; **1º usuário vira app-admin**.
- `predictions_score_on_write` (BEFORE INSERT/UPDATE de palpite): se o jogo está `finished`, calcula
  `score_type`/`points`/`scored_at`; senão deixa nulo (aguardando resultado).
- `matches_rescore_predictions` (AFTER UPDATE de placar/status): **recalcula todos os palpites** do
  jogo quando o resultado muda (e reverte se voltar a não-finalizado).
- `leagues_before_insert` (gera `join_code`, força status/payment conforme modo/papel) +
  `leagues_after_insert` (adiciona o dono como membro).
- Guards: `leagues_guard_status`, `protect_league_owner`, `leagues_guard_confronto_enabled`,
  `profiles_guard`, `enforce_joker_limit` (com `pg_advisory_xact_lock` desde 2.1.0 — sem corrida no
  limite 2/semana), `league_payments_count_discount` (conta o cupom de forma **atômica**, não estoura
  `max_uses`).

**Cron (pg_cron)**
- `run_football_sync(mode)` — dispara a Edge Function `sync-football`. **2.5.0**: `scores` a cada
  `*/5` (mas só chama a API se `should_sync_scores()` = há jogo ao vivo/prestes/recém) e `catalog`
  diário 09:00 UTC. Só dispara de fato com `private.sync_config` populado (URL + service_key).
  RPCs de admin: `admin_list_sync_alerts`, `admin_resolve_sync_alert`, `admin_set_competition_sync`,
  `admin_set_maintenance`, `admin_reopen_match`, `admin_recent_audit`, `admin_system_health` (todas
  `SECURITY DEFINER`, app-admin).
- `create_deadline_reminders()` — lembrete de prazo de palpite (jogo começando, membro não palpitou).
- `release_scheduled_confrontos()` — libera sorteios agendados (a cada 5 min).
- Purga de grupos `pending`+não pagas após ~24h.

## 6. O desempate (fixo) — `get_league_standings`

Ordem **exata** (já implementada; não inventar outra sem decisão):

```
pontos DESC
→ cravadas DESC
→ saldos DESC
→ aproveitamento DESC      (pontos / (pontos_máx_possíveis) )
→ acertividade DESC        ((cravadas+saldos+acertos) / jogos)
→ created_at ASC           (membro mais antigo vence)
```

Os pontos por tipo são lidos de `league_competitions.settings.points` (default cravada 3 / saldo 2 /
acerto 1), então um grupo pode customizar a pontuação sem mudar a função.

## 7. Autenticação (login/logout)

**Provider:** Supabase Auth com **Google OAuth (fluxo PKCE)**. Senha existe para usuários de teste
(seed). Config do client em `src/lib/supabase.ts` (`persistSession`, `autoRefreshToken`,
`detectSessionInUrl`, `flowType: "pkce"`).

**Fluxo de login**
1. `signInWithGoogle()` (`features/auth/AuthProvider.tsx`) → redireciona p/ o Google → volta em
   **`/auth/callback`** (`AuthCallback.tsx`).
2. O trigger `handle_new_user` cria o `profile` (nome/avatar do Google; **1º usuário = app-admin**).
3. `AuthProvider` mantém `{ session, user, profile, loading, isAppAdmin }`: no load inicial faz
   `getSession()` e **espera carregar o profile** antes de liberar `loading=false`; depois escuta
   `onAuthStateChange`. `isAppAdmin = profile.is_app_admin`.
4. Os **guards** (`RequireAuth`, `RequireAdmin`) usam esse estado. → [`03`](03-PAGINAS.md), [`04`](04-ADMIN.md).

**Logout:** `signOut()` → `supabase.auth.signOut()` + limpa o profile. O Supabase invalida o token;
a sessão sai do `localStorage`.

**Sala de espera (fila de acesso):** em pico, novos acessos entram numa fila FIFO (`AccessGate` +
RPCs `request/heartbeat/release_access`) em vez de derrubar quem está dentro. **Fail-open**: qualquer
erro no portão → admite (o portão nunca pode virar apagão). Usa **só RPC HTTP, nunca Realtime**.

## 8. Edge Functions (banco ↔ serviços) → ver [`07`](07-BUILD-E-DEPLOY.md)

`sync-football` (sincroniza jogos: ESPN/football-data/TheSportsDB) · `send-push` (Web Push) ·
`create-league-checkout` (preferência Mercado Pago, preço efetivo no servidor) ·
`mercadopago-webhook` (confirma pagamento, público `verify_jwt=false`) · `cancel-league-refund`
(reembolso self-service) · `list-provider-competitions` (catálogo de competições por provedor).

## 9. Ambiente local

- Supabase em Docker, portas **5442x** (API 54421, DB 54422, Studio 54423) — deslocadas p/ não
  colidir com outro projeto na máquina. `supabase start` aplica migrations + `seed.sql`.
- `psql` não está no PATH → `docker exec supabase_db_resultadismo psql -U postgres -d postgres`.
- Usuários de teste (senha `resultadismo123`): `joao.crf93@gmail.com` (app-admin),
  `bruno@teste.com`, `luan@teste.com`.
- ⚠️ **Nunca `supabase db push`/`link` aqui** — o CLI desta máquina aponta para outro projeto.
  Deploy = push na `main`. → [`MESTRE.md`](MESTRE.md) §3, [`07`](07-BUILD-E-DEPLOY.md).
