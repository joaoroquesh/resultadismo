# Escudos (perfil)

As formas dos **escudos de perfil** ficam aqui. O catálogo é montado
automaticamente (via `import.meta.glob` em `src/lib/crest.ts`) — não há lista
fixa no código.

## Como adicionar / remover / trocar

- Largue um SVG nomeado `escudo-<id>.svg` (ex.: `escudo-16.svg`). Ele aparece
  no editor no próximo build/reload do dev.
- Para remover, apague o arquivo. Quem já tinha escolhido essa forma cai no
  escudo padrão automaticamente.
- O `<id>` (o que vem depois de `escudo-`) é salvo no perfil. **Não renomeie**
  arquivos já em uso, senão o escudo de quem escolheu muda.

## Regras do SVG

- `viewBox="0 0 100 100"`, a forma preenchendo bem o quadro.
- Usado como **máscara** (mask-image), então a cor do traço não importa, só a
  silhueta (área pintada = aparece; transparente = recorta).
- `escudo-padrao.svg` é o default de todo mundo (recorte da logo). Mantenha-o.
