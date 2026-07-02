# ResultaDS — como construir com este design system

App de **bolão de futebol** (Resultadismo): palpitar o placar final e pontuar. Estética
**calorosa e objetiva** (turquesa de marca), mobile-first, clara por padrão + dark completo.
Prioridade máxima: **clareza e simplicidade** — nada que dificulte o entendimento do usuário.

## Wrapping e tema

- Os componentes **não exigem provider** para renderizar: eles estilizam via **variáveis CSS**
  (tokens), não via contexto. Renderizam corretos no **tema claro por padrão**.
- **Dark mode**: defina `data-theme="dark"` num ancestral (ex.: `<html data-theme="dark">`).
  As semânticas (`--color-surface`, `--color-text`, escala `ink`) invertem sozinhas; os
  componentes não mudam. No app isso é gerido pelo `ThemeProvider`, mas para construir telas
  basta o atributo no root.
- Fonte da marca: **Ubuntu** (já embarcada via `styles.css`; family = `var(--font-sans)`).

## Idioma de estilo: Tailwind v4 com tokens próprios

Estilize com **classes utilitárias Tailwind**. As escalas de cor NÃO são as default do Tailwind —
use estas famílias (cada uma 50→950):

| Família | Uso | Exemplos de classe |
|---|---|---|
| `brand` (turquesa) | ação primária, links, seleção, foco | `bg-brand-600` `text-brand-700` `ring-brand-500` |
| `ink` (neutros) | texto e superfícies neutras | `text-ink-950` `text-ink-500` `bg-ink-100` |
| `gold` | pontuação **+3 (cravada)** | `bg-gold-500 text-gold-950` |
| `grass` | pontuação **+2 (saldo)** | `bg-grass-600 text-white` |
| `aqua` | pontuação **+1 (acerto)** | `bg-aqua-700 text-white` |
| `flame` | **perigo / ao vivo apenas** (nunca decorativo) | `bg-flame-600` `text-flame-600` |

Semânticas (trocam no dark, use SEMPRE estas em vez de cor crua):
`bg-background` (app) < `bg-surface` (cards) < `bg-surface-2` (nav/painéis); borda `border-border`
ou `ring-border`; texto `text-ink-950` / `text-ink-500` (muted).

Raios: `rounded-xs|sm|md|lg|xl|pill` (pill = totalmente arredondado, usado em botões/badges).
Sombras (tokens, via arbitrary value): `shadow-[var(--shadow-soft)]` (cards),
`shadow-[var(--shadow-pop)]` (sheets/menus), `shadow-[var(--shadow-brand)]` (CTA).
Números de placar/ranking: `tabular-nums`. Nunca `#000`/`#fff` crus para superfícies.

## Onde está a verdade

- Stylesheet do DS: **`styles.css`** (importa `_ds_bundle.css` + tokens) — leia antes de estilizar.
- Doc por componente: cada `<Name>.prompt.md` (props + exemplos).
- Filosofia visual completa: `DESIGN.md` do repo (cor OKLCH, motion, bans).
- Componentes disponíveis em `window.ResultaDS.*` (ex.: `Button`, `Card`, `CardHeader`,
  `Input`, `Select`, `Combobox`, `Badge`, `ScorePill`, `Avatar`, `Escudo`, `Modal`,
  `ConfirmDialog`, `ToastProvider`/`useToast`, `SegmentedControl`, `Switch`, `EmptyState`,
  `Skeleton`, `Spinner`, `Coachmark`, `SortControl`, `ScrollRow`, `CrestMask`, `CrestEditor`).

## Exemplo idiomático

```tsx
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, Button, ScorePill } from "resultadismo";

<Card>
  <CardHeader>
    <CardTitle>Brasileirão — Rodada 12</CardTitle>
    <CardDescription>Palpites abertos até sábado, 16h.</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="flex items-center gap-2">
      <span className="text-sm text-ink-700">Seu último acerto:</span>
      <ScorePill type="cravada" withLabel />
    </div>
  </CardContent>
  <CardFooter>
    <Button size="sm">Palpitar agora</Button>
  </CardFooter>
</Card>
```

Bans (além dos globais): sem side-stripe borders, sem gradient text, sem glassmorphism
decorativo, sem grids de cards idênticos, sem modal como primeira opção (prefira inline/sheet).
