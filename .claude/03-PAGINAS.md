# 03 — Páginas, rotas e navegação

> Catálogo das telas existentes, suas rotas e níveis de acesso, mais a navegação (shell) e o
> Design System. Fonte de verdade das rotas: [`src/App.tsx`](../src/App.tsx). Para regras de cada
> tela → [`06`](06-REGRAS-DE-NEGOCIO.md); para admin → [`04`](04-ADMIN.md).

## 1. Tabela de rotas (`src/App.tsx`)

| Rota | Página | Acesso |
|---|---|---|
| `/auth/callback` | `auth/AuthCallback` | Fluxo OAuth |
| `/privacidade` | `legal/PrivacidadePage` | **Sempre público** (exigido pelo Google) |
| `/termos` | `legal/TermosPage` | **Sempre público** |
| `/` | `matches/JogosPage` | **Público** (vê jogos sem login; palpita logado) |
| `/como-funciona` | `help/ComoFuncionaPage` | Público |
| `/grupos` | `leagues/LigasPage` | Logado |
| `/grupos/nova` | `leagues/NovaLigaPage` | Logado |
| `/grupos/:slug` | `leagues/LigaDetailPage` | Logado (membro/admin) |
| `/perfil` | `profile/PerfilPage` | Logado |
| `/perfil/editar` | `profile/EditarPerfilPage` | Logado |
| `/jogador/:id` | `players/PlayerProfilePage` | Logado |
| `/simulador` | `confronto/SimuladorPage` | Logado (uso típico: app-admin) |
| `/admin` | `admin/AdminPage` | **App-admin** (`RequireAdmin`) |
| `/admin/competicoes/:id/jogos` | `admin/AdminCompMatchesPage` | **App-admin** |
| `/classificacao` | → redireciona p/ `/grupos` | — |
| `/ligas`, `/ligas/nova`, `/ligas/:slug` | → redireciona p/ `/grupos/*` | Compat (renames Liga→Federação→Grupo) |
| `*` | → redireciona p/ `/` | 404 |

**Guards** (`src/features/auth/guards.tsx`): `RequireAuth` (manda p/ `/` se deslogado — login é só pelo **modal/bottom-sheet**, não há página de login),
`RequireAdmin` (manda p/ `/` se não for app-admin). As rotas logadas ficam dentro do `<AppShell>`;
as duas de admin ficam dentro de `<RequireAdmin>`.

## 2. Navegação / shell

| Componente | Papel |
|---|---|
| `layout/AppShell` | Casca logada: `Sidebar` (desktop) + `BottomNav` (mobile) + `Outlet` + `InstallPrompt`. Envolve o conteúdo com a sala de espera (`AccessGate`). Sem sessão → `PublicShell`. |
| `layout/PublicShell` | Casca pública (sem sidebar/bottomnav). |
| `layout/Sidebar` | Nav desktop (≥lg): Jogos, Grupos, Perfil, Admin (se app-admin), Como funciona + ThemeToggle + card do usuário/Entrar. |
| `layout/BottomNav` | Nav mobile (barra inferior, safe-area): Jogos, Grupos, Perfil, Entrar. |
| `layout/Header` / `layout/Page` | Cabeçalho e container padrão de cada página (title + action). |

## 3. Catálogo de páginas (por feature)

### Jogos & palpites — `features/matches`
- **`JogosPage`** (`/`): home. Abas de escopo na ordem **Interesses** (personalização) →
  **Grupos** (jogos que valem ponto nos meus grupos, respeitando o recorte de seleções de cada um;
  padrão quando a pessoa tem grupo — inclusive pendente de aprovação) → **Todos** → competições.
  Coachmark na 1ª vez explica a aba Grupos. Seletor de dia (hoje → próximo com jogos), resumo do
  dia (pontos + dobros usados na semana), lista de `MatchCard`. As fileiras de abas/dias usam
  `ScrollRow` (degradê nas bordas indicando que dá pra arrastar). Deslogado → seções de landing.
  Mostra **1x** o `NovidadeBolaoModal` (anúncio da Gestão do Bolão) pra quem já passou do 1º
  acesso — espera o tour guiado terminar (`resultadismo:tour-done`) pra não sobrepor.
- **`MatchCard`**: card do jogo — times/escudos, status (horário/ao vivo/encerrado), inputs do
  palpite (auto-save com debounce), botão **2×** (dobro), resultado + tipo de pontuação colorido,
  "Galera" (quem palpitou). Trava ao chegar o `kickoff_at`. Depois do apito, respeita a preferência
  local `resultadismo-match-card-score-layout-v1`: **Meu palpite** (padrão) mantém o palpite como
  destaque e o resultado real em linha secundária; **Placar real** destaca o placar do jogo e leva o
  palpite para uma linha "Seu palpite".

### Grupos — `features/leagues`
- **`LigasPage`** (`/grupos`): topo com a **prévia da classificação dos grupos favoritados**
  (carrossel na ordem de favoritar — só os grupos que **já têm pontuação**) + **Resultadismo The Best
  compacto** (título + ver ranking + minha posição geral, **sem pontos**); depois meus grupos (cada
  card com a **estrela** de favoritar) + entrar por código. → `leagues/favorites.ts`, migration
  `20260610190000`.
- **`NovaLigaPage`** (`/grupos/nova`): criar grupo — nome (com **prefixo-badge**
  Bolão/Liga/Copa), descrição, visibilidade, política de entrada, competição inicial (padrão Copa do
  Mundo), modo, cupom (se pagamento ativo). → checkout/ativação conforme o modo de pagamento.
- **`LigaDetailPage`** (`/grupos/:slug`): detalhe — identidade (escudo/nome/descrição) + código de
  convite; **dono/admin edita nome, descrição e escudo** em "Editar grupo" (`GrupoEditor`; trocar o
  nome volta à moderação). Abas
  **Classificação** (tabela de Pontos ou `ConfrontoSection`; selo 💰 de prêmio quando o bolão está
  ativo), **Membros** (papéis, aprovar/remover; botão $ marca pagantes do bolão),
  **Gestão** (`GestaoBolaoTab` — Gestão do Bolão, ADR [`0009`](decisions/0009-gestao-bolao.md):
  membro vê quando ativa, admin sempre; vem **antes de Competições** pra dar destaque à
  funcionalidade nova; coachmark `resultadismo-coach-gestao-bolao-v1` na fileira de abas) e
  **Competições** (admin: adicionar competição/modo). Banner "Pagar agora" se
  pendente; botão de reembolso só p/ dono (≤7 dias).
- **`RefundFederationButton`**: botão isolado de cancelar+reembolsar (2 passos). → [`06`](06-REGRAS-DE-NEGOCIO.md).

### Classificação — `features/standings`
- **`StandingsTable`**: tabela de Pontos (pos, jogador, pontos, cravadas, saldos, acertividade,
  aproveitamento). Linha do usuário em destaque. Embutida no detalhe do grupo.

### Confronto — `features/confronto`
- **`ConfrontoSection`**: orquestra o modo Confronto (Liga/Copa) por estado (rascunho → painel de
  sorteio; agendado → contagem; sorteado/encerrado → tabela/bracket). Só aparece nos grupos com
  `confronto_enabled`.
- **`ConfrontoViews`**: tabela da Liga, rodadas, bracket da Copa, "meu confronto", detalhe A×B.
- **`SimuladorPage`** (`/simulador`) + `simulator.ts`: simulador autônomo de estrutura (não
  persiste). `build.ts`: motor puro de fixtures (round-robin, suíço, bracket).

### Perfil & jogadores — `features/profile`, `features/players`
- **`PerfilPage`** (`/perfil`): avatar/escudo, stats globais, menu (Admin/Simulador/tour se
  app-admin; grupos; como funciona), Aparência (tema + formato do card após o apito), Instalar app
  (PWA), Notificações (push), Sair.
- **`EditarPerfilPage`** (`/perfil/editar`): **HUB** do perfil — escudo (`CrestEditor`) + nome + email
  + UF (chips); linhas de preferência (time do coração / seleção / campeonatos) com **preview** que
  abrem o editor focado (`/perfil/personalizar?only=…`, com Salvar); **The Best** no fim. Sem convite.
- **`PersonalizationPage`** (`/perfil/personalizar`): no **1º acesso**, wizard de 6 telas (perfil →
  coração → seleção → campeonatos → The Best+convite → notificações+instalar); com `?only=coracao|
  selecao|campeonatos`, edita **um item só** (Salvar → volta ao hub). Convite por link (`?convite=`)
  é capturado no boot e preenche o campo. Depois vêm, nesta ordem: o **carrossel de boas-vindas**
  (`Onboarding`, 3 slides de conceito) e o **tour guiado** (`GuidedTour`, coach-marks na UI real).
- **`PlayerProfilePage`** (`/jogador/:id`): perfil público de outro jogador (stats + grupos
  visíveis).

### Admin — `features/admin` → ver [`04-ADMIN.md`](04-ADMIN.md)
- **`AdminPage`** (`/admin`): abas **Grupos / Comp. / Users / Pgto**.
- **`AdminCompMatchesPage`** (`/admin/competicoes/:id/jogos`): gerir jogos de uma competição
  (curadoria `hidden`, override de placar/status).

### Conteúdo / sistema
- **`help/ComoFuncionaPage`** (`/como-funciona`): regras do jogo (pontuação, modos, grupo,
  desempate, promoção).
- **`landing/LandingSections`**: hero + features para visitantes (dentro da JogosPage deslogada).
- **`legal/PrivacidadePage` / `TermosPage`**: páginas legais (LGPD, pagamento §12, arrependimento).
- **`onboarding/Onboarding`**: **carrossel de boas-vindas** do 1º acesso — 3 slides de conceito
  (bem-vindo · pontuação · 2×). Montado no `App` root; refazível pelo admin (Perfil → "Rever tour").
  Ao fechar, dispara o evento `resultadismo:onboarding-done` → o `GuidedTour`.
- **`onboarding/GuidedTour`**: **tour guiado em coach-marks** que apontam elementos **reais** da UI
  (via `data-tour`), em sequência: barra de filtros de **Jogos** → aba **Grupos** (cria grupo + "The
  Best") → aba **Perfil**. Roda inteiro em `/` (os 3 alvos estão à vista: filtro na página + nav
  fixa). Vem **depois** do carrossel; gate por `personalization_done` + `localStorage`
  (`resultadismo-onboarding-v1` visto + `resultadismo-tour-v1` não visto) + estar em `/`. Mede o
  alvo visível (mobile×desktop) e reusa a linguagem do `Coachmark` (anel turquesa + balão escuro).
- **`auth/*`**: `LoginModal` (bottom-sheet — **único** login do app), `AuthCallback`, `AuthProvider`, guards.
- **`notifications/NotificationsBell`**: sino + lista de notificações.
- **`access/AccessGate` + `WaitingRoom`**: sala de espera (fila FIFO em pico). → [`05`](05-DADOS-E-AUTH.md).

## 4. Design System (`components/ui`) — inventário

`Button` (variants primary/secondary/outline/ghost/danger; sizes; loading) · `Card` ·
`Input` · `Badge` (tones neutral/brand/gold/grass/aqua/flame) · `Avatar` (escudo do perfil) ·
`Modal` (bottom-sheet no mobile, centered no desktop) · `ConfirmDialog` (confirmação em 2 passos) ·
`SegmentedControl` · `Skeleton` · `EmptyState` · `Toast` (`useToast`, success/error/info) ·
`Spinner`/`LoadingScreen` · `Coachmark` (dica 1ª vez) · `CrestEditor` / `CrestMask` / `Escudo`
(escudos por máscara) · `ScorePill` / `TeamCrest` (em `components/`).
Tema: `theme/ThemeProvider` + `ThemeToggle`. PWA: `pwa/InstallPrompt`.

## 5. Fluxos principais (telas que participam)

- **Login**: `/` (deslogado) → botão "Entrar" abre o **`LoginModal`** (bottom-sheet) → Google → `/auth/callback` → `AuthProvider`
  cria/carrega profile → no 1º acesso: personalização → `Onboarding` (carrossel) → `GuidedTour` (tour guiado).
- **Palpitar**: `JogosPage` → escolhe competição/dia → `MatchCard` (inputs auto-save) → opcional 2×
  → resultado pontua sozinho ao encerrar o jogo.
- **Criar/entrar grupo**: `NovaLigaPage` (cria → checkout/ativação) **ou** `LigasPage` (entrar
  por código) → `LigaDetailPage`.
- **Ver classificação/confronto**: `LigaDetailPage` → aba Classificação → `StandingsTable` (Pontos)
  ou `ConfrontoSection` (Liga/Copa).
