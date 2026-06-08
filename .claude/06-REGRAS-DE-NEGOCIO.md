# 06 — Regras de negócio (a constituição)

> As regras que **definem o que o Resultadismo é**. Mudar qualquer uma exige decisão consciente do
> João + atualização de doc + changelog (ver [`MESTRE.md`](MESTRE.md) §5). Onde a regra mora no
> código, está citado — a **migration/função é a fonte de verdade**; este texto é o contrato legível.

Índice: [1. Pontuação](#1-pontuação-o-coração) · [2. Palpite/jogo](#2-ciclo-de-vida-do-palpite-e-do-jogo)
· [3. Classificação/desempate](#3-classificação-e-desempate) · [4. Grupos](#4-grupos)
· [5. Pagamento](#5-monetização--pagamento) · [6. Confrontos](#6-confrontos-liga--copa)
· [7. Escudos](#7-escudos) · [8. Notificações](#8-notificações) · [9. Outras regras](#9-outras-regras)

---

## 1. Pontuação (o coração)

| Tipo | Pontos | Quando |
|---|:---:|---|
| **Cravada** | **3** | Placar **exato** (acertou os dois números). |
| **Saldo** | **2** | Vencedor certo **+ mesma diferença de gols** (cobre empates: empate previsto com a mesma diferença = saldo). |
| **Acerto** | **1** | Só o **vencedor** certo (sem ser saldo). |
| **Erro** | **0** | Errou o vencedor. |

- Calculada **no banco**: `compute_score_type()` + `score_points()`
  (`20260526000002_football_data.sql`). O client **nunca** recalcula — só exibe.
- **Quando pontua:** ao escrever o palpite, se o jogo já está `finished`; e **re-pontua
  automaticamente** quando o resultado do jogo muda (triggers `predictions_score_on_write` e
  `matches_rescore_predictions`, `20260526000004`). → [`05`](05-DADOS-E-AUTH.md) §5.
- **Placar que conta:** 90' + prorrogação. **Pênaltis NÃO contam** para a pontuação (são
  informativos).
- **Pontos por tipo são configuráveis por grupo** (`league_competitions.settings.points`),
  default 3/2/1 — então a função usa o que estiver no settings.

### Dobro (2×) — o "coringa"
- Marca `predictions.is_joker`; o palpite vale **em dobro** naquela disputa.
- **Limite por semana, por competição** (semana civil ancorada em America/Sao_Paulo), garantido por
  trigger (`enforce_joker_limit`, migrations de joker `…012`/`…014`). O número exato do limite está
  na migration/competição — **conferir lá** antes de afirmar um valor.

---

## 2. Ciclo de vida do palpite e do jogo

**Jogo (`matches.status`):** `scheduled` → `live` → `finished` (também `postponed`/`cancelled`).
O resultado entra por **sync automático** (Edge Function, provedores ESPN/football-data/TheSportsDB)
ou por **override manual do admin** (`AdminCompMatchesPage`).

**Palpite:**
- Editável **até o `kickoff_at`**. A partir do apito, **trava** (`match_is_locked` + RLS de
  `predictions`): não dá para criar, editar nem apagar. → [`05`](05-DADOS-E-AUTH.md) §3.
- É **global por (usuário, jogo)**: o mesmo palpite conta em **todas** os grupos que disputam
  aquela competição.
- **Privacidade até o apito:** você só vê o palpite dos outros **depois** que o jogo começa. Antes,
  no máximo "fulano já palpitou / não palpitou" (vale também no detalhe de confronto — anti-trapaça).

**Curadoria:** o admin pode **ocultar** um jogo (`matches.hidden`): ele sai dos palpites **e não conta para a pontuação** — mesmo que alguém já tenha palpitado **antes** de ocultar. É filtro de leitura (`and m.hidden = false`) em **todas** as funções de pontuação (standings, perfil, confronto); **desocultar volta a contar na hora**. (migrations `…028`/`…029`). Também não gera nem aparece em **notificação** ("Não esquece de palpitar! ⏰"/cutucada) — `create_deadline_reminders`/`nudge_for_match` filtram `hidden=false` e a leitura passa pela RPC `get_my_notifications` (lembretes/cutucadas antigos somem da bell; desocultar faz reaparecer)

---

## 3. Classificação e desempate

Modo **Pontos/Tabela**: ranking por soma de pontos via `get_league_standings` (com dobros).
**Desempate fixo** (não inventar outro):

```
pontos → cravadas → saldos → aproveitamento → acertividade → membro mais antigo
```

Métricas exibidas: jogos, pontos, cravadas, saldos, **aproveitamento** (% de pontos vs máximo
possível) e **acertividade** (% de palpites que pontuaram). Detalhe da fórmula em
[`05`](05-DADOS-E-AUTH.md) §6.

### Resultadismo The Best (classificação geral) — recortes
Ranking de **todos os Resultadistas, todas as competições** (3/2/1 × dobro; ignora jogos ocultos;
opt-out por `show_in_global_ranking`). Na `/ranking`, o recorte é **por abas** (sem select, sem ano):
- **Todos** — soma tudo (`get_global_standings`).
- **Que eu jogo** — corta a pontuação de **todo mundo** ao **conjunto de campeonatos que você joga**
  (competições dos seus grupos, `get_my_played_competition_ids`); comparação justa só no que é comum
  (`get_global_standings_multi`). Só aparece se você joga algo.
- **Cada campeonato** — recorta àquela competição.
Alterna **pontos × detalhe** (cravadas/saldos/acertos/aproveitamento) na própria lista.

---

## 4. Grupos

> **Renome "Federação" → "Grupo" (2026-06-04, ADR [`0001`](decisions/0001-espaco-grupo.md)):** mais
> claro pro leigo. **Implementado** — doc, UI, rotas e copy renomeadas; banco segue `leagues`.

**Grupo** = o espaço social onde a turma joga. A tabela continua `leagues`; só o **rótulo** evoluiu:
**Liga → Federação → Grupo** (rotas `/grupos`, com redirects de `/federacoes/*` e `/ligas/*`). ⚠️ "Liga" passou a significar um **modo de disputa** dentro do grupo (ver §6) — é
uma troca de significado proposital.

- **Papéis:** `owner` (criador, protegido contra remoção/rebaixamento), `admin`, `member`.
- **Visibilidade ↔ entrada (modelo travado no banco, 2026-06-06):** a combinação é **enforçada por
  CHECK** (`leagues_visibility_join_policy_ck`, migration `20260606000006`):
  - **Privado ⇒ só convite** (`join_policy = 'invite'`). Não aparece pra ninguém de fora; entra só
    com o `join_code` (6 caracteres).
  - **Público ⇒ aberto OU por aprovação** (`open` | `approval`, nunca `invite`). Aparece na
    **vitrine de grupos públicos** (`list_public_leagues`, só `status='active'`) pra qualquer
    Resultadista achar e entrar (`join_public_league`: aberto → ativo na hora; aprovação → pendente).
  - Grupos antigos foram **normalizados** na migration (privado→invite; público+invite→approval).
- **/grupos (vitrine social, 2026-06-06):** prévia do **Resultadismo The Best** com **3 pessoas**
  (você + vizinhos, `get_global_rank_window`; fallback no pódio se você ainda não pontuou) →
  "Recebeu um convite?" → **Seus grupos** (cards ricos: flâmula, **posição no ranking do grupo** via
  `get_my_league_positions`, escudos de membros sobrepostos, **WhatsApp** + lápis do admin) →
  **Grupos públicos**.
- **Criação → ativação:** depende do **modo de pagamento** global (ver §5). Todo grupo tem
  `status` (pending/active/rejected/archived) e `payment_status`.
- **Revisão de nome:** grupo pago **ativa na hora**; só o **nome** entra em revisão do admin
  (`name_approved`) — disclaimer some quando o admin aprova (`admin_approve_league_name`).
- **Nome por prefixo-badge:** o tipo vira um prefixo fixo no nome — **Bolão** (Pontos), **Liga**,
  **Copa** — configurável no admin (`app_settings`). O usuário digita só o complemento.
- **Escopo V1:** na prática, **1 competição por grupo** e foco no modo Tabela/Pontos (Copa do
  Mundo é o padrão na criação). Liga/Copa (confronto) ficam atrás de gate (§6).

---

## 5. Monetização / pagamento

> História cronológica completa do pagamento: [`HISTORICO.md`](HISTORICO.md) (consolidado).

**Regra-mãe (atual — 2026-06, ADR [`0002`](decisions/0002-pagamento-desligado-gratis.md)):** **criar
grupos é gratuito** — pagamento no modo **`disabled`**. **Jogar, palpitar, participar e criar grupos é
grátis.** **Não é casa de apostas** (sem aposta, sem prêmio em dinheiro, sem pote — Lei 14.790/2023).
A **infra de pagamento abaixo fica preservada** (test/live, Mercado Pago, cupom, reembolso), apenas
**desligada** — se voltar a cobrar, é **taxa de serviço** pela criação de Grupo, nunca aposta/prêmio.

**Modo global** (`app_settings.payment_mode`, aba Pgto do admin):
- `disabled` — criação grátis (sem cobrança). **← modo atual em produção (ADR 0002).**
- `test` — pagamento **simulado** sem Mercado Pago (`simulate_league_payment` — **só app-admin** desde
  1.1.0, p/ o modo teste nunca virar "grupo grátis" pra usuário comum); seguro para testar.
- `live` — **Mercado Pago** de verdade (cobrança real; **desligado por ora** — ver ADR 0002).

**Preço:** base `league_price_cents` + promoção opcional (`promo_price_cents`/`promo_until`).
- **Preço efetivo = promo enquanto `now() < promo_until`, senão base** — decidido **no servidor**
  (`create-league-checkout`); o front só **espelha** (`isPromoActive`/`effectivePriceCents`).
- Valores atuais: base **R$ 19,90**; promo **R$ 9,90 até 20/07/2026** (fim da Copa), depois volta
  sozinho. ⚠️ Textos da landing/Como Funciona citam esses valores **hardcoded** — se mudar o preço
  no admin, atualizar o copy à mão.

**Cupons** (`discount_codes`): % **ou** R$ fixo, com `max_uses`/validade. Incidem sobre o preço
vigente. **100% off → ativa grátis** (sem passar pelo MP). `validate_discount_code` para preview.

**Fluxo (modo live):** crio grupo (`pending`) → `create-league-checkout` calcula preço + cupom e
cria a preferência → usuário paga (Pix/cartão; **boleto removido**) no checkout hosted →
**`mercadopago-webhook`** consulta o MP (autoritativo) → `confirm_league_payment` **ativa na hora**
(nome em revisão). Idempotente por `payment_id`. Cortesia do admin: `admin_comp_league`.
- **Endurecimento (1.1.0):** o webhook só ativa se o **pagador == dono** (`metadata.user_id`) e o
  **valor ≥ preço esperado** (quando sem cupom); tem anti-replay (`ts`) e rate limit por IP.
  `confirm_league_payment` tem **guarda de estado terminal** (`for update`): uma vez `refunded`, um
  `paid` reentregue **não** reativa o grupo.

**Reembolso (direito de arrependimento — CDC art. 49):** **self-service, automático, ≤ 7 dias**.
- Botão "Cancelar e reembolsar" **só para o dono**, grupo **paga**, dentro de **7 dias** do
  **pagamento** (`league_payments.created_at` — corrigido em 1.1.0; antes usava `approved_at`, que
  podia ser anterior ao pagamento e negar reembolso válido), confirmação em 2 passos. A mutação é
  atômica (`refund_league`, `for update`).
- `cancel-league-refund` revalida no servidor → devolução **total** no MP (`POST /refunds`,
  idempotente) → marca `refunded` e **arquiva** o grupo (`status=archived`, `deleted_at=now()` →
  Lixeira do admin, recuperável). Cortesia/100%-off/teste: cancela sem chamar o MP.
- **Incondicional** dentro dos 7 dias (sem exigir "não uso" — mais seguro juridicamente).
- Qualquer caminho de `refunded` (self-service, estorno manual no painel do MP via webhook, ação
  admin) leva ao mesmo estado arquivado.
- **Fatos do Mercado Pago (reembolso):** prazo para estornar até **180 dias** da aprovação; **Pix**
  volta à conta do pagador; **cartão** estorna em **7–10 dias úteis** (controla o banco emissor); no
  reembolso **total** a **taxa de venda é devolvida ao vendedor**; o valor sai do **saldo** do
  vendedor no MP.

**Boundaries:** a IA **não digita** o Access Token, não loga no MP, **não executa estornos** no
painel. Token de produção e teste de estorno são do João. → [`04`](04-ADMIN.md) §5.

---

## 6. Confrontos (Liga / Copa)

Dentro de um grupo, uma disputa tem um **modo**: **Pontos** (ranking por acúmulo) ou
**Confronto** (duelo direto) — e Confronto se subdivide em **Liga** (pontos corridos 3/1/0) e
**Copa** (mata-mata). Tudo sobre os **mesmos jogos** que o grupo já palpita.

> **Gate:** o modo Confronto só aparece nos grupos com `leagues.confronto_enabled = true`,
> ligado **só pelo app-admin** (`admin_set_confronto_enabled`). As demais veem "em breve". A
> estrutura toda está em produção **atrás desse gate**.

**Conceito central — o confronto se resolve por PERÍODO, não por "dia":** o problema da Copa é ter
poucos jogos por dia. A unidade do duelo é um **período** — uma rodada da fase de grupos, uma fase do
mata-mata, ou uma semana (`period_kind` = phase/week). Quem fizer **mais pontos no período** vence
o confronto (Liga: 3/1/0; empate de pontos = 1/1. Copa: o vencedor **avança** —
`advance_confronto_cup` promove p/ a fase seguinte, empate de mata-mata desempata por **seed**).
`get_competition_periods` lê o calendário real (ex.: Copa 2026 = 8 fases ou ~6 semanas). A **semana**
é ancorada em **America/Sao_Paulo** (BRT, igual ao dobro e à tela de Jogos — unificado em 1.1.0).

**Estados** (`league_competitions.confronto_state`): `draft` (rascunho, só admin vê) → `scheduled`
(sorteado, **oculto até o horário** — enforçado **no servidor** desde 1.1.0: `get_confronto_ties`/
`get_tie_detail` retornam vazio enquanto `scheduled`, não só na UI) → `drawn` (no ar) → `finished`.

**Sorteio:**
- Fixtures gerados no **client** (`features/confronto/build.ts`: round-robin pelo método do círculo,
  bracket por seed, **suíço** progressivo) e persistidos por **uma RPC transacional**
  (`draw_confronto`, admin-only) que trava os participantes (`confronto_participants`) e monta os
  `cup_ties`. `undo_confronto_draw` reverte **enquanto nenhuma rodada começou**.
- **Quando sortear:** instantâneo, agendado para data/hora, ou no 1º jogo do campeonato
  (`scheduled_draw_at`; liberado por cron `release_scheduled_confrontos` + gatilho lazy).
- **Simulador** (`/simulador` + painel no sorteio): mostra pares J1×J2, byes, chaveamento e a
  **viabilidade** (o que cabe no calendário) **antes** de comprometer, com slider "e se".

**Formato da Liga** (`liga_format`, escolhido **no sorteio**): turno parcial / ida e volta / **suíço**
(para 9+ jogadores, já que round-robin completo não cabe na janela curta da Copa; `append_confronto_ties`
gera a próxima rodada).

**Participantes** (`participant_mode`, escolhido na criação): **admin seleciona** OU **opt-in** (cada
um se inscreve em `confronto_optins`, válido só em `draft`).

**Regras de integridade:**
- **Anti-trapaça:** palpite/pontos do oponente ficam ocultos até o jogo começar (`get_tie_detail`
  revela só no apito ou para o próprio).
- **Saída = W.O.:** sair do grupo durante uma Liga/Copa ativa dá **W.O.** nos confrontos em
  aberto (oponente vence) e remove o membro (`leave_league`, dupla confirmação).
- **Bye:** sem oponente no período → **vence** (conta como vitória na classificação de confronto;
  ajustado em 1.1.0 — antes não pontuava).

---

## 7. Escudos

Identidade visual de **perfis** e **grupos** por **máscara SVG**: o SVG recorta (via
`mask-image`, alpha) um fundo de cor/padrão/foto. Desacopla **forma** de **conteúdo**.

- **Catálogo automático** via `import.meta.glob` de `src/assets/escudos/*.svg` (escudo-padrao +
  escudo-1..16) e `src/assets/grupos/*.svg` (flamula-1..3). Gerenciar = largar/remover arquivo.
  **Não renomear** arquivos em uso (o `<id>` fica salvo no perfil/grupo).
- **Encoding:** `crest:kind:shape:fill:cores:rotação:foto` salvo em `profiles.avatar_url` /
  `leagues.logo_url`. Fundos: sólido / listras / grade / bola / foto.
- **Todo perfil tem escudo** sem migration: `legacyToCrest` adapta avatares antigos no render
  (`gen:` antigo, foto crua do Google, ou `null` → escudo padrão determinístico pelo nome).
- Edição: `CrestEditor` (perfil em `EditarPerfilPage`; grupo na tela de editar grupo).

---

## 8. Notificações

- **Web Push (VAPID):** inscrição em `push_subscriptions`; Service Worker (`sw.ts`) exibe a
  notificação; envio pela Edge Function `send-push`. Permissão pedida no onboarding/perfil.
- **Lembrete de prazo:** cron `create_deadline_reminders()` — jogo começando em breve + membro **não
  palpitou** + sem lembrete anterior → cria notificação `deadline` (com push).
- **Cutucar (nudge):** `nudge_member` — membro cutuca outro membro que não palpitou. **Anti-spam:**
  no máx. 1 por par a cada 30 min.

---

## 9. Outras regras

- **Leitura anônima:** visitante vê jogos/competições/landing sem login (RLS anon de leitura);
  palpitar exige login.
- **Sala de espera:** em pico, fila FIFO protege o Realtime (fail-open). → [`05`](05-DADOS-E-AUTH.md) §7.
- **Competições reais:** sincronizadas de provedores (ESPN preferido: grátis, status ao vivo,
  escudos, nomes PT). football-data.org Free é limitado; API-Football Free é travado em 2022–2024
  (descartado p/ 2026). Admin publica (`is_published`) e renomeia em PT-BR (`display_name`).
- **Privacidade/LGPD:** contato único `resultadismoapp@gmail.com` (Controlador + DPO). Dados de
  cartão ficam **com o Mercado Pago**, nunca com o app. Termos §12 cobrem pagamento e arrependimento.
- **Personalização (2026-06-06 · reforma 2026-06-07):** o **tour de boas-vindas** (modal, 1º acesso)
  continua; depois o Resultadista cai na **página de personalização** (`/perfil/personalizar`, fluxo
  focado, também editável pelo Perfil). Telas: **time do coração** (só clubes, busca + lista, escolha
  única) · **seleção que torce** (Brasil 1º, depois alfabética) · **uma tela** "times e campeonatos"
  (campeonato inteiro **ou** times avulsos, com estado parcial) · **RTB** + código. **Tudo é pulável**
  (mas "Próximo" só habilita ao escolher). Preferências em `profiles`: `favorite_team_id`,
  `national_team_id`, `followed_competition_ids[]` (campeonato inteiro) e **`followed_teams jsonb`**
  (`{competition_id: [team_slug]}` — follow de time **por campeonato**: dá pra seguir um time numa
  liga e não numa copa). Campeonatos vêm de `list_personalization_competitions` (flag
  `in_personalization`). Copy **conversacional** → [`10`](10-UX-WRITING.md) §2.
- **Catálogo de times (fonte das listas) — `src/data/teams-catalog.json` (2026-06-07):** as listas
  de clube/seleção/time-por-campeonato são **client-side**, do catálogo curado (~292: clubes +
  seleções), **desacopladas da tabela `teams`** (que é do sync/jogos) — funciona fora de temporada.
  Cada time tem `slug`, `name_pt`, `kind` (club|national), `competitions` (provider_codes), `aliases`.
  Escudos: `public/teams/<arquivo>` resolvidos pelo manifest `src/lib/teamCrests.ts` (fonte primária,
  CDN custo zero). O `competitions` por time alimenta o "**seguir em todos** os campeonatos". Lógica
  em `src/features/onboarding/teamsCatalog.ts`.
  - **Como encorpar (adicionar clubes/seleções/campeonatos):** edite `src/data/teams-catalog.json`
    (slug + name_pt + kind + competitions + aliases). Para escudo novo: ponha o arquivo em
    `public/teams/<slug>.png|svg` (ou rode `scripts/fetch-crests.mjs` p/ baixar do `crest_source`) e
    rode `scripts/gen-team-crests.mjs` (regenera o manifest). Builder do catálogo:
    `scripts/gen-teams-catalog.mjs`. Faltam só escudos de **Costa do Marfim** e **Suécia** (Wikimedia
    quebrado p/ esses 2).

---

### Quando uma mudança toca uma regra de negócio
**Todo** código já passa pelo portão geral (regra **16**, Portão A): plano validado pelo João antes de
implementar. Esta seção é o **cuidado extra** quando a mudança encosta numa regra de negócio: confronte-a
com a regra acima (passo 1 do protocolo no [`MESTRE.md`](MESTRE.md)). Se a mudança **altera** a regra:
1. **Confirme com o João** com atenção redobrada (especialmente se fere uma regra central) — o OK do PO
   aqui não é só o do Portão A, é a aprovação consciente de mexer numa regra.
2. **Atualize TODOS os pontos de contato do site** que falam sobre ela — muitas destas regras
   (pontuação, preço, desempate, "não é casa de apostas") aparecem em **vários lugares**: home,
   "Como funciona", onboarding, landing, copy de UI, **Termos** e **Privacidade**. O site inteiro
   tem que comunicar a mesma coisa — nada de um ponto novo e outro velho. (passo 6 do protocolo)
3. **Atualize esta doc** e qualquer outra afetada em `.claude/`.
4. **Registre no [`CHANGELOG.md`](CHANGELOG.md)** (e no [`HISTORICO.md`](HISTORICO.md) se foi decisão
   de mudar uma regra).
