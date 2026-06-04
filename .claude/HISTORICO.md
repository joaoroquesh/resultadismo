# HISTÓRICO — como o Resultadismo chegou até aqui

> **Visão única** da evolução do projeto até o **2.0.0** (03/06/2026). Este arquivo **consolida** os
> registros de sessão que existiram em `docs/` (o diário de bordo dos chats) — esses registros foram
> a matéria-prima desta documentação e, uma vez consolidados aqui, foram removidos. O que importava
> deles está incorporado abaixo e nos documentos de regras (01–09).
>
> Isto é **contexto, não regra** — as regras vivas estão nos documentos 01–09. Para o changelog
> oficial daqui pra frente, ver [`CHANGELOG.md`](CHANGELOG.md). O design original dos confrontos,
> preservado como referência, está em [`../docs/planning/`](../docs/planning/).

---

## Linha do tempo (resumo)

| Quando | Marco | Versão reconstruída |
|---|---|---|
| até 2026 | Site estático v1 (HTML/CSS/JS + Firebase/planilhas), em GitHub Pages | **v1.x (legacy)** |
| 2026-05-26 | Reescrita v2: fundação React + Supabase | v2.0.0-dev.1 |
| 2026-05-27 | Segurança (PII), fila de acesso, escala, auto-deploy de functions | v2.0.0-dev.2 |
| 2026-05-31 → 06-02 | Pagamento de federações + rebrand Liga→Federação | v2.0.0-dev.3 |
| 2026-06-01 → 06-03 | Confrontos Liga/Copa (gated) | v2.0.0-dev.4 |
| 2026-06-03 | Escudos por máscara, ESPN, admin de jogos, tela de jogos | v2.0.0-dev.5 |
| 2026-06-03 | Promo da Copa + reembolso self-service | v2.0.0-dev.6 |
| **2026-06-03** | **Consolidação + sistema de documentação `.claude/`** | **v2.0.0** |
| 2026-06-04 | Ultra code review (7 revisores): endurecimento de segurança (RLS de confronto, estado terminal do pagamento, CSS injection do escudo, `cup_ties` só-RPC, webhook), correções de confronto (avanço da Copa, sorteio aleatório, bye=vitória, semana BRT), performance (lazy routes), **god-split** dos componentes grandes. Regularizado retroativamente na doc. | **v2.1.0** |
| 2026-06-04 | Renome **Federação → Grupo** (UI, rotas, SEO) + **pagamento desligado**: criar grupos passa a ser **grátis** (modo `disabled`, ADR 0002 — conflita com a regra central 3; infra de pagamento preservada e reversível) | **v2.4.0** |

---

## v1 — o jogo original (legacy)

O Resultadismo nasceu como **site estático** (HTML/CSS/JS) com dados em **Google Sheets/Firebase**,
hospedado no **GitHub Pages** (domínio resultadismo.com). Já tinha o **conceito sagrado**: palpitar
placares reais e pontuar por **cravada/saldo/acerto**, e um **sistema de design próprio** (tokens de
cor, tipografia Ubuntu, espaçamentos). Preservado na tag **`v1-legacy`** e na branch **`legacy/v1`**.

**Por que reescrever:** modernizar e habilitar o recurso novo de **Federações** (grupos privados),
impossível na arquitetura de planilhas.

---

## v2.0.0-dev.1 — Fundação da reescrita (2026-05-26)

Reconstrução como **SPA Vite + React + TS + Tailwind v4** com **Supabase** (Postgres, Auth Google,
RLS, Edge Functions, pg_cron), deploy Vercel. As migrations `…0001`–`…0008` montaram o esqueleto:

- **Adicionado:** `profiles` (+ bootstrap do 1º usuário como app-admin), `competitions`/`teams`/
  `matches`, `leagues`/`league_members`/`league_competitions`, `predictions`; **pontuação automática
  no banco** (`compute_score_type`/`score_points` + triggers) e **classificação com desempate**
  (`get_league_standings`); **RLS** completa; RPCs de liga; **cron** de sync; Realtime.
- Primeiro caso de uso definido: **Copa do Mundo 2026**.

> Detalhe técnico vivo: [`05-DADOS-E-AUTH.md`](05-DADOS-E-AUTH.md), [`06-REGRAS-DE-NEGOCIO.md`](06-REGRAS-DE-NEGOCIO.md).

---

## v2.0.0-dev.2 — Segurança, fila de acesso, escala, auto-deploy (2026-05-27)

- **Segurança:** a coluna `email` em `profiles` vazava PII (qualquer logado lia o e-mail de todos).
  **Removida** a coluna (e-mail vive em `auth.users`); criada RPC `admin_list_users()` (só app-admin)
  para a aba Usuários.
- **Adicionado — Sala de espera (fila FIFO):** `access_control`/`access_sessions` + RPCs
  `request/heartbeat/release_access`. Protege o Realtime em pico **sem derrubar** quem já está dentro.
  Princípios: **só RPC HTTP (nunca Realtime)** e **fail-open** (bug no portão nunca vira apagão).
- **Escala:** índices covering para a classificação, debounce das invalidações de Realtime, batch
  upsert no sync.
- **Infra:** **auto-deploy das Edge Functions** via GitHub Action (`deploy-functions.yml`) — fecha o
  último passo manual do pipeline.
- **Lição crítica registrada:** **NÃO rodar `supabase db push` local** (o CLI da máquina só enxerga
  outro projeto — quase aplicou um `drop column` no dashboard de advocacia). Deploy = push na `main`.

---

## v2.0.0-dev.3 — Pagamento de federações + rebrand Liga→Federação (2026-05-31 → 06-02)

- **Decisão de produto:** cobrar **taxa única** pela **criação de Federação** (não é aposta).
  Mercado Pago Checkout Pro + webhook. Alvo: Copa 2026, escala pequena (<200 usuários).
- **Adicionado:** migrations `…0020`/`…0021` — `payment_status`, `league_payments` (idempotência),
  `app_settings` (modo + preço), `discount_codes`; RPCs `confirm_league_payment`,
  `simulate_league_payment` (modo teste), `admin_update_payment_settings`, `admin_comp_league`
  (cortesia), `validate_discount_code`. Edge Functions `create-league-checkout` +
  `mercadopago-webhook`.
- **Alterado — rebrand Liga → Federação:** rotas `/federacoes` (+ redirects de `/ligas/*`) e textos.
  Identificadores de banco seguem `league`/`leagues`. (E "Liga" passou a designar um **modo** futuro.)
- **Pago ativa na hora; só o NOME entra em revisão** (`name_approved` + `admin_approve_league_name`);
  checkout sem boleto.
- **Operação:** Mercado Pago vinculado ao vivo em **modo Teste** primeiro (token de teste), via
  navegador. **Boundary:** o Access Token nunca foi digitado pelo agente — o João colou.

> Regras vivas do pagamento: [`06-REGRAS-DE-NEGOCIO.md`](06-REGRAS-DE-NEGOCIO.md) §5.

---

## v2.0.0-dev.4 — Confrontos Liga/Copa, gated (2026-06-01 → 06-03)

Design original preservado em [`../docs/planning/confrontos-e-federacoes.md`](../docs/planning/confrontos-e-federacoes.md)
e [`../docs/planning/confrontos-v2.md`](../docs/planning/confrontos-v2.md).

- **Adicionado (atrás de `confronto_enabled`, só app-admin):** modelo Confronto (`cup_ties` +
  `confronto_participants`, estados draft→scheduled→drawn→finished); **resolução por PERÍODO**
  (fase/semana) em vez de "dia"; sorteio transacional (`draw_confronto`/`undo_confronto_draw`);
  **simulador** de estrutura com viabilidade; formato **turno/ida-volta/suíço** escolhido no sorteio;
  participantes **admin OU opt-in**; **anti-trapaça** (palpite oculto até o apito); **W.O.** na saída;
  **prefixo-badge** de nome (Bolão/Liga/Copa); **sorteio agendado** (instantâneo/data-hora/1º jogo).
- **Estratégia:** subir a estrutura **cedo** em produção, mas visível só nas federações destravadas —
  iterar com usuários reais sem expor nada ao público.
- Migrations `…0022`/`…0023` e `…0004`–`…0019` da família confronto.

> Regras vivas do confronto: [`06-REGRAS-DE-NEGOCIO.md`](06-REGRAS-DE-NEGOCIO.md) §6.

---

## v2.0.0-dev.5 — Escudos, ESPN, admin de jogos, tela de jogos (2026-06-03)

- **Adicionado — escudos por máscara SVG:** identidade visual de perfis e federações reescrita (o
  SVG recorta um fundo de cor/foto); catálogo automático via `import.meta.glob`; **todo perfil tem
  escudo** (legados adaptados no render, sem migration). Refino UX `/impeccable`.
- **Adicionado — provedor ESPN:** JSON público (grátis, status ao vivo, escudos, nomes PT) para os
  jogos. Descartados scraping Python (frágil) e API-Football Free (travado em 2022–2024).
- **Adicionado — admin de jogos por competição** (`/admin/competicoes/:id/jogos`): curadoria
  (`matches.hidden`) + override manual de placar/status. Gestão de competições (publicar/renomear/
  detector de duplicatas).
- **Alterado — tela de jogos:** "Todos os campeonatos" como padrão, correção do dia (hoje/próximo,
  fim do vazamento entre escopos), **pontuação do dia selecionado**.

---

## v2.0.0-dev.6 — Promo da Copa + reembolso self-service (2026-06-03)

- **Alterado — preços:** base **R$ 19,90**, **promo R$ 9,90 até 20/07/2026** (fim da Copa), com
  preço efetivo decidido **no servidor**; admin edita/desliga a promo (`admin_set_promo`).
- **Go-live oficial:** João trocou para o **token de produção** do Mercado Pago + modo "Mercado
  Pago" + chave Pix → o app passou a **cobrar de verdade**.
- **Adicionado — reembolso self-service** (CDC art. 49): botão para o dono cancelar e ser reembolsado
  em até **7 dias** (`cancel-league-refund` → devolução total no MP → federação arquivada). Migration
  `…0015` faz `confirm_league_payment` arquivar ao receber `refunded`.
- **Corrigido:** bug do "Pagar agora" (409 em federação ativa+pendente, erro engolido).

---

## v2.0.0 — Consolidação + documentação (2026-06-03)

Tudo acima está **em produção** (`main`), e o projeto passou a ser **versionado formalmente a partir
do 2.0.0**. Criado o sistema de documentação **`.claude/`** (MESTRE + 01–09 + CHANGELOG + este
HISTORICO) com o **protocolo de mudança** que governa as próximas alterações, e os registros de
sessão de `docs/` foram consolidados aqui.

> Daqui pra frente, cada mudança que sobe é registrada no [`CHANGELOG.md`](CHANGELOG.md).

---

## Pendências e dívidas conhecidas (herdadas)

Itens em aberto trazidos dos registros consolidados. **Confirme o estado atual no código antes de
agir** — alguns podem já ter sido resolvidos por sessões posteriores.

**Pagamento / federações**
- **Textos de preço hardcoded** na landing e no "Como Funciona" (citam "R$ 19,90 / R$ 9,90") — se
  mudar o preço no admin, **atualizar o copy à mão**. → [`06`](06-REGRAS-DE-NEGOCIO.md) §5.
- **Botão "Aprovar" do admin** não deveria aparecer para federações `payment_status='pending'` (elas
  esperam **pagamento** do usuário, não aprovação) — senão recria a inconsistência do "Pagar agora".
  → [`04`](04-ADMIN.md).
- **Trava anti-abuso no reembolso** (opcional): hoje o reembolso é incondicional em 7 dias; se
  desejado, bloquear quando o usuário já lançou palpites.
- **Editar nome/descrição da federação após criação** (nome editado deve voltar à revisão do admin).
- **MEI** para emitir nota fiscal e regularizar tributos sobre a receita.
- **`VAPID_SUBJECT`** em `supabase/functions/send-push/index.ts` ainda usava e-mail antigo
  (`contato@resultadismo.com`).

**Confronto**
- **Teste end-to-end em prod** numa federação real (ligar `confronto_enabled`, criar Liga e Copa,
  sortear instantâneo/agendado, avançar suíço, conferir anti-trapaça e W.O. com 2 usuários reais).
- **Decisão em aberto:** no sorteio **agendado**, travar os participantes no momento do agendamento
  (atual: revelado no horário) — confirmar o comportamento desejado.
- **Consolação** para eliminados da Copa (opcional).

**Contas / operação**
- **Migração de contas** (GitHub, Vercel, Supabase, Google Cloud/OAuth) para
  `resultadismoapp@gmail.com` — **sem regenerar** o OAuth Client do Google (quebra o login).
- **Sincronização ESPN** dos amistosos: confirmar que rodou em prod e aposentar a competição antiga
  do TheSportsDB.

---

## Lições recorrentes (padrões que se repetiram)

Padrões pagos com incidentes reais — viraram regra em [`08`](08-PROCESSO.md) e [`09`](09-PARALELISMO.md):

1. **Repo editado em paralelo** por várias sessões → isolar em worktree, commit cirúrgico, nunca
   `git add -A`.
2. **Colisão de número de migration** entre sessões faz o Supabase **pular** a segunda → numerar
   forward-only, conferir o prod, reconciliar quando trava.
3. **NUNCA `supabase db push` local** (CLI aponta para outro projeto) → deploy é push na `main`.
4. **`git reset --hard` no dir principal** moveu uma branch alheia por engano → recuperado via
   `reflog`; sempre conferir `git branch --show-current` antes de qualquer git.
5. **Validar com dado/fluxo real** (navegador, API real) antes de construir/subir, não só typecheck.
6. **Boundaries de dinheiro:** o agente não digita Access Token, não loga no MP, não executa
   estornos — isso é do João.
