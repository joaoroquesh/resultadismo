# Sessão 2026-06-03 — Confrontos (Liga / Copa) por federação: do design ao deploy gated

> Documento gerado a partir dos timestamps reais do `git`, dos checks de commit e das verificações em produção. Horários em **America/São_Paulo (UTC-3)**. Todo o trabalho rodou na branch `feat/confrontos` (criada de `origin/main`) e foi mergeado em `main` em vários pushes ao longo de **2026-06-01 → 2026-06-03**, **em paralelo** com a sessão `claude/escudos-svg` (escudos, ESPN, jogos — ver [`sessao-2026-06-03.md`](./sessao-2026-06-03.md)). Estado final em produção: `main` @ **`ce8a267`**, projeto Supabase `vblvfbjqvmunlkehpafj`.
>
> Planejamento que originou este trabalho: [`planning/confrontos-e-federacoes.md`](./planning/confrontos-e-federacoes.md) e [`planning/confrontos-v2.md`](./planning/confrontos-v2.md). Este documento registra **o que de fato foi construído e subiu**.

## Sumário executivo

Foi entregue, **em produção e atrás de um gate por federação**, o modelo de **Confronto** (duelo direto) que alimenta os modos **Liga** (pontos corridos 3/1/0) e **Copa** (mata-mata), sobre os mesmos jogos que a federação já palpita. Resumo do que está no ar:

1. **Deploy gated** — `leagues.confronto_enabled` (default `false`). Liga/Copa só aparecem nas federações que o **app-admin** ativou; o resto segue em "em breve". Subiu cedo e foi ganhando recursos sem expor nada ao público.
2. **Modelo Confronto** — `cup_ties` (duelo A×B), `confronto_participants` (snapshot no sorteio), estados `draft → scheduled → drawn → finished`. Sorteio transacional (`draw_confronto`) e desfazer (`undo_confronto_draw`), ambos gated por admin.
3. **Período por FASE ou SEMANA** — o confronto se resolve por um **período** (rodada de grupos, fase do mata-mata, ou semana), não pelo "dia". Aproveita a **Copa inteira** (8 fases ou 6 semanas), com nº de jogos por período visível antes de sortear.
4. **Simulador completo** — antes de sortear, o admin vê pares J1×J2, byes, chaveamento e a viabilidade (o que cabe em turno/returno/suíço), com slider de "e se" para mais jogadores.
5. **Formato da Liga na simulação** — Turno / Ida e volta / Suíço escolhidos no sorteio (não na criação). Suíço de verdade (pareamento por classificação evitando revanches, com bye) e geração de próxima rodada.
6. **Participantes: admin seleciona OU opt-in** — `participant_mode` escolhido na criação; quando opt-in, cada um aceita jogar (`confronto_optins`).
7. **🔴 Anti-trapaça** — palpite/pontos do oponente ficam **ocultos** até o jogo começar; antes do apito só mostra "palpitou / não palpitou".
8. **Saída com W.O.** — sair da federação durante uma Liga/Copa ativa dá **W.O.** nos confrontos em aberto (oponente vence) e remove o membro, com dupla confirmação.
9. **Regra de nome editável** — prefixos **Bolão / Liga / Copa** como badge fixa no nome (não se digita), configuráveis no admin.
10. **Sorteio agendado** — instantâneo, agendado para data/hora, ou no 1º jogo do campeonato; revelado no horário por cron + gatilho lazy.

## Cronograma

| Horário (BRT) | Evento | Commit |
|---|---|---|
| 06-01 02:00 | Simulador de estrutura (Liga/Copa) para a Copa do Mundo — motor TS puro. | `c778a7e` |
| 06-01 07:56 | Modo **Liga** jogável: geração round-robin + classificação 3/1/0. | `6782a31` |
| 06-02 18:00 | **Confronto v2**: design + fundação no banco (estados, snapshot de participantes, sortear/desfazer). | `277d478` |
| 06-02 18:17 | UI completa da Liga (sorteio, classificação, rodadas, meu confronto, detalhe) + seletor Pontos\|Confronto. | `337fa49` |
| 06-02 18:23 | Criar federação + "Como Funciona" com os modos Pontos\|Confronto(Liga/Copa). | `367279d` |
| 06-02 18:25 | Simulador focado na Copa (por fase/semana) + copy. | `e5114b2` |
| 06-03 12:17 | **Gate**: libera Liga/Copa por federação (só app-admin) — `confronto_enabled`. | `0310825` |
| 06-03 12:40–12:58 | Reconciliação do histórico de migrations p/ destravar o deploy do confronto (prod tinha órfãs de sessões anteriores). | `4d49df1`, `0b3dcc4` |
| 06-03 13:33 | **Anti-trapaça**: esconde palpite até o jogo começar. | `eb5bdc4` |
| 06-03 13:40 | Simular e configurar rodadas **antes** de sortear. | `5863fd7` |
| 06-03 14:04 | Visões separadas (Pontos vs Confronto), regra de nome e saída com **W.O.** | `38d0213` |
| 06-03 14:09 | Renumera confronto após `match_curation` (colisão com a outra sessão). | `1fceec0` |
| 06-03 16:54 | **Período por FASE ou SEMANA** (aproveita a Copa inteira). | `3a4a29e` |
| 06-03 17:00 | Prévia real do sorteio (pares J1×J2, byes, fases). | `9ea3c7a` |
| 06-03 17:11 | Participantes — **admin seleciona OU opt-in** (escolhido na criação). | `1694fa7` |
| 06-03 17:19 | Liga **turno parcial OU suíço progressivo** (escolhido na criação). | `dd122d7` |
| 06-03 17:23 | Renumera confronto v3 após `espn`/`refund` (colisão). | `ff9cac2` |
| 06-03 18:09 | **Ajustes pontuais**: prefixo-badge, formato na simulação, "Configurar", **sorteio agendado**. | `0bb5e0b` |
| 06-03 18:13 | Merge final de `origin/main` + push para `main` → deploy. | `ce8a267` |

> A sessão paralela (`claude/escudos-svg`) mergeou commits intercalados (escudos, ESPN, admin de jogos). A cada divergência: `git fetch` + merge de `origin/main` antes de cada push, **sem nunca varrer trabalho não-meu**. Várias renumerações de migration foram necessárias por colisão de número (ver "Cuidados aprendidos").

## Decisões principais

### 1. Deploy gated por `confronto_enabled`, não feature flag global
A estrutura toda subiu **cedo** para produção, mas Liga/Copa só ficam visíveis nas federações que o **app-admin** ligou (`leagues.confronto_enabled`). Um **trigger** (`leagues_guard_confronto_enabled`) impede que admin de federação altere o campo; só a RPC `admin_set_confronto_enabled` (SECURITY DEFINER, checa `is_app_admin`) liga/desliga. Permitiu iterar em prod com usuários reais sem expor nada ao público, e contornar o limite de "1 competição por federação" só onde o teste roda.

### 2. Confronto se resolve por **PERÍODO**, não por "dia"
O problema central da Copa: poucos jogos por dia (às vezes 1) tornam o "duelo do dia" injusto. **Solução:** a unidade do confronto é um **período** — uma rodada da fase de grupos, uma fase do mata-mata, ou uma semana. Quem fizer mais pontos no período vence o confronto (3/1/0). A função `get_competition_periods(p_competition_id, p_kind)` lê o calendário real e devolve:
- **Por fase** (`phase`): 8 períodos na Copa 2026 — Rodada 1/2/3 dos grupos (24 jogos cada), 32-avos (16), Oitavas (8), Quartas (4), Semis (2), Final (2; 3º lugar mesclado na Final).
- **Por semana** (`week`): ~6 períodos (semanas ISO), com a contagem de jogos de cada uma.

Um helper SQL `match_in_period(...)` decide a que período um jogo pertence; `cup_ties.period_kind` + `period_value` gravam o período de cada confronto. As funções de pontuação (`get_confronto_ties`, `get_confronto_standings`, `get_tie_detail`) resolvem por período via subqueries laterais.

### 3. Fixtures montados no **client**, persistidos por **uma** RPC transacional
A geração de chaveamento/rodadas é TS puro (`build.ts`): round-robin pelo método do círculo, bracket por `seedOrder`, atribuição de período, e o pareamento suíço. O resultado vai inteiro para `draw_confronto(p_lc_id, p_participants, p_ties, …)` — uma RPC SECURITY DEFINER, gated por admin, que apaga o sorteio anterior e insere participantes + `cup_ties` numa transação. Mantém a lógica testável em TS e o banco como mero executor transacional. `undo_confronto_draw` reverte.

### 4. Liga grande → **Suíço**; formato escolhido na **simulação**
Round-robin completo precisa de `N-1` rodadas — não cabe na janela curta da Copa para 9+ jogadores. Para esses, **Suíço**: `buildSwissNextRound` pareia por classificação evitando revanches, com bye para ímpar; `useAdvanceSwiss` gera a próxima rodada (idempotente) e `append_confronto_ties` insere. **Decisão de UX (ajuste pontual):** mesmo quando todos-contra-todos *cabe*, o admin pode optar por Suíço — então a escolha **Turno / Ida e volta / Suíço** foi movida da criação para o **sorteio** (`liga_format` gravado em `draw_confronto`), onde ele vê o que cabe e decide se adiciona/remove gente.

### 5. Anti-trapaça por **revelação no apito**
Num confronto, ver o palpite do oponente antes do jogo é vantagem desleal. `get_tie_detail` revela palpite/pontos/joker de um lado **só se** `kickoff_at <= now()` **ou** o lado é o próprio usuário; senão devolve `null` + uma flag `a_palpitou`/`b_palpitou`. A UI mostra "palpitou / não palpitou" antes do apito e o palpite real só depois.

### 6. Saída da federação durante Liga/Copa = **W.O.**
Sair no meio de um confronto não pode virar fuga grátis. `leave_league(p_league_id)` marca W.O. (`cup_ties.walkover_user`) em todos os confrontos não resolvidos do usuário (o oponente vence), e então remove a associação. A UI usa **dupla confirmação** e só mostra o aviso de W.O. quando há confronto ativo (`confronto_enabled`).

### 7. Nome por **prefixo-badge**, não texto digitado
Os tipos têm prefixo fixo — **Bolão** (Pontos), **Liga**, **Copa** — guardados em `app_settings` (`name_prefix_points/liga/cup`) e editáveis no admin (`admin_set_name_prefixes` + `NameRulesCard`). **Ajuste pontual:** o prefixo virou **badge fixa** no campo de criação; o usuário digita só o complemento, e o nome salvo é `prefixo + complemento` — sem a antiga validação "comece com…".

### 8. Rascunho oculto + sorteio agendado
"Adicionar" virou **"Criar e configurar"**: a Liga/Copa nasce como **rascunho** (`draft`) visível só para o admin (filtro `isAdmin || confronto_state !== 'draft'`), e só aparece para os demais depois de **configurada e liberada para sorteio**. O sorteio pode ser **instantâneo**, **agendado para data/hora**, ou **no 1º jogo do campeonato**. Quando agendado, os `cup_ties` já são montados mas ficam no estado `scheduled` (ocultos); `release_scheduled_confrontos()` (pg_cron a cada 5 min) e `release_confronto_if_due(p_lc_id)` (gatilho lazy quando alguém abre) viram `scheduled → drawn` no horário.

## Modelo de dados (migrations aditivas)

Todas em `supabase/migrations/`, aplicadas em prod pela integração GitHub↔Supabase. Ordem cronológica do confronto:

| Migration | O que adiciona |
|---|---|
| `20260601000022_confronto_liga_mode.sql` | Valor `liga` no enum de modo da disputa. |
| `20260601000023_confronto_standings.sql` | `cup_ties.matchday` + `get_confronto_standings` (classificação 3/1/0). |
| `20260603000004_confronto_v2_foundation.sql` | `league_competitions.confronto_state` (`draft` default) + `drawn_at`; tabela `confronto_participants` (snapshot); `draw_confronto` / `undo_confronto_draw`. |
| `20260603000005_confronto_ties.sql` | `get_confronto_ties` (confrontos por rodada). |
| `20260603000006_confronto_tie_detail.sql` | `get_tie_detail` (detalhe A×B dia a dia). |
| `20260603000007_confronto_enabled.sql` | `leagues.confronto_enabled` + trigger `leagues_guard_confronto_enabled` + `admin_set_confronto_enabled`. |
| `20260603000011_confronto_hide_palpite.sql` | Anti-trapaça: `get_tie_detail` (DROP+CREATE) com `a_palpitou`/`b_palpitou` e revelação no apito. |
| `20260603000012_confronto_walkover.sql` | `cup_ties.walkover_user`; W.O. em `get_confronto_ties/standings`; `leave_league`. |
| `20260603000013_competition_name_rules.sql` | `app_settings.name_prefix_cup/liga/points` + `admin_set_name_prefixes`. |
| `20260603000016_confronto_periods.sql` | `cup_ties.period_kind/period_value`; `match_in_period`; `get_competition_periods`; reescrita das funções de pontuação por período. |
| `20260603000017_confronto_participants_mode.sql` | `league_competitions.participant_mode` (`admin` default); tabela `confronto_optins` + RLS; `toggle_confronto_optin`. |
| `20260603000018_confronto_liga_format.sql` | `league_competitions.liga_format` (`partial` default); `append_confronto_ties` (insere próxima rodada do suíço). |
| `20260603000019_confronto_schedule.sql` | `league_competitions.scheduled_draw_at`; `draw_confronto` recriada com `p_liga_format/p_period_kind/p_scheduled_draw_at`; `release_scheduled_confrontos` + `release_confronto_if_due`; pg_cron `release-scheduled-confrontos` (*/5). |

**Estados de `confronto_state`:** `draft` (rascunho, só admin) → `scheduled` (sorteado, oculto até o horário) → `drawn` (no ar) → `finished`.

**Segurança das RPCs:** todas as de escrita são SECURITY DEFINER, `set search_path = ''`, checam `is_app_admin()` ou `is_league_admin()` e `raise` se não-admin; `grant execute` a `authenticated` (as de leitura/lazy também a `anon` quando faz sentido). Probe anônimo → erro de permissão/RLS = existe + protegida.

## Frontend (`src/`)

### Novo — `src/features/confronto/`
- **`build.ts`** (210 ln) — motor de fixtures TS puro: `buildLigaFixtures` (round-robin circle, returno por swap), `buildCopaFixtures` (bracket por `seedOrder`, byes), `buildSwissNextRound` (pareamento por classificação evitando revanche), tipos `DrawTie`/`Period`, helpers de período e `pairKey`.
- **`api.ts`** (343 ln) — tipos (`ConfrontoTie`+walkover, `TieDetailRow`+palpitou, `ConfrontoPeriod`, `PeriodKind`) e hooks React Query: `useConfrontoStandings`, `useConfrontoTies`, `useTieDetail`, `useConfrontoPeriods`, `useConfrontoParticipants`, `useConfrontoOptins`, `useToggleOptin`, `useDrawConfronto`, `useUndoDraw`, `useAdvanceSwiss`.
- **`ConfrontoSection.tsx`** (897 ln) — orquestra por estado: `draft → SorteioPanel` (participantes, forma das rodadas por fase/semana, formato da Liga, prévia do sorteio, slider "e se", modal "Quando sortear?"); `scheduled → ScheduledView` (contagem + release lazy + desfazer agendamento); `drawn/finished → DrawnView` (+ "Gerar próxima rodada (suíço)").
- **`ConfrontoViews.tsx`** (503 ln) — tabela da Liga, rodadas, bracket da Copa, "meu confronto" e detalhe A×B.
- **`simulator.ts`** (173 ln) + **`SimuladorPage.tsx`** (224 ln) — simulador autônomo de estrutura.

### Modificado
- **`features/leagues/LigaDetailPage.tsx`** — toggle "Modo Confronto (teste)" (app-admin); aba Classificação com `SegmentedControl` Pontos/Confronto (visões separadas) e filtro que **esconde rascunho** de não-admin; formulário de criação com **prefixo-badge** + seletor de `participant_mode` + botão "Criar e configurar"; diálogo de saída com dupla confirmação + aviso de W.O.
- **`features/leagues/naming.ts`** — `NamePrefixes`, defaults (Copa/Liga/Bolão), `useNamePrefixes`/`useSetNamePrefixes`, `requiredPrefix`.
- **`features/admin/NameRulesCard.tsx`** — editor dos 3 prefixos (no painel admin de competições).

## Pontuação e regras (resumo)

- **Período da Liga/Copa** = soma dos pontos de palpite de cada lado **naquele período** (com dobros). Mais pontos no período vence o confronto (3/1/0); empate de pontos = 1/1.
- **Liga** — pontos corridos sobre os confrontos da disputa; desempate por saldo. Turno / Returno / Suíço conforme `liga_format`.
- **Copa** — vencedor do confronto avança no chaveamento; byes quando não é potência de 2.
- **W.O.** — preservado em todas as leituras (oponente vence; o que saiu some da tabela).
- **Bye** — preservado (sem oponente no período → passa).
- **Anti-trapaça** — palpite do oponente oculto até o apito.

## Validações realizadas

- **Build** (`tsc -b && vite build`) **verde** após cada bloco e no merge final (bundle limpo, sem cache: `index-*.js` 774K + `tsc -b` exit 0).
- **SQL na réplica local** (`supabase db reset` re-aplica todas as migrations + seed; `gen types` regenera `database.ts`):
  - **Anti-trapaça**: detalhe esconde o palpite do oponente antes do apito e revela depois.
  - **W.O.**: `bruno` sai → `joão` vence os confrontos em aberto e `bruno` some da tabela.
  - **Sorteio agendado**: draw com horário futuro → `scheduled` (futuro=t, `liga_format` gravado); `release_scheduled_confrontos()` com horário futuro → `liberados=0` (continua `scheduled`); ao mover o horário para o passado + release → `liberados=1`, vira `drawn` com `drawn_at`.
- **Preview** (app real logado como app-admin): badge de prefixo, ausência do seletor de formato na criação, "Criar e configurar", seletor Turno/Ida-e-volta/Suíço no sorteio, e os 3 modos de "Quando sortear?" renderizam sem erro.
- **Produção** (commit `ce8a267`): checks **Supabase Preview / build / deploy / Vercel = success**; probe REST com a publishable key → coluna `scheduled_draw_at` responde (`[]`, 200) e RPC `release_confronto_if_due` executa (`false`); `get_competition_periods` na Copo do Mundo devolve **8 fases** (24/24/24/16/8/4/2/2) e **6 semanas**; site `200`.

## Estado em produção (snapshot ao fim da sessão)

- `main` @ **`ce8a267`** — frontend pela Vercel, migrations pela integração GitHub↔Supabase (`vblvfbjqvmunlkehpafj`), cron `release-scheduled-confrontos` (*/5) ativo.
- **No ar e gated:** modelo Confronto, períodos por fase/semana, simulador, formato da Liga na simulação, participantes admin/opt-in, anti-trapaça, W.O. na saída, prefixo-badge, sorteio instantâneo/agendado/no-1º-jogo.
- **Visível só** nas federações com `confronto_enabled = true` (ligado pelo app-admin). As demais seguem em "em breve, não disponível".

## Pendências e próximos passos

1. **Teste end-to-end em prod numa federação real**: ligar `confronto_enabled`, criar uma Liga e uma Copa, sortear (instantâneo e agendado), avançar uma rodada de suíço, conferir anti-trapaça e W.O. com dois usuários de verdade.
2. **Decisão em aberto** (sinalizada ao João): no sorteio **agendado**, travar os participantes no **momento do agendamento** (atual: revelado no horário) — confirmar se é o comportamento desejado.
3. **Consolação para eliminados da Copa** (opcional, do planning) — quem cai segue só no ranking de Pontos; avaliar duelos de consolação.
4. **Branch `feat/confrontos`** pode ser apagada após confirmar que tudo em `main` está estável (todo o conteúdo já foi mergeado).

## Cuidados aprendidos (referência rápida)

- **Colisão de número de migration entre sessões paralelas** foi recorrente (≈6 rodadas): `match_curation`, `espn_provider`, `league_refund` da outra sessão colidiram com as do confronto. O Supabase controla por **número de versão**; com o mesmo número, a 2ª é **pulada** em prod. Regra adotada: `git fetch` antes de criar migration, **renumerar a minha para depois da maior existente** (forward-only), e fazer **db reset + build limpos** antes de cada push.
- **Reconciliar com o histórico real do prod**: o prod tinha migrations **órfãs** de sessões anteriores (`...022`/`...023`). Em vez de criar números novos, renomeei as minhas **de volta** para casar com o que o prod já tinha aplicado — senão o deploy trava com "remote migration versions not found".
- **Inspecionar o prod quando o deploy trava**: usei o dashboard de Migrations do Supabase (navegador autenticado do João, **somente leitura**) para descobrir qual número o prod já tinha antes de renumerar.
- **`drop function` antes de `create`** quando muda o tipo de retorno (`get_tie_detail` ganhou colunas) — Postgres não deixa trocar a assinatura com `create or replace`.
- **`PostgrestError` não é `Error`** — args opcionais de RPC: passar `?? undefined` (não `?? null`) p/ casar com o tipo gerado.
- **NUNCA `db push` manual para o prod** — o caminho é push em `main` → a integração aplica. Trabalho commitado sempre só dos **meus** arquivos.
