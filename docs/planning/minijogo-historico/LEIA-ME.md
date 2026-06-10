# Mini-jogo de placares históricos — pasta de planejamento

> Status: **Portão A CUMPRIDO** (09/06/2026) — comentários do João processados em
> [`decisoes-fechadas.md`](decisoes-fechadas.md) (a especificação vigente). **Fase 1 (dados) em
> andamento.** Comentários de convidados que chegarem depois: avaliar contra as decisões fechadas.

## Arquivos

| Arquivo | O que é |
|---|---|
| [`plano-v1.html`](plano-v1.html) | O plano completo, **comentável** — abrir no navegador. Decisões D1–D17 + perguntas Q1–Q5, cada uma com botões ✅/✏️/❌ e campo de comentário (salvos em localStorage). |
| [`comentarios-plano-v1.md`](comentarios-plano-v1.md) | Comentários do João (09/06/2026): 10 ✅ diretos, 6 ✏️ com instrução, "vamos seguir!". |
| [`decisoes-fechadas.md`](decisoes-fechadas.md) | **A especificação vigente** — consolidação plano + comentários, com respostas a D17/Q4 e a matriz de modos. Implementar a partir daqui. |

**Versão pública (para validar e mandar para terceiros):**
`https://www.resultadismo.com/planos/minijogo-historico-v1.html` — cópia idêntica servida de
`public/planos/` (com `noindex`, fora do precache do PWA via `globIgnores` no `vite.config.ts`).
⚠️ Se o plano mudar, **atualizar as duas cópias** (`docs/planning/...` e `public/planos/...`).
Comentários de convidados chegam por WhatsApp (botão Copiar/Baixar do próprio plano).

## Fluxo (para o João)

1. Abrir `plano-v1.html` no navegador.
2. Marcar ✅ Aprovo / ✏️ Ajustar / ❌ Recuso em cada decisão; comentar à vontade.
3. Clicar **"Baixar comentários (.md)"** na barra inferior e salvar o arquivo **nesta pasta** como
   `comentarios-plano-v1.md` (ou usar "Copiar" e colar direto no chat).
4. Avisar a IA: "li o plano, comentários na pasta".

## Fluxo (para a próxima sessão de IA)

1. Ler `.claude/MESTRE.md` (sempre) e este LEIA-ME.
2. Ler `comentarios-plano-v1.md` (se existir) e cruzar com `plano-v1.html`.
3. Decisões ✏️/❌ → produzir `plano-v2.html` (mesmo formato comentável) com os ajustes.
   Tudo ✅ → Portão A cumprido: iniciar a Fase 1 (dados) descrita no plano §9.
4. A pesquisa que embasou o plano (8 agentes: código, 7a0.com.br, fontes de dados 1930–2022,
   infra Supabase/Vercel/LGPD, naming, game design) está resumida dentro do próprio plano.
   Screenshots da análise do 7a0 estão em [`referencia-7a0/`](referencia-7a0/) (11 telas do fluxo completo).
