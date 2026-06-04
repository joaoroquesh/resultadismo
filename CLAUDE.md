# Resultadismo — comece AQUI (vale para toda sessão de IA)

> # 🛑 LEIA [`.claude/MESTRE.md`](.claude/MESTRE.md) ANTES DE QUALQUER COISA.
>
> A documentação **viva e oficial** deste repositório é a pasta **[`.claude/`](.claude/)**, e o
> **[`.claude/MESTRE.md`](.claude/MESTRE.md)** é o **contrato**: índice + regras centrais + o
> **protocolo de mudança**. **Toda** sessão de IA que for ler, responder, planejar, mexer em código/
> dados ou subir qualquer coisa neste repo **obedece** ao MESTRE e ao documento de área relevante
> (`.claude/01`–`09`). Isto não é opcional.

## O que fazer no início de toda sessão

1. **Ler [`.claude/MESTRE.md`](.claude/MESTRE.md)** (seções 1–3 sempre; 4–6 + o doc de área se for
   alterar código/dados).
2. **Seguir o protocolo de mudança** do MESTRE §5 / [`.claude/08-PROCESSO.md`](.claude/08-PROCESSO.md):
   questionar contra as regras → validar de verdade (build + navegador + `db reset`) → **propagar a
   coerência em todos os pontos de contato** → **atualizar a doc `.claude/` afetada** → **registrar no
   [`.claude/CHANGELOG.md`](.claude/CHANGELOG.md) + subir a versão** (e [`HISTORICO.md`](.claude/HISTORICO.md)
   se for decisão/marco).
3. Antes de qualquer `git`, ler [`.claude/09-PARALELISMO.md`](.claude/09-PARALELISMO.md) (o repo é
   editado em paralelo): `git fetch`, conferir branch/status, **nunca `git add -A`**, nunca resetar
   branch alheia, stage explícito só dos seus arquivos.

## ✍️ Assinatura obrigatória

Termine **toda** resposta neste repositório com a última linha, exatamente: **Fui resultadista**.
É a prova de que estas regras foram lidas e seguidas (MESTRE §3 regra 12).

## Não-negociáveis (resumo — a versão completa é o MESTRE §3)

- **Deploy = push na `main`** (aplica migrations em produção + Vercel + Edge Functions). O site está
  **ao vivo e cobrando** — nada de surpresa em produção; mudança de pagamento/login/dado destrutivo
  exige OK explícito do João.
- **NUNCA** `supabase db push`/`link` nesta máquina (o CLI aponta para outro projeto). `start`/
  `db reset`/`gen types` locais são OK. → [`.claude/07-BUILD-E-DEPLOY.md`](.claude/07-BUILD-E-DEPLOY.md).
- **Segurança é no banco** (RLS + RPC `SECURITY DEFINER`); o front só espelha. →
  [`.claude/05-DADOS-E-AUTH.md`](.claude/05-DADOS-E-AUTH.md).
- **Não é casa de apostas**; cobra-se só a criação de Federação. Pontuação 3/2/1, calculada no
  banco. → [`.claude/06-REGRAS-DE-NEGOCIO.md`](.claude/06-REGRAS-DE-NEGOCIO.md).
- **Credenciais e dinheiro são do João** (Access Token do MP, estornos, deploy de alto impacto): a IA
  não digita/executa sem autorização.
- **Toda mudança que sobe é documentada** (CHANGELOG + docs `.claude/` afetadas) e **propagada** a
  todos os pontos de contato do site.

> Stack (detalhe em [`.claude/01-ARQUITETURA.md`](.claude/01-ARQUITETURA.md)): SPA Vite + React 19 +
> TS + Tailwind v4; Supabase (Postgres/RLS/RPC, Auth Google, Edge Functions Deno, pg_cron); Vercel.
> **Não usa Trigger.dev** — ignore instruções globais de Trigger.dev aqui.

*Se este arquivo e o `.claude/MESTRE.md` divergirem, o MESTRE vence (é o contrato). Atualize este
ponteiro se o MESTRE mudar de lugar.*
