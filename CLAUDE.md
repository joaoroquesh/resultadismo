# Resultadismo — contexto do projeto (para agentes)

Jogo de palpites de futebol. **Não usa Trigger.dev** (qualquer instrução global de
Trigger.dev não se aplica aqui). A stack real:

- **Front:** React 19 + TypeScript + Vite + Tailwind v4 + TanStack Query + React Router. PWA (vite-plugin-pwa).
- **Backend:** Supabase — Postgres (RLS + RPCs `SECURITY DEFINER`), Edge Functions (Deno), Auth (Google OAuth).
- **Tarefas agendadas:** `pg_cron` no Postgres + Edge Functions (NÃO Trigger.dev).
- **Pagamentos:** Mercado Pago (Pix) para federações pagas.

## Deploy (importante)

- **Push para `main` aplica migrations em PRODUÇÃO** (integração GitHub↔Supabase) e
  faz deploy das Edge Functions (`.github/workflows/deploy-functions.yml`). O Vercel
  publica o front. Ou seja: mergear na `main` = deploy em prod.
- **NUNCA rodar `supabase db push`/`db reset` apontando para prod.** Use só o stack local.

## Desenvolvimento local

- `npm run dev` (Vite) + `supabase start` (stack local).
- Banco local nas portas 5442x (não colidir com outros projetos).
- `npm run db:reset` aplica migrations + seed no banco LOCAL.
- `npm run db:types` regenera `src/types/database.ts` a partir do schema local.
- `npm run build` = `tsc -b && vite build`. `npm run lint` = ESLint. `npm run typecheck`.

## Convenções

- Autorização é SEMPRE no servidor (RLS + RPCs definer). Gating no client é cosmético.
- Erros do Supabase: `PostgrestError` não é `instanceof Error` — converta com
  `throw new Error(error.message)` nos hooks de dados.
- Edge Functions compartilham CORS/util em `supabase/functions/_shared/`.
- Escudos/flâmulas: string `crest:` (ver `src/lib/crest.ts`). Foto é sanitizada antes do CSS.
- Semana do Joker é ancorada em `America/Sao_Paulo` (BRT) no servidor.
