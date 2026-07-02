# Design-sync — notas do repo (Resultadismo → claude.ai/design)

Este repo é um **app** (Vite + React 19 SPA), não uma biblioteca. O DS vive em
`src/components/ui/*` + `ScorePill`, com Tailwind v4 e tokens OKLCH em `src/index.css`.
Shape = **package**, modo **synth-entry** via barrel. 22 componentes sincronizados.

## Como este build funciona (peças não óbvias)

- **Barrel `--entry`**: `.design-sync/entry.ts` reexporta os componentes. É passado como
  `--entry` porque o conversor deriva o `PKG_DIR` subindo do entry até o `package.json` com
  nome — sem `--entry`, ele procuraria `node_modules/resultadismo` (inexistente num app) e
  quebra. Comando:
  ```
  node .ds-sync/package-build.mjs --config .design-sync/config.json \
    --node-modules ./node_modules --entry .design-sync/entry.ts --out ./ds-bundle
  ```
- **CSS = Tailwind compilado**: `cfg.cssEntry` aponta para `.design-sync/compiled-tailwind.css`,
  que é uma CÓPIA de `dist/assets/index-*.css` (a hash muda a cada build). **No re-sync:
  rode `npm run build` e depois `cp dist/assets/index-*.css .design-sync/compiled-tailwind.css`
  ANTES do conversor.** O source `src/index.css` (com `@import "tailwindcss"` + `@theme`) NÃO
  serve — o esbuild não compila Tailwind.
- **tsconfig dedicado** `.design-sync/tsconfig.paths.json` (não o `tsconfig.app.json`): os globs
  `include`/`exclude` com `/**/_*` do app quebram o comment-stripper do `tsconfigPathsPlugin`
  (lê `/* … */` como comentário e apaga `paths`). O dedicado só tem o alias `@/`.
- **Shim de crest**: `src/lib/crest.ts` usa `import.meta.glob` (macro só do Vite) no topo →
  vira `undefined` no esbuild e **mata o bundle inteiro** (TypeError na carga do IIFE). O
  alias `@/lib/crest` é redirecionado (no tsconfig.paths.json) para `.design-sync/shims/crest.ts`,
  gerado por `node .design-sync/shims/gen-crest-shim.mjs` (troca os globs por imports estáticos
  dos 20 SVGs em `src/assets/{escudos,grupos}`; esbuild inlina como data-URL). **Regenere o shim
  se os SVGs mudarem.**
- **Overlays** (Modal, ConfirmDialog): os previews envolvem o componente num wrapper com
  `transform: translateZ(0)` — isso torna o wrapper o bloco de contenção do `position:fixed`,
  então overlay + diálogo renderizam DENTRO do card (senão o topo do diálogo escapa do frame).
  `cfg.overrides` fixa `cardMode:single` + viewport largo (≥640 → layout centralizado do `sm:`).

## Previews só usam classes já existentes no app

O Tailwind v4 do app **NÃO escaneia** `.design-sync/previews/` — classes só-de-preview não
entram no CSS compilado. Por isso os previews usam **inline-style para layout** e só classes
que o app já usa (ex.: `Skeleton` é dimensionado por wrapper inline + `h-full w-full`, não por
`w-3/5`). Se precisar de classe nova num preview, ou use inline-style, ou adicione a fonte ao
Tailwind (`@source`) — mas isso mexe em `src/index.css` (app, exige OK do PO).

## Fontes

Marca = **Ubuntu** self-hosted (`public/fonts/ubuntu-latin-*.woff2`), NÃO Inter (o `DESIGN.md`
está desatualizado nesse ponto — diz "Inter"). `cfg.extraFonts` copia os 6 woff2; o `@font-face`
já vem no CSS compilado e as urls são reescritas para `fonts/`.

## Upload (pendente)

Este ambiente **não tem login interativo** (`/design-login` indisponível), então o upload para o
claude.ai/design NÃO foi feito. O `ds-bundle/` está pronto e validado. Para subir: rodar
`/design-sync` num terminal `claude` interativo (cria o projeto + envia), ou usar a própria
ferramenta com o `ds-bundle/`. Nenhum `projectId` foi gravado ainda (nada foi criado).

## Riscos de re-sync (watch-list)

- `compiled-tailwind.css` é gitignored e regenerado do `dist` — a hash muda; sempre recopie.
- O shim de crest e o barrel são espelhos manuais do app: se `src/lib/crest.ts` mudar de API,
  ou surgirem/sumirem componentes em `src/components/ui/`, atualize `entry.ts`, o
  `componentSrcMap` e regenere o shim.
- Previews de estados interativos (Select/Combobox abertos, hover) são mostrados FECHADOS de
  propósito (não renderizam estáticos). ToastProvider dispara toasts na montagem (timing do
  capture).
- Cores/formas de crest nos previews usam chaves válidas de `AVATAR_COLORS`
  (turquesa, verde, azul, dourado, laranja, vermelho, roxo, grafite, gelo) e shapes
  escudo `padrao/1..16`, flâmula `1..3`. Se a paleta/pasta mudar, revise os previews.

## Known render warns

- Nenhum warn pendente no último validate (22/22 renderizam limpo).
