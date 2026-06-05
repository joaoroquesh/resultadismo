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

### Alterado
- **Primeira dobra da home: no máximo 2 linhas de jogos.** O teaser deslogado deixa de usar a altura
  do viewport como teto e passa a mostrar **no máximo 2 linhas** de jogos (4 no desktop, 2 no mobile);
  o convite "Conheça o Resultadismo" cola **logo abaixo** dos jogos visíveis, acabando com o espaço
  vazio que sobrava em dias com poucos jogos. (`src/features/landing/FirstFold.tsx`)
- **Página de login removida.** `/login` deixou de existir; o **único** login é o bottom-sheet
  (`LoginModal`) com Google, aberto pelo botão "Entrar". Logout volta pra **Home** (`/`);
  `RequireAuth` e `AuthCallback` redirecionam pra `/`; CTAs "Entrar para palpitar"/"Entrar e jogar"
  abrem o modal. `LoginPage.tsx` excluído.

---

## [2.6.2] — 2026-06-05

### Corrigido
- **Jogo oculto também não notifica.** Complementa a ...028: o admin ocultar um jogo agora cobre
  toda a superfície — lembrete "Não esquece de palpitar! ⏰" não é mais criado pra jogo oculto
  (`create_deadline_reminders` ganhou `m.hidden = false`), cutucada de jogo oculto falha como
  "Jogo não encontrado." (`nudge_for_match`), e os lembretes/cutucadas **antigos** de jogos que
  foram ocultados depois somem da bell — leitura passa por uma RPC nova
  `get_my_notifications(p_limit)` que filtra via `not exists` em `matches.hidden=true`.
  É filtro de leitura, reversível: desocultar o jogo faz a notificação reaparecer.
  Migration `20260604000003`.

---

## [2.6.1] — 2026-06-05

### Corrigido
- **Jogo oculto não conta mais para a pontuação.** Quando o admin oculta um jogo (`matches.hidden`),
  os palpites nele param de somar pontos — **mesmo que alguém já tivesse palpitado antes** de ocultar.
  Filtro de leitura `and m.hidden = false` em **todas** as funções que somam/decidem pontos
  (`get_league_standings`, `get_player_profile`, `get_confronto_standings`/`_ties`, `get_tie_detail`,
  `advance_confronto_cup`; migration `20260603000028`). Desocultar volta a contar na hora; não muda
  o 3/2/1 nem o desempate. (O ponto-do-dia no client já excluía oculto — só busca jogos visíveis.)

### Alterado
- **Home pública (LandingSections) — redesign impecável pós-`/design-critique`.**
  Remove o CTA final duplicado (rodapé já fecha), CTA primário consistente em todo lugar
  ("Criar conta grátis"). Cards de pontuação com exemplo ancorado e sem ponto redundante.
  **Faixa de confiança** no herói (100% grátis · sem anúncios · Google · não é aposta) e
  **FAQ em acordeão** (6 perguntas — quebra de objeções "é pago?", "precisa de app?", "é aposta?").
  Microinterações sutis (hover lift, ease-out-expo). Sem dependência nova.

---

## [2.6.0] — 2026-06-05

### Adicionado
- **Editar grupo (nome + descrição + escudo) pelo dono/admin.** No detalhe do grupo, o botão
  **"Editar"** abre um editor único com **nome**, **descrição** e **escudo** juntos. Trocar o nome
  **re-dispara a moderação** (`name_approved=false`, volta à fila do admin) — o grupo segue ativo.
  RPC `update_group_info` (SECURITY DEFINER; gate `is_league_admin`/`is_app_admin`; bypass do guard
  p/ re-moderar). Migration `20260604000002`.

### Alterado
- **Cabeçalho do grupo reorganizado em 2 cards:** **Identidade** (escudo + descrição + Editar) e
  **Convide** (código + WhatsApp) — cada card com um trabalho só. Descrição vazia agora é um convite
  **"+ Adicionar descrição"** (antes era um "Sem descrição." morto).

---

## [2.5.0] — 2026-06-05

**Sincronização inteligente de jogos + saúde da API + Admin redesenhado.** O sync deixa de ser
manual: placares entram sozinhos, a API é monitorada (a ESPN é não-oficial e pode quebrar), e o
painel admin vira um centro de comando. ⚠️ _Migration `20260604000001` + mudança na edge function
`sync-football`. O cron só dispara de fato quando `private.sync_config` for populado (ação do João
com a service key — fora do código)._

### Adicionado
- **Sync inteligente (backend):** modos `scores` (só atualiza placar/status de jogos existentes,
  cron `*/5` guardado por `should_sync_scores()` — só gasta requisição se há jogo ao vivo/prestes/
  recém) e `catalog` (reconcilia 1×/dia). 1ª vez insere tudo; depois **jogo novo → alerta** (não
  insere cego), cancelamento → alerta, mata-mata "A definir"→time real → aplica+alerta, horário
  mudou → aplica+alerta. Tabelas `sync_alerts` e `admin_audit_log`; coluna `competitions.catalog_seeded`.
- **Saúde da API (nunca falhar em silêncio):** falha HTTP, formato inesperado ou "0 jogos com jogos
  futuros" → marca a competição (`last_sync_ok/error/checked_at`) + alerta `api_error` + **push pros
  admins**; auto-recupera quando volta.
- **Ao vivo automático:** o jogo aparece AO VIVO (0×0) no horário do kickoff, sem esperar a API
  (janela de 4h); placar real aparece quando a API confirma (`MatchCard`).
- **Admin redesenhado** (`AdminPage` dashboard-first, nav por URL `?t=`): aba **Visão** (saúde do
  sistema: ao vivo/próx 24h/online, status de sync por competição, banners de alerta), aba
  **Alertas** (aprovar/recusar pendências + histórico). Busca+ordenação em Usuários (admins primeiro)
  e Grupos. **Modo manutenção** (banner global `MaintenanceBanner`), **reabrir palpites** (jogo
  adiado), **atividade recente** (audit). RPCs `admin_*` (`SECURITY DEFINER`, app-admin).
- **Home pública (deslogado) — primeira dobra + convite de rolagem.** Num dia cheio, os jogos
  aparecem só até a altura do viewport (cortando onde estiver, com fade) e um convite "Conheça o
  Resultadismo" fixo na base leva às seções de venda — teaser em vez de despejar a lista toda
  (`src/features/landing/FirstFold.tsx` + `ScrollCue.tsx`).

### Alterado
- **Home no desktop usa a largura toda** (container igual ao header), com **jogos em 2 colunas** e as
  seções de venda (o que dá pra fazer / pontuação / competições) em colunas — aproveita o espaço
  lateral e encurta a página.
- **Microinterações/animações sutis na landing** (IntersectionObserver + CSS `ease-out-expo`):
  reveals com _stagger_, _hover lift_ e deriva no convite de rolagem. Sem bounce; respeita
  `prefers-reduced-motion` (DESIGN.md). Sem dependência nova (sem GSAP).

### Documentação
- [`04-ADMIN.md`](04-ADMIN.md): painel redesenhado (Visão/Alertas + abas), sync inteligente e RPCs.
- [`05-DADOS-E-AUTH.md`](05-DADOS-E-AUTH.md): tabelas `sync_alerts`/`admin_audit_log`, RPCs de sync e
  o cron `scores`/`catalog`.

---

## [2.4.1] — 2026-06-04

### Corrigido
- **Reembolso não aparece mais com a cobrança desligada.** O botão self-service "Cancelar e
  reembolsar" (detalhe do grupo) só é exibido quando o pagamento está em `test`/`live`; com
  `payment_mode = disabled` (ADR [`0002`](decisions/0002-pagamento-desligado-gratis.md)) ele fica
  **dormente** junto com o resto da infra — e volta sozinho se a cobrança for reativada. Antes
  aparecia em grupos com `payment_status = paid` mesmo sendo grátis, contradizendo o "grátis".
- **Card "Modo Confronto (teste)" não quebra mais no mobile.** No detalhe do grupo (admin), o
  botão "Ativar/Desativar Confronto" passa a **empilhar abaixo do texto, em largura total** em
  telas estreitas (segue inline no desktop) e o título ganha `flex-wrap`. Some a quebra feia do
  rótulo do botão e do título.

---

## [2.4.0] — 2026-06-04

### Alterado
- **Pagamento desligado: criar grupos é 100% grátis** (`payment_mode = disabled`; ADR
  [`0002`](decisions/0002-pagamento-desligado-gratis.md)). Toda a copy pública passa a comunicar
  "grátis" — home/landing, "Como funciona", criar grupo, Termos, Privacidade e SEO
  (`index.html`/JSON-LD/`llms.txt`). A **infra de pagamento** (Mercado Pago, preço, cupons, reembolso,
  `PaymentAdmin`) fica **preservada, apenas desligada** — reativável no futuro.
- **Rename "Federação" → "Grupo"** propagado também no **SEO** (`index.html` JSON-LD/FAQ + `llms.txt`),
  que tinham ficado de fora; concordância de gênero revisada na copy (um/o grupo, grupo ativo/criado…).

### Removido
- Menções a **taxa / R$ 9,90 / R$ 19,90 / Mercado Pago / reembolso** da copy pública (passa a dizer
  "grátis"). Só o código de infra (dormente) mantém o fluxo de pagamento.

### Corrigido
- **`npm run homolog:pull` (homologação local, dev-only):** o snapshot read-only de produção não
  carregava nada. Dois ajustes no `scripts/homolog-pull-prod.sh`: (1) dumpa só `auth.users` +
  `auth.identities` em vez do schema `auth` inteiro — a nuvem tem tabelas de subsistema
  (oauth/mfa/saml/webauthn/`custom_oauth_providers`) que não existem/diferem no Supabase local e
  abortavam a carga; (2) trunca **todo** o schema `public` dinamicamente antes de carregar, evitando
  conflito de PK com as linhas-padrão que as migrations inserem (`access_control`/`app_settings`).
  Validado ponta a ponta com dados reais (23 usuários, 3 grupos, 215 jogos, 206 palpites). **Não toca
  produção** (`pg_dump` só lê).

### Documentação
- **Guia de UX Writing** (`.claude/10-UX-WRITING.md`): voz, tom, glossário + linguagem proibida de
  aposta, padrões de microcopy (erro/vazio/sucesso/confirmação/push), acessibilidade e benchmarks —
  com base na skill global `ux-writing`. **Princípio reitor: clareza e simplicidade máximas** (leigo
  entende rápido).
- **Regra central 13 (MESTRE) + `DESIGN.md`:** o princípio de clareza/simplicidade máximas passa a
  reger o **design**, não só o texto.

### Decisões
- **Pagamento desligado — tudo grátis por ora** (ADR [`0002`](decisions/0002-pagamento-desligado-gratis.md)):
  criar grupos deixa de cobrar (modo `disabled`). **Conflita com a regra central 3** (cobrança) —
  decisão explícita do João, com a regra 3 (MESTRE) e [`06`](06-REGRAS-DE-NEGOCIO.md) §5 atualizadas.
  Infra preservada, reversível.
- **Renome "Federação" → "Grupo"** (ADR [`0001`](decisions/0001-espaco-grupo.md)): termo mais claro
  pro leigo ("Liga"/"Bolão" já são modos). Documentação `.claude/`, **UI, rotas e SEO** renomeadas
  (banco segue `leagues`). Também **"joker" → "coringa"** no glossário (PT, não anglicismo).

---

## [2.3.1] — 2026-06-04

### Corrigido
- **`ConsentDialog` (centro de privacidade)** estava com layout quebrado: título
  cortado na borda e botão "Compartilhar" com aparência desbotada (era
  `disabled` quando o estado já era `granted` — parecia bug). Redesenhado
  seguindo a premissa de clareza/simplicidade máximas (`MESTRE` §3 regra 13 +
  `DESIGN.md`): padding correto pra acomodar o X de fechar, card de status com
  **cor semântica** (grass / neutro / brand) e ícone em círculo, e **apenas uma
  ação contextual** quando o usuário já decidiu (sem botões `disabled`). Tom
  coloquial mantido ("Você tá ajudando a melhorar o app", "Topa nos ajudar
  com métricas anônimas?").

---

## [2.3.0] — 2026-06-04

**Centro de controle de privacidade.** O usuário ganha um lugar pra revisar e
alternar o consentimento do GA a qualquer momento — exigência da LGPD (art.
18, IX) e prática que reforça a integridade do consentimento (sem aceite por
inércia/timer, que a ANPD desaconselha no Guia de Cookies de 2023).

### Adicionado
- **Modal `ConsentDialog`** (`src/features/consent/`): mostra o estado atual
  (Compartilhando / Sem compartilhar / Sem decisão), permite alternar e tem
  link discreto para "Resetar minha escolha" — banner volta a aparecer.
- **`ConsentLink`** reusável (botão estilizado como link de rodapé) que
  abre o diálogo. Plugado em:
  - rodapé do `PublicShell` (visitante deslogado), ao lado de Termos/Privacidade;
  - rodapé do `PerfilPage` (logado), na mesma fileira.
- **Hook `useConsent()`** (`consent.ts`) usando `useSyncExternalStore`: banner
  e diálogo reagem em tempo real à escolha — inclusive entre abas (storage
  event).
- **`clearConsent()`** (`consent.ts`): API pra resetar a escolha, voltando o
  gtag pra `denied` e reabrindo o banner.

### Alterado
- **Copy do banner refinado:** mais convidativo ("Topa nos ajudar a melhorar o
  app?") e explícito sobre as garantias (IP anonimizado, sem rastreio
  publicitário, dá pra desativar a qualquer momento). Mantém o aceite
  explícito — sem timer / sem auto-accept.

---

## [2.2.2] — 2026-06-04

**Ambiente de homologação local + DevPanel.** Tudo **só de desenvolvimento** — gateado por
`import.meta.env.DEV`; **não entra no bundle de produção** (confirmado: ausente em `dist/`) e não
muda nada do app em produção.

### Adicionado
- **DevPanel** (`src/features/dev/DevPanel.tsx`): chip flutuante **arrastável/reposicionável** e
  recolhível p/ alternar a visualização — **Deslogado / Admin / Membro / Dono / 1º acesso** — e
  **"entrar como <e-mail>"** (qualquer usuário). Montado no `AppShell` só sob `import.meta.env.DEV`.
- **Snapshot read-only de produção** (`npm run homolog:pull` → `scripts/homolog-pull-prod.sh`):
  `pg_dump` que **só lê** prod e carrega a cópia no Supabase local; seta a senha de dev nos usuários
  locais p/ logar como qualquer um. Opção `ANONYMIZE=1` (LGPD). Produção nunca é tocada.
- **Seed** ganhou `novato@teste.com` (1º acesso, sem federação) e `dona@teste.com` (dona não-admin,
  federação "Galera do Trampo").

### Documentação
- [`07-BUILD-E-DEPLOY.md`](07-BUILD-E-DEPLOY.md) §7 "Homologação local" — arquitetura, como usar e por
  que local+snapshot em vez de read-replica/staging project.

---

## [2.2.1] — 2026-06-04

### Alterado
- **Banner de consentimento (UI):** "Recusar" virou link discreto (texto cinza
  com sublinhado no hover) em vez de botão outline, pra não competir
  visualmente com o CTA "Aceitar". Comportamento e a11y mantidos (continua
  `<button>` focável).

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
