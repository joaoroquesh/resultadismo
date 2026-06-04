# 07 — Build e deploy

> Como o projeto é construído e como uma mudança chega em produção. Enxuto e específico deste repo
> (**sem Liferay** — frontend estático na Vercel + backend Supabase). Para o passo a passo de subir
> uma mudança com segurança → [`08-PROCESSO.md`](08-PROCESSO.md).

## 1. Build

- **Comando:** `npm run build` = `tsc -b && vite build` (typecheck **e** build; um quebra o outro).
- **Saída:** `dist/` (estático). PWA gerado pelo `vite-plugin-pwa` (Service Worker via
  `injectManifest`, `src/sw.ts` + Workbox precache).
- **Config:** `vite.config.ts` (React + Tailwind v4 + PWA + alias `@`→`src`), `tsconfig*.json`
  (strict, paths `@/*`), `index.html` (manifest, Apple meta tags, captura de `beforeinstallprompt`).
- **Roteamento SPA:** `vercel.json` reescreve tudo para `/index.html`, **e** aplica **CSP + headers de
  segurança** (`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `X-Frame-Options: DENY`) — adicionados em 2.1.0.

> O build só afeta o **frontend**. Banco e Edge Functions têm pipelines próprios (§3).

## 2. Variáveis de ambiente

**Frontend (Vercel + `.env.local` no dev)** — só `VITE_*` chega ao client:

| Var | Para que |
|---|---|
| `VITE_SUPABASE_URL` | URL do projeto Supabase (local: `http://127.0.0.1:54321`) |
| `VITE_SUPABASE_ANON_KEY` | Chave anon/publishable (RLS protege) |
| `VITE_VAPID_PUBLIC_KEY` | Chave pública VAPID (Web Push) — opcional |
| `VITE_APP_NAME` | Nome do app — opcional |
| `VITE_LEAGUE_PRICE_CENTS` | Preço só p/ exibição (deve bater com o servidor) — opcional |
| `VITE_DEV_LOGIN_EMAIL` / `VITE_DEV_LOGIN_PASSWORD` | **Só dev** (2.1.0): login rápido de teste. Sem eles, o botão de dev não aparece. **Nunca** setar em produção. |

> `.env.local` (gitignored) já aponta para o Supabase local. Modelo em `.env.example`.

**Backend (Supabase secrets — produção)** — nunca em código, nunca commitados:

| Secret | Usado por |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | checkout/webhook/refund (**produção**; colado pelo João) |
| `APP_URL` | `https://www.resultadismo.com` |
| `MP_WEBHOOK_SECRET` | validação de assinatura do webhook (opcional) |
| `FOOTBALL_DATA_TOKEN` / `THESPORTSDB_KEY` | sync de jogos |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (`send-push`) |
| `SUPABASE_ACCESS_TOKEN` | secret de **repo** (GitHub Action de deploy de functions) |

> **CORS das Edge Functions (2.1.0):** não usam mais `Access-Control-Allow-Origin: *` — só `www`/apex
> de `resultadismo.com`, `*.vercel.app` e localhost (helper em `supabase/functions/_shared/`). Se o
> domínio de produção mudar, ajustar lá (ou setar `APP_URL`). `MP_WEBHOOK_SECRET` segue opcional, mas
> **recomendado** (o webhook já está protegido por checagem de pagador/valor/estado mesmo sem ele).

## 3. Como o deploy chega em produção

**Tudo dispara por `git push origin main`:**

```
git push origin main
 ├── Vercel ............................. build (Vite) → www.resultadismo.com
 ├── Integração Supabase↔GitHub ......... aplica supabase/migrations/* no banco de PRODUÇÃO
 └── GitHub Action deploy-functions.yml . deploya supabase/functions/* (quando o push as toca)
```

- **Projeto Supabase de PRODUÇÃO:** ref **`vblvfbjqvmunlkehpafj`** (org `joaoroque`).
- **Migrations:** aplicadas automaticamente pela integração no push. **Não** se roda `db push`.
- **Edge Functions:** `.github/workflows/deploy-functions.yml` roda `supabase functions deploy
  --project-ref vblvfbjqvmunlkehpafj` no push que mexe em `supabase/functions/**` ou `config.toml`
  (autentica via secret de repo `SUPABASE_ACCESS_TOKEN`).
- **Confirmar deploy:** checks verdes no commit — **Supabase Preview**, **Vercel**, **Deploy Edge
  Functions**.

## 4. ⚠️ Regra crítica: NÃO rodar Supabase CLI contra produção desta máquina

O CLI `supabase` desta máquina está autenticado numa conta que **só enxerga outro projeto**
(`rezende-advocacia-dash`, `ynvscgiikwpgprebxbbl`). Rodar `supabase link`/`db push` mirando o
Resultadismo **apontaria para o projeto errado** e poderia aplicar uma mudança destrutiva no lugar
errado. (Já houve o quase-acidente registrado em [`HISTORICO.md`](HISTORICO.md).)

- **Deploy de banco** = migration + **push na `main`** (a integração aplica).
- **Deploy de function** = push na `main` (a Action deploya).
- `supabase start`/`db reset`/`gen types` **locais** são OK (mexem só no Docker local).

## 5. Dev local

Pré-requisitos: Node 20+, Docker, Supabase CLI.

```bash
npm install
npm run db:start     # supabase start — Postgres/Auth/etc. (portas 5442x) + migrations + seed
npm run dev          # Vite em http://localhost:5173  (ou 5180 via .claude/launch.json)
```

- Portas **5442x** (deslocadas p/ não colidir com outro projeto Supabase na máquina).
- Após mudar schema local: `npm run db:reset` (re-aplica tudo) e `npm run db:types` (regenera tipos).
- Usuários de teste no seed (senha `resultadismo123`): `joao.crf93@gmail.com` (admin),
  `bruno@teste.com` / `luan@teste.com` (membros), `dona@teste.com` (dona de federação, não-admin),
  `novato@teste.com` (1º acesso, sem federação).

## 6. Go-live de cobrança (referência — já feito pelo João)

Para o Mercado Pago cobrar de verdade, **trocar a secret não basta**: é preciso (1) `MERCADOPAGO_ACCESS_TOKEN`
de **produção**, (2) modo **"Mercado Pago"** no admin (senão o app simula), (3) conta MP verificada
+ conta bancária, (4) **chave Pix** cadastrada (p/ Pix aparecer), (5) opcional: webhook no painel MP
+ `MP_WEBHOOK_SECRET`, e (6) um pagamento real de teste ponta a ponta. **Ordem:** token de produção
primeiro, depois virar o modo (evita janela com modo live + token de teste).

## 7. Homologação local (testar como qualquer usuário, sem tocar produção)

O ambiente de homologação **é o Supabase local** — roda idêntico a produção (mesmas migrations/RLS/
Edge Functions), mas isolado. Dois **modos de dados**:

1. **Seed (padrão):** dados de teste curados (`supabase/seed.sql`) — rápido, zero risco. Cobre os
   perfis admin / membro / dono / 1º acesso.
2. **Snapshot read-only de produção:** `npm run homolog:pull` faz `pg_dump` que **só LÊ** prod (nunca
   escreve) e carrega a cópia no local. Você vê os **dados reais**; qualquer escrita sua bate no
   **local**, jamais em prod. Refaça quando quiser dados frescos.
   ```bash
   PROD_DB_URL="postgresql://USUARIO:SENHA@HOST:5432/postgres" npm run homolog:pull
   # ANONYMIZE=1 troca nomes/e-mails (LGPD). URL: Dashboard → Project Settings → Database → Connection string (use o role read-only).
   ```
   > ⚠️ Traz **PII real** para a sua máquina — você é o controlador (LGPD). O script só faz `pg_dump`
   > (leitura) contra prod; toda escrita é no banco LOCAL. Produção **nunca** é tocada.

**DevPanel** (`src/features/dev/DevPanel.tsx`): chip flutuante **só em dev** — gate `import.meta.env.DEV`
no `AppShell`, então **não entra no bundle de produção** (confirmado: não aparece em `dist/`).
Arrastável/reposicionável (não tampa nada), recolhível. Alterna **Deslogado / Admin / Membro / Dono /
1º acesso** e **"entrar como <e-mail>"** (qualquer usuário — essencial no snapshot). Login por senha
(`VITE_DEV_LOGIN_PASSWORD`, default = senha do seed); o `homolog:pull` seta essa senha em todos os
usuários locais p/ logar como qualquer um (os reais entram por Google, sem senha — por isso o script
seta uma).

**Por que não read-replica / staging project:** replica (paga) deixa a **escrita quebrar** (ruim p/
testar fluxos); staging project é mais infra/custo. Local + snapshot é **grátis**, mais real (você
escreve à vontade na cópia) e **zero risco a produção**.

**Fluxo:** desenvolve local (seed p/ rapidez, snapshot p/ realismo) → valida (build + navegador) →
sobe p/ prod por **push na main** (§3). O DevPanel/seed/snapshot são puramente de dev — não afetam o
app em produção.
