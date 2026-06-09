# ADR 0007 — Temporada da Copa: só a Copa do Mundo em grupos (travada)

> **Status:** Aprovada e implementada (2026-06-09). Decisão do João (PO).
> **Regras vivas:** [`06-REGRAS-DE-NEGOCIO.md`](../06-REGRAS-DE-NEGOCIO.md) §4 ·
> migration `20260609000010` · [`02-CODIGO.md`](../02-CODIGO.md) §7 (anti-`<select>`).

## Contexto

Com o lançamento da Copa (v2.0), o catálogo tinha vários campeonatos publicados (Brasileirão A/B/C,
Bundesliga, estaduais etc.) e o seletor de competição do grupo oferecia todos. O foco do produto na
temporada é **um só**: o bolão da Copa do Mundo 2026. Oferecer mais opções agora dispersa, confunde
o usuário novo e multiplica superfícies de teste sem valor imediato.

## Decisão

1. **Só a Copa do Mundo pode ser competição de grupo**, e ela é **obrigatória e travada**: todo
   grupo nasce com a Copa em modo Pontos e não dá para removê-la nem trocá-la.
2. **Enforçado no banco** (defesa real, front só espelha): flag `competitions.group_eligible`
   (hoje só a Copa = true) + trigger de INSERT (recusa competição não-elegível em
   `league_competitions`) + trigger de DELETE (protege o **bolão** base; disputas de Confronto,
   modes `liga`/`cup`, continuam removíveis).
3. **Amistosos Internacionais**: seguem publicados (qualquer um palpita na aba Jogos), mas **não
   entram em grupo**.
4. **Demais campeonatos: despublicados** (rascunho; nada apagado). A personalização **continua
   listando-os de propósito** (seguir para o futuro); o feed mostra só o publicado.
5. **Front**: criação de grupo com a competição **fixa** (campo travado + copy "é a temporada da
   Copa; depois vêm outros campeonatos"); aba Competições sem remover no bolão e com o seletor
   restrito ao elegível.
6. **Regra de design system** (pedido do PO na mesma decisão): **nunca `<select>` nativo** — erro
   de lint; sempre `<Select>`/`<Combobox>` do design system.

## Alternativas consideradas

| Alternativa | Veredito |
|---|---|
| Só esconder no front (sem trava no banco) | **Recusada:** burlável via API; segurança é no banco (regra central 4). |
| Apagar os outros campeonatos | **Recusada:** despublicar é reversível e preserva dados/sync. |
| Permitir remover a Copa do grupo | **Recusada pelo PO:** todo grupo joga a Copa; é a identidade da temporada. |

## Consequências

- Liberar um campeonato para grupos no futuro = `group_eligible = true` + republicar (1 update).
- Grupos com Confronto continuam funcionando (as disputas usam a Copa como competição).
- Reversível sem perda: nenhum dado é apagado.
