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
Pagamento · Avisos · Construa · Qualidade · Changelog**. Todas as ações chamam RPCs que **revalidam `is_app_admin()` no banco** — o guard de UI
é conveniência, não segurança.

### Aba **Visão** (`AdminDashboard`) — saúde e uso (curta, clicável)
- Strip "ao vivo / hoje / online" (`admin_system_health`, refetch 30s) — cada um **clicável** (jogos →
  Competições; online → Usuários). "Online" = presença real (`profiles.last_active_at` < 90s via
  `touch_presence`).
- **Uso & comunidade** (`admin_usage_stats`, RPC nova): grade **curta** de KPIs **clicáveis**
  (drill-down) — acessos hoje, ativos 24h, novos hoje, total de pessoas, tempo médio/pessoa, palpites
  hoje, grupos ativos, **Gestão do Bolão ativa** (`league_competitions.pot_enabled`). Aproximações
  declaradas (`last_active_at` é sobrescrito; não é série histórica de DAU).
- **A lista de sincronização por competição SAIU da Visão** (poluía a primeira aba) → agora vive na
  aba Competições, agrupada.
- **Banners de alerta** (Nielsen #1): sync com problema (flame → Competições) e pendências (gold →
  Alertas).
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

### Aba **Competições** (`CompeticoesAdmin`) — casa de tudo de competição
- **Agrupada** nos 4 grupos da personalização (Seleções · Ligas e estaduais · Copas · Alternativos,
  colapsáveis), espelhando `data/competitions-registry.json` por `provider_code`
  (`competitionGroups.ts`; mesma taxonomia de `PersonalizationPage`). Leitura única
  `admin_list_competitions_full` (competição + pilha de fontes + saúde + contadores).
- **Cada campeonato** = card expansível: saúde, badges (rascunho/personalização/conflitos/arquivada),
  **ligar/pausar sync** (`admin_set_competition_sync`), **Sincronizar** (`sync-football`).
- **Pilha de fontes de API** por campeonato: cada fonte (primária/secundária) com saúde, **ligar/
  desligar** (`admin_set_competition_source_enabled`), **Tornar primária** (`admin_set_primary_source`
  — promove/rebaixa; seguro, ver §sync), **adicionar/remover** secundária
  (`admin_upsert/remove_competition_source`). Fontes editáveis no admin, **nada hard-coded** (fontes
  diferentes por campeonato).
- **Ver jogos / comparar fontes** (`/admin/competicoes/:id/jogos`): aba **Jogos** (curar/editar) e aba
  **Comparar fontes** (`admin_match_sources_for_competition`) — por jogo, o que **cada API** reporta
  lado a lado (scroll horizontal = swipe no mobile), divergências em vermelho + override/travar/
  descongelar.
- **Catálogo cruzado** (ESPN/football-data/TheSportsDB/**FIFA WC**): as APIs do mesmo campeonato
  aparecem **juntas** (cruzadas por `registryKey` do registro + fallback por nome) e cada uma é
  **anexada como fonte** (`admin_upsert_competition_source`) ao campeonato certo — **sem digitar
  código**; cria campeonato novo só quando não há match. Resolve a duplicação (antes "Adicionar"
  criava uma 2ª competição). Cada fonte exibe **quantos jogos trouxe** (`matches_count` por fonte).
- Lifecycle: **Publicar/Despublicar** (`admin_set_competition_published`), **Renomear** PT-BR
  (`admin_rename_competition`), **Excluir** → em uso (com palpites) **arquiva preservando os placares**
  (`admin_archive_competition`, confirma o nome; jogos + `match_sources` ficam) e dá pra **Restaurar**
  (`admin_restore_competition`); vazia, exclui de vez (`admin_delete_competition`).
- **FIFA WC** (`fifawc`, novo no enum `data_provider`): API aberta `worldcup26.ir` (sem chave) —
  adaptador `syncFifaWc` no `sync-football`, só validação (secundária) da Copa.
- **NameRulesCard** (prefixos de nome de grupo, `admin_set_name_prefixes`) segue no rodapé desta aba.

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

### Aba **Qualidade** (`DadosAdmin`, chave de URL `?t=dados`) — qualidade transversal dos dados
> A **gestão de fontes por competição saiu daqui** (era a antiga "Fontes por competição") e foi pra
> dentro de cada campeonato na aba **Competições**. Esta aba ficou enxuta, só com o que é
> **transversal** (não-por-campeonato): times sem cadastro + conflitos de placar.
- **Conflitos pra resolver** (destaque, `admin_list_match_conflicts`): só os jogos com divergência
  **não resolvida** (`score_conflict && !manual_lock`), encerrados primeiro. **Resolução em 1 toque:**
  cada fonte vira um botão ("Vale ESPN 1–0" → `admin_override_match` trava aquele placar) + opção de
  placar na mão. A **notificação** de conflito só dispara **após o jogo terminar** (ver pano de fundo).
- **Travados por você** (resumo → subpágina `/admin/qualidade/travados`): contador + "ver todos"; lista
  o que você travou (`manual_lock`), com **destravar**/editar (`admin_set_match_lock`,
  `admin_override_match`) e **descongelar** (`admin_unfreeze_match`).
- **Times fora do registro** (resumo → subpágina `/admin/qualidade/times-fora`,
  `admin_list_unmapped` / `admin_resolve_unmapped`): contador + "ver todos"; "Aceitar como veio" ou
  copiar JSON pro registro. Os mesmos controles de placar aparecem por campeonato na aba **Comparar
  fontes** (`admin_match_sources_for_competition`).
- Pano de fundo: o placar oficial é o **voto da maioria** das fontes (`resolve_match_golden`, cron a
  cada 10 min); finalizado + ≥2 fontes + >1h → **congelado** (decisão #3). **Fonte sem placar é
  ignorada** (golden só conta observações com placar). **Resolver na mão encerra o conflito:**
  `admin_override_match` / `admin_set_match_lock` (ao travar) zeram `score_conflict` e marcam como
  resolvidos os `sync_alerts` `score_conflict` pendentes do jogo; `alertConflicts` não re-alerta jogo
  travado **e só notifica jogo ENCERRADO** (`status='finished'`) — divergência ao vivo é transitória e
  não gera notificação. → [`05`](05-DADOS-E-AUTH.md).
- **Resiliência do sync (anti-spam):** as chamadas de API têm `fetchWithRetry` (retry+timeout) — blip
  de rede (`SendRequest`) se cura sozinho. O alerta/push de "Sincronização com problema" **só dispara
  com falha sustentada** (`competitions.sync_fail_streak` ≥ 3 ciclos seguidos sem nenhuma fonte; zera
  ao voltar). Degradação de uma fonte segue visível por fonte (aviso amarelo), sem notificar à toa.

### Tela de jogos por competição (`/admin/competicoes/:id/jogos` — `AdminCompMatchesPage`)
- Duas abas: **Jogos** (curadoria — ocultar/mostrar `matches.hidden`, override manual de placar/status,
  reabrir palpites) e **Comparar fontes** (`admin_match_sources_for_competition`): por jogo, o que
  **cada API** reportou lado a lado (scroll horizontal/swipe no mobile), divergências em vermelho, com
  override/travar/descongelar. Separada da tela de palpites.
- **Editor do jogo (aba Jogos → Editar)** — além de placar/status, escrita direta em `matches`
  (RLS `matches_admin_write`):
  - **Mata-mata "quem passa":** **pênaltis** (`home_pen`/`away_pen`), **quem avançou** (Automático /
    mandante / visitante → `advanced_team_id`, que tem prioridade no `resolved_advancer`) e toggle
    **"é mata-mata"** (`is_knockout`) — este só aparece em **jogo sem fase** (com fase, o trigger
    `matches_set_knockout` deriva da `stage` e o toggle não pega). Re-pontua via `matches_rescore`.
  - **Situação ao vivo** (`live_phase`): 1º tempo / intervalo / 2º tempo / prorrogação / pênaltis;
    só com o status "Ao vivo". Enquanto o jogo **não** estiver travado, a API pode sobrescrever no
    próximo sync.
  - **Trava contra a API**, em dois modos: **Adiantar** (`soft_lock`+`manual_lock`) crava o placar/
    pênaltis na frente da API e **libera sozinho** quando alguma fonte trouxer o **mesmo** valor
    (`release_soft_overrides`, cron 25s); **Travar** (`manual_lock`) fixa placar **e** pênaltis
    contra **qualquer** atualização; **Destravar** volta o controle à API. (→ [`05`](05-DADOS-E-AUTH.md) §sync.)
- **Reabrir palpites** (`admin_reopen_match`): emergência (jogo adiado) — empurra o `kickoff_at`
  ~15 min e destrava os palpites.
- ℹ️ O ideal é a API atualizar sozinha (sync inteligente — §sync abaixo); o override é exceção.

### 📚 Estudos (`/admin/estudos` — `features/estudos/`, chip no topo do `/admin`)
Biblioteca de **análises/estudos do produto em HTML, só para app-admin** (gamificação, Retrô,
confrontos, planos). Cada estudo é um HTML num **bucket PRIVADO de Storage** (`estudos`) + metadados
em **`study_docs`**; tudo gated por **RLS via `is_app_admin()`** (migration `20260616130000`). O visor
(`EstudoViewerPage`, `/admin/estudos/:slug`) **baixa o HTML pelo client autenticado** e o renderiza num
`<iframe srcdoc>` (sem URL pública), **seguindo o tema do app** (dark/light), responsivo, com "voltar".
A lista (`EstudosAdminPage`) agrupa por categoria e tem **upload** (qualquer app-admin publica um
`.html` novo). Substitui o vazamento anterior em `public/planos/*.html` (removido). **Fonte no repo:**
`docs/` (versionado); o app serve a cópia no bucket. **Publicar em prod:** subir cada HTML pelo botão
**Adicionar** (ou `scripts/seed-estudos.mjs` com credenciais de prod) — a migration cria a infra, mas
o bucket nasce **vazio**.

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
