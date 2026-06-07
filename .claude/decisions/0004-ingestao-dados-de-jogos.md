# Estudo: Ingestão de dados de jogos robusta e segura — Resultadismo

> Documento de DECISÃO (não de implementação). Descreve arquitetura, schema em alto nível, trade-offs e roadmap. Nada aqui é deploy; tudo respeita o contrato do `.claude/MESTRE.md` (segurança no banco, deploy = push na main, site ao vivo e cobrando).

---

## 1. Sumário executivo

**O problema.** Hoje a fonte primária de jogos é a **ESPN via engenharia reversa** (sem ToS, sem SLA, pode quebrar sem aviso). Os escudos são **hotlink** direto da URL do provedor (some quando a fonte derruba/move). A leitura de **todos os jogos/competições é pública via anon key** (`to anon using (true)`), e o dado curado/agregado não tem proteção. Cada fonte vira **linha competidora** nas tabelas `competitions/teams/matches` (uma coluna `provider` por linha), sem laço entre elas — não há reconciliação nem detecção de divergência. Há boa base já feita: modos `scores`/`catalog`, `sync_alerts`, `rate_limit_hit`, auditoria, fallback de escudo em 3 níveis no `TeamCrest.tsx`.

**Recomendação principal (acionável):**

1. **Blindar contra a quebra da ESPN AGORA (quick win, grátis):** transformar o sync numa **cadeia de fallback explícita** ESPN → football-data.org (oficial) → TheSportsDB, com **degradação graciosa** (se todas falharem, mantém o último dado bom e alerta; nunca zera jogo). Isso ataca o maior risco operacional sem tocar schema.
2. **Garantir a Copa 2026 com fonte à prova de balas:** estrutura (grupos/fixtures) do **openfootball/worldcup.json** (domínio público, zero chave) + ESPN/football-data só para placar ao vivo.
3. **Cachear escudos (fetch-once-cache) no Supabase Storage** gravando em `teams.local_crest` (coluna e fallback **já existem**) — elimina o hotlink. Custo ~R$0.
4. **Fechar o dado curado/agregado ao `anon`** (rankings, "The Best", estatísticas cruzadas → `to authenticated`) e manter a landing pública só com uma **fatia curada** (view/RPC com LIMIT). Aquisição preservada, ativo protegido.
5. **Rate limit POR USUÁRIO** reaproveitando a `rate_limit_hit` que já existe, servindo leitura crítica/agregada via **RPC `POST`** (GET não é rate-limitável no Postgres).
6. **Evoluir o schema para MDM** (staging bruto por fonte → crosswalk provider⇄canonical → golden record por campo → tabelas canônicas que o front lê), **sem mudar o contrato do front** (continua lendo `competitions/teams/matches`).
7. **Catálogo inteligente no admin:** escolher de qual fonte adicionar, ligar/desligar fontes por competição, e uma **visão de conflitos** (qual API diverge, em qual campo, com "fonte vencedora"/override).

**Gatilhos de evolução (o que dispara cada passo):** quebra recorrente da ESPN → fallback (F1, já); Copa 2026 se aproximando → openfootball (F1/F2); dado curado virar diferencial → fechar anon (F3); 2+ fontes ativas por competição → MDM/reconciliação (F4-F5); DB Supabase >500 MB ou querer estatísticas/ao-vivo confiável → primeira API paga / Pro.

**Honestidade:** não dá para esconder a anon key, nem usar CORS como autenticação, nem rate-limitar GET no Postgres. Scraping logado lento sempre será possível. O jogo é **encarecer + detectar + degradar com graça**, não impedir 100%.

---

## 2. Estado atual e riscos

### O que existe hoje (do mapa)

- **3 provedores** no `sync-football/index.ts`: ESPN (grátis, sem token, **eng. reversa**), football-data.org (token, oficial), TheSportsDB (grátis, sem escudos).
- **2 modos:** `scores` (5 min, condicional a `should_sync_scores()`) e `catalog` (1x/dia 09:00 UTC). Cron via pg_cron + pg_net chamando a Edge Function.
- **Schema "fonte = entidade":** `competitions/teams/matches` cada uma com **uma** coluna `provider` + `provider_code`/`provider_ref` e unique index parcial por provider.
- **Alertas** (`sync_alerts`): `new_match`, `cancelled`, `team_resolved`, `kickoff_changed`, `api_error`. Health por competição (`last_sync_ok/error`). Auto-recupera quando volta.
- **Escudos:** `teams.crest_url` = **hotlink** do provedor; `teams.local_crest` existe mas não é populado; `TeamCrest.tsx` já faz fallback `src → local_crest → crest_url → placeholder`.
- **Leitura pública:** `matches/competitions/teams` têm policy `to anon using (true)` (landing deslogada mostra tudo).
- **Já feito e bom:** `rate_limit_hit` (janela fixa atômica, só service_role/Edge); `admin_audit_log`; ingestão isolada em Edge Function com service_role; segredos fora do bundle.

### Riscos (com severidade)

| # | Risco | Severidade | Por quê |
|---|---|---|---|
| R1 | **ESPN é eng. reversa, fonte única primária** — pode mudar shape/sumir sem aviso, sem SLA | **ALTA** | É o coração da ingestão; se quebra, jogos param de atualizar. Hoje não há fallback automático real (há alerta, mas não troca de fonte). |
| R2 | **Hotlink de escudos** (`crest_url` direto do provedor) | **MÉDIA** | Quando a URL externa muda/cai, escudos somem em todo card. Já existe `local_crest`+fallback — risco é só não estar populado. |
| R3 | **Leitura pública total via anon** do catálogo inteiro + (se houver) agregados | **MÉDIA-ALTA** | Qualquer `curl` com a anon key dumpa a base. O ativo curado fica exposto a scraping. CORS não protege. |
| R4 | **Sem reconciliação multi-fonte** — cada fonte é linha competidora | **MÉDIA** | Impede usar 2 fontes para validar placar (voting); duplicatas de competição; sem detecção de divergência. Bloqueia robustez real. |
| R5 | **Copa 2026 dependeria de API não-oficial** para estrutura | **MÉDIA** | Bolão da Copa é evento crítico de receita; estrutura (grupos/chaveamento) não pode depender só da ESPN. |
| R6 | **Sem rate limit em leitura** | **BAIXA-MÉDIA** | GET vai para read replica, não é limitável no Postgres. Hoje irrelevante (<200 users), mas é vetor de abuso/scraping. |
| R7 | **Compliance Vercel Hobby** (site cobra → termos exigem Pro) | **BAIXA** (jurídico/compliance) | Não é técnico, mas é o único custo "obrigatório" hoje. |
| R8 | **Licenciamento de escudos** (marca registrada) num produto que cobra | **BAIXA** | Uso editorial/identificação é a prática da indústria; mitigável com disclaimer + logo pequeno + placeholder. |

---

## 3. Fontes de dados

### Matriz comparativa enxuta

| Fonte | Cobertura BR | WC2026 | Grátis — limite | Ao vivo | Escudos | Auth | Oficial / risco |
|---|---|---|---|---|---|---|---|
| **ESPN hidden API** | **Série A/B, Copa do Brasil, estaduais (Paulista/Carioca), Libertadores** | **Sim** (`fifa.world`, elim. CONMEBOL) | sem limite publicado | **Sim** | **Sim** (espncdn) | nenhuma | **Não-oficial / risco ALTO** |
| **football-data.org** | **só Série A** | **Sim** (`WC`) | **10 req/min** auth; placares **atrasados** | não (free) | crests (varia) | chave grátis | **Oficial / risco BAIXO** |
| **TheSportsDB** | Série A + fundo | histórico | chave `123`, 30 req/min, métodos cortados | não (free) | **forte** (badges) | chave teste | Oficial / risco BAIXO-MÉDIO |
| **API-Football** | **completa** (A/B/C/D, Copa BR, **estaduais**) | **Sim** | **100 req/dia** | sim | sim | chave grátis | Oficial / risco BAIXO |
| **openfootball/worldcup.json** | — | **WC2026 fixtures/grupos** | ilimitado (JSON estático) | não | não | nenhuma | **Domínio público / risco baixíssimo** |
| SofaScore / FotMob | ampla | sim | Cloudflare/tokens | sim | sim | anti-bot | **risco MUITO ALTO** — não usar |
| Sportmonks free | **não** (DK+SCO) | não | 2 ligas | — | — | chave | inútil p/ BR |

### Escolha

- **PRIMÁRIA — ESPN hidden API.** Única gratuita que cobre **BR inteiro + WC + Libertadores** num só lugar, com logos. Já integrada. **Mantém-se como uma das fontes, NÃO a única.** Mitigação do risco: curadoria/override admin + cache agressivo + **fallback automático** (próxima seção do pipeline).
- **FALLBACK OFICIAL — football-data.org (chave grátis).** Rede de segurança documentada para **Série A + Copa do Mundo** quando a ESPN quebrar. 10 req/min sobra para <200 users com cache.
- **ESCUDOS/FUNDO — TheSportsDB (já em uso).** Melhor artwork; não depender dela para ao vivo no free.
- **GARANTIA WC2026 — openfootball/worldcup.json.** Estrutura (grupos/fixtures) de domínio público; ESPN/football-data só para placar ao vivo. A estrutura do bolão da Copa nunca depende de API não-oficial.
- **Tapa-buraco opcional — API-Football free (100 req/dia).** Para casos pontuais (estadual específico) que ESPN/football-data não cubram. **Não serve como primária** (limite diário).

**Idioma:** ESPN/football-data retornam EN. Manter **mapa de aliases no banco** para PT-BR ("Athletico-PR", "Atlético-MG", "Brasileirão" = "Brazilian Serie A"). `?lang=pt&region=br` na ESPN ajuda só parcialmente.

---

## 4. Scraping como fallback

**Veredito honesto: vale ter — mas só como rede de segurança de 2ª/3ª camada, nas formas baratas, nunca furando anti-bot e nunca como primária.**

- **Legalidade (app BR, sem apostas, lendo fatos públicos deslogado):** risco jurídico **baixo**. Fatos esportivos não têm copyright (*Feist*); raspar dado público não viola CFAA (*hiQ*); raspar **deslogado** tende a não violar ToS (*Meta v. Bright Data*). Brasil **não tem** direito sui generis de banco; a "nuance UE" (*Football Dataco*: fixtures não têm proteção sui generis) só importaria se raspasse site europeu. O risco real é **técnico** (403/429/ban de IP), não processo.
- **Ordem de robustez/preferência:** (a) **endpoints JSON internos** ("hidden API", igual à ESPN) — melhor; (b) **JSON-LD `SportsEvent`** embutido na página (estável por SEO); (c) **HTML puro** (frágil, último recurso). **Evitar alvos atrás de Cloudflare/Akamai/DataDome** — troque de alvo, não tente furar (corrida armamentista perdida).
- **Onde rodaria:**
  - (a) e (b) → **na Edge Function de sync** que já existe (fetch + parse leve cabem nos 2s de CPU). **Sem navegador** no Deno/Supabase — Playwright não roda aqui.
  - (c)/render JS → **GitHub Actions agendado** (repo público = minutos ilimitados; privado ~2.000 min/mês), gravando no Supabase via service-role em GitHub Secrets. Cron mínimo 5 min, UTC, pode atrasar.
- **Disciplina:** só deslogado, só fatos (placar/horário/escalação), nunca texto editorial; respeitar `robots.txt`; User-Agent honesto com contato; rate baixo; cache no banco.

**Recomendação:** por ora, **não construir scraping de HTML**. A "cadeia de fallback" da F1 (ESPN→football-data→TheSportsDB, todas JSON) já cobre 95% do risco. Scraping HTML só entra (em GitHub Actions) se um dado específico crítico não existir em nenhuma API — improvável para o escopo BR+WC.

---

## 5. Arquitetura-alvo de ingestão

Princípio central (MDM): **separar fonte de entidade canônica**. Hoje as duas estão na mesma linha. A meta é manter `competitions/teams/matches` como **tabelas canônicas (golden)** que o front lê, e mover o bruto por fonte para tabelas `source_*`.

### Diagrama

```
[ESPN]      [football-data]   [TheSportsDB]   [openfootball WC]   [scraping JSON-LD?]
   │              │                 │                 │                    │
   ▼ INGEST (Edge Function sync-football, 1 linha por fonte, raw JSON + campos normalizados + content_hash)
┌────────────────────────────────────────────────────────────────────────────────┐
│  source_competitions  /  source_teams  /  source_matches      (STAGING — admin-only) │
└────────────────────────────────────────────────────────────────────────────────┘
   │ MATCH: determinístico → fuzzy → fila de revisão manual   (ordem: comp → team → match)
   ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  entity_xref   (crosswalk:  kind + provider + source_id  ->  canonical_id)            │
└────────────────────────────────────────────────────────────────────────────────┘
   │ RECONCILE: survivorship POR CAMPO (precedence/recent/complete/vote/trust) + detecta conflito
   ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  mdm_field_resolution (golden por campo + evidência de todas as fontes + status)      │
└────────────────────────────────────────────────────────────────────────────────┘
   │ UPDATE das linhas canônicas com os valores vencedores
   ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│  competitions / teams / matches   (CANÔNICAS — o FRONT lê SÓ isto; RLS público/auth)  │
└────────────────────────────────────────────────────────────────────────────────┘
```

### Schema proposto (alto nível, compatível com o existente)

**Migração-chave:** manter `competitions/teams/matches` como canônicas e **remover delas as colunas `provider`/`provider_code`/`provider_ref` e os unique index `*_provider_uk`** (uma canônica passa a ter N fontes). Para cada linha atual, criar 1 XREF `method='seed'`. O front não muda de contrato.

**Staging (bruto por fonte) — admin-only:**

```
source_competitions(id, provider, source_id, source_season, raw jsonb,
  name, name_norm, short_name, area, type, emblem_url, fetched_at, content_hash,
  unique(provider, source_id, source_season))

source_teams(id, provider, source_id, raw jsonb,
  name, name_norm, short_name, tla, country, crest_url, fetched_at, content_hash,
  unique(provider, source_id))

source_matches(id, provider, source_id, raw jsonb,
  source_comp_id, kickoff_at, kickoff_date(BRT), home_source_team, away_source_team,
  home_name_norm, away_name_norm, status, home_score, away_score, home_pen, away_pen,
  matchday, stage, fetched_at, content_hash, unique(provider, source_id))
```
`content_hash` = idempotência: se não mudou, pula. `raw` **nunca** é servido ao usuário.

**Crosswalk (provider ⇄ canonical):**

```
entity_xref(id, kind[competition|team|match], canonical_id, provider, source_id,
  source_row_id, status[confirmed|pending|rejected], method[deterministic|fuzzy_auto|manual|seed],
  confidence numeric, decided_by, decided_at, notes, created_at, updated_at,
  unique(kind, provider, source_id))
```
(Alternativa mais estrita: 3 XREFs separados com FK reais, evitando FK polimórfica.)

**Aliases / dicionário (idiomas e apelidos):**

```
entity_alias(id, kind, canonical_id, alias, alias_norm(generated), locale, source, ...)
-- ex.: Série A canônica ← "Brazilian Serie A", "Campeonato Brasileiro Série A", "Brasileirão"
```

**Golden record por campo + log de conflito:**

```
mdm_field_resolution(id, kind, canonical_id, field, resolved_value, resolved_from(provider),
  strategy_used, source_values jsonb[{provider,value,fetched_at,trust}],
  status[agreement|conflict|single_source|missing], distinct_count, agreement numeric,
  updated_at, unique(kind, canonical_id, field))
index where status='conflict'   -- a UI de conflitos lê isto
```

**Configuração de survivorship (admin edita sem deploy):**

```
mdm_source_trust(kind, field, provider, priority, trust, pk(kind,field,provider))
mdm_field_strategy(kind, field, strategy[precedence|recent|complete|vote|trust], pk(kind,field))
mdm_match_queue(id, kind, source_row_id, provider, best_canonical, candidates jsonb, score, state, ...)
```

**Pipeline (4 passos, RPCs `SECURITY DEFINER` orquestradas pela Edge Function + pg_cron já existentes):** INGEST → MATCH → RECONCILE → SERVE. O front lê **só** as canônicas; o admin lê adicionalmente `mdm_match_queue` (pendências) e `mdm_field_resolution where status='conflict'` (divergências). RLS: `source_*`, `entity_xref`, `mdm_*` = **admin-only**; só canônicas têm `select` público/auth.

---

## 6. Reconciliação e cruzamento

Doutrina (Fellegi–Sunter): por par de registros, decidir **match** / **non-match** / **possible match** (revisão humana). Mapeado em faixas de confiança.

### Extensões necessárias (verificar quais faltam no projeto)
`unaccent`, `pg_trgm` (similaridade trigrama + índice GIN), `fuzzystrmatch` (levenshtein, metaphone). Função `norm_name()` imutável (lower+unaccent+remove ruído "FC/EC/clube/série/...").

### Chaves determinísticas (blocking + match exato)
- **Competição:** bloco por `area`+`type`; match por XREF existente; senão por `alias_norm` igual.
- **Time:** match forte por `tla` (sigla) dentro do mesmo `country` — quase-único no futebol.
- **Jogo (mais robusto):** **reconcilie competição e time PRIMEIRO**; aí a chave natural do jogo é determinística: `(canonical_competition_id, kickoff_date, canonical_home_team_id, canonical_away_team_id)`, com tolerância de data ±1 dia (fuso entre APIs — por isso `kickoff_date` em BRT no staging). Jogo cai por consequência, quase sem fuzzy.

### Fuzzy (desempate, quando determinístico falha)
Escore = max(alias exato=1.0, `similarity()` trigrama do nome, metaphone=0.85 piso). **Honestidade:** para "Brazilian Serie A" = "Brasileirão" (idiomas diferentes), trigrama/levenshtein **não bastam** — a **tabela de aliases** é a verdade; fuzzy é só desempate.

### Roteamento por limiar (calibrar com dados reais — valores de referência)
- `score ≥ 0.92` → XREF `confirmed`, `method='fuzzy_auto'`.
- `0.75 ≤ score < 0.92` → XREF `pending` + linha em `mdm_match_queue` (revisão admin).
- `score < 0.75` sem candidato → **nova entidade canônica** OU enfileira "possível entidade nova".

Admin confirma/corrige via RPC `mdm_confirm_match()` (vincula a canônico existente) e `mdm_create_canonical()` (cria nova a partir do staging).

### Valor "vencedor" por campo (survivorship configurável)
- **placar final → voting majoritário** (2 de 3 APIs dizem 2×1 ganha — melhor defesa contra erro de uma API).
- **status ao vivo → most-recent-wins** (vence o `fetched_at` mais novo).
- **escudo → source precedence** (TheSportsDB por ter melhor arte).
- **`emblem_url`/`short_name` → most-complete-wins** (não-nulo).
- **nome → precedence/alias.**

### Detectar e registrar divergência
`mdm_reconcile_entity()` coleta valores das fontes confirmadas por campo, calcula `distinct_count`, define `status` (`agreement`/`conflict`/`single_source`/`missing`), escolhe vencedor pela estratégia, grava `agreement` (fração que concorda) em `mdm_field_resolution`, e dá UPDATE na canônica. Conflitos viram a fila de qualidade do admin (e podem virar `sync_alerts`).

---

## 7. Catálogo inteligente no admin

Aterrado na `CompeticoesAdmin.tsx` atual (selector de provider, busca, criar competição, publicar/renomear/sincronizar/excluir).

**(a) Escolher de QUAL fonte adicionar.** Mantém o selector de provider atual, mas a criação passa a gerar **uma canônica + 1 XREF** (não mais "competição = provider"). Se o nome normalizado bater com canônica existente (via aliases/fuzzy), o admin **vincula como fonte adicional** em vez de criar duplicata (resolve o alerta de duplicata que já existe hoje).

**(b) Ligar/desligar fontes por competição.** Cada competição canônica mostra suas fontes (XREFs) com toggle "fonte ativa". Desligar uma fonte = parar de ingerir/considerar no survivorship sem apagar histórico. Útil quando uma API começa a dar dado ruim para aquela competição.

**(c) Visão de conflitos.** Nova aba lendo `mdm_field_resolution where status='conflict'`:
- Lista: "Flamengo×Palmeiras — campo `away_score`: football_data=1, espn=1, thesportsdb=2 → divergente. Golden=1 por voto (2/3)."
- Ações: **ver evidência** (valor de cada API + `fetched_at`), **escolher fonte vencedora** (override pontual), **override manual** (digitar valor curado — vira `method='manual'`, registrado em `admin_audit_log`), **ajustar `mdm_source_trust`/`mdm_field_strategy`** (regra global sem deploy).
- A fila de **matching pendente** (`mdm_match_queue`) vira outra aba: "esta competição/time de tal fonte parece ser X — confirmar/rejeitar/criar nova".

UX coerente com o projeto: front só dispara RPCs `SECURITY DEFINER`; toda decisão é auditada.

---

## 8. Segurança e anti-abuso

**Verdades que guiam tudo (não opinião):** a anon key é **pública por design** (vai no bundle); **CORS não é autenticação** (curl ignora); a fronteira real é **RLS (quem/o quê) + rate limit/WAF (quanto)**. Rate limit nativo do Postgres/PostgREST **só funciona em escrita** (GET vai para read replica).

### Só logados leem dado completo — conciliando com a landing pública
- **Fechar o agregado/curado ao `anon`:** rankings globais, "The Best", estatísticas cruzadas → `to authenticated`.
- **Landing pública = fatia curada:** manter aquisição expondo ao `anon` **só** uma view/RPC enxuta (próximos N jogos do dia, sem IDs internos, sem histórico, sem agregados), com **LIMIT embutido**. Opção melhor: **RPC `SECURITY DEFINER` pública `landing_matches()`** com LIMIT no servidor; o `anon` chama só a função, não as tabelas.
- **RLS:** restringir via `TO authenticated` (não só `auth.uid() IS NOT NULL`) e usar **`(select auth.uid())`** nas policies (~95% de ganho de performance, custo zero).

> Conciliável: "login para ler o jogo completo" + "landing pública com isca curada" coexistem. Atende ao objetivo sem matar aquisição.

### Rate limit POR USUÁRIO (reaproveitando `rate_limit_hit`)
- GET puro não é limitável → servir **leitura crítica/agregada via RPC `POST`** (`supabase.rpc(...)` é POST), com bucket = `auth.uid()` (ou `'anon:'+IP` quando deslogado). A `rate_limit_hit` (janela fixa atômica) **já existe** — estendê-la para leitura é o caminho.
- **Nota de UX:** "~1 req/min" é agressivo demais para SPA (abrir tela, trocar de dia, refresh já gera vários GETs). Pensar como **"por ação cara"** (sync/export/busca apertados; leitura geral 60–120 req/min) + cache no cliente (já existe `useAllMatches`/poll).
- `db_pre_request` (HTTP 420 > 100/5min por IP) para **escrita direta** na Data API (exemplo oficial). Auth já rate-limita login/refresh (token bucket).

### Camadas extra (defense-in-depth)
- **Teto de linhas por resposta** (`max-rows`/`.limit()`) — impede dump em uma request (OWASP API4:2023). **Grátis, faça já.**
- **Cloudflare na frente** (custom domain do Supabase OU proxy via função sua, já que Vercel só vê a SUA SPA, não o tráfego anon→PostgREST): 1 regra de rate limit grátis (~60–120 req/min/IP, janela 10s) + Bot Fight Mode + DDoS. Bot Management avançado é Enterprise (não inventar que é grátis).

### Proteção da ingestão e segredos (já está certo — manter)
- Fetch externo só por **Edge Function com service_role** + cron, **nunca** pelo cliente. Segredos (service key, `CRON_SECRET`, token da API) **fora do bundle** (env das functions). Verificação de `CRON_SECRET`/assinatura + fail-closed (já feito no webhook MP). **Nunca repassar JSON cru da API ao cliente** — normaliza, persiste, serve do banco.

### Anti-scraping do dado curado
Aceitar o limite teórico: o que um logado vê, um scraper logado raspa devagar. Mitigação real: **agregado só `authenticated` + via RPC POST com LIMIT + rate limit por `auth.uid()`** (transforma "baixar tudo" em "muitas chamadas rastreáveis e banláveis") + borda (Cloudflare/Bot Fight). Encarecer + detectar, não bloquear 100%.

**Resumo grátis vs defense-in-depth:**
- **Grátis/alto impacto, faça já:** fechar agregado ao anon; landing via RPC curada com LIMIT; `max-rows`/`.limit()`; `(select auth.uid())`; grep no `dist/` por segredos.
- **Defense-in-depth barato:** RPC POST + `rate_limit_hit` por `auth.uid()`; `db_pre_request` para escrita; Cloudflare na frente.
- **Aceitar honestamente:** anon key não esconde; CORS não autentica; GET não rate-limita no Postgres; scraping lento logado sempre possível.

---

## 9. Escudos/logos

**A infraestrutura já existe:** `teams.crest_url` (hotlink) + `teams.local_crest` (override) + `TeamCrest.tsx` com fallback `src → local_crest → crest_url → placeholder`. Falta só **popular `local_crest`**.

**Design recomendado — Supabase Storage fetch-once-cache (bucket público `teams`):**
1. **Dedup por `team.id`**, caminho determinístico `teams/{teamId}.webp` (ou `.svg`).
2. **Fetch só quando faltar** (se `local_crest` preenchido e objeto existe, pula) — cada escudo baixado **uma vez na vida**.
3. **Baixar de `crest_url`**, validar imagem, upload com `upsert` e `cacheControl` longo (≥7 dias, ex. `2592000`).
4. **Formato:** SVG cru se a fonte tiver (escala perfeita ~5 KB); senão PNG/WebP ~64–128px. (Transformação nativa do Storage é Pro-only — converter na Edge Function com `resvg`/`sharp` ou guardar PNG original; ~500 escudos é trivial.)
5. **Gravar `local_crest`** = URL pública estável; manter `crest_url` como rede de segurança durante migração e depois parar de depender dele.
- **Onde tocar:** `sync-football/index.ts` (~linhas 375 e 659, onde grava `crest_url`); bucket novo `teams` (público, CDN grátis); `TeamCrest.tsx` **sem mudança**.

**Repo (`public/teams/`) — alternativa só para o conjunto fixo:** as 32 seleções da Copa 2026 podem ser versionadas no repo (imutável, sem dependência de runtime, servido pela Vercel CDN). Mas adicionar/atualizar exige commit+deploy na main (atrito) — por isso **Storage é o caminho único mais simples** (o sync já é o ponto natural).

**Custo:** ~5–10 MB total + egress irrisório → **R$0**, dentro do Free.

**Licenciamento (não é aconselhamento jurídico):** escudos são marca registrada; não há fair use garantido. Como o produto **cobra**, mitigar com: **disclaimer** nos Termos ("nomes e escudos são marcas de seus titulares, usados só para identificação" — padrão FotMob), **logo pequeno** ao lado do nome (sem sugerir patrocínio), e o **placeholder de iniciais** do `TeamCrest` como modo conservador. Para o conjunto fixo, SVGs do Wikimedia Commons têm licença por arquivo (verificar caso a caso).

---

## 10. Custos

Números verificados (jun/2026) nas fontes oficiais; itens secundários marcados.

| Componente | Hoje (<200) | ~1.000 users | ~10.000 users |
|---|---|---|---|
| **Supabase** | Free $0 | Free $0 (ou Pro $25 p/ conforto) | **Pro $25** + ~$10–40 egress |
| **Vercel** | Hobby $0 *(ver compliance)* | **Pro $20** (compliance) | Pro $20 + ~$5–30 overage |
| **Dados futebol** | ESPN+TheSportsDB $0 | $0 (ou football-data €12–29 p/ ao vivo) | API-Football Pro ~$19 ou football-data €29 |
| **Worker sync** | pg_cron/pg_net $0 | GitHub Actions $0 | GitHub Actions $0 |
| **Escudos** | Storage Free $0 | $0 | $0 |
| **Total realista** | **~$0** (compliance: ~$20) | **~$20–77** | **~$70–140** |

**Gatilhos de upgrade:**
- **Supabase Pro ($25):** **DB > 500 MB** (gatilho-mestre — monitorar tabela `predictions`) OU tirar pausa por inatividade OU egress > 5 GB.
- **Vercel Pro ($20):** **compliance** (site cobra → termos exigem Pro) — único custo "obrigatório" hoje. **Alternativa grátis legítima:** mover o SPA estático para **Cloudflare Pages/Netlify** (sem cláusula comercial dura) — vale considerar antes de pagar.
- **Primeira API paga:** querer **placar ao vivo confiável** (football-data Livescores €12) ou **estatísticas/escalações/histórico** (football-data Deep €29 / API-Football Pro $19).

**Recomendação para ficar grátis o máximo possível:** manter ESPN+TheSportsDB (com fallback football-data free); Storage Free p/ escudos; GitHub Actions p/ worker se precisar; **resolver a cláusula Vercel** conscientemente (assumir $20 ou migrar para Cloudflare Pages). Nenhuma API paga é necessária para os cenários (a) e (b).

**Incertezas:** preços API-Football ($19/$29/$39) via fontes secundárias (página oficial deu 403); pausa Free Supabase "7 dias" e "free forever" football-data via secundárias; pg_net sem limite numérico na fonte primária; cota mensal exata da Data API por plano não confirmada.

---

## 11. Roadmap em fases

Priorizado por **maior redução de risco com menor esforço e grátis primeiro**. Esforço: P (pequeno), M (médio), G (grande).

| Fase | Objetivo | Esforço | Risco que ataca | Toca prod ao vivo? |
|---|---|---|---|---|
| **F1 — Cadeia de fallback (QUICK WIN)** | Sync tenta ESPN → football-data → TheSportsDB, com degradação graciosa (todas falham → mantém último dado bom + alerta, nunca zera). Marcar `source`+`fetched_at` por registro. | **M** | **R1 (ALTO)** | Sim (Edge Function; sem schema). Cuidado: validar com `db reset` + navegador. |
| **F2 — Escudos fetch-once-cache** | Bucket `teams` público + popular `local_crest` no sync. Eliminar hotlink. | **P-M** | R2 | Sim (migration de storage + Edge Function). Baixo risco (fallback já existe). |
| **F3 — Blindar leitura** | Fechar agregado/curado ao `anon`; landing via RPC `landing_matches()` curada com LIMIT; `max-rows`/`.limit()`; `(select auth.uid())`. | **M** | R3, R6 | **Sim — sensível** (mexe em RLS de leitura pública). **Exige OK do João** (landing deslogada muda). |
| **F4 — WC2026 à prova de balas** | Estrutura (grupos/fixtures) via openfootball/worldcup.json; ESPN só placar. Aliases das seleções. | **M** | R5 | Sim (dados). Antes da Copa. |
| **F5 — Staging + crosswalk (MDM base)** | Criar `source_*`, `entity_xref`, `entity_alias`; migrar linhas atuais com XREF `seed`; sync passa a gravar staging. Front ainda lê canônicas (sem mudança de contrato). | **G** | R4 (estrutural) | **Sim — alto impacto** (refactor de schema). Migração cuidadosa + `db reset`. **OK explícito.** |
| **F6 — Reconciliação + golden record** | Matching determinístico/fuzzy + fila de revisão; `mdm_field_resolution` (voting/recent/precedence); detecção de divergência. | **G** | R4 (qualidade) | Sim (lógica de banco). Calibrar limiares com dados reais. |
| **F7 — Catálogo inteligente no admin** | UX: escolher fonte, ligar/desligar fontes, visão de conflitos + override. | **M-G** | R4 (operação) | Front + RPCs admin. Baixo risco para o usuário final. |
| **F8 — Borda (opcional)** | Cloudflare na frente (rate limit/IP + Bot Fight + DDoS) ou avaliar Cloudflare Pages p/ resolver compliance Vercel. | **M** | R3/R6/R7 | Infra/DNS. Planejar com cuidado (custom domain). |

**Quick win destacado:** **F1** blinda contra a quebra da ESPN (o maior risco operacional) sem tocar schema — é o que mais reduz risco por unidade de esforço.

---

## 12. Decisões em aberto para o João

1. **Landing deslogada (F3):** mantemos jogos visíveis sem login (fatia curada via RPC com LIMIT) ou exigimos login para ver qualquer jogo? (Trade-off aquisição × proteção do ativo.)
2. **Escudos — Storage vs repo:** confirmar **Supabase Storage fetch-once-cache** como caminho único? (Recomendado.) Ou versionar as 32 seleções da Copa no repo também?
3. **Prioridade de fontes:** confirmar **ESPN primária + football-data fallback + TheSportsDB escudos + openfootball WC**? Quer ativar a chave **football-data** (grátis) já para o fallback funcionar?
4. **Quando entrar no MDM (F5-F6):** vale o refactor de schema agora, ou só quando houver 2ª fonte ativa por competição de fato? (F5 é o maior esforço/risco do roadmap.)
5. **Compliance Vercel (R7):** assumir **Vercel Pro $20/mês** ou avaliar migrar o SPA para **Cloudflare Pages/Netlify** (grátis, sem cláusula comercial)?
6. **Aceitar custo se escalar:** ok com **~$70–140/mês aos 10k users** (Supabase Pro + Vercel Pro + primeira API paga), e qual gatilho aciona a primeira API paga — ao vivo confiável (€12) ou estatísticas (€29/$19)?
7. **Scraping HTML:** autorizar construir scraping de HTML/JSON-LD (em GitHub Actions) como 4ª camada, ou ficar só na cadeia de APIs JSON (F1)? (Recomendado: ficar nas APIs por ora.)
8. **Override manual de placar:** confirmar que admin pode sobrescrever golden record (com auditoria) na visão de conflitos — incluindo placar de jogo que afeta pontuação 3/2/1? (Impacta resultado de bolão — decisão sensível.)

---

## 13. Fontes

**Fontes de dados**
- ESPN hidden API: https://github.com/pseudo-r/Public-ESPN-API · https://zuplo.com/learning-center/espn-hidden-api-guide · https://scrapecreators.com/blog/espn-api-sports-data · https://espnapi.com/espn-api-official-or-unofficial-easy-beginner-guide/
- football-data.org: https://www.football-data.org/coverage · https://docs.football-data.org/general/v4/policies.html · https://www.football-data.org/pricing
- TheSportsDB: https://www.thesportsdb.com/documentation · https://www.thesportsdb.com/free_sports_api · https://www.thesportsdb.com/pricing
- API-Football: https://www.api-football.com/pricing · https://www.api-football.com/coverage · https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports
- Copa 2026 (público): https://github.com/openfootball/worldcup.json · https://github.com/openfootball/worldcup
- Comparativos: https://www.thestatsapi.com/blog/free-football-api-alternatives · https://www.jokecamp.com/blog/guide-to-football-and-soccer-data-and-apis/

**Scraping — legalidade e técnica**
- Feist: https://www.law.cornell.edu/supremecourt/text/499/340 · https://fairuse.stanford.edu/case/feist-publications-inc-v-rural-telephone-service-co/
- hiQ / CFAA: https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn · https://www.jenner.com/en/news-insights/publications/client-alert-data-scraping-in-hiq-v-linkedin-the-ninth-circuit-reaffirms-narrow-interpretation-of-cfaa
- Meta v. Bright Data: https://newmedialaw.proskauer.com/2024/01/24/california-court-issues-noteworthy-decision-on-breach-of-contract-claims-in-web-scraping-dispute/ · https://blog.ericgoldman.org/archives/2024/01/game-on-bright-data-scores-major-victory-in-web-scraping-dispute-with-meta-guest-blog-post.htm
- robots.txt: https://bytetunnels.com/posts/is-robots-txt-legally-binding-scraping-law-explained/ · https://www.promptcloud.com/blog/robots-txt-scraping-compliance-guide/
- UE / Football Dataco: https://www.scl.org/2407-football-dataco-no-database-copyright-protection-for-fixture-lists/ · https://littletonchambers.com/protecting-athletes-data-an-examination-of-database-rights-in-the-uk-and-eu/
- JSON-LD / anti-bot: https://schema.org/SportsEvent · https://scrapfly.io/blog/posts/http2-http3-fingerprinting-guide · https://developers.cloudflare.com/bots/additional-configurations/ja3-ja4-fingerprint/

**Reconciliação / MDM**
- Survivorship/golden: https://profisee.com/blog/mdm-survivorship/ · https://profisee.com/blog/what-is-a-golden-record/ · https://dataladder.com/guide-to-data-survivorship-how-to-build-the-golden-record/ · https://bi-insider.com/posts/master-data-management-the-golden-record/
- Crosswalk/XREF: https://docs.informatica.com/master-data-management/multidomain-mdm/10-3/overview-guide/key-concepts/content-metadata/cross-reference--xref--tables.html · https://docs.oracle.com/cd/E23943_01/dev.1111/e10224/med_xrefs.htm
- Record linkage: https://en.wikipedia.org/wiki/Record_linkage · https://www.zingg.ai/post/deterministic-vs-probabilistic-matching-why-enterprise-entity-resolution-needs-both · https://dataladder.com/fuzzy-matching-101/
- Revisão humana: https://www.maviklabs.com/blog/human-in-the-loop-review-queue-2026/ · https://www.dataiku.com/stories/blog/accelerating-entity-resolution
- Reconciliação/divergência: https://www.future-processing.com/blog/data-reconciliation-the-great-data-jigsaw/ · https://www.ibm.com/think/topics/data-reconciliation · https://dqops.com/docs/categories-of-data-quality-checks/how-to-reconcile-data-and-detect-differences/
- Fuzzy Postgres: https://www.postgresql.org/docs/current/fuzzystrmatch.html · https://www.postgresql.org/docs/current/pgtrgm.html

**Segurança / anti-abuso**
- Supabase API keys: https://supabase.com/docs/guides/getting-started/api-keys
- Securing API (grants+RLS, rate limit só escrita, HTTP 420, schemas): https://supabase.com/docs/guides/api/securing-your-api
- RLS (`TO authenticated`, `(select auth.uid())`): https://supabase.com/docs/guides/database/postgres/row-level-security
- Auth rate limits: https://supabase.com/docs/guides/auth/rate-limits
- OWASP API4:2023: https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/ · https://owasp.org/API-Security/editions/2023/en/0x11-t10/
- Cloudflare rate limiting: https://developers.cloudflare.com/waf/rate-limiting-rules/ · https://developers.cloudflare.com/waf/rate-limiting-rules/best-practices/

**Escudos / Storage**
- Supabase pricing/limites/CDN: https://supabase.com/pricing · https://supabase.com/docs/guides/storage/uploads/file-limits · https://supabase.com/docs/guides/storage/cdn/fundamentals · https://supabase.com/docs/guides/storage/cdn/smart-cdn · https://supabase.com/docs/guides/platform/manage-your-usage/storage-image-transformations · https://supabase.com/docs/guides/functions/storage-caching · https://github.com/orgs/supabase/discussions/5737
- BLOB no banco (evitar): https://arxiv.org/pdf/cs/0701168 · https://dev.to/hrishikesh_dalal_ced8f95e/system-design-ep-12-why-your-database-hates-your-images-a-guide-to-blobs-2k00
- Licenciamento: https://cosmovici-ip.com/news/fantasy-sports-and-intellectual-property-legal-implications-in-the-digital-age/ · https://answers.justia.com/question/2024/04/24/under-what-conditions-can-we-use-soccer-1011586 · https://scarincihollenbeck.com/law-firm-insights/how-to-get-away-with-using-a-logo-without-permission · https://apps.apple.com/us/app/fotmob-soccer-live-scores/id488575683 · https://commons.wikimedia.org/wiki/Category:SVG_association_football_logos

**Custos / infra**
- Supabase: https://supabase.com/pricing
- Vercel: https://vercel.com/docs/limits · https://vercel.com/pricing
- football-data pricing: https://www.football-data.org/pricing
- API-Football pricing (403, secundárias): https://www.api-football.com/pricing
- Sportmonks: https://www.sportmonks.com/football-api/plans-pricing/ · https://www.sportmonks.com/football-api/free-plan/
- GitHub Actions billing: https://docs.github.com/billing/managing-billing-for-github-actions/about-billing-for-github-actions
- Render / Fly: https://render.com/pricing · https://fly.io/docs/about/pricing/

---

**Incertezas materiais (honestidade):** limiares de matching 0.92/0.75 são da literatura, **não calibrados** para este domínio; matching PT×EN depende de aliases (fuzzy não basta); extensões `pg_trgm`/`fuzzystrmatch` provavelmente **faltam** no projeto (verificar); limites ESPN **não publicados** (tratar como desconhecido, cachear); preços API-Football e algumas notas de pricing vêm de fontes secundárias; minutos GitHub Actions privado (~2.000/mês) e pausa Free Supabase confirmar na conta.
