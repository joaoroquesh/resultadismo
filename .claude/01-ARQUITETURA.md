# 01 — Arquitetura

> Visão técnica de alto nível: stack, estrutura de pastas, fluxo de dados, integrações externas e
> modelo de deploy. Para regras de código → [`02-CODIGO.md`](02-CODIGO.md). Para banco/auth →
> [`05-DADOS-E-AUTH.md`](05-DADOS-E-AUTH.md). Para build/secrets → [`07-BUILD-E-DEPLOY.md`](07-BUILD-E-DEPLOY.md).

## 1. Stack

| Camada | Tecnologia |
|---|---|
| **Frontend** | Vite + **React 19** + **TypeScript** + **Tailwind v4** (`@tailwindcss/vite`) |
| **Roteamento** | React Router v7 (`react-router-dom`) |
| **Estado de servidor** | TanStack Query v5 (`@tanstack/react-query`) — cache, mutations, invalidação |
| **Backend** | **Supabase**: Postgres + Auth (Google OAuth) + RLS + Edge Functions (Deno) + pg_cron + Realtime |
| **PWA** | `vite-plugin-pwa` (injectManifest) + Workbox + Web Push (VAPID) |
| **Datas** | `dayjs` (locale pt-br, timezone America/Sao_Paulo) |
| **Ícones** | `lucide-react` |
| **Utils de classe** | `clsx` + `tailwind-merge` (helper `cn`) |
| **Dados de futebol** | football-data.org, **ESPN (JSON público)**, TheSportsDB — via Edge Function |
| **Pagamento** | Mercado Pago (Checkout Pro hosted) |
| **Analytics** | **Google Analytics 4** (`G-P86V27WXK2`) com Consent Mode v2; default `denied`, liberado só com o "Aceitar" do banner LGPD em `features/consent` |
| **Deploy** | **Vercel** (frontend estático) + **Supabase** (backend), disparados por push na `main` |

> Não há servidor próprio nem ORM: o app fala direto com o Supabase (PostgREST + RPC + functions).
> Toda lógica sensível mora no Postgres (funções/RLS) ou nas Edge Functions.

## 2. Estrutura de pastas

```
resultadismo/
├── .claude/              ESTA documentação (MESTRE + 01–09 + CHANGELOG/HISTORICO)
├── docs/                 Diário de bordo das sessões + planning + doc de pagamentos
├── public/              Favicons, ícones PWA, estáticos servidos como estão
├── src/
│   ├── main.tsx          Bootstrap: providers (Query, Auth, Toast, Theme, LoginModal) + SW
│   ├── App.tsx           Tabela de rotas + guards (RequireAuth/RequireAdmin) + redirects /ligas→/federacoes
│   ├── index.css         Tailwind v4 + Design System (cores OKLCH, tema claro/escuro via [data-theme])
│   ├── sw.ts             Service Worker (Workbox precache + listener de Web Push)
│   ├── types/database.ts GERADO por `supabase gen types` — tipos do schema. NÃO editar à mão.
│   ├── lib/              Clientes e helpers puros (ver §4)
│   ├── assets/           escudos/ (escudo-*.svg) e federacoes/ (flamula-*.svg) — catálogo via glob
│   ├── components/
│   │   ├── ui/           Design System (Button, Card, Input, Badge, Avatar, Modal, Toast, …)
│   │   ├── layout/       AppShell, PublicShell, Sidebar, BottomNav, Header, Page
│   │   ├── theme/        ThemeProvider, ThemeToggle
│   │   └── pwa/          InstallPrompt
│   └── features/         Fatias por domínio (ver §3)
├── supabase/
│   ├── migrations/       Schema + RLS + RPCs + cron (fonte de verdade do banco; ordem por número)
│   ├── functions/        Edge Functions Deno (sync-football, send-push, create-league-checkout, …)
│   ├── config.toml       Config local do Supabase
│   └── seed.sql          Dados de teste (usuários, competição exemplo)
├── .github/workflows/    deploy-functions.yml (auto-deploy das Edge Functions no push)
├── vite.config.ts        Vite + React + Tailwind + PWA + alias @→src
├── vercel.json           Rewrite SPA (tudo → /index.html)
└── package.json          Scripts + deps. "version" = versão do projeto (ver MESTRE §6)
```

### Princípio de organização: **feature slices**

Cada domínio vive em `src/features/<dominio>/` e tipicamente contém:
- `api.ts` — hooks TanStack Query (queries + mutations) daquele domínio;
- `*.tsx` — páginas e componentes da feature;
- arquivos de lógica pura quando faz sentido (`build.ts`, `stats.ts`, `naming.ts`…).

Features existentes: `access` (sala de espera), `admin`, `auth`, `confronto`, `help`, `landing`,
`leagues` (federações), `legal`, `matches` (jogos/palpites), `notifications`, `onboarding`,
`payments`, `players`, `profile`, `standings`.

## 3. Fluxo de dados (request → tela)

```
Usuário → React Router → Página (feature)
            │
            ├─ AuthProvider (session + profile + isAppAdmin)  ← Supabase Auth
            │
            ├─ hook de api.ts (TanStack Query)
            │     └─ supabase.from(...).select() | .rpc(fn) | .functions.invoke(fn)
            │            └─ Postgres (RLS aplica acesso) | Edge Function (Deno)
            │
            ├─ Realtime (jogos ao vivo): supabase.channel(...).on('postgres_changes', …)
            │     └─ invalida queries (debounce ~1.2s) → re-render
            │
            └─ Mutations → invalidateQueries(...) no onSuccess → UI atualiza
```

- **Leitura**: hooks `useX` em `features/*/api.ts`. Cache padrão `staleTime: 30s`,
  `refetchOnWindowFocus: false`, `retry: 1` (config em `src/main.tsx`).
- **Escrita**: hooks `useMutation` que invalidam as queries relevantes.
- **Tempo real**: só onde importa (jogos ao vivo, notificações). Subscriptions do Supabase
  invalidam queries com debounce. A **sala de espera** (`features/access`) usa **polling HTTP, nunca
  Realtime** — ela existe justamente para proteger o Realtime em pico (ver [`05`](05-DADOS-E-AUTH.md)).
- **Pontuação e classificação**: calculadas **no banco** (triggers + `get_league_standings`), não no
  client. O front só exibe. → [`06`](06-REGRAS-DE-NEGOCIO.md).

## 4. Camada `lib/`

| Arquivo | Papel |
|---|---|
| `supabase.ts` | Cria o client `createClient<Database>` (auth PKCE, `persistSession`, `autoRefreshToken`). Lê `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. |
| `types.ts` | Aliases de tipos do schema (`Profile`, `Competition`, `Match`, `League`, `Prediction`, `StandingRow`…) + constantes (`SCORE_POINTS`, `SCORE_LABEL`). |
| `rpc.ts` | `rpcCall<T>` — wrapper de `supabase.rpc` (evita problemas de binding `this`). |
| `format.ts` | `dayjs` pt-br + formatadores (kickoff, dia, fase, grupo, deadline, `isLocked`). |
| `crest.ts` | Sistema de escudos/flâmulas por máscara SVG: catálogo via `import.meta.glob`, encoding `crest:…`, `legacyToCrest`. → [`06`](06-REGRAS-DE-NEGOCIO.md) §escudos. |
| `avatar.ts` | Avatar gerado legado (`gen:shape:cores:rot`) — compat. |
| `pricing.ts` | `formatBRL`, helpers de preço (`isPromoActive`, `effectivePriceCents`) que **espelham** o servidor. |
| `pwa.ts` | Ciclo PWA: `isStandalone`, `isIOS`, `getInstallState`, `useInstallState`. |
| `utils.ts` | `cn` (clsx+twMerge), `initials`, `formatScore`. |
| `useFirstSeen.ts` | Marcador "já vi isto" em localStorage (onboarding/dicas). |

## 5. Integrações externas

| Integração | Onde entra | Observações |
|---|---|---|
| **Supabase Auth** | `features/auth/*` | Google OAuth (PKCE) + senha (dev/teste). Callback em `/auth/callback`. → [`05`](05-DADOS-E-AUTH.md). |
| **Supabase DB/RPC** | `features/*/api.ts` | PostgREST + funções. RLS aplica o acesso. |
| **Supabase Edge Functions** | `supabase.functions.invoke(...)` | Pagamento, reembolso, sync, push, catálogo de provedores. |
| **Supabase Realtime** | `features/matches/api.ts` | `postgres_changes` em `matches` para placar ao vivo. |
| **football-data.org / ESPN / TheSportsDB** | Edge Function `sync-football` | Sincroniza times/jogos. ESPN é o provedor preferido (grátis, status ao vivo, escudos, PT). |
| **Mercado Pago** | Edge Functions `create-league-checkout` / `mercadopago-webhook` / `cancel-league-refund` | Checkout hosted; preço efetivo decidido **no servidor**. → [`06`](06-REGRAS-DE-NEGOCIO.md) §pagamento. |
| **Web Push (VAPID)** | `features/notifications/push.ts` + `sw.ts` + Edge Function `send-push` | Lembrete de prazo e cutucadas. |

## 6. Modelo de deploy (resumo — detalhe em [`07`](07-BUILD-E-DEPLOY.md))

```
git push origin main
   ├── Vercel ............... build do frontend (Vite) → www.resultadismo.com
   ├── Integração Supabase↔GitHub  → aplica supabase/migrations/* no banco de PRODUÇÃO
   └── GitHub Action (deploy-functions.yml) → deploya supabase/functions/* (no push que as toca)
```

- **Projeto Supabase de PRODUÇÃO:** ref `vblvfbjqvmunlkehpafj` (org `joaoroque`).
- ⚠️ **NUNCA** `supabase db push`/`link` desta máquina (o CLI local enxerga outro projeto). Deploy
  de banco = **migration + push na main**. Ver regra central #5 no [`MESTRE.md`](MESTRE.md).
- **Dev local:** Supabase em Docker nas portas **5442x** (deslocadas para não colidir com outro
  projeto na máquina). Ver [`07`](07-BUILD-E-DEPLOY.md).

## 7. Arquivos âncora da arquitetura

| Arquivo | Por quê |
|---|---|
| `src/main.tsx` | Onde todos os providers são montados; ponto de entrada. |
| `src/App.tsx` | Tabela de rotas e guards — o mapa de navegação. |
| `src/lib/supabase.ts` | O único client do backend. |
| `src/features/auth/AuthProvider.tsx` | Sessão + profile + `isAppAdmin` (alimenta os guards). |
| `src/features/matches/api.ts` | Padrão de queries/mutations + Realtime. Bom modelo a imitar. |
| `supabase/migrations/` | Fonte de verdade do banco (schema, RLS, RPC, cron). |
| `vite.config.ts` / `index.css` | Build/PWA e o Design System. |
