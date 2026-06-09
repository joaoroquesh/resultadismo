# 02 — Regras de código

> Como escrever código **neste** projeto: convenções, padrões e armadilhas já mapeadas. A regra
> mestra é **escrever código que pareça com o código que já existe** — imite os padrões abaixo
> antes de inventar. Para arquitetura → [`01`](01-ARQUITETURA.md); para banco → [`05`](05-DADOS-E-AUTH.md).

## 1. Princípios

1. **Imite o vizinho.** Densidade de comentários, nomes, idioma e idioma de UI seguem o arquivo ao
   redor. Não introduza um estilo novo numa feature que já tem o seu.
2. **TypeScript estrito.** `strict: true`. Sem `any` solto; sem `// @ts-ignore` sem justificativa.
   Os tipos do banco vêm de `src/types/database.ts` (gerado) — use-os via `src/lib/types.ts`.
3. **A fonte de verdade da regra é o banco.** Validação/segurança vive em RLS/RPC. O front
   **espelha** (UX), nunca decide acesso nem recalcula pontuação. → [`05`](05-DADOS-E-AUTH.md).
4. **Mobile-first, desktop de verdade.** Layout responsivo real, não um celular centralizado.
5. **Acessível e on-brand.** Use os componentes de `components/ui` e os tokens do Design System
   (nunca cor crua). Respeite `prefers-reduced-motion`. → [`DESIGN.md`](../DESIGN.md).
6. **Idioma:** UI e textos para o usuário em **português** (coloquial, leve). Código (nomes de
   variáveis/funções) em português ou inglês conforme o arquivo vizinho — seja consistente.

## 2. Convenções de TypeScript / React

- **Componentes**: função nomeada exportada (`export function MinhaPage() {…}`), arquivos `.tsx`.
  Páginas em `PascalCasePage.tsx` dentro da feature.
- **Hooks de dados**: `useAlgo()` em `features/<dom>/api.ts`. Um arquivo `api.ts` por feature.
- **Imports**: use o alias **`@/`** para `src/` (ex.: `import { Button } from "@/components/ui/Button"`).
- **Tipos**: importe de `@/lib/types` (aliases) em vez de cavar em `database.ts`. Para casts
  contidos que evitam mexer no `database.ts` gerado, siga o padrão `LooseClient` já usado em
  `features/payments/api.ts`.
- **Sem classes**; componentes funcionais + hooks. Sem libs de estado global além do que já existe
  (Context para auth/tema/toast/login-modal; TanStack Query para dados de servidor).

## 3. Dados: TanStack Query

Padrão de **query** (copie deste molde):

```ts
export function useMyLeagues() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["my-leagues", user?.id],
    queryFn: async (): Promise<League[]> => {
      const { data, error } = await supabase.from("leagues").select("*")…;
      if (error) throw error;          // SEMPRE relançar o erro
      return data ?? [];
    },
  });
}
```

Padrão de **mutation**:

```ts
export function useCreateLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input) => { /* supabase insert/rpc; throw em erro */ },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-leagues"] }),
  });
}
```

Regras:
- **`queryKey` estável e descritiva**, incluindo dependências (`user?.id`, `competitionId`…).
- **Invalide** as queries afetadas no `onSuccess`. Não force `refetch` manual sem motivo.
- **Erros**: `if (error) throw error`. Atenção: **`PostgrestError` não é `Error`** — para o toast
  mostrar a mensagem real, relance `new Error(error.message)` (senão vira "Erro." genérico).
- **Args opcionais de RPC tipada**: passe `?? undefined` (não `?? null`) para casar com o tipo
  gerado.
- **`rpc`**: use `supabase.rpc(...)` direto ou o helper `rpcCall` de `lib/rpc.ts`; não desestruture
  `supabase.rpc` numa variável solta (perde o binding).

## 4. Design System (sempre use, não recrie)

> **🎨 UI/UX impecável (obrigatório — regra central 13 do [`MESTRE.md`](MESTRE.md)).** Qualquer
> alteração que toque na **interface (UI) ou na experiência (UX)** passa pela skill **`impeccable`**
> (crítica + polish), pelas **melhores práticas de UI/UX** e pelas **10 heurísticas de Nielsen**
> (visibilidade do estado, linguagem do mundo real, controle/liberdade, consistência, prevenção de
> erro, reconhecer > lembrar, flexibilidade, estético/minimalista, recuperação de erro, ajuda). Não
> entregue UI sem essa passada. → [`DESIGN.md`](../DESIGN.md).

- Componentes em `src/components/ui/`: `Button`, `Card`, `Input`, `Badge`, `Avatar`, `Modal`,
  `ConfirmDialog`, `SegmentedControl`, `Skeleton`, `EmptyState`, `Toast`, `Spinner`, `Coachmark`,
  `CrestEditor`, `CrestMask`, `Escudo`. Layout em `src/components/layout/`. → [`03`](03-PAGINAS.md).
- **Cores**: só variáveis semânticas do tema (`--color-background`, `--color-surface`,
  `--color-text`, `brand`, `gold`/`grass`/`aqua` para pontuação, `flame` só para live/destrutivo).
  **Nunca `#000`/`#fff`** nem cor crua hex no componente.
- **Pontuação tem cor própria**: cravada=dourado, saldo=verde, acerto=ciano. Use os tokens.
- **Tema**: claro por padrão + dark completo via `[data-theme="dark"]`. Componentes leem só as
  semânticas — então funcionam nos dois temas de graça.
- **Loading**: Skeleton (não spinner no meio do conteúdo). **Vazio**: `EmptyState` que ensina.
- **Confirmação destrutiva/sensível**: `ConfirmDialog` (2 passos), não `window.confirm`.
- **Bans** (além dos globais do DESIGN.md): sem side-stripe borders, sem gradient text, sem
  glassmorphism decorativo, sem grids de cards idênticos, modal não é a primeira opção (preferir
  inline/sheet).

## 5. Armadilhas já conhecidas (não repita)

| Armadilha | Regra |
|---|---|
| `<button>` sem `type` dentro de `<form>` dispara **submit** | O `Button` base já assume `type="button"`. Botões de envio reais declaram `type="submit"`. |
| `PostgrestError` engolido como "Erro." | Relance `new Error(error.message)` para o toast. |
| Vite **não enumera `public/`** | Assets que precisam de `import.meta.glob` (ex.: escudos) ficam em `src/assets/`. |
| Renomear `escudo-<id>.svg`/`flamula-<id>.svg` em uso | **Não renomeie** — o `<id>` fica salvo no perfil/grupo. Adicione novos. |
| Mudar tipo de retorno de função SQL | `drop function` antes de `create` (Postgres não troca assinatura com `create or replace`). |
| Editar `src/types/database.ts` à mão | É **gerado**. Rode `npm run db:types` após mudar o schema local. |
| Recalcular pontuação no client | **Nunca.** Pontuação/classificação vêm do banco. |

## 6. Mudanças de banco (resumo — detalhe em [`05`](05-DADOS-E-AUTH.md) e [`09`](09-PARALELISMO.md))

- Toda mudança de schema é uma **migration aditiva** em `supabase/migrations/`, nomeada
  `AAAAMMDDHHMMSS_descricao.sql` (na prática o prefixo é um número de versão crescente).
- **Numeração com sessões paralelas é armadilha frequente**: o Supabase controla migration por
  **número**; se duas sessões criam o mesmo número, a segunda é **pulada** em produção. Antes de
  criar, `git fetch` e **numere depois da maior migration existente** (forward-only). → [`09`](09-PARALELISMO.md).
- Funções de escrita: `security definer`, `set search_path = ''`, checam `is_app_admin()` /
  `is_league_admin()` e dão `raise` se não autorizado.
- Após mudar o schema local: `npm run db:types` para regenerar os tipos.

## 7. Validação antes de subir

> Isto é o **Portão B** (homologação antes do deploy). Pressupõe que o **Portão A** já aconteceu: o
> plano foi validado pelo João **antes** de você escrever este código (regra 16). →
> [`11`](11-EQUIPE-E-PAPEIS.md) §3.

- `npm run typecheck` (ou `npm run build`) **verde**.
- **Teste o fluxo no navegador** (Playwright/preview) — não só typecheck. (preferência do João).
- Mudança de banco: `supabase db reset` local aplica todas as migrations + seed sem erro.
- Detalhe operacional completo em [`08-PROCESSO.md`](08-PROCESSO.md).

### Portões de qualidade de código (obrigatórios para código novo)

Pontos de avaliação fixos do projeto. Valem **para todo código novo** e **também ao integrar/mesclar
branches** (quem mescla roda os portões na árvore integrada **antes** de subir — código de outra
sessão pode ser anterior aos portões). O **CI cobra sozinho**: o workflow
[`quality.yml`](../.github/workflows/quality.yml) roda `typecheck + lint + check:arch + build` em
todo push/PR e **reprova** se falhar. O código existente que ainda não passa é **backlog de
otimização** (refatorar aos poucos, sem quebrar o que funciona).

1. **Complexidade ciclomática.** Regra `complexity: ["warn", 20]` no `eslint.config.js`. **Avisa**
   (não quebra o build) quando uma função passa de 20 — sinal de que está fazendo coisa demais e
   pede quebra em funções/componentes menores. Conta `&&`, `??` e ternários, então componente React
   infla naturalmente: prefira extrair subcomponentes/hooks a empilhar condicional no JSX.
2. **Estrutura de dependências (camadas).** `npm run check:arch`
   (`scripts/check-architecture.mjs`). Camada interna **não importa** camada externa. Direção:
   `kernel` (lib/types/data) → `ui` (components/ui) → `components` → `feature` (features/*) →
   `chrome` (components/layout, ponte) → `app` (raiz). `auth` é **transversal** (importável por
   todos). **Violação dura** (núcleo vazando, ex.: `components/ui` importando `features/*`) **reprova**
   (exit 1); **acoplamento lateral** entre features e leitura de metadado fora do `src` são **avisos**
   (não bloqueiam) — o backlog a reduzir. Detalhe do modelo no topo do próprio script e em
   [`11-EQUIPE-E-PAPEIS.md`](11-EQUIPE-E-PAPEIS.md) §3.
3. **Nunca `<select>` nativo.** Regra `no-restricted-syntax` no `eslint.config.js` (**erro** de
   lint). A UI do sistema operacional destoa do tema/dark-mode: use sempre os componentes do
   design system — **`<Select>`** (`@/components/ui/Select`, listas curtas) ou **`<Combobox>`**
   (`@/components/ui/Combobox`, listas grandes com busca).

## 8. Scripts (`package.json`)

| Script | O quê |
|---|---|
| `npm run dev` | Vite dev server (porta 5173; ver `.claude/launch.json` p/ 5180) |
| `npm run build` | `tsc -b && vite build` (typecheck + build) |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:start` / `db:stop` / `db:reset` | Supabase local (Docker) |
| `npm run db:types` | Regenera `src/types/database.ts` do schema local |
