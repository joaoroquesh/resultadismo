# Decisões fechadas — Mini-jogo Resultadismo Retrô (Portão A cumprido)

> Consolidação do [`plano-v1.html`](plano-v1.html) + [`comentarios-plano-v1.md`](comentarios-plano-v1.md)
> do João (09/06/2026, "vamos seguir!"). **Esta é a especificação vigente** — sessões futuras
> implementam a partir daqui. Ajustes do PO estão incorporados; nada pendente de validação
> (o que depende de sentir no uso será calibrado na homologação, Portão B).

## Decisões (D1–D17)

| # | Decisão final | Origem |
|---|---|---|
| D1 | **Nome: Resultadismo Retrô** · `retro.resultadismo.com` (fase 2) · rota `/retro` | ✅ aprovado |
| D2 | Modos de dificuldade: **“Acerto”** (qualquer pontuação avança) e **“Só Cravada”** (só placar exato avança) | ✏️ ajustado pelo PO (era "Vale Ponto") |
| D3 | Run: 3 jogos de grupos (passa com 2/3; 3º jogo de honra) → oitavas/quartas (≥1 pt) → semi/final (≥2 pts) · máx. 21 pts | ✅ aprovado |
| D4 | Placar canônico: final com prorrogação, **sem pênaltis**; empate real pontua normal; aviso na UI | ✅ aprovado |
| D5 | **Timer em 3 ritmos**: **Sem Pressa** (sem timer, fora do ranking) · **Clássico** (folgado, ~12/10/8s) · **Resultadista** (apertado, ~10/8/7s). Decrescente por fase. Cronômetro mostra **milésimos + muda de cor nos 3s finais**. **Input próprio gigante na parte de baixo da tela** (rolagem/dois polegares; 1 jogo por vez na tela). Números exatos calibrados com o João no teste (Portão B). | ✏️ ajustado pelo PO |
| D6 | **Copa do Dia** (1/dia por conta, ranqueada, mesmos 7 jogos p/ todos) + **Treino** (infinito, sem ranking). Ranking: fase → pontos → tempo (servidor). Streak + melhor campanha. | ✅ aprovado |
| D7 | Share MVP: texto + grade de emojis sem spoiler + link p/ página pública `/retro/r/:code`; derrota também compartilha; card-imagem na fase 2 | ✅ aprovado |
| D9 | Heurística de dificuldade 1–7 + janelas por fase + 10% fora da janela. **Fatores extras do PO: seleção extinta = mais difícil (+1 por extinta em campo) e decisão de 3º lugar = mais difícil (+1)**. Pesos calibráveis; auto-calibração futura por taxa real de acerto. | ✏️ ajustado pelo PO |
| D10 | Fonte: **openfootball world-cup.json (CC0)** primária + validação cruzada (Fjelstul/Wikipedia em divergência). Seed one-off, 964 jogos. | ✅ aprovado |
| D11 | Bandeiras históricas da Wikimedia p/ seleções extintas/faltantes; fallback sigla+cores | ✅ aprovado |
| D12 | **Mesmo projeto Supabase** · tabelas `retro_*` · sorteio/gabarito/validação/tempo 100% no servidor (RPC `SECURITY DEFINER`; placar nunca desce ao client antes do palpite) | ✅ aprovado |
| D13 | MVP na rota `/retro`; subdomínio na fase 2 como redirect 301 | ✅ aprovado |
| D14 | Tempo de uso: `usage_seconds` (logados) + contador first-party agregado por dia (anônimos) + eventos GA4 novos; PostHog fase 2 | ✅ aprovado |
| D15 | Mesmo design system + animação "fliperama" (CSS puro). **Pegada retrô na UI** (adaptação suave da identidade é permitida). CTA: **"Jogar a Copa Retrô de hoje"**. | ✏️ ajustado pelo PO |
| D16 | MVP ganha **+ modo Só Cravada e + ritmo Sem Pressa** (saíram da fase 2). Resto do corte aprovado (curiosidades, card-imagem, subdomínio, PostHog = fase 2). | ✏️ ajustado pelo PO |
| D17 | Persistência (resposta técnica ao questionamento do PO — ver abaixo): **banco permanente só guarda runs da Copa do Dia de LOGADOS** (ranking/streak). Treino e anônimos rodam pelas mesmas RPCs (o gabarito não pode descer ao client — senão a aba anônima entrega os jogos do dia), mas a run é **efêmera** (purgada por cron diário) e o progresso/anti-repetição fica no localStorage. Contadores agregados (uso/calibração) sempre atualizam. | ✏️ respondido e incorporado |

### D17 — racional completo (pergunta do João: "anon só em localStorage faz sentido?")

Faz sentido **pela metade**, e o meio-termo pega o melhor dos dois:

- **Não dá** para o anônimo jogar 100% client-side: para pontuar localmente o navegador teria que
  receber o placar real ANTES do palpite — e na Copa do Dia os jogos são os mesmos do ranking; uma
  aba anônima viraria gabarito grátis (exploit nº 1 do plano). Por isso TODO mundo joga via RPC.
- **Mas** o João está certo que run de treino/anônimo não precisa virar linha eterna no banco:
  runs não-ranqueáveis são gravadas numa tabela efêmera (estado mínimo p/ validar timer/palpite)
  e **purgadas por cron** (~24h). Permanente = só Copa do Dia de logado.
- Anti-repetição de treino: lista local (localStorage) dos ~30 últimos jogos vistos, enviada como
  parâmetro à RPC de sorteio. Se a pessoa limpar o storage, só perde o anti-repeat — sem impacto.

## Perguntas (Q1–Q5)

| # | Resposta do PO | Consequência |
|---|---|---|
| Q1 | Métrica norte: **B (aquisição/viral) > C (tempo de uso/mídia) > A (retenção)** | Share antes de CTA de login; CTA pós-run aponta pro Resultadismo; login wall só no ranking |
| Q2 | **5–10% de campeões** confirmado | Calibração da dificuldade/barras mira esse alvo |
| Q3 | Curiosidades: **fora do MVP**, entram na fase 2 | Campo `fact_pt` já nasce na tabela, vazio |
| Q4 | Publicidade **discreta ou integrada**; perguntou sobre AdSense → ver abaixo | Registrar no doc 12 quando ele nascer |
| Q5 | "Cobriu tudo, vamos seguir!" | Portão A cumprido |

### Q4 — AdSense faz sentido? (resposta da equipe)

**Tecnicamente sim, estrategicamente não (por ora).** Três motivos:
1. **Rende pouco em tráfego pequeno** (display programático ≈ R$ 1–10 por mil visitas) — não paga o
   custo de marca.
2. **Controle imperfeito do que aparece**: AdSense pode servir anúncio de **casa de apostas** — choque
   frontal com a regra central "não é aposta" (dá para bloquear categorias, mas a margem de erro
   existe; o 7a0 com pop-under é o anti-exemplo).
3. **Coerência**: a landing do Resultadismo promete **"Sem anúncios"** — qualquer ad no ecossistema
   exige revisar essa promessa em todos os pontos de contato (regra central 9).

**Recomendação registrada:** MVP sem anúncio; com tração, **patrocínio direto integrado** ("Copa
Retrô de hoje oferecida por X" na tela de campanha/share) — discreto, controlável e com CPM melhor.
AdSense só como experimento tardio, com bloqueio da categoria apostas e revisão da copy. Decisão
final é do João quando chegar a hora (dinheiro = regra central 8).

## Especificação consolidada de modos (D2 + D5 + D6 + D16)

Dois eixos independentes, escolhidos antes da run:

| Eixo | Opções (MVP) | Observação |
|---|---|---|
| **Dificuldade** | **Acerto** (≥1 pt avança; semi/final ≥2 — D3) · **Só Cravada** (só cravada avança, em todas as fases) | Cada um com ranking próprio na Copa do Dia |
| **Ritmo** | **Resultadista** (apertado — o ritmo oficial do ranking) · **Clássico** (folgado) · **Sem Pressa** (sem timer) | **Só o ritmo Resultadista entra no ranking** (tempo comparável); Clássico/Sem Pressa = mesmas runs, sem ranking |

- Copa do Dia: os MESMOS 7 jogos valem para os dois modos de dificuldade; rankings separados
  (Acerto / Só Cravada). 1 tentativa por conta **por modo de dificuldade**? → **Não: 1 tentativa
  total por dia**, o jogador escolhe em qual modo encara (mantém a escassez Wordle). _Calibrável na
  homologação se parecer restritivo._
- Tempos de partida (ponto de partida p/ playtest): Resultadista 10/8/7s · Clássico 14/12/10s.
- Timer: barra encolhendo; aos **3s finais entra contagem com milésimos + mudança de cor** (pedido
  do PO).

## Status e próximos passos

- **Fase 1 (dados) — CONCLUÍDA E VALIDADA LOCALMENTE (09/06/2026).** Entregues:
  - `data/retro-sources/` — 22 JSONs do openfootball (CC0) + `curadoria.json` (86 seleções com
    nome PT/slug/tier/extinta, 34 jogos-lenda verificados, 33 bandeiras).
  - `scripts/gen-retro-seed.mjs` — importador com portões de qualidade; pegou 2 casos históricos
    reais: prorrogação em jogo de GRUPO na Copa de 1954 (regra da edição) e o duplo
    Brasil×Tchecoslováquia de 1962 (0x0 no grupo + 3x1 na final).
  - `supabase/migrations/20260610150000_retro_matches.sql` — tabela + RLS ligado SEM policy
    (anon e logado leem 0 linhas — gabarito protegido, verificado via `set role`) + 964 jogos.
    Distribuição de dificuldade: 1:36 · 2:133 · 3:315 · 4:267 · 5:150 · 6:54 · 7:9.
  - 33 bandeiras históricas em `public/teams/` (URSS, Iugoslávia, Zaire, Alemanha Oriental…)
    + manifest regenerado (325 escudos; 100% dos slugs do jogo resolvem).
  - `npm run db:reset` verde · `db:types` regenerado · `typecheck` verde.
  - Conferências no Postgres: 964 jogos · 22 edições · 35 disputas de pênaltis · 73 prorrogações ·
    4 replays · Maracanazo/7x1/final 2022 com dificuldade 1 e pênaltis como campo informativo.
- **Ajustes do PO na homologação da Fase 1 (09/06, aprovada com 2 pedidos — ATENDIDOS):**
  (a) **Sorteio pondera o nível primeiro** — grupos: nível 1 = 45% · 2 = 35% · 3 = 20% (corrige
  "nível 3 domina por ter mais jogos"); demais fases ~uniforme por nível; 10% fora da janela mantido.
  Implementado no visualizador E no motor (`retro_pick_match`).
  (b) **Bandeiras padronizadas em CÍRCULO** (padrão Sofascore dos PNGs 150×150): todos os 60 SVGs
  retangulares (33 novos + 27 pré-existentes) envelopados em clip circular com corte centralizado —
  `scripts/gen-flag-circles.mjs` (idempotente, marcador `data-rd-circle`).
- **Fase 2 (motor no banco) — CONCLUÍDA E TESTADA (09/06/2026).** Migration
  `20260610150001_retro_engine.sql`: tabelas `retro_daily`/`retro_runs`/`retro_run_matches`/
  `retro_usage_daily` (todas RLS sem policy) + RPCs `retro_start_run` (retomada do daily,
  unicidade 1/dia por conta), `retro_answer` (janela de tempo NO servidor +2s, pontua com
  `compute_score_type`/`score_points`, progressão D3 com jogo de honra e barra ≥2 na semi/final,
  modo Só Cravada), `retro_run_summary` (share sem spoiler), `retro_leaderboard` (fase→pontos→tempo,
  respeita `show_in_global_ranking`), `retro_touch_anon` (agregado diário, clamp 60s),
  `retro_purge_ephemeral` + cron 03:40 UTC (D17: permanente só Copa do Dia de logado).
  **Bateria de 8 testes verde** (`scripts/retro-engine-tests.sql`): campeão 21 pts, eliminação nos
  grupos com jogo de honra, timeout de servidor, barra da semi, daily determinístico/retomável/único,
  ranking, summary sem identidade de jogos, Só Cravada, clamp anônimo, purga, RLS = 0 linhas.
- **⚠️ Pendências antes do PUSH (a sessão que subir cumpre):** re-conferir numeração das migrations
  `20260610150000/2` vs `origin/main` (doc 09 §3 — hoje o bookkeeping local já pegou uma colisão de
  nº 000011 entre worktrees!); rodar `db reset` limpo de uma árvore atualizada; atualizar
  `.claude/05` §2 (tabelas `retro_*`) e criar `.claude/12-RETRO-MINIJOGO.md`; revisão AppSec do
  rate-limit das RPCs anônimas (hardening listado na pesquisa D14); homologação final (Portão B).
- **Fase 3 (UI) — CONCLUÍDA E VALIDADA E2E (09/06/2026)**, no worktree `feat/retro-minijogo`
  (`../resultadismo-retro`, base = main local pós-2.0). Feature slice `src/features/retro/`:
  `RetroPage` (landing + máquina de estados home→play→reveal→done, seletor Modo/Ritmo, streak +
  melhor campanha), `RunView` + `ScoreWheels` (roletas de rolagem grandes, "–" = sem palpite) +
  `RetroTimer` (barra + milésimos/cor nos 3s finais + auto-submit no estouro), `RevealCard`
  (carimbo CRAVADA/SALDO/ACERTO/FORA + flip do placar + confete na cravada), `ResultView`
  (campanha + share WhatsApp com grade de emojis sem spoiler), `RetroSharePage` (/retro/r/:code),
  `RetroLeaderboard`, heartbeat anônimo. Rotas públicas em `App.tsx`; keyframes "fliperama" no
  `index.css` (cobertos pelo kill-switch global de reduced-motion). Migration extra
  `20260610150002_retro_ui_support.sql` (payload com match_id/difficulty + RPC `retro_my_stats`).
  **Validação real**: typecheck + lint zerado (complexidade ≤20) + `check:arch` aprovado + **E2E
  Playwright em Chrome real** (run anônima completa de Treino, timer tenso + timeout auto-submit,
  reveal com flip visível, tela final, share-page 404, zero erros de console).
- **Homologação do PO — rodada 1 (09/06, "gostei das animações") — 6 ajustes ATENDIDOS:**
  (1) BUG corrigido: o slot seguinte era servido no `retro_answer` e o cronômetro corria durante o
  reveal → falso "tempo esgotado"; agora `retro_next` serve sob demanda (migration
  `20260610150003`), com E2E de regressão (ler reveal 12s + responder em 2s = sem timeout).
  (2) Roletas: maior número EM CIMA (rolar pra cima = mais gols) e começam em 0×0 (palpite válido).
  (3) Visual mais retrô: placar eletrônico ink-950 com dígitos dourados, scanlines no hero,
  listras duplas, roletas estilo placar de estádio. (4) Semi/final com moldura dourada pulsante
  ("⚡ decisão"); campeão com confete; vitrine `/retro?demo=1` (DEV) mostra todos os vereditos.
  (5) Modo/Ritmo empilhados (sem quebra de linha). (6) Integração Retrô⇄Resultadismo: entrada
  "Retrô" na Sidebar + BottomNav (logado) e no header/PublicShell (deslogado); na home do jogo,
  card "Voltar pro Resultadismo"; pós-share, card "Palpitar nos jogos de hoje →" (Q1: aquisição).
- **EM PRODUÇÃO (10/06/2026, commit dee3108)** — João autorizou o teste com amigos;
  migrations renumeradas 20260610150000-3 (colisão com a 20260610120000 do release 2.0 evitada).
- **Rodada 2 de homologação + FASE 4 — CONCLUÍDAS (10/06, commit bb8e625, aguardando teste local
  do João antes do push):** placar eletrônico sempre escuro (tokens `--retro-board*` — contraste);
  bandeiras corrigidas na RAIZ (wrapper preservava só xmlns básico e perdia `xmlns:xlink` → 12/60
  SVGs não decodificavam; originais restaurados + script corrigido + auditoria 60/60 + RetroCrest
  com retry); demo ganha prévia do card de decisão; eventos GA4
  (`retro_run_start/guess/run_end/share`); seção no Como Funciona + landing; guarda anti-abuso
  anônimo (30 runs/h/token, migration `20260610150004`); doc oficial `.claude/12-RETRO-MINIJOGO.md`
  + linha no MESTRE §2 + tabelas/RPCs no doc 05.
- **Rodada 3 (10/06, feedback dos amigos em produção) — 4 ajustes ATENDIDOS, commit local:**
  (1) ano/fase em DESTAQUE no card ("Copa de 1990" gigante + selo de fase); (2) escudos
  instantâneos: 85 bandeiras pré-aquecidas na home + respiro "Valendo…" de 1,2s antes do cronômetro
  (servidor compensa +1,5s no deadline, migration `20260610150005`); (3) botões +/− acima/abaixo
  das roletas; (4) semi/final mais justas: janelas do sorteio desceram um degrau (SF 4-6→3-5,
  F 5-7→4-6) + mata-mata pesa 40/35/25 pro fácil — a barra ≥2 pts da semi/final (D3) fica, é o
  mecanismo de raridade do título; se seguir difícil, o próximo botão é ela.
- **Rodada 4 (10/06, decisão do PO):** modos rebalanceados — `acerto` aceita **qualquer
  pontuação (≥1) em todas as fases** (caiu a barra ≥2 da semi/final, decisão explícita do PO
  sobre a recomendação da equipe) e o modo difícil virou **"Na Crava"** (≥2: saldo ou cravada em
  todas as fases; "só cravada" era impossível) — migration `20260610150006`, testes T4/T6
  reescritos. **Share como imagem**: card PNG 1080×1350 via canvas (identidade do placar
  eletrônico, trilha colorida, CTA-desafio), Web Share API nível 2 com fallback texto/wa.me +
  botão "Baixar a imagem".
- **Rodada 5 (10/06, decisões do PO):** (1) barras de volta e mais duras — acerto: semi pede
  SALDO e **final só com CRAVADA**; Na Crava: ≥2 sempre + final só cravada (migration
  `20260610150007`, `retro_pass_need`); (2) **🎲 cada cravada dá 1 ficha de troca de jogo**
  (RPC `retro_reroll`, T9 na bateria); (3) **treinos ranqueados** (runs de logado persistem;
  board Treino = melhor campanha por pessoa; melhor campanha geral no perfil); (4) run em
  **overlay tela-cheia** (cabe até em iPhone SE 375×667, validado por E2E); (5) share prioriza
  COMPARTILHAR: arquivos via Web Share → imagem no clipboard + wa.me → texto (sem botão de
  download); (6) **navegação separada**: Retrô sai da Sidebar/BottomNav/header e entra como
  sugestão no Perfil; voltar pro Resultadismo pela home do jogo e pós-run.
- **Rodada 6 (10/06, decisões do PO):** (1) emojis do share nas cores do app (🟨 cravada · 🟩
  saldo · 🟦 acerto); (2) **RESET de ranking + Copa do Dia** e novo formato **temático por
  seleção** (dia 0 = Brasil; rotação entre 58 seleções com ≥7 jogos; 7 jogos ordenados do fácil ao
  difícil; RPC `retro_today` — migration `20260610150008`); (3) ritmo Clássico aposentado (ficam
  Sem Pressa ← e Resultadista →; fácil sempre à esquerda); modos renomeados **Vale Ponto / Vale
  Saldo**; (4) **Dificuldade do Treino** Fácil/Padrão/Difícil (janelas ±1; ranking de Treino só no
  Padrão); (5) tela: `/retro*` ganhou **RetroShell próprio** (sem BottomNav/header do app),
  overlay z-[70], microcopy enxuta; (6) **banner do Retrô na landing** deslogada e **card próprio
  no topo do menu do Perfil** (saiu o item de lista).
- **Backlog (fase 2 do Retrô)** — eventos GA4 (union do `analytics.ts`) ✓feito, entrada na navegação/Como Funciona/
  landing (pontos de contato), docs `.claude/05` §2 + `12-RETRO-MINIJOGO.md` → **Fase 5**:
  homologação com o João (Portão B), integração do worktree na main e deploy.
