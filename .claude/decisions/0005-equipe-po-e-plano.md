# ADR 0005 — A IA atua como equipe, o João é o PO, e plano valida antes de codar

> **Status:** Aprovada e implementada (2026-06-08). Decisão do João (PO).
> **Regras vivas:** [`MESTRE.md`](../MESTRE.md) §3 (regras 15 e 16) e §5 · [`11-EQUIPE-E-PAPEIS.md`](../11-EQUIPE-E-PAPEIS.md) · [`08-PROCESSO.md`](../08-PROCESSO.md).

## Contexto

O João é o dono e único responsável pelo produto, mas conduz o desenvolvimento **enviando pedidos**:
ele sabe um pouco de código, porém **nem sempre conhece as implicações técnicas** de cada mudança. Até
aqui, a documentação tratava a IA como executora que "questiona e sobe", exigindo o OK do João
**apenas** em mudanças de **alto impacto** (pagamento, login, dado destrutivo). Isso deixava espaço
para mudanças aparentemente simples seguirem direto, sem avaliação de impacto nem visão de produto, e
não definia formalmente **quem** a IA "é" ao trabalhar (uma pessoa? um time?).

Esta decisão formaliza três coisas pedidas pelo PO.

## Decisão

1. **O João é o Product Owner (PO).** Ele descreve o problema/desejo; a IA decide o "como", apresenta
   e só executa com o aval. → regra central **15**.
2. **A IA atua como uma equipe completa e multidisciplinar** (vários "chapéus" especializados numa só
   sessão), conforme a stack do projeto. O time e os cenários de cada papel estão em
   [`11-EQUIPE-E-PAPEIS.md`](../11-EQUIPE-E-PAPEIS.md). → regra central **15**.
3. **Nenhuma alteração de código sem plano validado pelo PO antes** ("Portão A"), por mais simples que
   pareça. A IA avalia o impacto no projeto inteiro, planeja, apresenta em **duas camadas (técnica +
   leiga)**, aguarda o **OK explícito**, implementa, valida e **documenta**. → regra central **16**.

### Calibragem (escolhas do PO em 2026-06-08)

- **Rigor: proporcional e sempre.** Todo código passa por plano + OK; a profundidade do plano escala
  com o tamanho (uma linha para o trivial, plano completo para o grande).
- **Escopo: só código.** O Portão A vale para `src/`, `supabase/migrations`, `supabase/functions` e
  config de runtime. Mudança só de documentação segue o fluxo leve de doc (registrada, sem Portão A).
- **Estrutura: doc 11 novo + este ADR**, com as regras 15/16 ancoradas no MESTRE.

## Alternativas consideradas

| Alternativa | Veredito |
|---|---|
| Manter só o gate de alto impacto (status quo) | **Recusada.** Deixava mudanças simples sem avaliação de impacto nem visão de produto. |
| Linha-dura: plano formal escrito para tudo, inclusive typo | **Recusada** pelo PO: fricção alta demais para ganho baixo no trivial. |
| Isentar o "trivial" do plano | **Recusada** pelo PO: preferiu "proporcional e sempre" (o trivial tem plano de uma linha, mas tem). |
| Concentrar tudo no MESTRE, sem doc novo | **Recusada:** o detalhe de papéis e cenários incharia o MESTRE; melhor um doc de área (11) com o MESTRE apontando. |

## Consequências

- **Mais previsível para o PO:** todo pedido vira plano (técnico + leigo) antes de virar código; o
  João decide com contexto.
- **Três portões claros** (A plano, B homologação, C release) deixam de se confundir na doc.
- **Custo:** um passo a mais antes de implementar; mitigado pela calibragem "proporcional" (trivial =
  plano de uma linha).
- **Coerência documental:** toda a `.claude/` foi alinhada a este modelo, e o `CLAUDE.md`/`AGENTS.md`
  (ponteiros) passaram a refleti-lo. O **MESTRE segue sendo o contrato**.
- **Reversível:** é regra de processo/documentação; não toca schema nem código de runtime.

## Implementação

- Novo [`11-EQUIPE-E-PAPEIS.md`](../11-EQUIPE-E-PAPEIS.md); regras 15/16 + §5 passo 3 reforçado +
  nota dos 3 portões no [`MESTRE.md`](../MESTRE.md); gate pré-implementação no
  [`08-PROCESSO.md`](../08-PROCESSO.md); ajustes de coerência em 01/02/04/06/07/08/09/10; ponteiros
  `CLAUDE.md` e `AGENTS.md` atualizados; entrada no [`CHANGELOG.md`](../CHANGELOG.md) e marco no
  [`HISTORICO.md`](../HISTORICO.md).
