# 03 — Páginas, rotas e navegação

> Catálogo das telas existentes, suas rotas e níveis de acesso, mais a navegação (shell) e o
> Design System. Fonte de verdade das rotas: [`src/App.tsx`](../src/App.tsx). Para regras de cada
> tela → [`06`](06-REGRAS-DE-NEGOCIO.md); para admin → [`04`](04-ADMIN.md).

## 1. Tabela de rotas (`src/App.tsx`)

| Rota | Página | Acesso |
|---|---|---|
| `/login` | `auth/LoginPage` | Público (deslogado) |
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

**Guards** (`src/features/auth/guards.tsx`): `RequireAuth` (manda p/ `/login` se deslogado),
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
- **`JogosPage`** (`/`): home. Seletor de competição (**"Todos os campeonatos"** é o padrão) +
  seletor de dia (hoje → próximo com jogos), resumo do dia (pontos + dobros usados na semana), lista
  de `MatchCard`. Deslogado → mostra as seções de landing.
- **`MatchCard`**: card do jogo — times/escudos, status (horário/ao vivo/encerrado), inputs do
  palpite (auto-save com debounce), botão **2×** (dobro), resultado + tipo de pontuação colorido,
  "Galera" (quem palpitou). Trava ao chegar o `kickoff_at`.

### Grupos — `features/leagues`
- **`LigasPage`** (`/grupos`): minhos grupos + entrar por código.
- **`NovaLigaPage`** (`/grupos/nova`): criar grupo — nome (com **prefixo-badge**
  Bolão/Liga/Copa), descrição, visibilidade, política de entrada, competição inicial (padrão Copa do
  Mundo), modo, cupom (se pagamento ativo). → checkout/ativação conforme o modo de pagamento.
- **`LigaDetailPage`** (`/grupos/:slug`): detalhe — escudo/nome/código de convite, abas
  **Classificação** (tabela de Pontos ou `ConfrontoSection`), **Membros** (papéis, aprovar/remover),
  **Competições** (admin: adicionar competição/modo). Banner "Pagar agora" se pendente; botão de
  reembolso só p/ dono (≤7 dias).
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
  app-admin; grupos; como funciona), Aparência (tema), Instalar app (PWA), Notificações
  (push), Sair.
- **`EditarPerfilPage`** (`/perfil/editar`): editor de escudo (`CrestEditor`), nome, time do coração.
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
- **`onboarding/Onboarding`**: tour de primeiro acesso (montado no `App` root; refazível pelo admin).
- **`auth/*`**: `LoginPage`, `LoginModal` (overlay global), `AuthCallback`, `AuthProvider`, guards.
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

- **Login**: `/` (deslogado) → `LoginModal`/`LoginPage` → Google → `/auth/callback` → `AuthProvider`
  cria/carrega profile → `Onboarding` no 1º acesso.
- **Palpitar**: `JogosPage` → escolhe competição/dia → `MatchCard` (inputs auto-save) → opcional 2×
  → resultado pontua sozinho ao encerrar o jogo.
- **Criar/entrar grupo**: `NovaLigaPage` (cria → checkout/ativação) **ou** `LigasPage` (entrar
  por código) → `LigaDetailPage`.
- **Ver classificação/confronto**: `LigaDetailPage` → aba Classificação → `StandingsTable` (Pontos)
  ou `ConfrontoSection` (Liga/Copa).
