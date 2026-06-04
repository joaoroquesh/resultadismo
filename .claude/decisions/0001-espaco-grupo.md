# ADR 0001 — Nome do espaço dos grupos de amigos: "Federação" → "Grupo"

> **Status:** ✅ Aprovada (2026-06-04, decisão do João) · **a implementar no código.**
> Até a troca subir nas telas, a UI **ainda diz "Federação"** — coerência (regra central 9 do
> [`MESTRE.md`](../MESTRE.md)). Este é o registro do estudo e da decisão.

## Contexto

O Resultadismo tem um **espaço privado de um grupo de amigos** que guarda **várias competições** ao
longo do tempo: **Bolão** (pontos corridos), **Liga** e **Copa** (modos de confronto entre membros).
Esse espaço já se chamou "Liga/Grupo" e virou **"Federação"** no rebrand anterior.

**Problema:** "Federação" é **institucional e abstrata** (CBF, FPF — órgão que governa clubes) e
**não é auto-explicativa**: precisa ser explicada. Isso colide com o **princípio reitor** recém-
cravado — **clareza e simplicidade máximas pro leigo** (regra central 13 /
[`10-UX-WRITING.md`](../10-UX-WRITING.md) §0). *Um termo que precisa ser explicado já é um alerta.*

As **duas palavras mais naturais** pro brasileiro para esse espaço **já são modos** aqui:
- **Liga** — é como o **Cartola FC** (referência no Brasil) chama o grupo de amigos, com tipos
  pública/privada/moderada (igual ao nosso modelo). Mas "Liga" é um **modo de confronto** aqui.
- **Bolão** — é como os apps de bolão chamam o container ("crie seu bolão"). Mas "Bolão" é o **modo
  de pontos** aqui.

Ou seja: o usuário **espera** "Liga"/"Bolão" e recebe "Federação".

## Decisão

Renomear o espaço de **Federação → "Grupo"** na **UI e nas rotas**. "Grupo" é o termo **mais claro e
universal disponível**, encaixa limpo na hierarquia — *"no seu **Grupo**, rode um **Bolão**, uma
**Liga** ou uma **Copa**"* — e **não rouba** a identidade de futebol (os **modos** já a carregam). O
calor da marca fica no copy ("monte seu grupo, chama a galera e batam o bolão"), não no rótulo.

- **Banco NÃO muda:** `leagues`/`league_competitions` permanecem (rename de tabela é caro; decisão
  mantida do rebrand anterior). É troca de **rótulo + rotas**.

## Alternativas consideradas

| Opção | Veredito |
|---|---|
| **Grupo** | ✅ **Escolhida** — clareza máxima, sem colisão, encaixa na hierarquia. |
| **Turma** | Vice — tão clara, mais calorosa ("sua turma"). Boa se quiser mais marca. |
| **Manter Federação** | Metáfora boa e escalável, mas **custo de clareza** (contra o princípio). |
| Liga / Bolão | ❌ já são **modos** (colisão). |
| Clube / Time | ❌ confunde com times reais. |
| Arena / Vestiário / Resenha / Confederação | ❌ exigem explicação (ferem a clareza). |

## Consequências

- ✅ Clareza imediata pro leigo; alinha com o princípio reitor.
- ⚖️ Perde a metáfora institucional e o gancho "confrontos entre federações" — **mitigado:** a visão
  futura vira **"confronto entre grupos"** / **"campeões de cada grupo se enfrentam"** / **"Copa dos
  grupos"**, que é até mais claro. O nome "Federação" **não era requisito** dessa feature.
- 🔁 Reversível (é rótulo, não schema).

## Plano de implementação (a fazer — tudo num conjunto coerente)

Regra central 9 — propagar em **TODOS os pontos de contato** de uma vez:
1. **Rotas:** `/federacoes` → `/grupos` (+ redirects de `/federacoes/*` **e** dos antigos `/ligas/*`).
2. **Copy de UI:** nav, criar/detalhe, admin, "Como funciona", onboarding, landing, Termos,
   Privacidade, push, estados vazios — "federação" → "grupo" (minúsculo em texto corrido).
3. **Docs:** virar `06` §4, o glossário do `10` e as menções no MESTRE; mover esta ADR para
   "Implementada" + entrada no CHANGELOG com versão.
4. **NÃO tocar** nos identificadores de banco/código (`league*`).

## Referências (precedente de mercado)

- Cartola FC usa **"Liga"** para o grupo de amigos:
  [Ligas Cartola](https://dicasdarodada.com/ligas-cartola/) ·
  [TechTudo](https://www.techtudo.com.br/dicas-e-tutoriais/2018/04/cartola-fc-2018-como-criar-ligas-para-jogar-com-amigos.ghtml).
- Apps de bolão usam **"bolão"/"grupo"** para o container:
  [Bolão Copa 2026](https://play.google.com/store/apps/details?id=com.bolaocopa.bolao_copa_2026&hl=pt_BR) ·
  [dacopa](https://www.dacopa.com/) ·
  [Canaltech](https://canaltech.com.br/apps/melhores-sites-e-apps-para-organizar-o-bolao-da-copa/).
