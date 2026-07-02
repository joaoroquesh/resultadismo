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
| `profiles` | Perfil público do jogador (espelha `auth.users`) | `id`(=auth.users), `display_name`, `avatar_url` (escudo `crest:…`), `favorite_team`, **`is_app_admin`**, **`notif_prefs`** (jsonb `deadline`/`nudge`/`broadcast`, default tudo on), `last_active_at` (presença). Sem `email`. |
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
| `notifications` | Notificações in-app | `user_id`, `type` (nudge/deadline/**broadcast**/**admin_alert**/result/…), `title`/`body`/`data`, `read_at` |
| `push_subscriptions` | Inscrições de Web Push | `user_id`, `endpoint` (único), `p256dh`, `auth` |
| `notification_broadcasts` | Histórico dos avisos em massa do admin — **1.8.0** | `title`/`body`/`url`, `segment`, `segment_league_id`/`segment_lc_id`/`segment_top_n`, `sent_count`, `created_by`. **RLS ligado sem policy** — acesso só via `admin_list_broadcasts`. |
| `app_settings` | **Singleton (id=1)** de config global | `payment_mode`, `league_price_cents`, `promo_price_cents`/`promo_until`, prefixos de nome, **`maintenance_mode`/`maintenance_message`** |
| `sync_alerts` | Fila de decisões do admin sobre o catálogo — **1.5.0** | `competition_id`, `match_id`, `provider_ref`, `kind` (new_match/cancelled/api_error = acionável; team_resolved/kickoff_changed = informativo), `status` (pending/approved/rejected/applied), `payload`. Sem acesso de cliente; só RPCs `admin_*`. |
| `admin_audit_log` | Histórico de ações sync/admin — **1.5.0** | `actor` (null = sistema/cron), `action`, `entity_type`/`entity_id`, `detail` |
| `discount_codes` | Cupons | `code`, `percent_off` **ou** `amount_off_cents`, `max_uses`/`used_count`, `active`, `expires_at` |
| `league_payments` | Trilha de pagamentos (auditoria/idempotência) | `league_id`,`user_id`, `provider` (mercadopago/comp/test), `payment_id` (único), `status`, `amount_cents`, `discount_code` |
| `access_control` / `access_sessions` | Sala de espera (fila FIFO) | config singleton + 1 linha por aba (`state` active/waiting) |
| `app_analytics_sessions` / `app_analytics_events` | Analytics first-party do app-admin | Sessões, page views, tempo e eventos de minigame por produto (`app`/`retro`/`manager`), com `visitor_key` aleatório para anônimo, `user_id` quando logado, rota normalizada, `is_app_admin` para filtro operacional e **RLS-on sem policy** — escrita só via `track_app_usage`, leitura só via RPCs admin. `/admin` não entra na coleta. |
| `rate_limits` | Rate limit das Edge Functions (janela fixa por bucket) — **1.1.0** | `bucket` (pk), `window_start`, `count`. Sem acesso de cliente; só `service_role`/`rate_limit_hit`. |
| `private.sync_config` | Config server-side do sync (URL das functions + service_key) | schema **`private`** — não exposto na API |
| `retro_matches` / `retro_runs` / `retro_run_matches` / `retro_daily` / `retro_usage_daily` | **Mini-jogo Retrô** (placares históricos) — 964 jogos de Copas (seed CC0), runs (permanentes só Copa do Dia de logado; resto purgado por cron), desafio do dia e agregado de uso anônimo | **Todas RLS-on SEM policy** (gabarito nunca desce ao client) — acesso só via RPCs `retro_*`. → [`12-RETRO-MINIJOGO.md`](12-RETRO-MINIJOGO.md) |

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
  1.1.0** (não há mais `INSERT/UPDATE/DELETE` direto via PostgREST; tudo passa por `draw_confronto`/
  `append_confronto_ties`/`advance_confronto_cup`/`leave_league`).
- **`league_payments`**: dono lê os seus; escrita só `service_role` (webhook).
- **`app_settings`**: todos leem (modo/preço); escrita só via RPC de admin. **`discount_codes`**:
  CRUD só admin (usuário valida via `validate_discount_code`).

## 4. RPCs (funções) — as que importam

**Pontuação & classificação**
- `compute_score_type(ph,pa,rh,ra)` → enum (`cravada`/`saldo`/`acerto`/`erro`) — IMMUTABLE.
- `score_points(score_type)` → int (3/2/1/0).
- `get_league_standings(lc_id)` → classificação com o **desempate fixo** (ver §6). `SECURITY
  DEFINER`, com guarda de acesso (membro/público/admin). Conta só jogos com kickoff **em BRT** ≥
  `league_competitions.starts_on` (null = tudo) e dentro do recorte de seleções; `get_my_league_positions`
  e `get_group_rank_window` **delegam** a ela.
- `competition_period(competition_id)` → período `[1º jogo, último jogo]` da competição (em BRT) e
  `starts_on_window(lc_id)` → janela de edição da **data de início do bolão** (editável até a Copa
  terminar) + limites. Espelham o trigger `trg_lc_starts_on_window` (migration `20260615190000`). →
  [`06`](06-REGRAS-DE-NEGOCIO.md) §4.
- `get_confronto_standings` / `get_confronto_ties` / `get_tie_detail` / `get_competition_periods` —
  confronto por período. **Guarda de visibilidade desde 1.1.0** (membro/público/admin — não vazam
  liga privada p/ anon); `ties`/`tie_detail` retornam vazio enquanto o sorteio está `scheduled`. →
  [`06`](06-REGRAS-DE-NEGOCIO.md).
- `advance_confronto_cup(lc_id)` — Copa: promove o vencedor de cada chave p/ a fase seguinte
  (idempotente; empate desempata por seed). Chamada "lazy" pelo client ao abrir o chaveamento.

**Grupo**
- `join_league_by_code(code)` / `join_public_league(id)` — entrar (respeita `join_policy`).
- `approve_league` / `reject_league` / `set_app_admin` — admin. → [`04`](04-ADMIN.md).
- `draw_confronto` / `undo_confronto_draw` / `toggle_confronto_optin` / `leave_league` — confronto.

**Pagamento** (detalhe em [`06`](06-REGRAS-DE-NEGOCIO.md))
- `confirm_league_payment` (webhook, idempotente; `paid`→ativa, `refunded`→arquiva). **1.1.0:**
  trava a liga (`for update`) e tem **guarda de estado terminal** (`refunded` não volta a `paid`).
- `simulate_league_payment` (modo teste — **só app-admin** desde 1.1.0), `refund_league` (reembolso
  atômico, `for update`, só `service_role`), `rate_limit_hit` (janela fixa por bucket, só
  `service_role`), `validate_discount_code`, `admin_*` de pagamento.

**Mini-jogo Retrô (2026-06-10)** — `retro_start_run` (Copa do Dia 1/dia com retomada + guarda
anti-abuso anônimo 30/h), `retro_next` (serve o jogo sob demanda — o cronômetro nasce no clique),
`retro_answer` (janela de tempo no servidor + pontuação via `compute_score_type`), `retro_run_summary`
(share sem spoiler), `retro_leaderboard`, `retro_my_stats` (streak), `retro_touch_anon` (agregado,
clamp 60s), `retro_purge_ephemeral` (cron diário). Detalhe: [`12-RETRO-MINIJOGO.md`](12-RETRO-MINIJOGO.md).

**Helpers de segurança**: `is_app_admin()`, `is_league_member(id)`, `is_league_admin(id)`,
`can_settle_leagues()`, `match_is_locked(id)`.

**Acesso/notificação**: `request_access`/`heartbeat_access`/`release_access` (fila, **só RPC, nunca
Realtime**); `nudge_member` (cutucar, anti-spam 30 min).

**Analytics first-party (2026-07-01)**
- `track_app_usage(session_key, visitor_key, product, route, event_type, seconds, meta)` — coleta
  best-effort de page view/heartbeat. Produtos válidos: `app`, `retro`, `manager`; eventos:
  `page_view`, `heartbeat`, `manager_match_complete`; segundos capados a 90. App-admin é gravado com
  `is_app_admin=true` para filtro no painel; a rota `/admin` segue bloqueada no client.
- `admin_app_metrics_range(start_day, end_day, product, include_admins)` — painel agregado para
  app-admin: período flexível até o dia mais antigo com registro e produto `all|app|retro|manager`;
  retorna resumo, série diária, páginas com detalhe diário e produtos. Por padrão filtra admins;
  com `include_admins=true`, inclui os acessos de admin que foram gravados já com flag. As médias
  de sessão/tempo usam usuários ou usuário-dia ativos, não dias zerados do calendário.
- `admin_player_metrics(user_id)` — painel privado no perfil do jogador para app-admin: produtos
  acessados, grupos/origem, minigames, ritmo de palpites e blocos rápidos. Cruza `auth.users` só
  nessa leitura operacional de admin.

**Notificações (1.8.0)**
- `get_notification_prefs()` / `set_notification_pref(type, enabled)` — preferências por usuário
  (`deadline`/`nudge`/`broadcast`), self via `auth.uid()`. `get_unread_count()` — badge do sininho.
- `admin_broadcast_preview(segment, arg)` / `admin_send_broadcast(title, body, url, segment, arg)` /
  `admin_list_broadcasts(limit)` / `admin_list_group_targets()` — avisos em massa, gate
  `is_app_admin()`. → [`04`](04-ADMIN.md). Segmentos: all/no_prediction/online/group/group_top.
- **Internas** (`execute` revogado de todos; só rodam via outras funções/triggers):
  `wants_notification(user, type)` (admin_alert ignora prefs), `private.broadcast_recipients(segment,
  arg)` (cada segmento já filtra quem desligou avisos), `fan_notify_admins(...)` (alerta pros
  app-admins com dedupe 6h). `create_deadline_reminders` e `nudge_for_match` respeitam a preferência.

**Dados de jogos multi-fonte (2.12.0)**
- Tabelas: **`competition_sources`** (várias fontes por competição: 1 `primary` dona do calendário +
  N `secondary` que só validam placar; cadeia de fallback) e **`match_sources`** (1 observação por
  `(jogo, fonte)` — base do voto e da detecção de divergência). Ambas RLS-on **sem policy** (só via
  RPC). `competitions.in_personalization` (flag) e colunas em `matches`: `frozen`/`frozen_at`,
  `manual_lock`/`manually_edited_*`, **`soft_lock`**, `score_sources_count`, `score_conflict`.
- `resolve_match_golden(p_match_ids[])` (interna, grant só `service_role`; **cron a cada 10 min**):
  placar golden = voto da maioria das fontes (empate → mais recente); marca `score_conflict`; e
  **congela** (decisão #3) finalizado + ≥2 fontes + >1h. **Nunca** toca `manual_lock`/`frozen`.
- **Override do admin (2 modos):** **Travar** (`manual_lock=true`) blinda placar **e pênaltis** —
  `reconcilePrimary` e `resolve_match_golden` pulam jogo travado (só gravam observação). **Adiantar**
  (`soft_lock=true`+`manual_lock=true`) segura o placar adiantado até a API alcançar:
  `release_soft_overrides()` (grant `service_role`, **cron `resultadismo-release-soft` 25s**) destrava
  (`manual_lock`/`soft_lock`→false) assim que alguma fonte reporta o **mesmo** placar (pênaltis entram
  só se o admin os definiu). Aditivo: não altera `resolve_match_golden`/`reconcilePrimary`.
- RPCs de admin (gate `is_app_admin()`): `admin_override_match` (placar/status + lock, decisão #8),
  `admin_set_match_lock`, `admin_unfreeze_match`, `admin_list_match_conflicts`,
  `admin_{list,upsert,set_enabled,remove}_competition_source`. → [`04`](04-ADMIN.md) aba Dados.
- O sync (`sync-football`) ficou multi-fonte: primária reconcilia a estrutura; secundárias casam por
  dia+nomes e só gravam observação (nunca inserem); respeita freeze/lock; degrada com graça.

## 5. Triggers e cron

**Triggers-chave**
- `handle_new_user` (AFTER INSERT em `auth.users`): cria o `profile`; **1º usuário vira app-admin**.
- `predictions_score_on_write` (BEFORE INSERT/UPDATE de palpite): se o jogo está `finished`, calcula
  `score_type`/`points`/`scored_at`; senão deixa nulo (aguardando resultado).
- `matches_rescore_predictions` (AFTER UPDATE de placar/status): **recalcula todos os palpites** do
  jogo quando o resultado muda (e reverte se voltar a não-finalizado).
- `predictions_score_on_write` também normaliza o "quem passa" do mata-mata: vitória mantém
  `advance_team_id` nulo (classificado implícito pelo placar), empate exige/assume o mandante. A
  migration `20260629010000` fez backfill dos empates antigos de mata-mata que estavam vazios,
  preservando escolhas já preenchidas.
- `leagues_before_insert` (gera `join_code`, força status/payment conforme modo/papel) +
  `leagues_after_insert` (adiciona o dono como membro).
- Guards: `leagues_guard_status`, `protect_league_owner`, `leagues_guard_confronto_enabled`,
  `profiles_guard`, `enforce_joker_limit` (com `pg_advisory_xact_lock` desde 1.1.0 — sem corrida no
  limite 2/semana), `league_payments_count_discount` (conta o cupom de forma **atômica**, não estoura
  `max_uses`).

- **Alertas pro admin (1.8.0)**: `notify_admins_sync_alert` (AFTER INSERT em `sync_alerts` `pending`)
  e `notify_admins_name_review` (AFTER INSERT/UPDATE de `name_approved` em `leagues`, dispara só com
  `name_approved=false AND status='active'` — não em `pending`, senão spammaria todo grupo recém-
  criado). Ambos chamam `fan_notify_admins` e são **fail-safe** (`exception when others then return
  new`): nunca quebram a escrita-base.
- `notifications_send_push` (AFTER INSERT em `notifications`): empurra o Web Push de cada notificação
  (lê `private.sync_config`; no-op se não configurado). É o que faz broadcast/cutucada/prazo virar
  push no celular.

**Cron (pg_cron)**
- `run_football_sync(mode)` — dispara a Edge Function `sync-football`. **1.5.0**: `scores` a cada
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
erro no portão → admite (o portão nunca pode virar apagão). Usa **só RPC HTTP, nunca Realtime**. Com a
fila **desligada**, `request_access` admite direto (sem criar sessão) e o front **não** liga o
heartbeat de fila.

**Presença ("online") é separada da fila:** todo usuário logado bate `touch_presence`
(`PresenceTracker`, ~30s, só com a aba visível), que grava `profiles.last_active_at` + acumula
`usage_seconds`. O "online" do admin (dashboard, lista de usuários, perfil) = `last_active_at`
recente (**90s**), **não** depende de `access_sessions` nem da fila estar ligada.

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
