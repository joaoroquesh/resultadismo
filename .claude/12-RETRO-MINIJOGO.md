# 12 — Resultadismo Retrô (mini-jogo de placares históricos)

> A "ramificação do MESTRE" para o mini-jogo (decisão do João no plano, D17 do Portão A).
> O **MESTRE continua sendo o contrato**: este doc detalha o que o Retrô **herda**, o que ele
> **muda deliberadamente** e onde cada regra vive. Espec completa e histórico de decisões:
> [`docs/planning/minijogo-historico/decisoes-fechadas.md`](../docs/planning/minijogo-historico/decisoes-fechadas.md).

Em produção desde **2026-06-10** em **`/retro`** (jogável sem login). Subdomínio
`retro.resultadismo.com` = fase futura (redirect 301).

## 1. O que é (30 segundos)

Mini-jogo viral-irmão: o jogador encara **a própria Copa** — **7 jogos reais de Copas do Mundo
(1930–2022)** — com poucos segundos para cravar cada placar. Grupos: passa pontuando em 2 de 3
(o 3º jogo sempre acontece, "jogo de honra"). Mata-mata: não atingiu a barra do modo, caiu.
Sobreviveu aos 7 = **Campeão** (máx. 21 pts). Share com **card-imagem PNG** (canvas; Web Share API nível 2 →
fallback: copia a IMAGEM pro clipboard + wa.me → texto) + grade de emojis **sem spoiler** (🟨 cravada · 🟩 saldo · 🟦 acerto — cores do app) +
página pública `/retro/r/:code`.

- **Modos e barras (rodada 5 do PO, migration `20260610150007` — `retro_pass_need`):**
  `acerto` (rótulo **Vale Ponto**) = ≥1 até as quartas · **semi e FINAL = saldo ou cravada (≥2)**;
  `cravada` (rótulo **Vale Saldo**) = ≥2 sempre. (rodada 8: a final deixou de exigir cravada.)
- **🎲 Fichas de troca:** cada CRAVADA dá 1 ficha; o jogador pode trocar o jogo atual da run
  (RPC `retro_reroll` — re-sorteia, cronômetro renasce; vale na Copa do Dia, ganho por mérito).
- **Treinos ranqueados:** runs de LOGADO são todas persistentes; ranking de Treino = melhor
  campanha de cada um (`retro_leaderboard(p_board=>'treino')`); melhor campanha do perfil
  considera tudo. Anônimo segue efêmero (purga diária).
- **Run em tela cheia:** overlay imersivo z-[70]; conteúdo em bloco **max-w-sm centrado** (não
  estica em telas grandes/tablet). Na **semi/final** um banner gold pulsante avisa "só SALDO ou
  CRAVADA passa"; hint curto da fase nas demais. "sair ✕" discreto. **Separação total (rodada 6):** as rotas `/retro*` vivem num
  **`RetroShell` próprio** (mini-header com "ir pro Resultadismo →" + ConsentBanner) — fora do
  AppShell: nada de Sidebar/BottomNav/header do app-mãe. Entradas: **card próprio no topo do menu
  do Perfil**, **banner na landing** e seção no Como Funciona.
- **Sempre com tempo (rodada 14):** o "Sem Pressa" foi removido — todo jogo é cronometrado
  (10/8/7s). Sem seletor de ritmo nem de dificuldade. Rótulos: **Seleção do Dia** (diário, Copa,
  ranqueado) e **Jogo livre** (o jogo do dia a dia — Copa/Pontos, também ranqueia logado).
- **Seleção do Dia = sempre Copa (rodada 13):** o desafio diário ranqueado é eliminatório (Copa).
  O formato (Copa/Pontos) só varia no **Jogo livre**. Ranking diário = Copa apenas.
- **Copa do Dia TEMÁTICA (rodada 6):** cada dia é a Copa de **uma seleção** (rotação determinística
  entre as 58 com ≥7 jogos; dia 0 = 10/06 = Brasil; RPC `retro_today` mostra o tema), com os 7
  jogos **ordenados do mais fácil ao mais difícil**; 1 tentativa por conta/dia, com retomada.
  **Treino:** infinito, com **dificuldade Fácil/Padrão/Difícil** (janelas do sorteio ±1; board de
  Treino = melhor campanha por pessoa, só no Padrão). **Ritmos:** Sem Pressa · Resultadista (o
  Clássico foi aposentado na UI; valor segue válido no banco). Rótulos dos modos: **Vale Ponto**
  (`acerto`) e **Vale Saldo** (`cravada`). Seletores sempre do fácil (esquerda) ao difícil (direita).
- **Placar canônico:** final com prorrogação, **sem pênaltis** (informativos) — regra central nº 1
  preservada; empate real em mata-mata pontua como empate.

## 2. O que o Retrô HERDA do MESTRE (inegociável)

- **Pontuação 3/2/1/0 calculada no banco** — reusa `compute_score_type()`/`score_points()`.
- **RLS-first:** `retro_matches`/`retro_runs`/`retro_daily`/`retro_run_matches`/`retro_usage_daily`
  têm **RLS ligado SEM policy** — o gabarito **nunca** desce ao client; tudo via RPC
  `SECURITY DEFINER`. Tempo validado **no servidor** (deadline por slot + 2s de tolerância).
- **Não é casa de apostas** (nada de prêmio/dinheiro), deploy só por push na `main`, identidade
  visual por tokens, coerência de pontos de contato, CHANGELOG.

## 3. O que o Retrô MUDA deliberadamente (registrado)

| Mudança | Racional |
|---|---|
| **Animação "fliperama"** (carimbo, flip, confete, shake) | Exceção consciente ao motion sutil do DESIGN.md, restrita ao slice `features/retro/`; respeita `prefers-reduced-motion`. |
| **Placar eletrônico SEMPRE escuro** (tokens `--retro-board*`, não invertem no dark) | Decisão do PO 10/06: contraste dos dígitos dourados. |
| **Anônimo escreve no banco** | Só via RPCs do jogo: runs **efêmeras** (purga diária 03:40 UTC, cron `retro-purge-ephemeral`), agregado diário de uso (`retro_usage_daily`, clamp 60s/batida) e **guarda anti-abuso** (30 runs/h por token). Permanente = só Copa do Dia de logado (D17). |
| **Publicidade (futuro)** | Regra do PO (Q4): **discreta ou integrada** (patrocínio direto); **nunca pop-under**; AdSense só com bloqueio da categoria apostas + revisão da promessa "Sem anúncios". Hoje: sem anúncio. |

## 4. Onde vive (código e banco)

- **Front:** `src/features/retro/` (RetroPage = landing + máquina de estados; RunView/ScoreWheels/
  RetroTimer; RevealCard; ResultView + share; RetroSharePage; RetroLeaderboard; RetroCrest;
  `retroLocal.ts` = token anônimo + anti-repetição local). Rotas públicas `/retro` e `/retro/r/:code`
  no `App.tsx`; entradas na Sidebar/BottomNav/PublicShell. Vitrine de animações: `/retro?demo=1`
  (**só DEV**).
- **Banco (migrations `20260610150000–150013`; 150011 = Formato Copa/Pontos + config admin + fix reroll daily; 150008 RESET; 150009 abandono; 150010 final-aceita-saldo + ranking-por-dificuldade + feedback.product):** seed dos **964 jogos** (fonte openfootball CC0,
  importador `scripts/gen-retro-seed.mjs` com portões de qualidade; dificuldade 1–7 com 34
  jogos-lenda) + motor (RPCs `retro_start_run`, `retro_next` — serve **sob demanda**, o cronômetro
  nasce no clique —, `retro_answer`, `retro_run_summary`, `retro_leaderboard`, `retro_my_stats`,
  `retro_touch_anon`, `retro_purge_ephemeral`). Testes: `scripts/retro-engine-tests.sql`
  (rodar contra o Supabase local).
- **Sorteio (calibrado na rodada 3, 10/06):** nível primeiro (grupos 45/35/20; mata-mata 40/35/25,
  sempre puxando pro fácil), janelas por fase **G 1–3 · 8ª 2–4 · 4ª 3–5 · SF 3–5 · F 4–6**, 10%
  fora da janela; anti-repetição do Treino via lista local (≤30 ids). O deadline do servidor tem
  **+1,5s de respiro de leitura** (o client mostra o confronto ~1,2s antes do cronômetro visual;
  bandeiras pré-aquecidas na home via `retroFlagSlugs.ts`).
- **Bandeiras:** `public/teams/` (33 históricas adicionadas; todas as SVG padronizadas em
  **círculo** por `scripts/gen-flag-circles.mjs` — idempotente).
- **Analytics:** eventos `retro_run_start`/`retro_guess`/`retro_run_end`/`retro_share` (sem PII).
- **Tempo de tela SÓ do Retrô (rodada 11):** `RetroShell` bate `retro_touch` a cada 30s p/ TODOS
  (anon+logado) → `retro_usage_daily.screen_seconds`. Separado do app-mãe (PresenceTracker não roda
  no RetroShell).
- **Feedback admin:** `/admin/retro` (acessível pela nav do **/admin** principal: chip "🕹️ Retrô")
  lista os reports do Retrô (`FeedbackAdmin
  product="retro"`, via `admin_list_feedback` com `product`) — autor, página, corpo, resolver/responder
  (`admin_update_feedback`). "Meus envios" filtra por `auth.uid()`. O admin principal lista TODOS os
  reports com **badge de produto** (🕹️ Retrô). **Rodada 12:** removida a duplicata de
  `submit_feedback` (6-arg) que podia inserir sem `product` (sumindo o report do admin do Retrô).
- **Tela final (rodada 13):** o card espelha a IMAGEM de share — placar eletrônico escuro
  (`--retro-board`) + listras + scanlines + emoji por fase + trilha + pontos dourados. Botões
  "Jogar de novo" / "Voltar"; no FIM, convite pro **bolão da Copa** com a logo do Resultadismo.
- **UI enxuta (rodada 14):** home sem cards de Ritmo e de "Como funciona" (vira link), hero curto;
  tela do jogo sem "nível X/7". Menos texto, mais direto (queixa de telas sobrecarregadas).
- **Trilha (CampaignTrail):** Copa = G1·G2·G3│8ª·4ª·SF·F; **Pontos = J1..J7** (sem fases nem
  divisor); o card mostra "Jogo N de 7" no Pontos.
- **Páginas:** `/retro/regras` (regras em blocos curtos), `/admin/retro` (config admin, RequireAdmin).
- **Feedback do Retrô:** `/retro/feedback` (só logado) reusa a `FeedbackPage` com `product="retro"`
  (coluna `feedback.product` classico|retro; `submit_feedback` ganhou `p_product`). Páginas
  Retrô-específicas no seletor de bug. Link discreto na home do Retrô.
- **Veredito dinâmico (`verdict.ts`):** emoji por fase (🏆 campeão · 🥈 vice · 🔥 semi · 💪 quartas
  · 👏 oitavas · 😅 grupos) + manchete por fase, no reveal/tela final/share/página pública. Quem é
  eliminado na semi/final com **acerto** vê "eliminado nos pênaltis 😬" (acertou o vencedor, faltou
  saldo). **Ranking** dá destaque à FASE (pontos/tempo viram desempate em cinza), com nota do critério.
- **Bandeiras (fix rodada 8):** o circularizador `gen-flag-circles.mjs` agora preserva
  `fill`/`stroke`/`style` da raiz do SVG — sem isso, bandeiras que definem a cor no `<svg>` raiz
  (Honduras etc.) renderizavam em preto. Re-baixadas e auditadas por COR (não só decode): 60/60 ok.

## 5. Backlog conhecido (fase 2 do Retrô)

Curiosidades por jogo (`fact_pt`), card-imagem de share + OG dinâmica, subdomínio, modo Sem Pressa
com ranking separado?, auto-calibração da dificuldade por `shown_count`/`scored_count`, PostHog
(se mídia), expansão de pools (Euro, Libertadores, Brasileirão — modelo de dados já genérico).
