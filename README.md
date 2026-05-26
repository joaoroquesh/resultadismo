# Resultadismo

Jogo de palpites de futebol. Crave o placar dos jogos reais, dispute em ligas privadas com os amigos e suba na classificação.

> Reconstrução completa (v2) em React + Supabase. A versão antiga (site estático + Firebase/planilhas) está preservada na tag **`v1-legacy`** e na branch **`legacy/v1`**.

## Pontuação

| Tipo | Quando | Pontos |
|------|--------|:------:|
| **Cravada** | placar exato | **+3** |
| **Saldo** | vencedor certo + mesma diferença de gols (cobre empates) | **+2** |
| **Acerto** | só o vencedor certo (sem empate) | **+1** |
| Erro | vencedor errado | 0 |

Critérios de desempate: pontos → cravadas → saldos → aproveitamento → acertividade → antiguidade.

## Stack

- **Frontend:** Vite + React + TypeScript + Tailwind v4 + React Router + TanStack Query
- **Backend:** Supabase (Postgres, Auth, RLS, Edge Functions, pg_cron)
- **Dados de futebol:** football-data.org (Copa do Mundo, Brasileirão e mais — gratuito), TheSportsDB (extra) e entrada manual
- **Deploy:** Vercel (frontend estático) + Supabase (backend)

## Desenvolvimento local

Pré-requisitos: Node 20+, Docker, Supabase CLI.

```bash
npm install
supabase start          # sobe Postgres/Auth/etc. (portas 5442x) + aplica migrations + seed
npm run dev             # http://localhost:5173
```

O `.env.local` já aponta para o Supabase local. Para regenerar tipos do banco: `npm run db:types`.

**Usuários de teste** (seed) — senha `resultadismo123`:
- `joao.crf93@gmail.com` (app admin)
- `bruno@teste.com`, `luan@teste.com`

> O **primeiro usuário** a se cadastrar vira automaticamente administrador do app (bootstrap do dono).

## Estrutura

```
src/
  components/ui/        Design System (Button, Card, Input, Badge, Avatar, ScorePill…)
  components/layout/    AppShell, Header, BottomNav, Page
  features/
    auth/               AuthProvider, login, guards
    matches/            Jogos + card de palpite + pontuação
    leagues/            Ligas: criar, entrar, gerir, competições
    standings/          Classificação
    admin/              Painel do app admin
    profile/            Perfil
  lib/                  supabase client, tipos, formatação
supabase/
  migrations/           Schema + RLS + RPCs + cron
  functions/sync-football/  Edge function de sincronização
  seed.sql              Dados de teste
```

## Deploy (passo a passo)

### 1. Supabase (cloud)
1. Crie um projeto em [supabase.com](https://supabase.com) (free tier).
2. Linke e suba o schema:
   ```bash
   supabase login
   supabase link --project-ref SEU_REF
   supabase db push                 # aplica as migrations
   supabase functions deploy sync-football
   ```
3. Em **Project Settings → API**, copie a *Project URL* e a *anon/publishable key*.

### 2. Login com Google
1. No [Google Cloud Console](https://console.cloud.google.com), crie credenciais OAuth 2.0 (Web).
2. Em *Authorized redirect URIs*, adicione: `https://SEU_REF.supabase.co/auth/v1/callback`.
3. No painel Supabase → **Authentication → Providers → Google**, ative e cole o Client ID e Secret.
4. Em **Authentication → URL Configuration**, defina o Site URL para a URL da Vercel e adicione `https://SEU_DOMINIO/auth/callback` aos redirects.

### 3. Token de dados de futebol (gratuito)
1. Registre-se em [football-data.org/client/register](https://www.football-data.org/client/register) e pegue o token.
2. Configure o secret da edge function:
   ```bash
   supabase secrets set FOOTBALL_DATA_TOKEN=seu_token
   # opcional: supabase secrets set THESPORTSDB_KEY=sua_chave
   ```
3. No app (logado como admin) → **Perfil → Admin → Comp.**, crie a competição com provider `football_data` e código (ex.: `WC` para Copa do Mundo, `BSA` para Brasileirão) e clique em **Sincronizar**.

### 4. Sincronização automática (opcional, recomendado para jogos ao vivo)
No SQL Editor do Supabase, rode uma vez (substitua os valores):
```sql
insert into private.sync_config (id, functions_url, service_key)
values (1, 'https://SEU_REF.supabase.co/functions/v1', 'SUA_SERVICE_ROLE_KEY')
on conflict (id) do update set functions_url = excluded.functions_url, service_key = excluded.service_key;
```
A função `run_football_sync()` já está agendada (pg_cron) a cada 15 minutos.

### 5. Vercel
1. Importe o repositório GitHub em [vercel.com](https://vercel.com) (framework: **Vite**).
2. Variáveis de ambiente:
   - `VITE_SUPABASE_URL` = Project URL do Supabase
   - `VITE_SUPABASE_ANON_KEY` = publishable/anon key
3. Deploy. O `vercel.json` já trata o roteamento de SPA.
4. (Opcional) Aponte o domínio `resultadismo.com` para a Vercel.
```
