# Flâmulas (federação)

As formas das **flâmulas de federação** ficam aqui. O catálogo é montado
automaticamente (via `import.meta.glob` em `src/lib/crest.ts`).

## Como adicionar / remover / trocar

- Largue um SVG nomeado `flamula-<id>.svg` (ex.: `flamula-4.svg`). Aparece no
  editor da federação no próximo build/reload.
- Para remover, apague o arquivo. Federações que usavam caem na 1ª flâmula.
- O `<id>` é salvo na federação. **Não renomeie** arquivos já em uso.

## Regras do SVG

- `viewBox="0 0 100 100"`, a forma preenchendo a largura.
- Usado como **máscara** (mask-image): só a silhueta importa, não a cor.
- Federações não têm letra; é só a flâmula recortando as cores
  (sólido / listras / grade / bola).
