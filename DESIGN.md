# Resultadismo — Design System

Mobile-first, claro por padrão + modo escuro completo. Register: product (familiaridade ganha; a ferramenta some na tarefa). Estética calorosa/animada (Nubank/Apple), não fria (Sofascore).

## Color (OKLCH)

Estratégia: **Restrained++** — neutros tintados de turquesa + turquesa como ação primária/seleção + o sistema de pontuação (dourado/verde/ciano) como cor semântica vívida e celebratória (não decorativa). Nunca `#000`/`#fff`.

- **brand** (turquesa): primária, links, seleção, foco. base ≈ `oklch(0.66 0.12 182)`.
- **gold** (cravada/+3): `oklch(0.82 0.16 92)` — texto escuro.
- **grass** (saldo/+2): `oklch(0.62 0.16 142)`.
- **aqua** (acerto/+1): `oklch(0.62 0.11 210)`.
- **flame** (perigo/ao vivo): `oklch(0.62 0.21 25)` — usar só p/ live e destrutivo, nunca decorativo.
- **ink** (neutros): tintados de turquesa (chroma ~0.01, hue 200). Light: surface clara, texto escuro. Dark: surface `oklch(0.22 0.012 220)`, texto claro.

Tema via `[data-theme="dark"]` sobrescrevendo as variáveis semânticas (`--color-background`, `--color-surface`, `--color-surface-2`, `--color-border`, `--color-text`, `--color-text-muted`). Componentes usam só as semânticas, nunca cor crua.

Camadas: `background` (app) < `surface` (cards) < `surface-2` (nav/painéis, levemente diferente).

## Typography
- Família única: **Inter** (variable) com fallback system-ui. Sem display/body pairing.
- Escala **fixa** (rem), ratio ~1.2: 12 / 13 / 14 / 16 / 18 / 22 / 28 / 34. Sem clamp fluido em produto.
- Pesos: 400 / 500 / 600 / 700. Hierarquia por peso+escala. Números: `tabular-nums` em placares e classificação.
- Prosa 65–75ch; dados podem ser densos.

## Elevation
- `shadow-soft` (cards), `shadow-pop` (sheets/menus), `shadow-brand` (CTA). Sombras sutis, tintadas. No escuro, elevação por surface mais clara + ring, sombra mínima.
- Raios: xs 8 / sm 10 / md 14 / lg 20 / pill 999.

## Motion
- 150–250ms, ease-out (quart/expo). Transmite estado (save, lock, pontuação, subida no ranking), nunca decoração. Sem bounce.
- Respeitar `prefers-reduced-motion`.

## Components (todos com default/hover/focus/active/disabled/loading/error)
Button, Input, Card, Badge, Avatar (gerado), ScorePill, MatchCard, SegmentedControl, Sheet/Drawer, Toast, Skeleton, EmptyState, Countdown, ThemeToggle, Stat. Skeletons no loading (não spinner no meio do conteúdo). Empty states que ensinam.

## Bans (além dos globais)
Sem side-stripe borders, sem gradient text, sem glassmorphism decorativo, sem hero-metric template, sem grids de cards idênticos, sem modal como primeira opção (preferir inline/sheet).
