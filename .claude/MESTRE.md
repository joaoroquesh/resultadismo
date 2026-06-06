# MESTRE — Resultadismo (porta de entrada da documentação)

> **🛑 LEIA ISTO PRIMEIRO, SEMPRE.**
> Qualquer IA (ou pessoa) que vá ler, mexer, planejar ou subir **qualquer coisa** neste
> repositório começa por este arquivo. Ele é o índice + as regras centrais + o **protocolo de
> mudança** que governa todos os outros documentos da pasta `.claude/`.
>
> Se você só vai responder uma pergunta, leia as seções 1–3. Se vai **alterar código ou dados**,
> leia também as seções 4–6 e o documento específico da área que vai tocar.

> **✍️ Assinatura obrigatória — sinal de conformidade.**
> Ao final de **toda** resposta neste repositório (qualquer pergunta, ajuste ou mudança feita por
> IA), escreva como **última linha**, exatamente: **Fui resultadista**.
> É a prova de que a IA leu e está obedecendo as regras do `.claude/`. Se a frase **não** aparecer,
> presuma que estas regras não foram lidas/seguidas.

Versão atual do projeto: **2.8.1** · App em produção: **https://www.resultadismo.com** ·
Última revisão desta doc: **2026-06-05**.

---

## 1. O que é o Resultadismo (30 segundos)

Jogo social de **palpites de placares de futebol**. Você crava o placar de jogos reais, ganha
pontos (**cravada +3 / saldo +2 / acerto +1**) e disputa em **grupos** privados de amigos com classificação, confrontos e zoeira saudável. **Jogar, palpitar e criar grupos é grátis**
(pagamento desligado por ora — ver [`06`](06-REGRAS-DE-NEGOCIO.md) §5 e ADR [`0002`](decisions/0002-pagamento-desligado-gratis.md)).
Não é casa de apostas: não há aposta nem prêmio em dinheiro.

- **Stack:** SPA Vite + React 19 + TypeScript + Tailwind v4, backend **Supabase** (Postgres, Auth
  Google, RLS, Edge Functions Deno, pg_cron). Deploy: **Vercel** (frontend) + **Supabase**
  (backend), ambos disparados por **push na `main`**.
- **Estado:** **no ar e cobrando de verdade** (Mercado Pago, modo live). Primeiro caso de uso é a
  **Copa do Mundo 2026**.
- **Dono e único dev:** João (`joaoroquesh`). Construído por diversão; design importa muito.

> Detalhes de produto/marca em [`PRODUCT.md`](../PRODUCT.md) e [`DESIGN.md`](../DESIGN.md) (raiz do
> repo). Este `.claude/` é a camada **técnica e operacional**.

---

## 2. Mapa da documentação (`.claude/`)

Leia o documento da área que você vai tocar **antes** de tocar. Cada um é a fonte de verdade
daquele assunto.

| # | Arquivo | Quando ler |
|---|---------|-----------|
| — | **MESTRE.md** (este) | Sempre, primeiro. Índice + regras centrais + protocolo de mudança. |
| 01 | [`01-ARQUITETURA.md`](01-ARQUITETURA.md) | Entender stack, pastas, fluxo de dados, integrações, modelo de deploy. |
| 02 | [`02-CODIGO.md`](02-CODIGO.md) | Antes de escrever código: convenções de React/TS/Tailwind, design tokens, padrões de dados. |
| 03 | [`03-PAGINAS.md`](03-PAGINAS.md) | Mexer em telas/rotas: catálogo de páginas, navegação, componentes de UI. |
| 04 | [`04-ADMIN.md`](04-ADMIN.md) | Mexer em admin: app-admin × admin de grupo, painel, RPCs de admin. |
| 05 | [`05-DADOS-E-AUTH.md`](05-DADOS-E-AUTH.md) | Mexer em banco/login: tabelas, RLS, RPCs, autenticação, login/logout. |
| 06 | [`06-REGRAS-DE-NEGOCIO.md`](06-REGRAS-DE-NEGOCIO.md) | **A constituição.** Pontuação, grupos, pagamento, confrontos, escudos, notificações. |
| 07 | [`07-BUILD-E-DEPLOY.md`](07-BUILD-E-DEPLOY.md) | Build, variáveis de ambiente, como o deploy chega em produção, secrets. |
| 08 | [`08-PROCESSO.md`](08-PROCESSO.md) | **Como subir uma mudança** do começo ao fim (detalha o protocolo da seção 5). |
| 09 | [`09-PARALELISMO.md`](09-PARALELISMO.md) | **Vários chats/sessões no mesmo repo.** Regras anti-colisão. Ler antes de qualquer `git`. |
| 10 | [`10-UX-WRITING.md`](10-UX-WRITING.md) | Escrever textos do app (microcopy): clareza/simplicidade, voz, tom, glossário, padrões de erro/vazio/sucesso. |
| — | [`CHANGELOG.md`](CHANGELOG.md) | O que mudou em cada versão. **Atualizar a cada mudança que sobe.** |
| — | [`HISTORICO.md`](HISTORICO.md) | Narrativa de como o projeto evoluiu até aqui (consolida `docs/`). Contexto, não regra. |

> A evolução do projeto está consolidada em [`HISTORICO.md`](HISTORICO.md) (visão única). A pasta
> [`docs/`](../docs/) guarda apenas o planejamento de design (`planning/`) como referência.

---

## 3. Regras centrais (inegociáveis sem decisão explícita do João)

Estas são as coisas **sagradas**. Mudar qualquer uma exige decisão consciente do João e atualização
de docs + changelog (seção 5). Cada uma tem dono num doc específico.

1. **A pontuação é o coração.** Cravada = 3, Saldo = 2 (cobre empates: vencedor certo + mesma
   diferença de gols), Acerto = 1 (só o vencedor), Erro = 0. Calculada **no banco** (não confiar no
   client). → [`06`](06-REGRAS-DE-NEGOCIO.md), [`05`](05-DADOS-E-AUTH.md).
2. **Desempate fixo:** pontos → cravadas → saldos → aproveitamento → acertividade → membro mais
   antigo. Já existe em `get_league_standings`. → [`06`](06-REGRAS-DE-NEGOCIO.md).
3. **Não é casa de apostas.** Sem aposta nem prêmio em dinheiro, sem pote/stakes (Lei 14.790/2023).
   **Criar grupos é gratuito por ora** (pagamento em modo `disabled`); se voltar a cobrar, é **taxa
   de serviço** pela criação de Grupo, nunca aposta/prêmio. → [`06`](06-REGRAS-DE-NEGOCIO.md) §5,
   ADR [`0002`](decisions/0002-pagamento-desligado-gratis.md).
4. **Segurança é no banco (RLS-first).** Toda regra de acesso vive em RLS/RPC `SECURITY DEFINER`.
   O frontend **espelha**, nunca é a fonte de verdade. → [`05`](05-DADOS-E-AUTH.md).
5. **Deploy é só por push na `main`.** Push aplica migrations em produção e sobe Vercel + Edge
   Functions. **NUNCA** rodar `supabase db push`/`link` local nesta máquina (o CLI aqui aponta para
   OUTRO projeto — `rezende-advocacia-dash` — e aplicaria a mudança no lugar errado). →
   [`07`](07-BUILD-E-DEPLOY.md).
6. **Identidade visual é marca.** Turquesa `#1CB19C`, escudo, sistema de cor da pontuação
   (dourado/verde/ciano), tipografia, dark mode completo. Nada de "mar escuro de dados" estilo
   Sofascore. → [`DESIGN.md`](../DESIGN.md), [`02`](02-CODIGO.md).
7. **O repo é editado em paralelo.** Quase sempre há outra sessão/chat trabalhando. Antes de
   `git`, ler [`09`](09-PARALELISMO.md). Nunca `git add -A`; nunca resetar branch alheia.
8. **Credenciais e dinheiro são do João.** A IA **não digita** Access Token do Mercado Pago, não
   loga na conta do MP, não executa estornos no painel, não roda deploy de alto impacto sem
   autorização explícita. → [`07`](07-BUILD-E-DEPLOY.md), [`08`](08-PROCESSO.md).
9. **Coerência em TODOS os pontos de contato (essencial).** Toda alteração precisa ser refletida em
   **todo lugar do site que fala sobre aquilo** — home, "Como funciona", onboarding, Termos,
   Privacidade, landing, copy de UI **e** a doc `.claude/`. Nunca deixar um ponto mudado e outro
   desatualizado: o app inteiro comunica **a mesma coisa, alinhada**. → §5 passo 6.
10. **Toda mudança que vai para produção é documentada.** Sempre: entrada no
   [`CHANGELOG.md`](CHANGELOG.md) **+** atualização dos documentos `.claude/` afetados. Decisão de
   mudar uma regra (mesmo contra a orientação) ou um marco → **também** no
   [`HISTORICO.md`](HISTORICO.md). → §5–6.
11. **Seja crítico.** Em cada alteração, verifique se algo fere as regras do projeto; se ferir,
   **confirme com o João** antes de seguir (não mude por conta própria). → §5 passos 1–2.
12. **Sinal de conformidade.** Toda resposta da IA neste repositório termina com **"Fui
   resultadista"** (ver o topo). Sem a frase, presuma que estas regras não foram seguidas.
13. **UI/UX impecável, claro e simples.** Qualquer alteração que toque na **UI ou UX** passa pela
   skill **`impeccable`**, pelas **10 heurísticas de Nielsen** e pelas melhores práticas de UI/UX.
   **Princípio reitor: clareza e simplicidade máximas** — qualquer pessoa, mesmo quem nunca ouviu
   falar do jogo, entende **rápido** o que fazer e o que está acontecendo; o que estiver complexo,
   simplifique (sem infantilizar). Vale para **design e texto**. → [`10`](10-UX-WRITING.md) (texto),
   [`02`](02-CODIGO.md) §4, [`DESIGN.md`](../DESIGN.md).
14. **Homologação local antes do deploy (checagem do João).** Toda mudança passa **primeiro** pela
   checagem do João em **homologação local**. Antes de `git push`/merge na `main` (que dispara o
   deploy em produção), a IA **abre a mudança rodando localmente** (`npm run dev` — idealmente com o
   snapshot real via `npm run homolog:pull`) e **espera o aval explícito do João**; **sobretudo em
   qualquer alteração de UI/UX**, que ele precisa **ver no navegador** antes de subir. Sem o OK do
   João, **não há push/merge na `main`**. → §5 passo 9, [`07`](07-BUILD-E-DEPLOY.md),
   [`08`](08-PROCESSO.md).

---

## 4. Antes de mexer em qualquer coisa (checklist de entrada)

1. Li este MESTRE e o(s) documento(s) da área que vou tocar.
2. Rodei [`09-PARALELISMO.md`](09-PARALELISMO.md): `git fetch`, conferi `git branch --show-current`
   e `git status` — sei se a `main` andou e se há trabalho não-commitado de outra sessão.
3. Entendi a **regra de negócio** envolvida (doc 06) — a mudança não fere nenhuma regra central
   (seção 3) sem decisão explícita.
4. Tenho um plano. Se a mudança é grande, planejei antes de executar (preferência do João).

---

## 5. 🔁 Protocolo de mudança (a ORDEM de toda mudança que sobe)

> **Toda mudança no site/app passa por esta ordem, a partir de agora.** Mudança não é "fazer e
> empurrar"; é **pensar, questionar contra as regras, e só então subir — atualizando tudo que ela
> toca.** O detalhamento operacional (comandos, validação, git) está em
> [`08-PROCESSO.md`](08-PROCESSO.md); aqui fica a ordem canônica.

**0. Entender o pedido.** O que o João quer de fato? Qual problema resolve? (Se ambíguo, perguntar.)

**1. Questionar com espírito crítico.** Seja crítico em **cada** alteração. A mudança faz sentido frente a:
   - as **regras de negócio** (doc 06) — ela respeita pontuação, desempate, "não é aposta", regras
     de grupo/pagamento/confronto?
   - a **arquitetura e o código** (docs 01, 02, 05) — cabe nos padrões? mexe em RLS/segurança?
   - os **processos e a identidade** (docs 07, 08, `DESIGN.md`) — é deployável com segurança? está
     on-brand?
   Se ela **conflita** com uma regra (central — seção 3 — ou de negócio), **pare e confirme com o
   João** — não suba por conta própria.

**2. Decidir / aprovar.** Se faz sentido, seguir. Se é alto impacto (mexe em pagamento, prod ao
   vivo, dado destrutivo, login), **confirmar com o João** antes. Trazer trade-offs. Se a mudança
   vai **contra uma regra do projeto** e o João decidir fazê-la mesmo assim, **registre a decisão e
   o motivo** no [`HISTORICO.md`](HISTORICO.md) e atualize as regras afetadas (esta doc + o documento
   da área).

**3. Planejar.** Liste os arquivos que vai tocar **e os documentos que a mudança afeta** (já nesta
   etapa — não deixe a doc pro fim e esqueça).

**4. Implementar** seguindo os padrões do doc 02, isolado conforme o doc 09 (worktree se houver
   sessão concorrente). Mudanças de banco = **migration aditiva** numerada corretamente (doc 05/09).

**5. Validar de verdade.** Typecheck/build + **testar o fluxo no navegador (Playwright)** + (se
   banco) `supabase db reset` local. Não confiar só em typecheck. (doc 08)

**6. Propagar para TODOS os pontos de contato (essencial).** Procure no site **todo lugar que fala
   sobre o que você mudou** e atualize **todos** — para o app inteiro comunicar a mesma coisa,
   alinhada. _Exemplo:_ mexeu na **pontuação** (cravada/saldo/acerto)? Ela aparece em vários lugares
   — "Como funciona", onboarding, landing, o card do jogo, e possivelmente Termos/Privacidade.
   Atualize **cada um**. Como achar: busque no código (ex.: `grep -rin "cravada\|saldo\|acerto" src`)
   e confira as telas em [`03-PAGINAS.md`](03-PAGINAS.md). **Nunca** deixe um ponto novo e outro
   velho.

**7. Atualizar a documentação `.claude/` afetada.** Para **cada** regra/comportamento alterado,
   atualize o(s) documento(s) correspondente(s) (01–09). Documentação desatualizada é pior que
   nenhuma.

**8. Registrar no CHANGELOG e versionar.** Entrada em [`CHANGELOG.md`](CHANGELOG.md) + **suba a
   versão** (ver seção 6) + `package.json`. Decisão de mudar uma regra ou marco grande → **também**
   uma nota em [`HISTORICO.md`](HISTORICO.md).

**9. Homologar com o João (gate antes do deploy).** Antes de subir, **abra a mudança rodando
   localmente** (`npm run dev`; quando fizer sentido, com dados reais via `npm run homolog:pull`) e
   **espere o aval explícito do João** — **sobretudo em qualquer alteração de UI/UX**, que ele
   precisa **ver no navegador**. Sem o OK do João, **não** se faz push/merge na `main`. (regra
   central 14)

**10. Subir com segurança.** Só então: push (conforme doc 09 — fast-forward sobre `origin/main`,
   só os **seus** arquivos). Push na `main` = **deploy em produção**: confirme os checks verdes
   (Supabase Preview, Vercel, Deploy Edge Functions).

> Regra de ouro: **se a mudança sobe, a coerência do site + a doc + o changelog sobem junto.** Um
> commit que muda comportamento sem atualizar **todos os pontos de contato** que falam daquilo, mais
> a doc afetada, está **incompleto**.

---

## 6. Versionamento e changelog

- O projeto está sendo versionado a partir de **2.0.0** (a reescrita React+Supabase, no ar hoje).
  O histórico anterior (site estático v1 e a evolução até aqui) está consolidado em
  [`HISTORICO.md`](HISTORICO.md).
- A partir de agora, **toda mudança que sobe ganha uma entrada no [`CHANGELOG.md`](CHANGELOG.md)** e
  um número de versão, no padrão **MAJOR.MINOR.PATCH**:
  - **PATCH** (2.0.x) — correção de bug, ajuste de copy, refino de UI, sem mudar regra de negócio.
  - **MINOR** (2.x.0) — recurso novo ou mudança de comportamento compatível (nova tela, novo modo,
    novo controle de admin).
  - **MAJOR** (x.0.0) — mudança estrutural/incompatível ou reescrita de um pilar.
- O número fonte de verdade fica no [`package.json`](../package.json) (`"version"`). Mantê-lo em
  sincronia com a entrada mais recente do CHANGELOG.
- Em caso de dúvida entre MINOR e PATCH, **mudou regra de negócio? → MINOR.**

---

## 7. Onde as coisas vivem (atalhos)

| Preciso de… | Vá para |
|---|---|
| Stack, pastas, integrações, deploy | [`01-ARQUITETURA.md`](01-ARQUITETURA.md) · [`07-BUILD-E-DEPLOY.md`](07-BUILD-E-DEPLOY.md) |
| Como escrever código aqui | [`02-CODIGO.md`](02-CODIGO.md) |
| Que telas existem e em que rota | [`03-PAGINAS.md`](03-PAGINAS.md) |
| Regras de admin | [`04-ADMIN.md`](04-ADMIN.md) |
| Tabelas, RLS, login/logout | [`05-DADOS-E-AUTH.md`](05-DADOS-E-AUTH.md) |
| Pontuação, grupo, pagamento, confronto, escudo | [`06-REGRAS-DE-NEGOCIO.md`](06-REGRAS-DE-NEGOCIO.md) |
| Subir uma mudança sem quebrar nada | [`08-PROCESSO.md`](08-PROCESSO.md) |
| Trabalhar junto com outro chat | [`09-PARALELISMO.md`](09-PARALELISMO.md) |
| Código-fonte do banco | [`supabase/migrations/`](../supabase/migrations/) · [`supabase/functions/`](../supabase/functions/) |
| Como o projeto evoluiu até aqui | [`HISTORICO.md`](HISTORICO.md) |

---

*Este arquivo é o contrato. Se algo nos outros documentos contradisser as regras centrais (seção 3)
sem uma decisão registrada, as regras centrais vencem — e a contradição deve ser corrigida.*
