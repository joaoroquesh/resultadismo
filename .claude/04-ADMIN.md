# 04 — Admin e administração

> Dois níveis de poder distintos: **admin do app** (dono da plataforma) e **admin de grupo**
> (dono/admin de um grupo). Este documento define quem pode o quê, o painel admin e as RPCs que o
> alimentam. Banco/RLS → [`05`](05-DADOS-E-AUTH.md); regras de negócio → [`06`](06-REGRAS-DE-NEGOCIO.md).

## 1. Os dois níveis de admin

| | **App-admin** | **Admin de grupo** |
|---|---|---|
| Onde mora | `profiles.is_app_admin` (boolean) | `league_members.role ∈ {owner, admin}` |
| Escopo | A **plataforma inteira**: competições, aprovações, pagamento, usuários, moderação | **Umo grupo**: membros, competições do grupo, sorteio do confronto |
| Como vira | 1º usuário a se cadastrar vira app-admin (bootstrap); depois via RPC `set_app_admin` | `owner` = quem criou; `admin` = promovido pelo dono |
| Guard no front | `RequireAdmin` (rota `/admin`) usa `isAppAdmin` do `AuthProvider` | UI checa o papel via `is_league_admin` |
| Guard no banco | RPCs checam `is_app_admin()` | RPCs checam `is_league_admin(league_id)` |

> **Bootstrap do dono:** o **primeiro** registro em `profiles` recebe `is_app_admin = true`
> (trigger `handle_new_user`). É assim que o João vira admin sem configuração manual. → [`05`](05-DADOS-E-AUTH.md).

**Proteção do dono do grupo:** o trigger `protect_league_owner` impede remover/rebaixar o
`owner` — nem um app-admin tira o poder do dono de um grupo sem regra explícita.

## 2. Painel do app-admin (`/admin` — `features/admin/AdminPage.tsx`)

**Dashboard-first**, navegação por **abas na URL** (`?t=`) — rolável (não espreme no mobile);
voltar de "ver jogos" cai na aba certa. Abas: **Visão · Alertas · Grupos · Competições · Usuários ·
Pagamento · Avisos · Construa · Dados · Changelog**. Todas as ações chamam RPCs que **revalidam `is_app_admin()` no banco** — o guard de UI
é conveniência, não segurança.

### Aba **Visão** (`AdminDashboard`) — saúde do sistema
- Strip "ao vivo / hoje / online" (`admin_system_health`, refetch 30s). "Online" = presença real
  (`profiles.last_active_at` < 90s via `touch_presence`), não a fila de acesso.
- **Sincronização**: status por competição (verde/vermelho/cinza = último sync ok/erro/nunca),
  última sync, **Sincronizar** (manual = modo `catalog`) e **ligar/pausar** sync
  (`admin_set_competition_sync`). "Sincronizar tudo".
- **Banners de alerta** (Nielsen #1): sync com problema (flame) e pendências (gold) → levam a Alertas.
- **Modo manutenção** (`admin_set_maintenance`): quando ligado, **bloqueia o app** para logados
  não-admin — eles veem a `MaintenanceScreen` (tela cheia turquesa, logo estática, `maintenance_message`
  editável ou texto padrão). O **admin continua usando o app** e vê só a faixa `MaintenanceBanner`
  (lembrete). Visitante **deslogado** segue na landing (o flag só é legível por logado; gate em
  `AppShell`; tour de onboarding suprimido na manutenção). **Atividade recente** (`admin_recent_audit`).

### Aba **Alertas** (`SyncAlertsPanel`)
- **Precisam de você** (pendentes): jogo novo (`new_match`→inserir), cancelamento (`cancelled`),
  API com problema (`api_error`) → **aprovar/recusar** (`admin_resolve_sync_alert`).
- **Histórico**: aplicados/resolvidos (mata-mata definido, horário mudou).

### Aba **Grupos** (`LigasAdmin`)
- **Aguardando aprovação**: grupos `pending` → **Aprovar** (`approve_league`) / **Rejeitar**
  (`reject_league`).
- **Todos os grupos**: **busca** (nome/dono) + **ordenação** (`SortControl`: Nome ou Criação,
  crescente/decrescente) — sempre visíveis. Cada grupo: status + **Gerir** (abre o detalhe) +
  **Excluir** (soft-delete → Lixeira).
- **Lixeira**: grupos soft-deletadas (recuperáveis) → **Restaurar** (`admin_restore_league`).
- ⚠️ Grupos com `payment_status='pending'` esperam **pagamento do usuário**, não aprovação do
  admin — "Aprovar" não deveria aparecer para elas (causa-raiz registrada de um bug antigo do
  "Pagar agora"). → [`HISTORICO.md`](HISTORICO.md).

### Aba **Comp.** (`CompeticoesAdmin`) — competições reais
- **Sincronizar todas** (`sync-football`) e por competição.
- Catálogo por provedor (**ESPN** preferido, football-data, TheSportsDB): buscar e **Adicionar**
  (nasce como rascunho).
- Por competição: **Publicar/Despublicar** (`admin_set_competition_published`), **Renomear** PT-BR
  (`admin_rename_competition`), **Ver jogos** (`/admin/competicoes/:id/jogos`), **Excluir**
  (`admin_delete_competition`).
- **NameRulesCard**: prefixos de nome de grupo (Bolão/Liga/Copa) — `admin_set_name_prefixes`.

### Aba **Usuários** (`UsuariosAdmin`)
- Lista todos os perfis **com e-mail** via RPC `admin_list_users` (lê `auth.users`;
  `SECURITY DEFINER`, só app-admin — a coluna `email` foi **removida** de `profiles` por privacidade).
- **Busca** por nome/e-mail + **ordenação** (`SortControl`): por **Online**, **Nome**, **Entrada**
  (data de criação) ou **Uso**, cada um **crescente/decrescente** (padrão: Online primeiro). Os
  **online** ficam com selo verde + anel no card + ponto pulsante, e a contagem aparece no topo
  (`is_online` = `last_active_at` recente, <90s).
- Promover/rebaixar app-admin (`set_app_admin`).

### Aba **Pgto** (`PaymentAdmin`) → detalhe em [`06`](06-REGRAS-DE-NEGOCIO.md) §pagamento
- **Nomes a revisar**: aprovar o nome de grupos pagas (`admin_approve_league_name`).
- **Pagamento de grupos**: modo (Desativado/Teste/Mercado Pago), preço base, promoção
  (`admin_update_payment_settings`, `admin_set_promo`). Mostra o "preço vigente agora".
- **Cupons de desconto**: criar/ativar/excluir (`discount_codes`).
- **Cortesia**: liberar um grupo de graça (`admin_comp_league`).

### Aba **Avisos** (`BroadcastPanel`) — notificações em massa
- **Compositor**: título (obrigatório), mensagem e link opcionais; **pré-visualização de alcance**
  (debounce 400ms via `admin_broadcast_preview`) antes de enviar. Botão **Enviar** só libera com
  título e alcance > 0 (o motivo do bloqueio aparece ao lado quando só falta o título).
- **Segmentos** (`admin_send_broadcast`): **todo mundo**, **não palpitou hoje** (tem jogo de hoje
  numa federação ativa e ainda não palpitou), **online agora** (presença < 90s), **um grupo**
  (membros de uma federação) e **topo de um grupo** (os N primeiros — 1 a 50 — da classificação de
  uma competição). Os selects de grupo/competição vêm de `admin_list_group_targets`.
- Todo segmento **desconta quem desligou avisos** (`profiles.notif_prefs.broadcast`). Disparo
  grande (> 50 pessoas) pede **confirmação dupla** (`ConfirmDialog tone="warn"`).
- **Histórico** (`admin_list_broadcasts`): o que já foi enviado, com segmento, alcance e autor.
- O envio insere 1 notificação por destinatário (o trigger `notifications_send_push` empurra o push
  de cada uma) e **audita** em `admin_audit_log` (`broadcast_send`).
- **Alcance real do push**: o rodapé mostra "Push no aparelho: N aparelhos (M pessoas)" via
  `admin_push_stats` — in-app chega pra todo o segmento; push só pra quem tem aparelho inscrito.
  A `send-push` responde `{sent, total, failed[]}` e **loga toda falha de entrega** (status+motivo)
  no dashboard, consultável em `net._http_response`.

### Alertas automáticos pros app-admins (`fan_notify_admins`, dedupe 6h por kind+ref)
- **Grupo aguardando aprovação** (`group_pending`): dispara na criação de grupo `pending` (modo
  grátis) — sininho + push com link pra `Admin → Grupos`. *(O alerta `name_review` só existe no
  fluxo de pagamento e na edição de nome.)*
- **Sync** (`sync_alert`), **feedback novo** (`feedback`) e **nome editado** (`name_review`)
  completam a família.

### Aba **Construa** (`FeedbackAdmin`) — "Construa o Resultadismo com a gente!"
- Reportes de **erro** (🐞) e **sugestões** (💡) que os usuários enviam em **`/construa`**. Filtros por
  status (**Novos** / Backlog / Resolvidos / Arquivados / Todos) com contagem; novos primeiro.
- Cada item: texto + (só em **erro**) **contexto auto-capturado** — página, **versão do app** e
  navegador/aparelho (resumido); **melhoria não captura** esse contexto. Mostra o autor (link pro
  perfil) e o **e-mail** (`mailto:`, contato direto).
- Ciclo: **Arquivar** (ignora) · **Backlog** (pro desenvolvimento) · **Resolver** (abre uma resposta
  que **notifica o autor** — in-app + push). **Reabrir** volta resolvido/arquivado pra "novo".
- Backend: tabela `feedback` (RLS — usuário só enxerga os próprios), RPCs `submit_feedback` /
  `admin_list_feedback` / `admin_update_feedback`; novo report → trigger chama `fan_notify_admins`
  (avisa os app-admins); resolver → insere 1 `notification` (`feedback_reply`) pro autor. Migration
  `20260606000005`.

### Aba **Dados** (`DadosAdmin`) — qualidade dos dados de jogos (multi-fonte) — **2.12.0**
- **Conflitos e jogos travados** (`admin_list_match_conflicts`): jogos onde as fontes **divergem** no
  placar (`score_conflict`) ou que estão sob edição manual. Mostra **o que cada fonte reporta**
  (`match_sources`), badges (divergente/congelado/manual/Nº fontes) e ações: **override manual** de
  placar/status que **trava contra a API** (`admin_override_match`, decisão #8), **travar/destravar**
  (`admin_set_match_lock`) e **descongelar** (`admin_unfreeze_match`).
- **Fontes por competição** (`admin_list_competition_sources`): cada competição tem 1 fonte
  **primária** (dona do calendário) + N **secundárias** (só validam placar). Liga/desliga
  (`admin_set_competition_source_enabled`), adiciona secundária (`admin_upsert_competition_source`) e
  remove secundária (`admin_remove_competition_source`; a primária é protegida).
- Pano de fundo: o placar oficial é o **voto da maioria** das fontes (`resolve_match_golden`, cron a
  cada 10 min); finalizado + ≥2 fontes + >1h → **congelado** (decisão #3). → [`05`](05-DADOS-E-AUTH.md).

### Tela de jogos por competição (`/admin/competicoes/:id/jogos` — `AdminCompMatchesPage`)
- Curadoria por jogo: ocultar/mostrar (`matches.hidden`, RPC/`useSetMatchHidden`) e **override
  manual** de placar/status. Separada da tela de palpites.
- **Reabrir palpites** (`admin_reopen_match`): emergência (jogo adiado) — empurra o `kickoff_at`
  ~15 min e destrava os palpites.
- ℹ️ O ideal é a API atualizar sozinha (sync inteligente — §sync abaixo); o override é exceção.

## 3. Admin de grupo (dentro de `LigaDetailPage`)

Quem é `owner`/`admin` de um grupo pode:
- **Membros**: aprovar entradas pendentes, remover, promover/rebaixar (menos o dono).
- **Competições do grupo**: adicionar competição + escolher o **modo** (Pontos / Liga / Copa,
  estes últimos só se `confronto_enabled`).
- **Confronto**: sortear (`draw_confronto`), desfazer (`undo_confronto_draw`), agendar sorteio —
  tudo gated por `is_league_admin` no banco. → [`06`](06-REGRAS-DE-NEGOCIO.md) §confronto.
- **Escudo/nome** do grupo (na tela de editar grupo).

> O modo **Confronto (Liga/Copa)** por grupo é destravado **só pelo app-admin** via
> `admin_set_confronto_enabled` (`leagues.confronto_enabled`). Admin de grupo **não** liga isso
> sozinho (trigger `leagues_guard_confronto_enabled` protege o campo).

## 4. RPCs de admin (referência rápida)

| RPC | Faz | Checa |
|---|---|---|
| `set_app_admin(user_id, value)` | Concede/revoga app-admin | `is_app_admin()` |
| `approve_league(id)` / `reject_league(id)` | Aprova/rejeito grupo pendente | `is_app_admin()` |
| `admin_soft_delete_league` / `admin_restore_league` / `admin_list_deleted_leagues` | Lixeira (moderação) | `is_app_admin()` |
| `admin_approve_league_name(id)` | Aprova o nome (tira o disclaimer) | `is_app_admin()` |
| `admin_list_users()` | Lista perfis + e-mail (de `auth.users`) | `is_app_admin()` |
| `admin_delete_competition` / `admin_set_competition_published` / `admin_rename_competition` | Gestão de competição | `is_app_admin()` |
| `admin_set_name_prefixes(...)` | Prefixos de nome (Bolão/Liga/Copa) | `is_app_admin()` |
| `admin_set_confronto_enabled(league_id, value)` | Destrava Liga/Copa por grupo | `is_app_admin()` |
| `admin_update_payment_settings(mode, price)` / `admin_set_promo(...)` / `admin_comp_league(id)` | Pagamento/promo/cortesia | `is_app_admin()` |
| `draw_confronto` / `undo_confronto_draw` | Sorteio do confronto | `is_league_admin()` ou `is_app_admin()` |
| `admin_broadcast_preview(segment, arg)` | Conta o alcance de um aviso | `is_app_admin()` |
| `admin_send_broadcast(title, body, url, segment, arg)` | Dispara o aviso + grava histórico + audita | `is_app_admin()` |
| `admin_list_broadcasts(limit)` / `admin_list_group_targets()` | Histórico de avisos / alvos de grupo | `is_app_admin()` |

> Os nomes/assinaturas exatos estão nas migrations de cada feature em
> [`supabase/migrations/`](../supabase/migrations/). A migration é a fonte de verdade.

## 5. Boundaries do agente (IA) ao mexer em admin/produção

- **Não digitar credenciais** (ex.: Access Token do Mercado Pago) nem logar na conta do MP. O João
  cola os segredos.
- **Não executar estornos** no painel do Mercado Pago. O reembolso self-service é código do app;
  testá-lo de verdade = estorno real → quem testa é o João.
- **Não subir mudança de alto impacto** (pagamento, prod ao vivo, dado destrutivo) **sem
  autorização explícita** do João. Este é o **gate adicional de alto impacto** (regra central 8 /
  [`08`](08-PROCESSO.md) §8); ele **não substitui** o **Portão A** (plano, regra 16) nem o **Portão B**
  (homologação local, regra 14). E o **Portão A vale para qualquer alteração de código** no
  admin/produção, mesmo simples: já precisa de **plano validado pelo João antes de codar**. →
  [`08`](08-PROCESSO.md), [`11`](11-EQUIPE-E-PAPEIS.md) §3, [`MESTRE.md`](MESTRE.md) §3.
