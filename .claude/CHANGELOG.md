# Changelog — Resultadismo

Todas as mudanças relevantes que **sobem para produção** a partir de agora são registradas aqui.

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento
**MAJOR.MINOR.PATCH** (regras no [`MESTRE.md`](MESTRE.md) §6). O número fonte de verdade fica no
[`package.json`](../package.json).

> **Como usar:** toda mudança que sobe ganha uma entrada (passo 7 do protocolo em
> [`MESTRE.md`](MESTRE.md) §5 / [`08-PROCESSO.md`](08-PROCESSO.md)). Acumule em **[Não lançado]**
> enquanto desenvolve; ao subir, mova para uma versão datada e atualize o `package.json`.
> A evolução **anterior** ao 2.0.0 (site v1 e a construção do v2) está em [`HISTORICO.md`](HISTORICO.md).

Tipos de entrada: **Adicionado**, **Alterado**, **Corrigido**, **Removido**, **Segurança**,
**Depreciado**.

---

## [Não lançado]

_(Nada ainda. Próximas mudanças entram aqui antes de virar uma versão.)_

---

## [2.2.0] — 2026-06-04

**Google Analytics + consentimento LGPD.** Liga o GA4 à property `resultadismo-site`
(`G-P86V27WXK2`) com **Consent Mode v2**: por padrão tudo entra como `denied` (sem cookies, sem ID),
e o usuário decide num banner discreto. Sem rastreamento publicitário (os escopos `ad_*` ficam
permanentemente `denied`).

### Adicionado
- **Integração GA4 com Consent Mode v2** no `index.html` (script `async`, default `denied`).
  IP anonimizado.
- **Feature `consent`** (`src/features/consent/`): helper `consent.ts` (`getConsent` /
  `setConsent` / `applyStoredConsent` com persistência em `localStorage`) e `ConsentBanner.tsx`
  (banner sutil no rodapé, on-brand, com Aceitar/Recusar e link pra Política). Montado no
  `AppShell` — aparece pra logado, deslogado e na landing.
- **Política de Privacidade** atualizada (data → 4/jun/2026): novo item "Dados de uso" na lista de
  dados coletados (§1), Google Analytics na lista de operadores (§4), e nota sobre cookies do GA
  na seção de armazenamento local (§6) — tudo condicionado ao aceite no banner.

### Documentação
- [`01-ARQUITETURA.md`](01-ARQUITETURA.md): linha de **Analytics** na tabela de integrações.

---

## [2.1.0] — 2026-06-04

**Ultra code review (7 revisores) + endurecimento de segurança + refactor.** Conjunto que entrou em
produção pelos PRs **#4–#7**. ⚠️ _Nota de processo: estes PRs subiram **sem** seguir o protocolo do
[`MESTRE.md`](MESTRE.md) §5 (faltou CHANGELOG/HISTÓRICO + docs de área + assinatura). Esta entrada e
a atualização dos docs 05/06/07/01 são a **regularização retroativa**._

### Segurança
- **Vazamento de liga privada (confronto):** `get_confronto_standings`/`get_confronto_ties`/
  `get_tie_detail` eram `SECURITY DEFINER` abertas a `anon` sem checagem — qualquer um com o `lc_id`
  lia o bracket de uma federação privada. Agora gateiam em `is_app_admin() OR is_league_member() OR`
  liga pública (igual `get_league_standings`).
- **Pagamento "ressuscitando":** `confirm_league_payment` ganhou **guarda de estado terminal** +
  `select … for update` — um evento `paid` reentregue depois de um reembolso **não** reativa mais a
  federação.
- **CSS injection armazenada (escudo):** a foto do `crest:` é **sanitizada** antes de virar
  `url(...)` no CSS (só http(s) absoluto; rejeita aspas/parênteses/`;`). `avatar_url`/`logo_url` são
  texto livre do usuário — fechava um vetor de overlay/exfiltração.
- **Escrita direta em `cup_ties` removida** (era `for all` p/ admin de liga): mutação de confronto só
  via RPC `SECURITY DEFINER` (não dá mais p/ forjar W.O./placar via PostgREST).
- **Webhook do Mercado Pago endurecido:** confirma só se o **pagador == dono** da federação
  (fecha cross-league/`external_reference` forjado), checa **valor ≥ esperado** (sem cupom),
  anti-replay por `ts`, e **rate limit** por IP. (A validação de assinatura segue ligada quando
  `MP_WEBHOOK_SECRET` está setado.)
- **CORS** das Edge Functions deixou de ser `*` → allow-list (`www`/apex de `resultadismo.com`,
  `*.vercel.app`, localhost). Comparação de token cron/service em **tempo constante**. **Sem vazar**
  corpos de erro de provedores upstream.
- **CSP + headers** no `vercel.json` (`Content-Security-Policy`, `nosniff`, `Referrer-Policy`,
  `X-Frame-Options`). **Credenciais de dev** saíram do código (agora via `VITE_DEV_LOGIN_*`).
- `simulate_league_payment` agora exige **app-admin** (era qualquer dono); cupom contado de forma
  **atômica** (não estoura `max_uses`); `league_payments.amount_cents >= 0`.

### Corrigido
- **Reembolso (CDC):** janela de 7 dias contada a partir da **data do pagamento**
  (`league_payments.created_at`), não mais do `approved_at` — o fluxo aprovar-depois-pagar não nega
  mais reembolso válido. Mutação atômica via `refund_league` (`for update`).
- **Copa (mata-mata) avança:** `advance_confronto_cup` promove o vencedor de cada chave para a fase
  seguinte (antes os slots ficavam vazios pra sempre). Empate de mata-mata desempata por **seed**.
- **Sorteio agendado não vaza mais:** `get_confronto_ties`/`get_tie_detail` retornam vazio enquanto
  `confronto_state = 'scheduled'` (o sigilo era só na UI).
- **Bye = vitória** na classificação de confronto (antes não pontuava).
- **Joker 2/semana** com `pg_advisory_xact_lock` (fecha corrida que deixava passar 3+).
- **`get_league_standings`** protegido contra divisão por zero se `cravada = 0`.

### Alterado
- **Sorteio de confronto é aleatório:** a ordem (seed) é embaralhada de forma estável por disputa
  (`shuffleSeeded`, seed = `lcId`) em vez de seguir a ordem de entrada; `draw_confronto`/
  `append_confronto_ties` **validam** participantes (membros ativos, sem auto-pareamento).
- **Semana unificada em America/Sao_Paulo** (BRT): tela de Jogos (`dayKey`/`weekKey`) e confronto
  (`match_in_period` + `get_competition_periods`) agora acompanham o joker (que já era BRT).
  ⚠️ Disputas em modo "semana" já sorteadas guardam o valor antigo (UTC).

### Performance
- **Code-splitting:** rotas pesadas (admin, confronto/simulador, editor, detalhe de federação) viram
  `React.lazy` — bundle inicial **792 KB → 611 KB** (gzip 221 → 179 KB).
- Índice de cobertura `predictions (user_id, match_id) INCLUDE (score_type, is_joker)`; `CrestMask`
  memoizado; `matches.hidden` filtrado **no servidor** (usa o índice parcial); poll da federação
  pendente com teto (~3 min).

### Adicionado
- **"Compartilhar no WhatsApp"** no card de convite (Web Share API nativa, com fallback `wa.me`).
- Botão **"Entrar"** no header para visitante não logado.

### Refactor / Manutenção
- **God-split:** `LigaDetailPage` → `leagues/tabs/*`; `ConfrontoSection` → `ScheduledView`/
  `SorteioPanel`/`DrawnView`; `AdminPage` → `LigasAdmin`/`CompeticoesAdmin`/`UsuariosAdmin`.
- ESLint instalado + flat config; casts obsoletos removidos (tipos regenerados); `payments/api.ts`
  sem `any`; dead exports removidos; erros padronizados (`PostgrestError` → `Error`);
  tipos de RPC de confronto mantidos à mão **de propósito** (o gerador do Supabase marca colunas
  nuláveis de funções `returns table` como não-nuláveis). `*.tsbuildinfo` no `.gitignore`.

### Documentação
- Documentação viva versionada em **`.claude/`** (MESTRE + 01–09 + HISTÓRICO + CHANGELOG) +
  `docs/README.md`. `CLAUDE.md` da raiz passa a **obrigar** toda sessão a ler o `.claude/MESTRE.md`.
- Atualizados por causa deste conjunto: [`05-DADOS-E-AUTH.md`](05-DADOS-E-AUTH.md),
  [`06-REGRAS-DE-NEGOCIO.md`](06-REGRAS-DE-NEGOCIO.md), [`07-BUILD-E-DEPLOY.md`](07-BUILD-E-DEPLOY.md),
  [`01-ARQUITETURA.md`](01-ARQUITETURA.md).

### Migrations
`20260603000020`–`000027`: guards de leitura de confronto, pagamento (estado terminal, simulate
admin, cupom atômico, `amount_cents`), escrita de confronto (remoção da policy + validação +
`advance_confronto_cup`), corrida do joker, `rate_limits`+`rate_limit_hit`, `refund_league`,
índice de palpites, e semana em BRT.

---

## [2.0.0] — 2026-06-03

**Marco de lançamento.** Linha de base da reescrita **React + Supabase**, no ar em
**www.resultadismo.com** e cobrando de verdade (Mercado Pago). Consolida tudo que foi construído
entre 26/05 e 03/06/2026 (detalhe e cronologia em [`HISTORICO.md`](HISTORICO.md)).

### Adicionado
- **Jogo de palpites completo:** cravada/saldo/acerto (3/2/1), pontuação e re-pontuação automáticas
  no banco, dobro (2×) com limite por semana, classificação com desempate fixo.
- **Federações** (grupos privados): criação, papéis (dono/admin/membro), visibilidade e políticas de
  entrada, código de convite, escudo por máscara SVG.
- **Modo Confronto (Liga/Copa)** por federação, **atrás de gate** (`confronto_enabled`): duelo por
  período (fase/semana), sorteio transacional (instantâneo/agendado), formato turno/ida-volta/suíço,
  participantes admin/opt-in, anti-trapaça, W.O. na saída, simulador de estrutura.
- **Monetização:** cobrança de taxa única pela criação de Federação via Mercado Pago (modos
  Desativado/Teste/Mercado Pago), preço base + promoção da Copa, cupons de desconto, cortesia do
  admin, e **reembolso self-service** (arrependimento, 7 dias).
- **Dados de futebol** via ESPN (preferido), football-data.org e TheSportsDB; admin de competições
  (publicar/renomear/sincronizar) e admin de jogos por competição (curadoria + override).
- **Tela de jogos** com "Todos os campeonatos", dia hoje/próximo e pontuação do dia.
- **Notificações:** Web Push (lembrete de prazo) e cutucadas, PWA instalável.
- **Sala de espera** (fila FIFO) para proteger o Realtime em pico.
- **Painel admin** (Federações / Competições / Usuários / Pagamento) e perfis público/próprio.
- **Documentação `.claude/`** (este conjunto): MESTRE + 01–09 + CHANGELOG + HISTORICO.

### Segurança
- Coluna `email` removida de `profiles` (PII); admin lê e-mail via RPC restrita.
- Acesso governado por RLS + RPCs `SECURITY DEFINER`; pagamento protegido por triggers de guarda.

### Infra
- Deploy 100% por push na `main` (Vercel + integração Supabase + GitHub Action de Edge Functions).

---

<!--
GABARITO para a próxima entrada (copie e preencha):

## [2.0.1] — AAAA-MM-DD
### Corrigido
- … (o que mudou, e por quê; cite arquivos/migrations se ajudar)
### Documentação
- Atualizado `.claude/0X-...md` por causa desta mudança.
-->
