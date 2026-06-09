# 12 — DESIGN (identidade visual + sistema de destaque)

> Doc viva. Regras de UI/UX do Resultadismo. Complementa o MESTRE §3 regra 13
> ("UI/UX impecável, claro e simples") e a skill `impeccable` + heurísticas de Nielsen.

## Princípio
**Máxima clareza e simplicidade.** O leigo entende rápido. Vale pro design e pro texto
(ver também `10-UX-WRITING.md`).

## 🚫 Regra de destaque — proibido "tom lavado"
**NÃO usar um tom mais claro da MESMA cor do ícone/texto como fundo de destaque**
(ex.: `bg-brand-500/10`, `bg-flame-500/12`, `bg-aqua-500/12`, `bg-brand-500/15 text-brand-700`).
Esse padrão **não faz parte da identidade do Resultadismo** — foi introduzido por engano e
deve ser **substituído e evitado** em telas novas/tocadas.

### ✅ Como destacar (alinhado à identidade)
| Intenção | Use | Não use |
|---|---|---|
| **Item selecionado / ativo** | superfície neutra + **contorno sólido** `ring-2 ring-brand-600` + check sólido; ou preenchimento **sólido** `bg-brand-600 text-white` em chips/CTAs | `bg-brand-500/10` |
| **Chip de ícone** (círculos de cabeçalho) | círculo neutro `bg-surface-2`/`bg-ink-100` com o ícone na cor **sólida**; ou chip sólido da marca com ícone branco | `bg-flame-500/12 text-flame-600` |
| **Badge / contador** | pílula **sólida** `bg-brand-600 text-white` (ou `bg-ink-900 text-white`) | `bg-brand-500/15 text-brand-700` |
| **Ênfase especial / raridade** | **dourado sólido** (`gold`) + elevação `shadow-brand` + contorno | tom lavado dourado |
| **Hover / foco** | `hover:bg-ink-50` + `ring`/`border` sólidos | tint colorido translúcido |

**Resumo:** destaque = **sólido (marca/dourado) + contorno + elevação**, sobre **superfícies neutras**
(`surface`, `surface-2`, `ink-50/100`). Cor translúcida da própria cor, nunca.

## Tokens de cor (de `src/index.css`)
`brand` (turquesa, hue ~182) · `gold` (dourado) · `flame`/`grass`/`aqua` (acentos) ·
`ink` (neutros) · `surface`/`surface-2`/`background`. Elevação: `shadow-brand`.

## Migração
**Concluída (2026-06-09):** varredura completa — 92 substituições (54 com alpha `bg-cor/NN` +
38 sólidas `bg-cor-50/100`), incluindo o primitivo `Badge` (variantes agora sólidas). Restam 0
ocorrências em código de produto (DevPanel, dev-only, fora do escopo). **Não introduzir novas.**
