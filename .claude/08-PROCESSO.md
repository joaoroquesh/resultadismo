# 08 — Processo de mudança

> O passo a passo operacional de levar uma mudança da ideia ao deploy **sem quebrar nada**.
> Detalha o protocolo canônico do [`MESTRE.md`](MESTRE.md) §5. Para concorrência entre sessões →
> [`09-PARALELISMO.md`](09-PARALELISMO.md). Para o mecanismo de deploy → [`07`](07-BUILD-E-DEPLOY.md).

## 1. A ordem (resumo executável)

```
0. Entender o pedido
1. Questionar criticamente contra as regras (negócio 06, arquitetura 01/02/05, processo 07/08, design)
2. Decidir/aprovar (TODO código exige plano validado pelo João — regra 16; alto impacto/contra regra → confirmação redobrada; decisão contra regra → registrar no HISTORICO)
3. Planejar e APRESENTAR ao PO em duas camadas (técnica + leiga) + aguardar OK antes de implementar — Portão A, regra 16 (arquivos + pontos de contato + DOCS afetadas)
4. Implementar (padrões do 02; isolar conforme 09; migration aditiva se mexer no banco)
5. Validar de verdade (typecheck/build + navegador + db reset)
6. Propagar para TODOS os pontos de contato do site que falam daquilo (coerência)
7. Atualizar a documentação .claude/ afetada (01–11)
8. Registrar no CHANGELOG + versionar (+ HISTORICO se decisão/marco)
9. Homologar com o João: abrir local (npm run dev) + aval explícito antes de subir — sobretudo UI/UX (MESTRE §3 regra 14)
10. Subir com segurança (push conforme 09 = deploy em produção)
```

> **Se a mudança sobe, a coerência do site + a doc + o changelog sobem junto.** Mudar comportamento
> sem atualizar todos os pontos de contato e a doc afetada = entrega incompleta.

## 2. Antes de começar (entrada)

1. Li o [`MESTRE.md`](MESTRE.md) e o documento da área que vou tocar.
2. `git fetch` + `git branch --show-current` + `git status` — sei se a `main` andou e se há
   trabalho não-commitado de outra sessão (→ [`09`](09-PARALELISMO.md)).
3. Entendi a regra de negócio (06). A mudança **não fere** uma regra central
   ([`MESTRE.md`](MESTRE.md) §3) sem decisão explícita.

## 3. Questionar (o filtro)

Toda mudança passa por estas perguntas **antes** de virar código:
- Respeita a **pontuação**, o **desempate**, "**não é casa de apostas**"? (06)
- Cabe na **arquitetura** e nos **padrões de código**? Mexe em **RLS/segurança**? (01, 02, 05)
- É **deployável com segurança**? Está **on-brand**? (07, DESIGN.md)
- É de **alto impacto** (pagamento, prod ao vivo, dado destrutivo, login)? → confirmar com o João.

Se conflita com uma regra central → **pare e leve ao João**. Não suba.

## 3.1 Apresentar o plano ao PO (Portão A — regra 16)

> O João é o **PO**; a IA atua como **equipe** (papéis em [`11-EQUIPE-E-PAPEIS.md`](11-EQUIPE-E-PAPEIS.md)).
> **Nenhuma alteração de código começa sem este portão.**

Depois de questionar e antes de implementar, **monte o plano e apresente ao João**:
- **Avalie o impacto no projeto inteiro** (não só no arquivo óbvio): regras 06, arquitetura/segurança
  01/02/05, processo 07/08, identidade DESIGN.md/10. Vista os papéis da área tocada (doc 11 §4).
- **Apresente em duas camadas:** **técnica** (arquivos/tabelas, riscos, trade-offs, rollback se
  sensível) **+ leiga** (a solução em 1-2 frases, para o PO que nem sempre domina o técnico).
- **Aguarde o OK explícito.** Só então implemente.
- **Proporcional:** trivial = uma linha de plano; grande = plano completo. Mas **sempre** há plano + OK.
- **Escopo = código** (`src/`, `supabase/migrations`, `supabase/functions`, config de runtime).
  Mudança **só de documentação** segue o fluxo leve (registrada, sem este portão).

Este é o **Portão A**. Não confundir com o **B** (homologação local antes do push, regra 14, §7) nem
com o **C** (release/versão, ADR [`0003`](decisions/0003-versionamento.md), [`MESTRE.md`](MESTRE.md)
§6). Os três coexistem. O **gate de alto impacto** (§8) é **adicional** a esses, não um quarto portão.

## 4. Implementar

- Siga os padrões do [`02-CODIGO.md`](02-CODIGO.md). Imite o código vizinho.
- **Isolamento:** se houver sessão concorrente, trabalhe em **branch/worktree** próprio a partir do
  `origin/main` atual; toque só nos **seus** arquivos. → [`09`](09-PARALELISMO.md).
- **Banco:** mudança = **migration aditiva** em `supabase/migrations/`, numerada **depois** da maior
  existente (conferir após `git fetch`). Função de escrita = `security definer`, `set search_path =
  ''`, checa admin/owner. Depois: `npm run db:types`.
- **Pagamento/segredos:** a IA não digita Access Token, não loga no MP, não executa estornos. (04 §5)

## 5. Validar (de verdade)

| Camada | Como |
|---|---|
| Tipos/build | `npm run typecheck` (ou `npm run build`) **verde** |
| Complexidade | `npm run lint` — regra `complexity` **avisa** acima de 20; evite introduzir função nova acima disso (doc 02 §7) |
| Dependências | `npm run check:arch` **APROVADO** (sem violação dura de camada); avisos de acoplamento lateral são backlog (doc 02 §7) |
| Banco | `npm run db:reset` aplica todas as migrations + seed **sem erro**; testar a regra via `psql`/Studio |
| Fluxo real | **Testar no navegador** (Playwright/preview) — o João pediu validação real, não só typecheck |
| Concorrência | `npm run build` na árvore inteira como gate de coerência **mas** revisar o diff cirurgicamente (não validar trabalho alheio como seu) |

> Preview em **porta isolada** (ex.: 5180, ver `.claude/launch.json`) p/ não colidir com outra
> sessão rodando em 5173/5174.

## 6. Coerência do site + documentação + changelog

**Primeiro, a coerência do site (essencial):** procure **todo ponto de contato** que fala sobre o
que você mudou e atualize **todos** — home, "Como funciona", onboarding, landing, copy de UI,
**Termos** e **Privacidade**. Ex.: mudou a **pontuação** ou o **preço**? Aparecem em vários lugares;
use `grep -rin` no `src/` e confira [`03-PAGINAS.md`](03-PAGINAS.md). O app inteiro comunica a mesma
coisa — **nunca** um ponto novo e outro velho.

**Depois, a documentação:**
- Para **cada** regra/tela/dado que mudou, atualize o documento correspondente em `.claude/`
  (01–11). Ex.: novo modo de confronto → 06 (+ 03 se nova tela, + 05 se nova tabela/RPC).
- Adicione a entrada no [`CHANGELOG.md`](CHANGELOG.md) e **suba a versão** ([`MESTRE.md`](MESTRE.md)
  §6) + `package.json`. Decisão de mudar uma regra ou marco grande → nota em
  [`HISTORICO.md`](HISTORICO.md).

## 7. Subir (push = deploy em produção)

> **Gate (MESTRE §3 regra 14):** antes de qualquer push/merge na `main`, **abra a mudança rodando
> localmente** (`npm run dev`; com dados reais via `npm run homolog:pull` quando ajudar) e **espere o
> aval explícito do João** — sobretudo em **UI/UX**, que ele precisa ver no navegador. Sem OK, não sobe.

1. `git fetch` de novo; rebase/merge de `origin/main` se andou (→ [`09`](09-PARALELISMO.md)).
2. **Stage explícito por arquivo** (nunca `git add -A`). Conferir `git diff --cached --name-only` —
   só os seus arquivos.
3. Commit com mensagem clara (`feat(...)`, `fix(...)`, `docs(...)`).
4. Push **fast-forward** sobre `origin/main` (idealmente `branch:main`).
5. **Confirme os checks verdes** no commit: **Supabase Preview**, **Vercel**, **Deploy Edge
   Functions**. Push na `main` aplica migrations em produção e sobe o frontend/funções.

## 8. Alto impacto — confirmar antes

Estas mudanças **exigem OK explícito do João** antes do push:
- Qualquer coisa de **pagamento** ou que mexa em dinheiro/estorno.
- Migration **destrutiva** (drop de coluna/tabela, alteração de dado em prod).
- Mudança em **login/auth** ou que possa **derrubar o site ao vivo**.
- Mudar uma **regra central** ([`MESTRE.md`](MESTRE.md) §3).

Para essas, descreva o impacto e o plano de rollback **antes** de agir. O site está ao vivo e
cobrando — surpresa em produção não é aceitável.

## 9. Ao terminar

- Resuma o que mudou, o que foi validado e o que **não** foi validado em runtime (seja honesto).
- Traga **pontos de decisão e melhorias** para o João escolher.
- Deixe **chaves/acessos/liberações** agrupados num checklist no fim (preferência do João).
