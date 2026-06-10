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
fallback: copia a IMAGEM pro clipboard + wa.me → texto) + grade de emojis **sem spoiler** +
página pública `/retro/r/:code`.

- **Modos e barras (rodada 5 do PO, migration `20260610150007` — `retro_pass_need`):**
  `acerto` = ≥1 até as quartas · **semi pede saldo (≥2)** · **FINAL só com CRAVADA**;
  `cravada` ("Na Crava") = ≥2 sempre · **FINAL só com CRAVADA**.
- **🎲 Fichas de troca:** cada CRAVADA dá 1 ficha; o jogador pode trocar o jogo atual da run
  (RPC `retro_reroll` — re-sorteia, cronômetro renasce; vale na Copa do Dia, ganho por mérito).
- **Treinos ranqueados:** runs de LOGADO são todas persistentes; ranking de Treino = melhor
  campanha de cada um (`retro_leaderboard(p_board=>'treino')`); melhor campanha do perfil
  considera tudo. Anônimo segue efêmero (purga diária).
- **Run em tela cheia:** o play roda num overlay imersivo (cabe em qualquer altura, até iPhone SE;
  "sair ✕" discreto). **Navegação separada do app-mãe (rodada 5):** Retrô fora da
  Sidebar/BottomNav/header público — entrada fica no **Perfil** ("nosso outro jogo"), na landing e
  no Como Funciona; o jogo tem "← Voltar pro Resultadismo".
- **Ritmos:** `resultadista` (10/8/7s — o único que **ranqueia**) · `classico` (14/12/10s) ·
  `sempressa` (sem timer). Cronômetro mostra **milésimos + cor nos 3s finais**.
- **Copa do Dia:** mesmos 7 jogos para todos (sorteados lazy à meia-noite BRT), **1 tentativa por
  conta/dia**, com retomada; ranking fase → pontos → tempo. **Treino:** infinito, sem ranking.
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
- **Banco (migrations `20260610150000–150007`):** seed dos **964 jogos** (fonte openfootball CC0,
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
- **Analytics:** eventos `retro_run_start`/`retro_guess`/`retro_run_end`/`retro_share` na union de
  `src/lib/analytics.ts` (sem PII).

## 5. Backlog conhecido (fase 2 do Retrô)

Curiosidades por jogo (`fact_pt`), card-imagem de share + OG dinâmica, subdomínio, modo Sem Pressa
com ranking separado?, auto-calibração da dificuldade por `shown_count`/`scored_count`, PostHog
(se mídia), expansão de pools (Euro, Libertadores, Brasileirão — modelo de dados já genérico).
