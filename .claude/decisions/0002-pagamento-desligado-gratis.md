# ADR 0002 — Pagamento desligado: criar grupos é gratuito (por ora)

> **Status:** ✅ **Aprovada e implementada (2026-06-04, decisão do João).** Modo de pagamento em
> `disabled` (criar grupo não cobra). Toda a copy pública comunica "grátis". A **infraestrutura** de
> pagamento (Mercado Pago, preço, cupons, reembolso, `PaymentAdmin`) fica **preservada no código,
> apenas desligada** — reativável no futuro.

## Contexto

A **regra central 3** (MESTRE) previa **cobrança de taxa de serviço pela criação de Grupo** (modo
`live`, Mercado Pago — ver [`06`](../06-REGRAS-DE-NEGOCIO.md) §5). Era a **única fonte de receita** do
projeto.

João decidiu, **neste momento, não cobrar**: criar grupos passa a ser **100% gratuito**. Motivo:
**tirar o atrito** da largada (Copa do Mundo 2026) e deixar as pessoas jogarem e montarem grupos
livremente, priorizando **crescer a base** em vez de monetizar agora.

Isso **conflita com a regra central 3** ("cobra-se taxa pela criação de Grupo"). Pelo protocolo do
MESTRE (§5 passo 2: mudança contra uma regra central exige decisão explícita do João + registro),
esta ADR documenta a decisão, o HISTORICO recebe a nota, e a regra é atualizada.

## Decisão

1. **Modo de pagamento global em `disabled`** — criação de grupo sem cobrança. Já aplicado em
   produção pelo João (admin → aba Pgto).
2. **Copy pública comunica "grátis"** em **todos os pontos de contato** (regra 9): home/landing,
   "Como funciona", criar grupo, Termos, Privacidade e SEO (`index.html` / JSON-LD / `llms.txt`).
   Removidas as menções a **taxa / R$ 9,90 / R$ 19,90 / Mercado Pago / reembolso** da copy.
3. **Infra de pagamento preservada, apenas dormente:** modos `test`/`live`, checkout Mercado Pago,
   preço (`pricing.ts`/`league_price_cents`), cupons, reembolso self-service e `PaymentAdmin`
   **continuam no código**. Reativar = trocar o modo + restaurar a copy de preço.
4. **Formas pagas no futuro:** não são comunicadas agora. Quando voltarem, serão **apresentadas com
   clareza antes de qualquer cobrança** (texto neutro em Termos §12).

## Alternativas consideradas

| Opção | Veredito |
|---|---|
| **Grátis agora (`disabled`), infra preservada** | ✅ **Escolhida** — zero atrito, 100% reversível. |
| Remover o código de pagamento | ❌ jogaria fora trabalho que volta no futuro; mais risco. |
| Manter a cobrança | ❌ contra a decisão do João (atrito na largada da Copa). |

## Consequências

- ✅ Qualquer pessoa **cria grupos sem pagar** — menos atrito, mais adoção.
- ⚖️ **Sem receita por ora** (era a única fonte). Aceito: projeto é por diversão; formas pagas voltam
  depois.
- 🔁 **Reversível:** trocar o modo `disabled` → `live` no admin + restaurar a copy de preço (esta ADR
  documenta o caminho de volta). A infra não foi removida.
- 📝 **"Não é casa de apostas" permanece** intacto (sem aposta, sem prêmio em dinheiro — Lei
  14.790/2023). A regra central 3 e o [`06`](../06-REGRAS-DE-NEGOCIO.md) §5 passam a refletir
  "grátis por ora; taxa de serviço só se/quando voltar".

## Implementação (feita nesta leva — conjunto coerente, regra 9)

1. **Modo `disabled`** em produção (admin, pelo João).
2. **Copy "grátis"** em home, "Como funciona", criar grupo, Termos (§1 e §12), Privacidade,
   `index.html` (JSON-LD/FAQ), `llms.txt`.
3. **Infra preservada** (test/live/MP/cupom/reembolso/`PaymentAdmin`/`pricing.ts`).
4. **Docs:** regra central 3 (MESTRE) + [`06`](../06-REGRAS-DE-NEGOCIO.md) §5 reescritas; entrada no
   CHANGELOG (**2.4.0**) + nota no [`HISTORICO`](../HISTORICO.md).
