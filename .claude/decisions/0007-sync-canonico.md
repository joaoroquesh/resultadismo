# ADR 0007 — Registro canônico no sync + alerta de times não-mapeados (Fase C)

**Status:** aceito · **Data:** 2026-06-09 · **PO:** João

## Contexto
APIs diferentes usam nomes/escudos diferentes. O PO definiu: o **registro de times**
(`data/teams-registry.json`) é a fonte da UI — o sync deve traduzir o que vier diferente, e times
fora da lista devem gerar um alerta com opção de importar.

## Decisão
1. `gen:teams` emite `supabase/functions/_shared/teams-canonical.json` (mapas `exact` por slug
   completo e `loose` por normName; **chaves ambíguas ficam fora do loose** pra nunca traduzir errado).
2. `sync-football` consulta o registro **antes** de `TEAM_PT`/`COUNTRY_EN_PT` (que viram fallback) e
   grava `teams.local_crest` com o escudo do repo quando o time é canônico.
3. Times sem match canônico são logados em `sync_unmapped` (RPC `log_unmapped_teams`, service_role;
   contador de avistamentos). **Admin → Dados** ganha a seção **"Times fora do registro"**:
   *Aceitar como veio* (status accepted, mantém nome/escudo da API) ou *Copiar JSON* (snippet pronto
   pro registro + `npm run gen:all`).

## Consequências
- O casamento de jogos (`normName` em `ingestSecondary`) segue como está — a tradução acontece na
  ENTRADA (upsert de teams/nomes), então os nomes já chegam padronizados dos dois lados.
- Competições não geram unmapped (o sync só puxa competições configuradas); alerta de competição
  continua sendo o fluxo de erro do sync no admin.
