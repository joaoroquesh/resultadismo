# Documentação — Pagamento de Federações (Resultadismo)

> Documento gerado em **03/06/2026**. Registra, em ordem cronológica, todas as decisões e
> mudanças de código do sistema de **cobrança pela criação de Federações** (taxa única via
> Mercado Pago), incluindo data e hora (horário de Brasília, UTC−3).
>
> Fontes: histórico do Git (timestamps dos commits), memória do projeto e o histórico das
> conversas que conduziram cada decisão.

---

## Sumário

1. [Contexto e objetivo](#1-contexto-e-objetivo)
2. [Linha do tempo (data + hora)](#2-linha-do-tempo-data--hora)
3. [Decisões de produto consolidadas](#3-decisões-de-produto-consolidadas)
4. [Arquitetura técnica](#4-arquitetura-técnica)
5. [Modelo de preços (base + promoção)](#5-modelo-de-preços-base--promoção)
6. [Fluxos principais](#6-fluxos-principais)
7. [Painel de administração (aba "Pgto")](#7-painel-de-administração-aba-pgto)
8. [Estado atual em produção](#8-estado-atual-em-produção)
9. [Segurança, conformidade e boundaries](#9-segurança-conformidade-e-boundaries)
10. [Pendências e próximos passos](#10-pendências-e-próximos-passos)
11. [Anexo — referência de arquivos, migrations e commits](#11-anexo--referência-de-arquivos-migrations-e-commits)

---

## 1. Contexto e objetivo

O **Resultadismo** é um jogo gratuito de palpites de futebol entre amigos (React + Supabase),
sem apostas e sem dinheiro real. **Jogar, palpitar e participar continua 100% grátis.**

A monetização cobra apenas pela **criação de uma Federação** (o espaço onde a turma joga) —
uma **taxa única** (sem recorrência), enquadrada como **taxa de serviço** (não é casa de
apostas, não há prêmio em dinheiro). O alvo inicial é a **Copa do Mundo 2026** (abertura
11/06/2026), com escala pequena esperada (**< 200 usuários**, teto ~1000).

A análise do concorrente **app.dacopa.com** (origem dos dados de jogos e comparação de
Termos/Privacidade) foi o ponto de partida que originou as melhorias legais e o desenho da
cobrança.

---

## 2. Linha do tempo (data + hora)

Horários de **Brasília (UTC−3)**. Cada item traz o commit correspondente quando houve mudança
de código.

### 31/05/2026 — Decisões iniciais (produto + legal)

- **Monetização definida:** cobrar pela criação de Federação, **taxa única** via **Mercado Pago
  Checkout Pro** (hosted, sem PCI) + webhook → Edge Function que ativa a federação. Mirando a
  Copa 2026; escala pequena (< 200, teto 1000).
- **Enquadramento jurídico:** taxa de serviço (não aposta). Implica atualizar Termos/Privacidade
  (cláusula de pagamento, direito de arrependimento 7 dias — CDC, Mercado Pago como operador) e
  considerar **MEI** para nota fiscal/tributos.
- **LGPD:** consolidar contato em **resultadismoapp@gmail.com** (Controlador + Encarregado/DPO);
  páginas legais ajustadas (ANPD, retenção, identificação do controlador).

### 01/06/2026 01:35 — Fundação do pagamento · commit `24aa08d`

- Migration **`20260531000020_league_payments.sql`**: enum `payment_status`
  (`none`/`pending`/`paid`/`failed`/`refunded`), coluna `leagues.payment_status`, tabela
  `league_payments`, função `can_settle_leagues()`, triggers `leagues_before_insert` e
  `leagues_guard_status` (bypass para `service_role`/admin via GUC `app.settle_bypass`), RPC
  `confirm_league_payment` (idempotente) e cron de purga de pendentes.
- Edge Functions **`create-league-checkout`** e **`mercadopago-webhook`** (1ª versão) + tipos.
- Trabalho **isolado em worktree/branch `feat/pagamento-federacoes`** por haver outras sessões
  Claude trabalhando o mesmo repositório (concorrência).

### 01/06/2026 02:00 — Modo de pagamento, cupons e rebrand · commit `6ab1e6f`

- Migration **`20260531000021_payment_settings_discounts.sql`**: enum `payment_mode`
  (`disabled`/`test`/`live`), tabela **`app_settings`** (singleton `id=1`: `payment_mode`,
  `league_price_cents` — default R$ 9,90), tabela **`discount_codes`** (% ou R$, usos, validade).
  RPCs `admin_update_payment_settings`, `admin_comp_league` (liberar grátis/cortesia),
  `simulate_league_payment` (modo teste, sem MP) e `validate_discount_code`.
- **Rebrand Liga → Federação**: rotas **`/federacoes`** (+ redirects de `/ligas/*`) e textos
  visíveis. Identificadores de banco seguem `league`/`leagues` (não renomeados).
- Frontend do fluxo de pagamento (módulo `src/features/payments/api.ts`, `PaymentAdmin.tsx`,
  Nova Federação e Detalhe da Federação cientes do modo).

### 02/06/2026 (tarde) — Vinculação do Mercado Pago ao vivo (modo TESTE)

- Via **Claude-in-Chrome** (navegador "João"), foram configurados no Supabase de produção os
  secrets **`APP_URL`** (= `https://www.resultadismo.com`) e **`MERCADOPAGO_ACCESS_TOKEN`**
  (token de **teste**). Modo trocado para "Mercado Pago", criada federação de teste → caiu no
  **checkout real do MP (R$ 9,90)** ✓; modo revertido para **Teste** (seguro).
- Boundary respeitado: **o Access Token nunca foi digitado por mim** — o João colou.
- Nota de contas: o Supabase do projeto está na org **joaoroque**; app em
  **www.resultadismo.com** (login `joao.crf93@gmail.com`).

### 02/06/2026 17:56 — "Pagamento redondo" · commit `a9ee8a2` (branch `feat/federacoes-redondo`)

- **Botão de criar com clique único** (anti-duplo-clique; rótulo "Abrindo o Mercado Pago…").
- **Pago ativa na hora; só o NOME entra em revisão do admin.** Migration de moderação adiciona
  **`leagues.name_approved`**; `confirm_league_payment`/`simulate_league_payment` marcam
  `name_approved=false`; RPC **`admin_approve_league_name`**; disclaimer no Detalhe e card
  "Nomes a revisar" no admin.
- **Checkout sem boleto** (`excluded_payment_types: ticket`) — Pix aparece se a conta MP tiver
  Pix habilitado.
- Conteúdo: corrige "tudo grátis" na landing; explica Federação paga em landing / Como Funciona /
  Privacidade; **Como Funciona aprofundado** (o que é Federação, campeonatos futuros, desempate).
- **Descoberta:** o critério de desempate **já existia** em `get_league_standings`
  (pontos → cravadas → saldos → aproveitamento → acertividade → mais antigo) — apenas documentado.

### 02/06/2026 21:39–21:40 — Merge para a main = **deploy em produção** · commits `702bb9f` + `d459677`

- `702bb9f`: merge de `main` em `feat/federacoes-redondo`.
- `d459677`: migration de moderação **renumerada para `20260602000022_federacao_name_review.sql`**
  (para aplicar **após** a `20260602000021_admin_competition_tools` já aplicada em prod — evitar
  migration fora de ordem, que a sync do Supabase pode pular). **Mesclado na main** → Supabase
  aplica migrations, Vercel e functions sobem. **Produção em modo Teste** (sem cobrança real).
- **Incidente resolvido:** um `git reset --hard` no diretório principal (que estava em
  `feat/confrontos`, de outra sessão) moveu aquela branch sem querer; **restaurado via reflog**
  (`e5114b2`), 4 commits intactos, nada perdido. Lição registrada: *antes de qualquer git no dir
  principal, conferir `git branch --show-current`.*

### 02/06/2026 23:10 — **FIX "Pagar agora"** · commit `7c69577` (deploy em prod)

- **Bug:** federação com `status='active'` + `payment_status='pending'` (admin clicou "Aprovar"
  numa federação pendente de **pagamento**) fazia `create-league-checkout` retornar **409 "já está
  ativa"**, e o erro era **engolido** (sem aviso) — o botão "Pagar agora" parecia não funcionar.
- **Correção (3 partes):** a função só bloqueia se `payment_status='paid'`; o banner de pagamento
  **esconde** quando `status='active'`; "Pagar agora" passa a mostrar **toast** no erro.
- Diagnóstico feito via **Claude-in-Chrome** interceptando `fetch` (o tracker de rede não captura
  chamadas do `supabase-js functions.invoke`). Deploy verde; verificado no navegador.

### 03/06/2026 (madrugada) — **Go-live oficial** (cobrança real)

- O João executou os passos de produção: trocou **`MERCADOPAGO_ACCESS_TOKEN`** pelo **token de
  produção**, deixou o modo em **Mercado Pago** e **cadastrou a chave Pix** na conta MP.
- Checklist de go-live fornecido (resumo): *trocar só a secret não basta* — é preciso também
  **modo "Mercado Pago"** (senão o app simula e nem usa o token), **conta MP verificada** + conta
  bancária, **chave Pix** (para o Pix aparecer), webhook no painel MP + `MP_WEBHOOK_SECRET`
  (opcional, segurança), e um **pagamento real de teste** ponta a ponta. Ordem: **token de
  produção primeiro, depois virar o modo** (evita janela com modo live + token de teste).
- A partir daqui o app passou a **cobrar de verdade**.

### 03/06/2026 00:13 — **Preço R$ 19,90 + promo R$ 9,90 (Copa)** · commit `a257c14` (deploy em prod)

- Migration **`20260603000001_promo_pricing.sql`**: adiciona `app_settings.promo_price_cents` e
  `promo_until`. **Preço base R$ 19,90**; **promoção R$ 9,90 até 20/07/2026** (fim da Copa). RPC
  **`admin_set_promo`** (define/limpa a promo).
- **Preço efetivo = promo enquanto `now() < promo_until`, senão base** — calculado **no servidor**
  (`create-league-checkout`) e espelhado no front (helpers `isPromoActive` / `effectivePriceCents`).
- Admin (aba Pgto) passa a **editar/desligar a promoção** (preço + data fim) e mostra o "preço
  vigente agora". Tela Nova Federação exibe **"de ~~R$ 19,90~~ por R$ 9,90 — promoção da Copa"**;
  cupom incide sobre o preço vigente. Landing e Como Funciona citam a promo.
- Merge para a main via **push direto `feat/promo-copa:main`** (fast-forward de `7c69577`, a main
  não havia avançado). Deploy verde; **verificado no navegador** (tela mostra R$ 9,90 com R$ 19,90
  riscado). Branch e worktree removidos após o merge.

---

## 3. Decisões de produto consolidadas

| Tema | Decisão |
|------|---------|
| **O que é cobrado** | Apenas a **criação** de Federação. Jogar/palpitar/participar é grátis. |
| **Formato** | **Taxa única** por Federação (sem recorrência/renovação). |
| **Enquadramento** | Taxa de serviço — **não é aposta**, não há prêmio em dinheiro. |
| **Ativação** | Pago **ativa na hora**; só o **nome** fica sob revisão do admin. |
| **Preço** | Base **R$ 19,90**; **R$ 9,90** na promoção da Copa (até **20/07/2026**), automático. |
| **Meios de pagamento** | **Pix** (0,99%) e **cartão** (3,98–4,98%). **Boleto removido** (R$ 3,49 fixo). |
| **Controles do admin** | Modo (Desativado/Teste/Mercado Pago), preço base, promoção, cupons, cortesia (liberar grátis), aprovar nome. |
| **Escopo V1** | Apenas modo **Tabela/Pontos** (Copa). Confronto/Liga (round-robin) é de outra frente. |
| **Campeonatos futuros** | Brasileirão, top 5 da Europa, Série B, Libertadores, Copa do Brasil. |
| **Desempate** | pontos → cravadas → saldos → aproveitamento → acertividade → usuário mais antigo. |
| **Pontuação** | cravada = 3, saldo = 2, acerto = 1. |

---

## 4. Arquitetura técnica

### 4.1 Banco de dados (Supabase / Postgres)

- **Enums:** `payment_status` (`none`,`pending`,`paid`,`failed`,`refunded`); `payment_mode`
  (`disabled`,`test`,`live`).
- **`leagues`** (Federações): colunas `payment_status` e `name_approved`.
- **`league_payments`:** registro de cada pagamento (provider, payment_id, status, amount_cents,
  discount_code) — `payment_id` único (idempotência).
- **`app_settings`** (singleton `id=1`): `payment_mode`, `league_price_cents` (base),
  `promo_price_cents` (promo, opcional), `promo_until` (validade da promo).
- **`discount_codes`:** cupons (% ou R$, `max_uses`, `used_count`, `active`, `expires_at`).
- **Triggers:** `leagues_before_insert` e `leagues_guard_status` protegem `status`/`payment_status`/
  `name_approved` contra alteração indevida; **bypass** apenas para `service_role`/admin via GUC
  `app.settle_bypass`.
- **RPCs (funções):**
  - `confirm_league_payment` — idempotente; ativa a federação após pagamento confirmado.
  - `simulate_league_payment` — modo **teste**, simula pagamento aprovado (sem MP).
  - `admin_update_payment_settings(mode, price_cents)` — modo + preço base.
  - `admin_set_promo(promo_price_cents, promo_until)` — define/limpa a promoção (null limpa).
  - `admin_comp_league(league_id)` — cortesia (libera grátis).
  - `validate_discount_code(code)` — valida cupom.
  - `admin_approve_league_name(league_id)` — aprova o nome (tira o disclaimer).
  - `get_league_standings(lc_id)` — classificação com o desempate citado acima.

### 4.2 Edge Functions (Deno)

- **`create-league-checkout`** (caminho **live**; autenticado): lê `app_settings`, **calcula o
  preço efetivo** (promo se `now() < promo_until`, senão base), aplica cupom, cria a **preferência
  no Mercado Pago** (sem boleto, 1 parcela, `notification_url` apontando para o webhook). Desconto
  de 100% → ativa **de graça** sem MP. Secrets: `MERCADOPAGO_ACCESS_TOKEN`, `APP_URL`.
- **`mercadopago-webhook`** (público, `verify_jwt=false`): consulta o pagamento na **API do MP
  (autoritativo)**, chama `confirm_league_payment` e registra o uso do cupom. Opcional:
  `MP_WEBHOOK_SECRET` para validar assinatura.

### 4.3 Frontend (React + React Query)

- **`src/features/payments/api.ts`** — módulo de pagamentos. Hooks: `usePaymentSettings`,
  `useUpdatePaymentSettings`, `useSimulatePayment`, `useCompLeague`, `useDiscountCodes` /
  `useCreateDiscount` / `useToggleDiscount` / `useDeleteDiscount`, `useApproveName`,
  `useNameReviewLeagues`. Helpers: **`isPromoActive`**, **`effectivePriceCents`**,
  `applyDiscount`, `validateDiscount`. (Casts contidos via `LooseClient` para não mexer no
  `database.ts` e reduzir conflito com outras sessões.)
- **`src/features/leagues/NovaLigaPage.tsx`** — criar Federação: clique único, preço vigente,
  selo de promoção "de R$ 19,90 por R$ 9,90", cupom.
- **`src/features/leagues/LigaDetailPage.tsx`** — banner "Pagar agora" (pendentes) e disclaimer de
  nome em revisão.
- **`src/features/leagues/api.ts`** — `startLeagueCheckout`, `useLeagueCheckout`.
- **`src/features/admin/PaymentAdmin.tsx`** — aba **"Pgto"**: "Nomes a revisar", "Pagamento de
  federações" (modo + preço base + promoção) e "Cupons de desconto".
- **`src/features/help/ComoFuncionaPage.tsx`**, **`src/features/landing/LandingSections.tsx`**,
  **`src/features/legal/TermosPage.tsx`** e **`PrivacidadePage.tsx`** — conteúdo de pagamento.
- **`src/lib/pricing.ts`** — `formatBRL` (formatação de centavos para exibição).

---

## 5. Modelo de preços (base + promoção)

```
preço_efetivo = (promo_price_cents definido E now() < promo_until)
                ? promo_price_cents      (promoção)
                : league_price_cents     (base)
```

- **Autoritativo no servidor:** quem decide o valor cobrado é a Edge Function
  `create-league-checkout` (usa o relógio do servidor). O front apenas **espelha** para exibição.
- **Valores atuais:** base = **R$ 19,90** (`1990`); promo = **R$ 9,90** (`990`); `promo_until` =
  **2026-07-20 23:59:59 (−03)**. Depois dessa data, volta a R$ 19,90 **automaticamente**.
- **Cupom** incide **sobre o preço vigente** (promo, se ativa). Cupom de 100% → ativa grátis.

---

## 6. Fluxos principais

**Criar Federação (modo Mercado Pago):** usuário cria → `create-league-checkout` calcula o preço
efetivo e cria a preferência → redireciona ao checkout do MP → paga (Pix/cartão) → **webhook**
confirma → `confirm_league_payment` ativa a federação (**na hora**) com o **nome em revisão**.

**Voltar sem pagar:** a federação fica `pending`; no Detalhe aparece o banner **"Pagar agora"**
(reabre o checkout). Se já estiver `active`, o banner some.

**Modo Teste:** `simulate_league_payment` aprova um pagamento fictício (sem MP) e ativa — para
testar o fluxo ponta a ponta sem cobrança real.

**Cortesia / Cupom:** admin pode liberar uma federação grátis (`admin_comp_league`) ou criar
cupons (% ou R$). Cupom de 100% ativa sem passar pelo MP.

**Moderação do nome:** toda federação paga nasce ativa com `name_approved=false`; o admin aprova
o nome em "Nomes a revisar" (ou exclui se for impróprio).

---

## 7. Painel de administração (aba "Pgto")

- **Nomes a revisar** — aprova o nome das federações já ativas.
- **Pagamento de federações** — **Modo** (Desativado / Teste / Mercado Pago), **Preço base**,
  **Promoção por tempo limitado** (preço promocional + data fim; desmarcar encerra). Mostra o
  **"preço vigente agora"**.
- **Cupons de desconto** — criar (% ou R$, usos), ativar/desativar, excluir.

> A promoção **expira sozinha** na data definida — não é preciso desligar manualmente.

---

## 8. Estado atual em produção

- **`origin/main` = `a257c14`** (03/06/2026 00:13).
- **Modo:** Mercado Pago (**live**) — cobrando de verdade (token de **produção** + chave Pix
  configurados pelo João).
- **Preço:** base **R$ 19,90**; promo **R$ 9,90** até **20/07/2026**.
- **Migrations aplicadas** até `20260603000001_promo_pricing`.
- **Deploys** (Supabase Preview + Vercel + Deploy Edge Functions) verdes em todos os merges.

---

## 9. Segurança, conformidade e boundaries

- **Credenciais financeiras:** o **Access Token do Mercado Pago nunca foi digitado pelo agente** —
  o João colou. Nunca houve login na conta do Mercado Pago.
- **Deploy em produção** só com **autorização explícita** do João a cada merge na main.
- **Concorrência:** múltiplas sessões no mesmo repositório → trabalho isolado em **worktrees**;
  o diretório principal fica em `feat/confrontos` (outra sessão) — **não commitar/resetar lá**.
- **LGPD:** contato único `resultadismoapp@gmail.com` (Controlador + Encarregado/DPO); Mercado Pago
  como **operador** de pagamento; Termos com cláusula de pagamento (seção 12) e direito de
  arrependimento; menções a ANPD e retenção. Dados de cartão ficam **com o Mercado Pago**, nunca
  com o app.

---

## 10. Pendências e próximos passos

- **Validar Pix em pagamento real** (em produção, conta verificada + chave Pix já cadastrada).
- **Causa-raiz do bug "Pagar agora":** o botão **"Aprovar" do admin não deveria aparecer** para
  federações `payment_status='pending'` (elas esperam **pagamento**, não aprovação) — ajuste na
  fila de aprovação (frente do admin, outra sessão).
- **Textos hardcoded:** landing e Como Funciona citam "R$ 19,90 / R$ 9,90" no código — se o preço
  mudar no admin, **atualizar esse copy à mão** (os demais pontos são dinâmicos).
- **MEI** para emitir nota fiscal e regularizar tributos sobre a receita.
- **Migração de contas** (GitHub, Vercel, Supabase, Google Cloud/OAuth) para
  `resultadismoapp@gmail.com` — sem regenerar o OAuth Client do Google (quebra o login).
- **`VAPID_SUBJECT`** em `supabase/functions/send-push/index.ts` ainda usa e-mail antigo.

---

## 11. Anexo — referência de arquivos, migrations e commits

### Migrations (ordem de aplicação)

| Arquivo | Conteúdo |
|--------|----------|
| `20260531000020_league_payments.sql` | `payment_status`, `league_payments`, triggers, `confirm_league_payment`, purga |
| `20260531000021_payment_settings_discounts.sql` | `payment_mode`, `app_settings`, `discount_codes`, RPCs de admin/simulação/cupom |
| `20260602000022_federacao_name_review.sql` | `leagues.name_approved`, `admin_approve_league_name`, ativa-na-hora |
| `20260603000001_promo_pricing.sql` | `app_settings.promo_price_cents` + `promo_until`, `admin_set_promo` |

### Edge Functions

| Função | Papel |
|--------|-------|
| `supabase/functions/create-league-checkout/index.ts` | Cria preferência MP; calcula preço efetivo; aplica cupom |
| `supabase/functions/mercadopago-webhook/index.ts` | Confirma pagamento (consulta MP); ativa federação |

### Commits-chave (horário de Brasília)

| Data/hora | Commit | Descrição |
|-----------|--------|-----------|
| 01/06/2026 01:35 | `24aa08d` | Fundação do pagamento (migration 020, functions, tipos) |
| 01/06/2026 02:00 | `6ab1e6f` | Modo de pagamento + cupons + liberar grátis + rebrand Liga→Federação |
| 02/06/2026 17:56 | `a9ee8a2` | "Pagamento redondo": clique único, ativa-na-hora (revisão só do nome), Pix, conteúdo |
| 02/06/2026 21:40 | `d459677` | Renumera migration name_review → 022; **merge na main (deploy)** |
| 02/06/2026 23:10 | `7c69577` | **Fix** "Pagar agora" (409 em federação ativa+pendente) |
| 03/06/2026 00:13 | `a257c14` | **Preço base R$ 19,90 + promo R$ 9,90** (Copa), com validade |

### Secrets (Supabase, produção)

| Secret | Valor / observação |
|--------|--------------------|
| `MERCADOPAGO_ACCESS_TOKEN` | Token de **produção** (colado pelo João; nunca pelo agente) |
| `APP_URL` | `https://www.resultadismo.com` |
| `MP_WEBHOOK_SECRET` | Opcional (validação de assinatura do webhook) |

---

*Fim do documento.*
