# 09 — Paralelismo (vários chats/sessões no mesmo repo)

> **Quase sempre há outra sessão (de IA ou pessoa) editando este repositório ao mesmo tempo.** O
> João trabalha com **mais de um chat em paralelo**, cada um numa frente. Este documento é a regra
> anti-colisão: **leia antes de qualquer `git`.** As lições aqui foram pagas com incidentes reais
> (registrados em [`HISTORICO.md`](HISTORICO.md)).

## 0. Regra de ouro

> **Toque só nos SEUS arquivos. Antes de criar migration ou commitar, confira o que as outras
> sessões já fizeram. Nunca varra trabalho alheio.**

## 1. Sempre, antes de mexer

```bash
git fetch
git branch --show-current     # NÃO assuma que está na main
git status                    # há trabalho não-commitado (de outra sessão)?
git log --oneline -8          # a main andou? quem commitou o quê?
```

- O diretório principal **pode estar numa branch de outra sessão** (ex.: `feat/confrontos`). **Não
  commite/resete lá.**
- Se há arquivos modificados que **você não tocou**, são de outra sessão em andamento — **não
  encoste** neles, não os stageie.

## 2. Isolar a sua frente

Para qualquer mudança não-trivial quando há concorrência:

1. **Trabalhe em branch/worktree próprio**, criado a partir do **`origin/main` atual**:
   ```bash
   git fetch
   git worktree add -b minha-frente ../resultadismo-minha-frente origin/main
   ```
   - Symlink/copie `node_modules` e copie `.env.local` para o worktree.
   - O worktree não encosta na árvore principal (que pode ter trabalho não-commitado de outra sessão).
2. **Multi-frente** (vários assuntos independentes no mesmo pedido): **um agente/branch por frente**,
   em worktrees isolados. Passe a cada um a lista de **arquivos "não tocar"** + setup.
3. **Integre depois** num worktree próprio a partir do `main` atual, resolvendo conflitos **sem**
   mexer na árvore principal; entregue o branch integrado para o João mesclar quando quiser.

## 3. Migrations entre sessões — a armadilha nº 1

O Supabase controla migrations **por número de versão**. Se **duas sessões criam o mesmo número**, a
segunda é **PULADA em produção** (a regra dela simplesmente não é aplicada — bug silencioso, ex.: o
enum `'espn'` que não entrou).

**Regra:**
- `git fetch` **antes** de criar a migration.
- **Numere depois da maior migration existente** (forward-only) — confira o último número em
  `supabase/migrations/` e no que o prod já aplicou.
- Se sua migration colide com uma que outra sessão já mergeou, **renumere a sua** (do maior para o
  menor ao renomear arquivos, para não sobrescrever).
- Se o prod tem migrations **órfãs** de sessões anteriores e o deploy trava ("remote migration
  versions not found"), **reconcilie**: descubra qual número o prod já tem (dashboard de Migrations
  do Supabase, **só leitura**, navegador autenticado do João) e ajuste a sua numeração para casar.
- Combine **faixas de numeração** com as outras sessões quando der.

## 4. Commit cirúrgico

- **Stage explícito por arquivo.** **Nunca `git add -A`** — varre trabalho de outra sessão.
- Antes de commitar: `git diff --cached --name-only` — só os **seus** arquivos.
- Mensagem clara e escopada (`feat(confronto): …`, `fix(pagamento): …`, `docs: …`).

## 5. Push = deploy. Fast-forward sobre a main

- Antes do push: `git fetch`; se `origin/main` andou, **rebase/merge** a sua branch sobre ela
  (resolva conflitos no seu lado).
- Prefira **fast-forward direto** (`git push origin minha-frente:main`) quando a main não andou.
- Push na `main` **aplica migrations em produção** e sobe Vercel + functions → confira os checks
  verdes. → [`07`](07-BUILD-E-DEPLOY.md).
- **Alto impacto** (pagamento, destrutivo, login) → confirmar com o João **antes**. → [`08`](08-PROCESSO.md).

## 6. Nunca faça

- ❌ `git add -A` / `git commit -am` com trabalho alheio na árvore.
- ❌ `git reset --hard` no diretório principal sem conferir a branch (já moveu uma branch de outra
  sessão por engano — recuperado via `reflog`; ver [`HISTORICO.md`](HISTORICO.md)).
- ❌ `git checkout`/`switch` que descarte mudanças não-commitadas que não são suas.
- ❌ Criar migration com número já usado por outra sessão.
- ❌ **Subir a versão** (`package.json` / header do CHANGELOG) por conta própria — só em **release
  deliberado** (1 dono); sessões apenas **acumulam em `[Não lançado]`** (ADR 0003 / [`MESTRE.md`](MESTRE.md) §6).
- ❌ `supabase db push`/`link` (CLI desta máquina aponta para outro projeto). → [`07`](07-BUILD-E-DEPLOY.md) §4.

## 7. Coordenação por área (quem mexe onde)

Antes de mexer fundo numa área quente, verifique se outra sessão já está nela — **domínios que
colidem com frequência**:

| Área | Arquivos quentes | Risco |
|---|---|---|
| Grupos/ligas | `leagues` (DB + `features/leagues` + `database.ts`) | Alto — pagamento, confronto e moderação mexem todos aqui |
| Pagamento | `app_settings`, `league_payments`, `features/payments`, functions MP | Alto — dinheiro ao vivo |
| Confronto | `cup_ties`, `league_competitions`, `features/confronto` | Alto — muitas migrations |
| Admin | `features/admin`, RPCs `admin_*` | Médio |
| Tipos do banco | `src/types/database.ts` (gerado) | Conflito garantido se duas sessões regeneram |

**Como coordenar:** isole em worktree, toque o mínimo no arquivo compartilhado (ex.: o padrão
`LooseClient` em `features/payments/api.ts` evita mexer no `database.ts`), e deixe footprint pequeno
em arquivos muito disputados (ex.: +N linhas isoladas no `LigaDetailPage`, não refator grande).

## 8. Se algo der errado

- Branch movida/commit perdido → **`git reflog`** quase sempre recupera (achou os 4 commits da
  `feat/confrontos` num incidente). Não entre em pânico, não force mais nada antes de olhar o reflog.
- Deploy travado por migration → reconcilie a numeração com o prod (§3) **antes** de tentar de novo.
- Na dúvida sobre estado da `main`/prod → `git fetch` + checks do GitHub + (leitura) dashboard do
  Supabase. **Não** rode comando destrutivo para "descobrir".
