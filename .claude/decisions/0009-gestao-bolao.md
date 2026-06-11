# ADR 0009 — Gestão do Bolão: organização informativa, sem dinheiro no app

**Status:** aceito · **Data:** 2026-06-10 · **PO:** João

## Contexto
Usuários pediram uma forma de organizar o bolão pago que os grupos de amigos **já fazem por fora**
(quem pagou, valor, divisão do prêmio). A regra central 3 do MESTRE diz "não é casa de apostas,
sem pote/prêmio em dinheiro" — e a legislação (Lei 14.790/2023, DL 204/67) restringe exploração
de aposta a operadores licenciados. O PO refletiu sobre o risco e decidiu o enquadramento.

## Decisão
1. **Nenhum dinheiro passa pelo app.** A "Gestão do Bolão" é um quadro de avisos: o admin registra
   quem pagou, o valor combinado e a divisão (%) do prêmio entre 1º/2º/3º. O app só **exibe** os
   números (R$ informativo); cobrança/pagamento/entrega acontecem fora, entre os membros.
2. A regra central 3 segue valendo: o Resultadismo não recebe, não guarda, não repassa e não
   intermedeia valores. A única cobrança do app continua sendo a criação de Federação.
3. **Permissões no banco** (triggers + RLS na migration `20260610200000_gestao_bolao.sql`):
   admins gerenciam settings e pagantes; **só o DONO trava/destrava** (`pot_locked`); travado,
   nada de pot_* muda (nem settings nem pagantes). Trava é **manual pelo dono** (decisão do PO),
   com dica na UI pra travar antes de a Copa começar.
4. **Prêmio só entre pagantes**: o rateio cruza a classificação oficial com o conjunto de pagantes
   (`potMath.ts`); cada prêmio arredonda pra baixo e a sobra fica no caixa do grupo. Colocação sem
   pagante suficiente não premia.
5. **Visível só a membros** do grupo (RLS select = membro). Disclaimers fixos na aba, cláusula
   própria nos Termos (seção 5) e seção no Como Funciona.
6. Anúncio: **broadcast** (manual, pelo admin João) + **coachmark** na página do grupo
   (`resultadismo-coach-gestao-bolao-v1`).

## Consequências
- O app continua fora do escopo de "exploração de apostas": não há aposta no app, só registro
  informativo de um acordo privado entre amigos (que existiria de qualquer forma).
- Se algum dia o dinheiro entrar no app (ex.: cobrar inscrição via MP), esta decisão DEVE ser
  revisitada — vira outra categoria legal e exige OK explícito do PO.
- A UI mostra valores em R$ derivados de `pot_entry_cents × pagantes`; o app nunca afirma que
  alguém "recebeu" ou "deve" — só o combinado.
