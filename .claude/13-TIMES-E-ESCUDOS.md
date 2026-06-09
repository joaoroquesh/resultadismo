# 13 — TIMES E ESCUDOS (editar à mão)

> Fonte ÚNICA e editável dos times do Resultadismo. Sem UI de admin — você edita
> arquivo + roda um comando. Feito pra fazer 1 ou muitos (inclusive em lote com IA).

## A fonte de verdade
**`data/teams-registry.json`** — uma entrada por time:
```json
{
  "slug": "flamengo",            // chave única; minúsculo, sem acento (= nome do PNG)
  "name_pt": "Flamengo",         // nome oficial exibido
  "short_pt": "Flamengo",        // nome curto (listas apertadas)
  "tla": "FLA",                  // sigla 3 letras (ou null)
  "country": "Brasil",
  "kind": "club",                // "club" ou "national"
  "competitions": ["bra.1", "conmebol.libertadores"],  // provider_codes
  "aliases": ["Flamengo", "CR Flamengo"]               // TODAS as grafias (PT/EN/APIs)
}
```
> Os `aliases` casam o escudo e (futuro, Fase C) traduzem o que as APIs mandam diferente.

## Trocar / adicionar UM escudo
1. Salve o arquivo em **`public/teams/<slug>.png`** (ou `.svg`). Slug = minúsculo, sem acento,
   só `a-z0-9` (ex.: "Atlético-MG" → `atleticomg.png`).
2. Rode **`npm run gen:all`**.
   - Regenera `src/lib/teamCrests.ts` (manifesto) e `data/teams-catalog.json` (+ a cópia em
     `src/data/`, automática — não precisa copiar nada à mão).
3. Commit + push → Vercel serve em `/teams/<arquivo>` (CDN, custo zero).

## Adicionar / corrigir UM time ou alias
1. Edite **`data/teams-registry.json`** (adicione a entrada, ou ajuste nome/aliases/competições).
2. **`npm run gen:teams`** (ou `gen:all` se também mexeu em escudo).
3. O relatório mostra **times sem escudo** e **sem alias** — confira.

## Em lote (muitos de uma vez)
Edite várias entradas no `data/teams-registry.json` (é só JSON), solte os PNGs em
`public/teams/`, rode **`npm run gen:all`**, confira o relatório, commit.

## Comandos
- `npm run gen:crests` → só o manifesto de escudos (a partir de `public/teams/`).
- `npm run gen:teams` → catálogo a partir do registro (escreve `data/` **e** `src/data/`).
- `npm run gen:all` → os dois, na ordem.

## Regras
- **Nunca** edite `src/lib/teamCrests.ts` nem `data/teams-catalog.json` à mão (são gerados).
- O app importa `@/data/teams-catalog.json` (= `src/data/`); o gerador mantém as duas cópias iguais.
- Arquivos dup/typo em `public/teams/` não viram time (sem entrada no registro) — remova-os.
