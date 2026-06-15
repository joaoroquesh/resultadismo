# Changelog — Resultadismo

Todas as mudanças relevantes que **sobem para produção** a partir de agora são registradas aqui.

Formato inspirado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versionamento
**MAJOR.MINOR.PATCH** (regras no [`MESTRE.md`](MESTRE.md) §6). O número fonte de verdade fica no
[`package.json`](../package.json).

> **Como usar:** toda mudança que sobe ganha uma entrada (passo 7 do protocolo em
> [`MESTRE.md`](MESTRE.md) §5 / [`08-PROCESSO.md`](08-PROCESSO.md)). Acumule em **[Não lançado]**
> enquanto desenvolve; ao subir, mova para uma versão datada e atualize o `package.json`.
> Numeração (ADR 0003): legado = **v0**, **1.x = soft-launch** (última: 1.11.0), **2.0 = Copa** (atual: 2.0.0). As
> versões abaixo foram **relabel 2.x → 1.x** (só o dígito MAJOR; detalhe preservado). A versão **só
> sobe em release deliberado**, não a cada commit. Evolução anterior em [`HISTORICO.md`](HISTORICO.md).

Tipos de entrada: **Adicionado**, **Alterado**, **Corrigido**, **Removido**, **Segurança**,
**Depreciado**.

---

## [Não lançado]

### Adicionado
- **Grupo nasce ATIVO + moderação reativa de nome (ADR [`0010`](decisions/0010-grupo-ativo-moderacao-reativa.md)).**
  No modo grátis o grupo passa a nascer **ativo na hora**, sem fila de aprovação: o usuário cria e
  já joga. Os **admins são avisados na criação** ("Novo grupo criado, confira o nome") e podem
  **sinalizar** um nome impróprio depois (botão na aba Grupos do admin) — aí o nome **some e vira
  genérico** ("Grupo (nome em revisão)") em todos os lugares e o **dono é avisado** pra trocar; o
  grupo segue funcionando. Ao renomear, o nome volta a valer. Migration `20260615120000` (trigger
  de criação ativo + RLS, RPC `admin_flag_league_name`, `update_group_info` libera no rename,
  backfill dos pendentes). Front: `groupName.ts`, banner no grupo, copy da criação, `useFlagLeagueName`.
- **Escolher se a pontuação conta os jogos já realizados ou só a partir de hoje.** Na criação do
  grupo, um toggle "A pontuação conta a partir de quando?" — **A partir de hoje** (padrão) ou
  **Contar jogos já feitos**. Grava `league_competitions.starts_on` (a classificação já filtrava por
  ele); a aba Classificação mostra "a pontuação conta a partir de DD/MM" quando aplicável.
- **Compartilhar a classificação do grupo como imagem.** Botão "Compartilhar classificação" na aba
  Classificação gera uma imagem no estilo da marca (mesmo motor do share de placar) com logo, nome
  do grupo, posição/nome/pontos + cravadas e aproveitamento, pódio em ouro/prata/bronze e o selo
  **💰 do prêmio** quando o bolão paga (top 20). Web Share (WhatsApp) com fallback de download.
  Novo `standingsShareImage.ts` reaproveitando `C`/`roundRect`/`loadImage`/`shareImageBlob` de
  `shareImage.ts`; evento GA4 `share { content_type: 'group_standings' }`.
- **Bolão: o membro vê o que vale e quem está participando do pago.** (1) Na **Classificação** do
  grupo, um aviso deixa claro o **recorte de seleções** quando há um ("Neste grupo valem os jogos
  de X. Você pode palpitar em qualquer jogo, mas só esses contam no ranking aqui.") — some quando o
  recorte é "Todas", pra não poluir. (2) Na classificação, **todo pagante** do bolão pago agora
  exibe um selo **🎟️ no bolão** (visível a qualquer membro, não só ao dono); os premiados seguem
  com o **💰 valor**. `describeTeamScope` em `teamsCatalog`; `payers` propagado ao `StandingsTable`.

### Corrigido
- **Palpites da galera: pontuação dobrada não some mais no encerrado + trovão de 2× por palpite.**
  No jogo encerrado a pontuação de quem usou o Dobro voltava ao valor base (o `ScorePill` não
  recebia `doubled`); agora mostra o valor dobrado (ex.: cravada com 2× = +6). E todo palpite que
  usou o **Dobro** ganha um **⚡** ao lado na lista da galera — **sempre**, inclusive quando a
  pessoa não pontuou (ex.: erro com 2×). `ScorePill` ganhou `showZap` pra não duplicar o ícone.
- **Fileira de dias: hoje agora centraliza DE VERDADE (re-fix).** O fix anterior só centralizava
  uma vez preso ao escopo; no load frio (logado e em grupo) os jogos/dias chegavam depois e o dia
  caía à esquerda. Agora a centralização re-roda quando a **lista de dias muda** (`centerKey` com a
  assinatura dos dias) e a medição é robusta (tenta antes do paint, re-tenta se a largura ainda é 0,
  re-centra após as fontes carregarem) — sem brigar com o scroll manual depois.

### Alterado
- **Palpites da galera: só os SEUS grupos, na ordem dos favoritos, e ranking ao vivo.** O chip
  "Todos" morreu — palpite de quem não está nos seus grupos não aparece (sem grupo, a área convida
  a entrar num). Os chips seguem a MESMA ordem da página /grupos (favoritos primeiro, na ordem de
  favoritar; a estrela ao lado favorita/desfavorita o grupo ativo) e o primeiro abre por padrão.
  Com o jogo ROLANDO, a lista ordena pela pontuação em curso e mostra só o número colorido ao lado
  (+6 dourado, +2 verde, +1 azul, 0 cinza) — sem o selo de fundo, que segue só no encerrado.
  Desempate: vitória do mandante → empate → vitória do visitante; dentro, mais gols do lado
  decisivo, depois do outro. Encerrado ordena pela mesma régua (pontuação oficial).

### Corrigido
- **Fileira de dias: hoje nasce CENTRALIZADO e a bolinha de "ao vivo" não corta mais.** (1) Ao
  abrir/atualizar a página, o dia selecionado (hoje) vem centralizado na fileira, com clamp: se ele
  está numa ponta, encosta na borda (1º dia → à esquerda, último → à direita) em vez de forçar; a
  rolagem manual do usuário não é mais desfeita (só re-centra ao trocar de aba de escopo, não a cada
  toque num dia). `ScrollRow` ganhou `centerSelector`/`centerKey`. (2) O ponto vermelho de jogo ao
  vivo no tab do dia era cortado no topo pelo `overflow` da fileira; agora há respiro vertical
  (`py-1.5`) e ele aparece inteiro.
- **Sync: sigla (TLA) deixou de ser chave de matching de time — "Camboja 2×0 Hong Kong" não vira
  mais "Atlético-MG 2×0 Hong Kong".** O gerador do mapa canônico (`gen-teams-catalog.mjs`)
  indexava também o TLA de cada time; a abreviação da ESPN pra países sem cadastro colidia com
  sigla de clube e o sync gravava o clube no lugar da seleção (auditoria: Camboja→Atlético-MG e
  Comores→Como **já em prod** nos amistosos pré-Copa; Grécia→Grêmio, Botswana→Botafogo e
  Bahamas→Bahia eram minas armadas). Agora só slug/nome/short/aliases viram chave (sigla fica
  para os fallbacks `TEAM_PT`/`COUNTRY_EN_PT` do sync) e **Camboja, Comores e Grécia** entraram
  no registro como seleções (Grécia casou o `grecia.svg` que já existia). Auditoria pós-fix:
  182 seleções da ESPN, zero caem em clube; nenhuma chave existente mudou de dono. Migration
  `20260611150000` corrige os dados já gravados (2 times + 3 jogos; placar/pontuação intactos).
- **Seleções de amistoso sem cadastro apareciam em inglês e sem escudo ("Argentina × Iceland").**
  O registro tinha só 69 seleções; o que a ESPN mandava fora dele ficava com o nome cru em inglês
  no banco e o escudo caía no quadradinho de sigla (`teamCrestPath("Iceland")` → slug "iceland"
  não existe; o arquivo é `islandia.svg`). Varredura contra os dados reais de prod (REST anônimo:
  tabela `teams` + nomes dos 180 jogos): **77 seleções novas** no `data/teams-registry.json` com
  os aliases em inglês exatos das APIs (Iceland, Slovakia, Kazakhstan, "Cent Afr Rep",
  "Trin & Tob"…); 20 casaram escudo que já existia (`islandia.svg`, `russia.svg`, `hungria.svg`…).
  Pós-`gen:all`: todos os nomes de prod resolvem (sobram só clubes — fora do escopo — e o
  placeholder "Time"); nenhuma chave existente do canônico mudou de dono. Jogos já gravados em
  inglês se corrigem sozinhos no próximo sync em modo `catalog` (modo `scores` não toca nome).
  Obs.: Guam e Guatemala têm a mesma sigla (GUA) — cadastrá-los só ficou seguro com o fix do TLA
  acima, que subiu primeiro. Efeito colateral: o seletor de "seleção que torce"
  (perfil/onboarding) passa de 69 pra 146 opções, 59 sem bandeira.
- **Competições apagadas por engano no admin RESTAURADAS (com os "seguindo" intactos).** O João
  apagou 16 campeonatos em rascunho (Copa América, Eurocopa, Nations League, as 5 Eliminatórias,
  Saudi Pro League, Primeira Liga, Eredivisie, Süper Lig, Pro League BEL, Premiership SCO, Super
  League GR) sem saber que o delete é HARD e que rascunho aparece na personalização — eles sumiram
  da tela de campeonatos. A migration `20260611200000` recria cada um **com o MESMO id de antes**
  (fonte: `admin_audit_log`, que guarda id+nome de cada exclusão): como `followed_competition_ids`
  (uuid[]) e `followed_teams` (jsonb) não têm FK, os IDs ficaram nos perfis e **religam sozinhos**
  — ninguém perde o que tinha selecionado (única perda: `favorite_competition_id`, FK SET NULL,
  irrecuperável sem backup). Idempotente, só-INSERT com guardas (id/provider_code/slug), validada
  na simulação local (restaura + religa + lista na personalização + no-op na 2ª execução).
- **Imagem de palpites: selo da pontuação alinhado e raio visível na cravada.** O ⚡ era um emoji
  no canvas: métrica própria desalinhava/"quebrava" a linha do selo e, amarelo sobre o fundo
  dourado da cravada, ele sumia. Agora o raio do 2× é **desenhado** (polígono) na mesma baseline
  do texto, escuro no dourado e branco nos demais. De quebra: o escudo passa a ser buscado pelo
  **nome completo** do time (o curto abreviado tipo "Á. do Sul" caía no quadradinho de sigla) e o
  nome completo vira o rótulo quando cabe — África do Sul com bandeira e por extenso.

### Adicionado
- **Grupo aguardando aprovação agora avisa os admins** (sininho + push, link direto pra
  `Admin → Grupos`). Lacuna confirmada em produção: no modo grátis o grupo nasce `pending`
  esperando liberação, mas nenhum trigger cobria esse caminho — 3 grupos foram aprovados sem
  ninguém ser avisado (o alerta `name_review` pertence só ao fluxo de pagamento). Trigger novo
  `notify_admins_group_pending` com dedupe padrão de 6h por grupo. Validado em transação no banco
  local (INSERT como o front faz → 1 alerta por admin → rollback). → [`04`](04-ADMIN.md).
- **Painel de Avisos mostra o alcance real do push**: "Push no aparelho: N aparelhos (M pessoas) —
  o resto recebe só no sininho" (RPC nova `admin_push_stats`, só app-admin). Evita a impressão de
  que o aviso vira push pra todo o segmento.
- **`send-push` não engole mais erro de entrega**: cada falha vira log no dashboard (status +
  motivo + sufixo do endpoint) e a resposta passa a ser `{sent, total, failed[]}` — consultável em
  `net._http_response` pra diagnóstico definitivo (o silêncio de 10–11/06 ficou sem causa exata
  justamente por falta disso; a investigação confirmou criação/envio/exibição funcionando hoje).
- **Aba "Grupos" na página de jogos: os palpites que valem ponto nunca somem.** Quem personalizou
  "só Brasil" mas está num grupo que conta outras seleções vê os jogos do grupo numa aba própria.
  Ordem das abas: **Interesses** (encurtada; só personalização) → **Grupos** (união dos recortes dos
  meus grupos, inclusive pendentes de aprovação; é o **padrão** quando a pessoa tem grupo) →
  **Todos** → competições. **Coachmark** na 1ª visita explica a aba. As fileiras de abas e de dias
  usam o novo **`ScrollRow`** (componente de UI): **degradê nas bordas** quando há mais conteúdo pra
  arrastar, sumindo no fim do scroll. → [`03`](03-PAGINAS.md).
- **Anúncio in-app da Gestão do Bolão na home.** Pop-up (`NovidadeBolaoModal`) que aparece **uma
  vez** na tela de Jogos pra quem já passou do 1º acesso, listando o que dá pra fazer: definir o
  valor da inscrição, marcar quem pagou, configurar a divisão do prêmio (1º/2º/3º) e ver na
  classificação quem está levando, com o disclaimer de que o dinheiro continua fora do app. **Não
  colide com o tour guiado** dos novatos: o tour passou a emitir `resultadismo:tour-done` ao
  fechar, e o modal só abre depois disso (veteranos, que já têm o flag do tour, veem na hora).
  CTAs "Ver meus grupos" (→ /grupos) e "Agora não".

### Alterado
- **Imagem de palpites junta jogos de DIAS diferentes.** A seleção não se perde ao trocar a aba
  de dia: marca o de ontem, troca a aba, marca o de hoje e gera UMA imagem — em ordem de horário e
  com a **data pequenininha** em cada jogo ("QUA 10/06") pra dar o contexto. A barra ensina ("1
  jogo — toque em mais (até de outro dia)"); trocar de escopo zera a seleção. No caminho, corrigido
  um crash de tela branca pra usuário logado que existia só no working tree de hoje (estado da
  seleção lido antes de declarar) — nunca chegou em produção.
- **Compartilhar vários jogos ficou achável.** O ícone no card ganhou o rótulo "compartilhar"
  e **abre o modo de seleção já com aquele jogo marcado** — a barra ("1 jogo — toque em mais
  pra juntar" → "Gerar imagem") ensina o gesto; tocar nos outros cards soma na mesma imagem.
  Antes, o único jeito de juntar jogos era um botão no fim da fileira de dias (segue lá como
  atalho), que podia ficar fora da tela. De quebra, jogo no "ao vivo automático" (agendado que
  já começou há <4h) agora também conta como selecionável, na mesma régua do card.

### Corrigido
- **Coachmark da Gestão aponta pra aba certa (não mais pro canto).** Depois que a aba virou a 3ª
  (com a 4ª "Competições" à direita) e a fileira ganhou rolagem, a seta/balão da dica de novidade
  miravam o fim da fileira. O `Coachmark` ganhou `caretTargetSelector`: mede o botão alvo
  (`[data-value='bolao']`), traz ele à vista no trilho rolável e ancora a **seta, o balão (com
  clamp pra não vazar da tela) e o anel de destaque** sobre a aba **Gestão**, onde quer que ela
  esteja. O `SegmentedControl` passou a marcar cada botão com `data-value`.
- **Selo de prêmio (💰) não sobrepõe mais as cravadas no mobile.** Em telas pequenas o valor da
  premiação encostava na coluna CRA. Agora, quando o jogador leva prêmio, a 2ª linha mostra **só o
  selo** (esconde "X jogos") e as colunas numéricas do resumo encolhem um tico — o 💰 fica colado à
  esquerda, longe das cravadas (validado até 320px com nome longo). Quem não leva prêmio segue com
  "X jogos"; grupos sem bolão não mudam nada.
- **JogosPage: memoização do `dayMatches` restaurada na ordem certa.** O erro do React Compiler
  ("Existing memoization could not be preserved") era causado pelas funções de compartilhar
  declaradas **antes** do `dayMatches` que elas leem; o hotfix anterior tirou o `useMemo` e deixou
  2 avisos de deps. Agora o bloco de share vem **depois** da declaração e o `useMemo` voltou —
  lint zerou no arquivo (sobrou só o aviso de complexidade do backlog).
- **Abas do grupo não quebram mais no mobile (aba Gestão).** Com 4 abas, o `SegmentedControl`
  estourava a largura da tela em celulares. Agora o conteúdo **rola lateralmente DENTRO da
  pílula** (labels nunca quebram linha) com o **degradê do `ScrollRow`** na cor da pílula
  avisando que tem mais aba pra arrastar — mesmo padrão das fileiras de Jogos (regra 9). O
  `ScrollRow` ganhou a prop `fadeClassName` pra usar o fade fora do fundo da página. Vale pros
  9 usos do componente (Retrô, Nova Liga, admin etc.): quando as opções cabem, nada muda
  (continuam esticando); quando não cabem, rola em vez de quebrar.
- **Link de convite pra quem já é de casa.** Quem abre um link `?convite=` e **já concluiu** o
  1º acesso vai direto pra **/grupos com o código preenchido** (só na visita do clique — flag de
  sessão consumida; visitas normais seguem nos Jogos). Quem ainda não concluiu continua caindo no
  wizard, que já preenche o convite.
- **Onboarding: dois bugs do fluxo.** (1) O campo de convite aparecia com um **UUID aleatório** —
  era o `?code=` do **callback do OAuth do Google** sendo capturado como convite; agora só `?convite=`
  conta, com formato validado (`A–Z0–9`, 3–12) e auto-limpeza do lixo já salvo no aparelho.
  (2) **Concluir voltava pra primeira tela**: corrida entre o navegar e o `done=true` chegar — o
  cache agora é marcado otimisticamente no Concluir/Pular tudo, o gate nunca mais lê estado velho.
- **Listagens da Copa só com as 48 classificadas (Itália fora).** O recorte do grupo e a lista de
  times da Copa na personalização mostravam o catálogo inteiro de seleções (66) — incluindo quem
  não se classificou (Itália etc.). Agora há `WC2026_SLUGS` no `teamsCatalog` com as **48
  classificadas**, extraídas dos **próprios jogos da Copa em produção** (104 partidas, 48/48
  mapeadas pros slugs do catálogo, fonte: o banco): `catalogWcNations()` no seletor do recorte e
  `teamsForCompetition` filtrando os códigos da Copa (`WC`/`fifa.world`). **Amistosos e a "seleção
  da torcida" seguem com as 66** (a Itália joga amistosos e pode ser a seleção do coração).

### Adicionado
- **Favoritar grupo → prévia da classificação no topo da /grupos.** O usuário marca a **estrela**
  num grupo e a **prévia da classificação dele** (janela de 3: você + vizinhos de cima e de baixo)
  sobe pro topo, no lugar do Resultadismo The Best. Favoritou vários → vira um **carrossel** (com
  bolinhas), na ordem que favoritou. A prévia de um grupo **só aparece quando ele já tem pontuação**
  na competição-bolão dele (antes da Copa, fica de fora). O **Resultadismo The Best** virou um
  **card pequeno**: só título + "ver ranking" + **minha posição geral (sem pontuação)**. Banco:
  `profiles.favorite_group_ids` (ordenado) + RPCs `toggle_favorite_group` (valida ser membro) e
  `get_group_rank_window` (janela por grupo, visão Pontos, com o gate de pontuação); hooks isolados
  em `features/leagues/favorites.ts`. Migration `20260610190000`. → [`03`](03-PAGINAS.md),
  [`06`](06-REGRAS-DE-NEGOCIO.md) §4.
- **Pontuação prévia AO VIVO + compartilhar placar como imagem.** (1) Com o jogo rolando, o
  palpite mostra como está pontuando: borda do placar na cor do tipo (dourado/verde/azul; cinza no
  erro) + texto plano ("Cravada +3"), sem o chip de resultado final — volta da v0, mais suave.
  (2) Botão de **compartilhar** no card (live/encerrado) gera uma **imagem da marca** (escudos,
  placar, palpite, selo da pontuação e total) via Web Share/download; e dá pra **selecionar vários
  jogos do dia** ("Compartilhar" na fileira de dias → toca nos cards → Gerar imagem).
- **Gestão do Bolão — organize o bolão do grupo dentro do app (sem dinheiro no app).** Nova aba
  **Gestão** na página do grupo (ADR [`0009`](decisions/0009-gestao-bolao.md)): o admin ativa,
  define o **valor da inscrição** e a **divisão do prêmio** (% pro 1º/2º/3º, com presets), e marca
  **quem pagou** (botão $ na aba Membros); o app calcula o prêmio total (pagantes × valor) e mostra
  na classificação o **selo 💰** de quem está levando o quê — prêmio disputado **só entre
  pagantes**, sobras ficam no "caixa do grupo". O **dono** trava/destrava as definições quando o
  combinado fechar (dica: antes de a Copa começar). Tudo enforçado **no banco** (migration
  `20260610200000`: colunas `pot_*` em `league_competitions` + tabela `league_pot_payers`, RLS
  só-membros, triggers de trava/dono). **Nenhum dinheiro passa pelo app** — disclaimers fixos na
  aba, cláusula nova nos **Termos** (§5) e seção no **Como Funciona**; anúncio por broadcast +
  coachmark na página do grupo. → [`06`](06-REGRAS-DE-NEGOCIO.md) §5, [`03`](03-PAGINAS.md).
- **Tour guiado de 1º acesso (coach-marks na UI real).** Depois da personalização **e** do carrossel
  de boas-vindas, um **tour guiado** (`GuidedTour`) acende, em sequência, os pontos reais da tela: a
  **barra de filtros de Jogos** (Meus interesses × Todos), a aba **Grupos** (criar grupo + o
  **Resultadismo The Best**, ranking de todo mundo) e a aba **Perfil**. Roda inteiro em `/`, mede o
  alvo **visível** (mobile: nav de baixo → balão acima / desktop: sidebar → balão ao lado) e reusa a
  linguagem do `Coachmark` (anel turquesa + balão escuro). Aparece **uma vez** (`localStorage`
  `resultadismo-tour-v1`), refazível pelo admin (Perfil → "Rever tour"). De brinde, o **carrossel de
  boas-vindas foi enxugado para 3 slides** (o slide "Dispute em grupos" virou o **passo 2 do tour**,
  sem avisar de Grupos duas vezes). Alvos marcados com `data-tour` em
  `JogosPage`/`BottomNav`/`Sidebar`; só frontend (sem migration). → [`03`](03-PAGINAS.md) §3.
- **Aba "Grupos" na página de jogos: os palpites que valem ponto nunca somem.** Quem personalizou
  "só Brasil" mas está num grupo que conta outras seleções vê os jogos do grupo numa aba própria.
  Ordem das abas: **Interesses** (encurtada; só personalização) → **Grupos** (união dos recortes dos
  meus grupos, inclusive pendentes de aprovação; é o **padrão** quando a pessoa tem grupo) →
  **Todos** → competições. **Coachmark** na 1ª visita explica a aba. As fileiras de abas e de dias
  usam o novo **`ScrollRow`** (componente de UI): **degradê nas bordas** quando há mais conteúdo pra
  arrastar, sumindo no fim do scroll. → [`03`](03-PAGINAS.md).
- **Recorte de seleções do grupo editável até a Copa começar.** Quem criou o grupo sem reparar no
  recorte ("Todas" × "Só o Brasil" × escolhidas) agora pode **ajustar na aba Competições** (card
  "Seleções que valem ponto", só admin) enquanto **nenhum jogo da Copa tiver começado** — depois
  do 1º jogo trava (mudar no meio retroagiria o ranking). Trava **no banco** (trigger
  `trg_lc_team_scope_window`, migration `20260610180000`) + RPC `team_scope_window` pro front
  mostrar o estado; seletor único `TeamScopeSelector` compartilhado entre a criação e a edição
  (a criação agora avisa "dá pra mudar até a Copa começar"). → [`06`](06-REGRAS-DE-NEGOCIO.md) §4.
- **Convite de grupo com o texto de divulgação completo.** O compartilhamento do código (card do
  grupo em `/grupos` e botão da página do grupo) agora usa o **pitch de marketing aprovado pelo
  João** ("🏆 Achei o melhor bolão pra Copa do Mundo!" + benefícios) fechando com **"Entre no meu
  grupo \"nome\"" + código + link parametrizado** (`?convite=CÓDIGO`, que preenche o campo sozinho
  no 1º acesso). Texto unificado em `features/leagues/inviteShare.ts` (regra 9: os dois pontos de
  share falam a mesma coisa); grupo público compartilhado da vitrine sai sem código, apontando
  `/grupos`. Corrigido o typo "Entra na meu grupo" e o card passou a registrar o evento `share`.
- **Mini-jogo Resultadismo Retrô — EM PRODUÇÃO em `/retro` (2026-06-10, teste com amigos
  autorizado pelo João).** Fases 1–3 + rodada 1 de homologação + Fase 4. Pós-deploy/Fase 4:
  correção de contraste (placar eletrônico **sempre escuro** nos dois temas, tokens
  `--retro-board*`), `RetroCrest` com retry (logos sumindo intermitente), guarda anti-abuso
  anônimo (30 runs/h/token, migration `20260610150004`), eventos GA4
  (`retro_run_start/guess/run_end/share`), seção Retrô no **Como Funciona** e na **landing**,
  novo doc [`12-RETRO-MINIJOGO.md`](12-RETRO-MINIJOGO.md) + linha no MESTRE §2 + tabelas/RPCs no
  doc 05. **Rodada 3 (feedback dos amigos):** ano/fase em destaque no card, 85 bandeiras
  pré-aquecidas + respiro "Valendo…" (deadline +1,5s, migration `20260610150005`), botões +/− nas
  roletas, semi/final recalibradas (janelas SF 3-5 · F 4-6, pesos 40/35/25). **Rodada 4 (decisão do PO):**
  modos rebalanceados — acerto ≥1 em todas as fases; modo difícil vira "Na Crava" (≥2, saldo ou
  cravada; migration `20260610150006`) — e **share como imagem** (card PNG via canvas + Web Share
  API, fallback download/texto). **Rodada 5 (decisões do PO):** barras novas (acerto: semi=saldo,
  final=CRAVADA; Na Crava: ≥2 + final=CRAVADA), 🎲 cravada dá ficha de troca de jogo
  (`retro_reroll`), treinos ranqueados (melhor campanha por pessoa, board próprio), run em overlay
  tela-cheia (cabe no iPhone SE), share prioriza compartilhar (clipboard de imagem no desktop) e
  navegação separada (Retrô no Perfil, fora dos menus principais) — migration
  `20260610150007`. **Rodada 6 (decisões do PO):** reset de ranking/Copa do Dia e novo formato
  **temático por seleção** (rotação diária entre 58 seleções, jogos do fácil ao difícil, RPC
  `retro_today` — migration `20260610150008`); emojis do share nas cores do app; ritmos só Sem
  Pressa/Resultadista; modos renomeados Vale Ponto/Vale Saldo; Dificuldade do Treino
  (Fácil/Padrão/Difícil); `RetroShell` próprio (separação total do app-mãe), banner na landing e
  card no topo do Perfil. **Rodada 7 (decisões do PO):** sair encerra a run (Copa do Dia confirma e
  vira W.O. sem retomada — `retro_abandon`, migration `20260610150009`); layout da run centrado
  (cabe em telas baixas), "Treino livre" em 1 linha com loading independente, aba "Copa do Dia"
  sem quebra; CTAs de funil posicionando o Resultadismo como **bolão da Copa**. **Rodada 8 (decisões do PO):** final aceita saldo (semi e
  final = saldo/cravada; migration `20260610150010`); ranking de Treino ordenado por dificuldade
  (difícil na frente); correção do bug das bandeiras P&B (circularizador preservava o `fill` da
  raiz; auditoria de cor 60/60); textos curtos por fase no jogo; home mais clara (cada seletor
  diz o que controla); feedback do Retrô em `/retro/feedback` (só logado, `feedback.product`).
  **Rodada 9 (feedback dos amigos):** jogo não estica em telas grandes; emoji/manchete dinâmicos
  por fase no share e tela final (`verdict.ts`); regra da semi/final destacada (banner pulsante no
  jogo + explicação no reveal); "eliminado nos pênaltis 😬" no near-miss; ranking dá destaque à
  fase (pontos/tempo são desempate). **Rodada 10 (simplificação + bug):** corrigido o reroll na
  Copa do Dia (voltava o mesmo jogo — migration `20260610150011`); dois Formatos (Copa eliminatório
  / Pontos soma os 7); regra de saldo/cravada nas finais virou config admin em `/admin/retro`
  (desligada por padrão); dificuldade 2 níveis; página de regras `/retro/regras`; ranking por
  formato. **Rodada 11:** cor do Honduras corrigida; 👑 no 1º do ranking; renomes (Copa do Dia →
  Seleção do Dia, Treino livre → Jogo livre); removida a dificuldade (um modo só, ranking
  fase/pontos/tempo); tempo de tela só do Retrô (`retro_touch` → `screen_seconds`); feedback admin
  do Retrô em `/admin/retro` + fix do "Meus envios". **Rodada 12:** trilha J1..J7 no modo Pontos;
  caminho admin→Retrô (chip na nav do /admin); fix do report sumido (dropada a duplicata 6-arg de
  `submit_feedback` que inseria sem product — migration `20260610150013`) + badge de produto no
  admin. **Rodada 13:** Seleção do Dia só no formato Copa (ranking diário = Copa); tela final
  redesenhada espelhando a imagem de share (card escuro retrô); "Jogar Treino agora" → "Jogar de
  novo"; convite pro bolão da Copa no fim, com logo do Resultadismo. **Rodada 14:** "Jogo livre"
  deixa de dizer "sem ranking" (ele ranqueia e é o jogo do dia a dia); telas mais leves (sem cards
  de Ritmo e "Como funciona", hero curto, sem "nível X/7"); removido o "Sem Pressa" (todo jogo é
  cronometrado). **Fix:** card do Retrô no Perfil usava `bg-ink-950` (que inverte no dark → ficava
  claro com texto branco, ilegível); trocado pelo token estável `--retro-board` (escuro nos dois
  temas). **Fix dark/share:** o banner do Retrô na landing deslogada agora INVERTE certo (no dark
  vira claro com texto escuro p/ destaque — tokens `ink-50`/`ink-300` + `gold-600`), em vez de texto
  branco ilegível; e o **texto** de compartilhamento passou a usar o emoji dinâmico por fase
  (🏆🥈🔥💪👏😅) igual à imagem (era sempre 😭). **Rodada 15:** card do Retrô no Perfil também
  inverte no dark (claro com texto escuro), igual à landing; e **admin de acessos/tempo** —
  `profiles.retro_last_active_at`/`retro_usage_seconds` + `retro_admin_stats` (migration
  `20260610150014`) mostram online agora e tempo total **Retrô vs Normal** no `/admin/retro`.
  **Rodada 16:** 1º lugar do ranking agora INVERTE no tema (claro→faixa escura/texto claro;
  escuro→faixa clara/texto escuro — par `ink-950`/`ink-50`, fim do texto claro em fundo claro no
  dark); na página do link compartilhado, artigo certo ("jogou **a** Seleção do Dia" / "**o** Jogo
  livre") + **escudo do jogador** ao lado do nome (logado); e o **escudo entrou na imagem** do share
  — render fiel no canvas (silhueta SVG da forma + cores sólido/listras/grade/bola + inicial), com
  fallback de círculo e foto cross-origin caindo p/ sólido (sem tainted canvas). Só front, sem
  migration. **Rodada 17:** a **foto** do escudo agora aparece na imagem do share (antes virava
  sólido). Foto carregada com `crossOrigin="anonymous"` (Google `lh3.googleusercontent.com` serve
  `access-control-allow-origin: *` — verificado empiricamente; a CSP de prod `img-src https:`
  permite) + **cache-bust dedicado** (a UI viva já cacheou a URL via CSS sem cors; reusar sujaria o
  canvas) + **timeout 4s** + cover-crop igual ao CSS. Qualquer falha (host sem CORS, offline,
  timeout) cai no escudo sólido + inicial — a imagem **sempre** gera. Só front, sem migration.
  **Rodada 18 (modos de dificuldade — migration `20260610150015`):** o **modo Pontos saiu** da
  entrada (ninguém usava; runs antigas e links de share seguem renderizando como legado) e o **Jogo
  livre ganhou 3 modos** com nomes de futebol — **Amistoso 🤝** (só jogos nível 1-3; raros nível 4
  na semi/final), **Clássico ⚽** (a curva servida até hoje; as runs/ranking existentes migraram pra
  cá) e **Lenda 🐐** (nível 4-7; alguns 3 nos grupos; nível 7 raro — só 9 jogos no catálogo). Os
  níveis 1-7 NÃO aparecem na tela (regra de negócio); a dificuldade segue escalando dos grupos à
  final em todos. **Ranking do Jogo livre por modo** (`retro_leaderboard` trocou `p_format` por
  `p_level`). **Selos da Lenda**: >15 pts = **HISTÓRICA 📜**; 21 pts = **ZEROU O GAME 👾** com
  animação própria (`ZerouFx`: chuva dourada densa + manchete pulsante + anel dourado, acima do
  confete de campeão). **Imagem do share** ganhou selo destacado do modo (pílula colorida) + selos
  HISTÓRICO/ZEROU; texto e página pública idem. **Barra de dificuldade discreta** no card do jogo
  (7 pips coloridos por faixa; `retro_match_payload` agora manda `difficulty` — índice de raridade,
  não dá o placar). **Modal de 1º acesso** (`RetroIntro`, localStorage `retro-intro-v1`, vale pra
  anônimo): grupos = pontue em 2 de 3 (pílulas 3/2/1), oitavas em diante = errou caiu, cravada =
  ficha. **Como jogar** reescrito (bloco dos 3 modos no lugar do Pontos). `retro_my_stats` blindado
  (runs legadas do Pontos com stage_rank NULL roubavam o "melhor" do hero). Suite T4/T6 testa os
  modos (janelas estatísticas, 200 sorteios). **Rodada 19 (OG próprio do Retrô):** compartilhar um
  link `/retro*` no WhatsApp/Twitter agora mostra o **card do Retrô** (`public/og-retro.jpg`,
  1200×630 — estilo do hero: brand-700 + scanlines + listras + lockup escudo "Resultadismo RETRÔ"
  dourado + "Você lembra desse placar? 🕹️" + trilha colorida), não mais o do bolão. Como é SPA:
  `scripts/build-retro-html.mjs` (roda no `postbuild`) gera `dist/retro.html` clonando o
  `dist/index.html` com title/description/canonical/OG/Twitter do Retrô (falha o build se o
  index.html mudar de formato — sem OG errado em silêncio), e o `vercel.json` reescreve `/retro` e
  `/retro/:path*` pra esse arquivo ANTES do catch-all. Bônus: a página pública do share
  (`/retro/r/:code`) também ganha o card do Retrô. SPA intacta (mesmos bundles; router lê a URL).
  **Rodada 20 (fix do reroll na Seleção do Dia — migration `20260610150016`):** o 🎲 trocar-jogo na
  Copa do Dia trazia jogo de **outra seleção** (o reroll forçava sorteio no catálogo todo e ainda
  excluía os 7 do tema). Agora troca por **outro jogo da MESMA seleção do dia** (fora dos 7, com a
  dificuldade mais próxima da do slot original — mantém a curva fácil→difícil); o Jogo livre segue
  sorteando no catálogo. **Borda:** se a seleção esgota (Egito e Coreia do Norte têm exatamente 7
  jogos — zero sobrando), cai num jogo aleatório de outra Copa e o `retro_reroll` devolve
  `random_fallback:true` → o front mostra "Acabaram os jogos dessa seleção — esse veio de outra Copa
  🎲". Conserta de brinde um bug latente (sorteio vazio gravava slot com match_id NULL e gastava a
  ficha). Testes T11 (mesma seleção, daily controlado de Brasil) e T12 (Egito esgota → fallback+flag).
  Histórico completo da construção: Comentários
  do PO processados → [`decisoes-fechadas.md`](../docs/planning/minijogo-historico/decisoes-fechadas.md)
  (espec vigente: nome Resultadismo Retrô, modos Acerto/Só Cravada, ritmos
  Resultadista/Clássico/Sem Pressa, Copa do Dia + Treino, runs permanentes só de logados na Copa do
  Dia). Fase 1: migration `20260610150000_retro_matches.sql` (**964 jogos das 22 Copas**, fonte
  openfootball CC0 em `data/retro-sources/`, dificuldade 1–7 com 34 jogos-lenda, **RLS ligado sem
  policy** = gabarito inacessível ao client, verificado com `set role anon/authenticated` = 0
  linhas); importador `scripts/gen-retro-seed.mjs` com portões de qualidade (pegou a prorrogação
  de grupo de 1954 e o duplo Brasil×Tchecoslováquia de 1962); **33 bandeiras históricas** (URSS,
  Iugoslávia, Zaire, Alemanha Oriental…) em `public/teams/` + manifest regenerado (325 escudos,
  100% dos slugs do jogo resolvem). Ajustes do PO na homologação da Fase 1: sorteio pondera o
  nível primeiro (grupos 45/35/20) e **todas as 60 bandeiras SVG padronizadas em círculo**
  (`scripts/gen-flag-circles.mjs`, padrão Sofascore). Fase 2: migration
  `20260610150001_retro_engine.sql` — tabelas `retro_daily`/`retro_runs`/`retro_run_matches`/
  `retro_usage_daily` (RLS sem policy) + RPCs `retro_start_run` (Copa do Dia 1/dia com retomada) /
  `retro_answer` (janela de tempo no servidor, pontuação por `compute_score_type`, progressão com
  jogo de honra e barra ≥2 na semi/final, modo Só Cravada) / `retro_run_summary` (share sem spoiler)
  / `retro_leaderboard` (fase→pontos→tempo) / `retro_touch_anon` (agregado diário) /
  `retro_purge_ephemeral` + cron (runs permanentes só da Copa do Dia de logados — D17). **Bateria
  de 8 testes verde** em `scripts/retro-engine-tests.sql`. `db reset` + `db:types` + `typecheck`
  verdes. **Fase 3 (UI, branch `feat/retro-minijogo`):** feature slice `src/features/retro/`
  (landing com Copa do Dia/Treino e seletor Modo×Ritmo, roletas de placar com rolagem, timer com
  milésimos nos 3s finais e auto-submit, reveal "fliperama" com carimbo/flip/confete, tela de
  campanha com share de emojis sem spoiler, página pública `/retro/r/:code`, ranking, streak via
  `retro_my_stats` na migration `20260610150002`); rotas públicas no `App.tsx`; validado com
  typecheck + lint zerado + check:arch + E2E Playwright (Chrome real, run anônima completa, zero
  erros de console). Ao subir: atualizar `.claude/05` §2 e criar `.claude/12-RETRO-MINIJOGO.md`.

### Corrigido
- **"Permissão negada" nas notificações agora ensina a liberar.** Quando o navegador/celular está
  com as notificações BLOQUEADAS (não dá pra abrir as configurações pela pessoa), aparece um guia
  passo a passo por plataforma (Android no navegador → cadeado/Permissões; Android com app →
  Configurações → Apps; iPhone → instalar o app / Ajustes → Notificações; desktop → cadeado) +
  botão "Já liberei — tentar de novo". Cobre o onboarding (tela de notificações), o banner e o
  Perfil (que só dizia "bloqueadas"). De quebra, corrigido um falso-positivo: navegador SEM
  suporte não mostra mais o guia de bloqueio.
- **Notificações clicáveis levam ao lugar de resolver.** Itens do sininho agora navegam pro
  destino (`data.url` do backend, com fallback por tipo: cutucada/lembrete → Jogos, feedback →
  Construa, alerta de admin → Admin → Alertas); o clique na push já abria o app no `data.url`
  (service worker). `fan_notify_admins` sem url passa a apontar pra `/admin?t=alertas`
  (migration `20260610170000`).
- **Jogos personalizados + recorte de seleções no grupo.** (1) Aba Jogos ganha o filtro
  **"Meus interesses"** (ativo por padrão pra quem personalizou): mostra campeonatos seguidos
  inteiros + jogos dos times/seleções escolhidos (coração, seleção e seguidos) em **qualquer**
  campeonato disponível — interesse indisponível é ignorado. (2) Na **criação do grupo**, escolha
  leve de quais seleções **valem ponto no ranking**: *Todas* (padrão, recomendado), *Só o Brasil*
  ou *Escolher* (chips com bandeira). Guardado em `league_competitions.followed_team_slugs`
  (expandido com aliases) e respeitado pelo `get_league_standings` via `team_slug()` SQL
  (migration `20260610160000`). (3) Notas/avisos **sem barra lateral única** (17 removidas;
  regra atualizada no [`12-DESIGN`](12-DESIGN.md)).
- **Fonte Ubuntu bloqueada pelo CSP em produção — agora self-hosted.** O CSP do `vercel.json`
  (`style-src` sem `fonts.googleapis.com`) bloqueava a stylesheet do Google Fonts desde a adição
  dos headers, e **todo visitante via a fonte de sistema** em vez da Ubuntu (passava despercebido
  em máquinas com a Ubuntu instalada localmente, como a do João). Correção escolhida pelo PO
  (opção B): **self-host** dos 6 `.woff2` (subset latin, pesos 300/400/500/700 + itálico 400/500,
  ~96 KB) em `public/fonts/`, `@font-face` no `src/index.css`, `preload` dos pesos 400/500/700 no
  `index.html` e `Cache-Control: immutable` para `/fonts/` no `vercel.json`. **O CSP estrito
  permanece intacto** (`font-src 'self'`), sai a dependência do Google (privacidade/LGPD) e a
  fonte carrega do mesmo domínio. → [`07`](07-BUILD-E-DEPLOY.md) §1.

### Removido
- **GitHub Pages legado desligado — fim do check vermelho "deploy".** Resquício do **v0** (site
  estático em GitHub Pages): o repo ainda tinha o Pages **ligado** (Settings → Pages, source
  `main`/raiz, build Jekyll) e um `CNAME` apontando para **`www.resultadismo.com`** — o **mesmo**
  domínio da produção, que hoje roda no **Vercel**. O workflow auto-gerenciado
  `pages build and deployment` (check **"deploy"**, sem arquivo em `.github/workflows`) passou a
  **falhar com 401 "Requires authentication"** a partir de 2026-06-10 (revalidação do domínio
  custom pelo GitHub: como o DNS resolve para o Vercel, o Pages perdeu a verificação e bloqueou o
  deploy). **Produção nunca foi afetada** (DNS → Vercel; o Pages só servia a raiz crua do repo via
  Jekyll). Pages **desabilitado** via API (`DELETE /repos/.../pages`) e **`CNAME` removido** do repo
  (só tinha sentido para o Pages, agora desligado) — some o ruído de CI e a reivindicação dupla do
  domínio. Decisão do PO. → [`HISTORICO.md`](HISTORICO.md).

## [2.0.0] — 2026-06-10

> **🏆 O marco da Copa (ADR [`0003`](decisions/0003-versionamento.md)): v2.0 = lançamento oficial.**
> Cortada pelo João em 2026-06-09. Consolida personalização repaginada, placar com stepper,
> temporada só-Copa nos grupos, ingestão multi-fonte e os portões de qualidade.

### Adicionado
- **Planejamento do mini-jogo de placares históricos da Copa (Portão A — só documentação).** Plano
  completo e comentável em [`docs/planning/minijogo-historico/plano-v1.html`](../docs/planning/minijogo-historico/plano-v1.html)
  (decisões D1–D17 + perguntas Q1–Q5; fluxo de comentários no
  [`LEIA-ME`](../docs/planning/minijogo-historico/LEIA-ME.md)). Embasado em pesquisa multi-agente:
  análise jogada do 7a0.com.br, fontes de dados das 22 Copas (964 jogos; openfootball CC0 +
  validação Fjelstul), infra (mesmo projeto Supabase — auth não compartilha entre projetos; rota
  `/retro` antes de subdomínio; tracking first-party p/ anônimos), naming (recomendação
  "Resultadismo Retrô") e crítica de game design (Copa do Dia + Treino, timer decrescente,
  anti-cheat server-side). Aguarda OK do João. Publicado para validação em
  `https://www.resultadismo.com/planos/minijogo-historico-v1.html` (cópia em `public/planos/`,
  `noindex`, excluída do precache do PWA via `injectManifest.globIgnores` no `vite.config.ts` —
  única mudança de config; nenhum código de runtime do app tocado).
- **Temporada da Copa: grupos só com a Copa do Mundo, travada** (ADR
  [`0007`](decisions/0007-temporada-copa-so-copa-em-grupos.md)). Todo grupo nasce com a **Copa em
  modo Pontos** e não dá para removê-la nem trocá-la; **só ela** pode ser competição de grupo.
  Enforçado **no banco** (flag `competitions.group_eligible` + triggers de INSERT/DELETE em
  `league_competitions`, migration `20260609000010`) e espelhado no front (criação de grupo com a
  competição **fixa** + copy "depois da Copa chegam outros campeonatos"; aba Competições sem
  remover no bolão). **Amistosos** seguem publicados para palpitar na aba Jogos, mas **não entram
  em grupo**; demais campeonatos **despublicados** (reversível). Disputas de **Confronto**
  continuam removíveis. → [`06`](06-REGRAS-DE-NEGOCIO.md) §4.
- **CI de qualidade (`.github/workflows/quality.yml`).** `typecheck + lint + check:arch + build`
  rodam em **todo push/PR** e reprovam se falhar — nenhuma sessão mescla código que viole os
  portões sem o robô acusar. Docs reforçadas: portões valem **também ao integrar branches**
  ([`02`](02-CODIGO.md) §7, [`09`](09-PARALELISMO.md) §5, [`07`](07-BUILD-E-DEPLOY.md)).
- **Regra de design system: nunca `<select>` nativo** (erro de lint via `no-restricted-syntax`).
  Sempre `<Select>`/`<Combobox>` de `@/components/ui`. → [`02`](02-CODIGO.md) §7.
- **"Quem já palpitou" por GRUPO + favoritos.** Com 2+ grupos, chips (scroll lateral) filtram as
  listas por grupo; estrela no chip define o **grupo favorito** (abre por padrão); estrela na linha
  **favorita o Resultadista** (fixa no topo; tabela `user_favorites`, RLS self).
- **Sync canônico (Fase C) + alerta de não-mapeados.** O registro de times agora dirige o sync:
  tradução nome/short via mapa gerado (`teams-canonical.json`, exact/loose com ambíguas excluídas),
  `teams.local_crest` apontando pro escudo do repo, e times fora do registro caem em `sync_unmapped`
  → seção **"Times fora do registro"** no Admin → Dados (aceitar como veio / copiar JSON pro
  registro). [`decisions/0008`](decisions/0008-sync-canonico.md)
- **Curadoria de competições editável** (`data/competitions-registry.json`): grupo (Seleções/Ligas/
  Copas/Alternativos) e ordem vêm do registro (`gen:comps` sincroniza o front e emite SQL de upsert
  pra migration). Guia no [`13`](13-TIMES-E-ESCUDOS.md).
- **Convite fecha o ciclo:** links compartilhados embutem `?convite=CODIGO` e o campo de `/grupos`
  abre pré-preenchido (limpa ao entrar).
- **Escudos 292/292** (Costa do Marfim + Suécia) e **todos os toggles** no `ui/Switch`.
- **Time/seleção do coração agora SALVAM** (bug pré-existente). As colunas `favorite_team_id`/
  `national_team_id` eram **uuid (FK→teams)**, mas o catálogo de personalização é **slug** — o slug
  não cabia e a escolha nunca persistia. Viraram **text (slug)** (`set_personalization` text). Agora
  o time/seleção aparecem no **hub** (preview) e no **perfil público** do jogador. Tela 0 do
  onboarding no layout do hub (escudo à esquerda, nome à direita, email abaixo); **UF em chips**; o
  **tour de boas-vindas** só aparece na página de jogos (nunca sobre a personalização). Migrations
  `20260609000002/000003` (aditivas; `db reset` verde).
- **Personalização repaginada (1º acesso) + base de times/escudos.** Fluxo de 6 telas: **(0) Seu
  perfil** (escudo + nome + **UF** em chips horizontais — coluna nova `profiles.uf`), (1) time do
  coração, (2) seleção, (3) campeonatos e times (4 grupos: Seleções/Ligas/Copas/Alternativos), (4)
  **The Best + convite** (dividida; "Recebeu o código de convite de alguém?"), (5) **notificações +
  instalar o app** (dividida; pede a permissão real + instala/instruções iOS). Cabeçalho com **ícone
  e título lado a lado**; nas listas, **cabeçalho e busca fixos e só a lista rola**; **X** da busca
  limpa o texto e some quando vazio; estado da busca não vaza entre telas. **Destaque sem "tom
  lavado"** (regra nova em [`12-DESIGN.md`](12-DESIGN.md)): seleção com contorno sólido `ring-brand`,
  chips/badges sólidos. **Convite por link** (`?convite=`) capturado no boot → `localStorage` →
  **preenche o campo sozinho**. O **tour de boas-vindas** (Onboarding) agora vem **depois** da
  personalização (fluxos independentes; pular o tour não pula a personalização).
- **Registro único de times/escudos, editável à mão.** `data/teams-registry.json` é a fonte; o
  gerador re-resolve escudos pelo manifesto e escreve `data/` **e** `src/data/` (fim da divergência).
  Escudos **265→290/292** (seleções `.svg` que estavam com `crest_file` null), dups/typo removidos.
  `npm run gen:crests | gen:teams | gen:all`. Guia em [`13-TIMES-E-ESCUDOS.md`](13-TIMES-E-ESCUDOS.md).
- **Palpitar o placar sem teclado** — o input numérico (que abria o teclado) virou **stepper +/−**
  (teto **19** por lado). Enquanto não palpita, o placar fica **“– ×–”** (não palpitado, ≠ de um 0×0
  real); **clicar no card** liga o +/− e já vale **0×0** (o autosave salva sozinho, mesmo sem tocar).
  **Nunca um lado vazio** (mexer num time fixa o outro em 0). `×` e layout do card intactos.
- **Modelo de trabalho: João é o PO, a IA é uma equipe, e nenhum código sobe sem plano validado
  antes.** Novo doc [`11-EQUIPE-E-PAPEIS.md`](11-EQUIPE-E-PAPEIS.md): a IA atua como **equipe
  multidisciplinar** (11 papéis com responsabilidades e cenários), o João é o **Product Owner**, e
  ficam nomeados os **3 portões** (A plano-antes-de-codar / B homologação pré-deploy / C release).
  Regras centrais **15** (PO + equipe) e **16** (plano validado antes de qualquer código, proporcional,
  escopo = código) adicionadas ao [`MESTRE.md`](MESTRE.md); §5 passo 3 reforçado + gate Portão A no
  [`08-PROCESSO.md`](08-PROCESSO.md). Coerência propagada em 01/02/04/06/07/08/09/10 e nos ponteiros
  `CLAUDE.md`/`AGENTS.md`. Decisão registrada em [`decisions/0005`](decisions/0005-equipe-po-e-plano.md).
  **Só documentação** (nenhum código de runtime tocado).
- **Portões de qualidade de código (obrigatórios para código novo).** (1) **Complexidade ciclomática**:
  regra `complexity: ["warn", 20]` no `eslint.config.js` (avisa, não quebra o build). (2) **Estrutura
  de dependências**: `npm run check:arch` (`scripts/check-architecture.mjs`) garante que camada interna
  não importa externa (`kernel → ui → components → feature → chrome → app`; `auth` transversal) —
  violação dura reprova, acoplamento lateral é aviso/backlog. Documentado em
  [`02-CODIGO.md`](02-CODIGO.md) §7, [`08-PROCESSO.md`](08-PROCESSO.md) §5 e
  [`11-EQUIPE-E-PAPEIS.md`](11-EQUIPE-E-PAPEIS.md) §3. Hoje: `check:arch` **APROVADO** (0 violações
  duras); 17 funções acima de 20 de complexidade e 27 avisos de acoplamento ficam como **backlog de
  otimização** (sem quebrar o que funciona).
- **AGENTS.md na raiz.** Novo ponto de entrada para sessões Codex/IA, espelhando o `CLAUDE.md` e
  apontando para a documentação viva em `.claude/` (`MESTRE`, processo, paralelismo e regras centrais).
- **Changelog no admin.** Nova aba **Changelog** no `/admin` (só app-admin) que renderiza este
  `CHANGELOG.md` (importado cru no build), do mais recente ao mais antigo — render de markdown leve,
  sem dependência nova.
- **Versão no rodapé do Perfil** (`v{APP_VERSION}`, de `package.json`).
- **Ingestão multi-fonte de jogos (robustez + qualidade dos dados).** Cada competição tem 1 fonte
  **primária** (dona do calendário) + N **secundárias** (só validam placar; nunca inserem), com
  fallback e degradação graciosa. **Golden record** por voto da maioria (`match_sources`,
  `resolve_match_golden`, cron 10 min), detecção de conflito, e **freeze** de finalizados confirmados
  por ≥2 fontes (>1h) — resultado final travado no banco. **Override manual com lock** (admin corrige
  placar; a API não sobrescreve). +10 competições no catálogo (estaduais, Champions/Europa, Copa
  América, MLS, Liga MX) + personalização por flag `in_personalization`. Aba **Admin → Dados**
  (conflitos + override + fontes por competição). Escudos do repo (`public/teams`) como fonte primária
  via manifest. Estudo em [`decisions/0004`](decisions/0004-ingestao-dados-de-jogos.md). 4 migrations
  `20260607*`, **aditivas e não-destrutivas** (nenhum jogo existente alterado além de placar).
- **Personalização — seguir time POR campeonato** (`profiles.followed_teams jsonb`) + escolha **"só
  neste" / "em todos (N)"** quando o time joga em 2+ campeonatos (`get_teams_by_competition` devolve
  `in_competitions`). Migrations `20260607000005` / `20260607000007`.
- **Personalização — +campeonatos:** Eurocopa, Nations League, **Eliminatórias** (5 confederações),
  Copa Africana, e o grupo **Alternativos** (Saudi, MLS, Liga MX, Portugal, Holanda, Turquia,
  Bélgica, Escócia, Grécia, Conference) + **Amistosos**. Codes ESPN verificados. Migration
  `20260607000006`.
- **Catálogo de times da personalização (`src/data/teams-catalog.json`, ~292: 226 clubes + 66
  seleções).** As listas (time do coração, seleção, times por campeonato) viram **client-side** a
  partir do catálogo curado, **desacopladas da tabela `teams`** (sync/jogos) — populam mesmo fora de
  temporada, com **escudos** (`public/teams` via manifest `teamCrests`). O `competitions` por time
  alimenta o "**seguir em todos**". Lógica em `teamsCatalog.ts`. Como **encorpar**: editar o JSON +
  rodar `scripts/fetch-crests.mjs` / `gen-team-crests.mjs` (doc em [`06`](06-REGRAS-DE-NEGOCIO.md) §9).
  Pendente: escudos de Costa do Marfim e Suécia (Wikimedia quebrado).

### Alterado
- **Polimento pré-lançamento (pedidos do PO).** Zoom desabilitado no site (app-like). Discurso
  unificado: o modo do grupo é o **bolão** em toda copy (NovaLigaPage com card e rodapé sem
  duplicação; bloco morto de "Modo de disputa" removido do CompeticoesTab); **confronto** aparece
  só como "em breve". **Como funciona** reescrita: seção "Palpitar leva segundos" (traço → toque →
  0×0 com +/−), bolão/confronto enxutos, convite por **link**, "quem já palpitou" com filtro por
  grupo e estrela, **The Best** e **Do seu jeito** (personalização + notificações + app). Lápis no
  card de /grupos abre **direto o editor** do grupo (`?editar=1`). Menu Perfil → Personalização
  leva ao **hub** (`/perfil/editar`); o wizard completo é só do 1º acesso (quem já concluiu é
  redirecionado). **Escudos com cache** (SW CacheFirst p/ `/teams/` e CDNs, 30 dias) e crests dos
  cards de jogo carregam **eager** — some a demora das imagens.
- **Varredura completa do "tom lavado"** (92 substituições, incl. o primitivo `Badge` → sólidos) —
  regra do [`12-DESIGN`](12-DESIGN.md) agora vale no app inteiro.
- **Página de personalização reformada:** fluxo focado (nav colada embaixo, conteúdo rola, listas
  com busca + seleção única que só habilita o "Próximo" ao escolher); **uma tela** "times e
  campeonatos" com **grupos colapsáveis e selecionáveis inteiros** (Seleções · Ligas e estaduais ·
  Copas · Alternativos) e checkbox redondo pai/filho com estado parcial. Time do coração mostra só
  clubes; seleção com **Brasil primeiro**.
- **Toggles unificados no primitivo `Switch`.** `AdminDashboard` (Sala de espera, Sync automático,
  Modo manutenção) e `NotifPrefsCard` (Lembretes/Cutucadas/Avisos) agora usam o primitivo único
  `src/components/ui/Switch.tsx` em vez de toggles hand-rolled próprios — fecha a migração prevista na
  nota do "Switch on/off canônico" abaixo. Sem mudança de comportamento; o switch do AdminDashboard era
  visualmente idêntico ao primitivo. (`DadosAdmin` mantém um toggle menor, h-5/w-9, por ser uma variante
  de tamanho que o primitivo ainda não cobre.)

### Segurança
- Tabelas internas `match_sources`/`competition_sources` com RLS ligado **sem policy** (acesso só via
  RPC). RPCs de admin `SECURITY DEFINER` + `search_path=''` + gate `is_app_admin()`;
  `resolve_match_golden` interna (grant só `service_role`). Dado bruto da API nunca é servido ao
  cliente (sempre do banco); ingestão só via Edge (service_role/`CRON_SECRET`).
- **Exclusão/despublicação de competição EM USO exige confirmar o nome exato (3ª confirmação).**
  Causa-raiz de um incidente: `admin_delete_competition` apagava em cascata matches → palpites →
  pontos → o link do grupo (irreversível sem backup). Agora, se a competição tem palpites e/ou é
  usada por grupos, EXCLUIR — ou DESPUBLICAR — só prossegue passando `p_confirm_name` = nome exato;
  senão a RPC recusa. Nova RPC `admin_competition_usage` (palpites/grupos/matches). Defesa no banco
  (`SECURITY DEFINER`), então protege mesmo se a UI falhar. Migration `20260607000008`.
- **Fim da exclusão em CASCATA destrutiva (FK RESTRICT).** Causa-raiz da perda dos palpites. Agora
  `predictions → matches` e `league_competitions → competitions` são **RESTRICT**: o **banco RECUSA**
  apagar uma competição que tem palpites ou é usada por grupo (não importa a UI). `matches →
  competitions` segue CASCADE (jogo é descartável/re-sincronizável). Para excluir uma competição em
  uso, o admin **limpa os vínculos no Supabase primeiro** (palpites/uso em grupo). `admin_delete_competition`
  dá mensagem clara orientando isso. Migration `20260607000009`.
- **UI de exclusão segura no admin** (`CompetitionDangerDialog`). Ao excluir/despublicar uma
  competição, o diálogo mostra o **uso real** (`admin_competition_usage`: jogos/palpites/grupos):
  exclusão de competição **em uso é bloqueada** com orientação ("limpe os vínculos no Supabase");
  exclusão de competição só-com-jogos e despublicação em-uso **exigem digitar o nome exato**;
  competição vazia exclui com confirmação simples.

### Corrigido
- **Jornada de personalização não some mais no meio.** O RPC marcava `personalization_done` em
  TODA chamada — avançar 1 tela já "concluía" (recarregou no meio → nunca via o resto). Agora o
  done é explícito (`p_mark_done`): só **Concluir** (ou pular a última tela) fecha a jornada;
  persistências intermediárias e edições do hub não mexem. + **novo reset geral** pra jornada
  aparecer pra todos no próximo acesso (migration `20260610130000`).
- **Prod: lista de campeonatos da personalização vazia (só Copa).** Drift local×prod: a migration
  `20260607000006` pulou os inserts em produção (os campeonatos já existiam como **rascunho**) e o
  RPC filtra `status='active'` — no banco local zerado tudo nasce ativo e o bug ficou invisível.
  Corretivo `20260610120000` (gerado do registro): ativa + garante os 38 curados (`is_published`
  intocado — a temporada só-Copa continua mandando no que é jogável).
- **Stepper do palpite é temporário** (ajuste pós-lançamento do dia): o +/− só aparece ao tocar
  pra editar e **some sozinho** (~3,5s sem mexer / depois do "salvo"); fechado, o palpite fica em
  números com borda da marca ("Editar palpite"). E **reset da jornada de personalização**
  (migration `20260610000000`): quem preencheu a versão antiga passa pela jornada nova no próximo
  acesso — preservados The Best, grupo favorito e UF.
- **Contraste no modo escuro.** Tons de texto dos accents (`-700/-800/-900` de brand/gold/grass/
  aqua/flame) agora clareiam no tema escuro (tokens em `index.css`, mesmo padrão do brand-600/700)
  — corrige textos quase ilegíveis (ex.: hero do "Construa com a gente", notas com barra lateral).
  `-500/-600` (fundos sólidos) e `gold-950` ficam como estão.
- **Ícone do Resultadismo na barra de status do Android (era um quadrado branco).** O `badge` da
  notificação apontava pro favicon **colorido** de 32px; o Android achata bitmap colorido numa
  silhueta — daí o quadrado. Agora existe `public/favicon/badge-96.png` (silhueta **sólida do
  escudo**, branca com transparência, gerada do ícone 192) e o service worker usa ele. Vale a
  partir da próxima visita (o SW atualiza sozinho) para notificações novas.
- **Segurança: `create_deadline_reminders` só roda pelo cron.** A função do lembrete de palpite
  nunca recebeu `revoke` (default do Postgres: EXECUTE para todos) e podia ser invocada por
  qualquer cliente via REST. Revogada de `public/anon/authenticated` (migration
  `20260609000013`); o pg_cron não é afetado.
- **Portões de qualidade zerados na integração da v2.** A integração das branches da personalização
  havia entrado com 2 erros de lint (`react-hooks/preserve-manual-memoization` no
  `PlayerProfilePage`, memo manual removido) e 2 violações de camada (`NotifPrompt` movido de
  `components/pwa` → `features/notifications`). `npm run lint` 0 erros e `check:arch` APROVADO; o
  novo CI passa a impedir regressão.
- **Push sempre com identidade (escudo + título + corpo).** O service worker (`src/sw.ts`) nunca mais
  exibe uma notificação "vazia": sem corpo, usa um texto da marca — garante que toda push nossa
  apareça com o escudo verde e nunca caia no aviso genérico do navegador. Adicionados `lang: "pt-BR"`
  e suporte a `tag` (base p/ agrupar por entidade no futuro). Verificação completa do pipeline
  (trigger `notifications_push` → `send-push` → SW) confirmou: automáticas (lembrete/alerta) e
  enviadas (cutucada/aviso) usam o **mesmo caminho e payload**; o aviso genérico "Toque para copiar o
  URL" visto antes é **do próprio Chrome** (SW antigo / push pela aba em vez do app instalado), não do
  nosso código.
- **Switch on/off canônico** (`src/components/ui/Switch.tsx`) — primitivo único e acessível (`inline-flex`
  + classes padrão). Corrige o toggle **"Aparecer no Resultadismo The Best"** no Perfil, que repetia o
  bug do thumb que não animava (translate sobre `absolute`); agora com update **otimista** (não "treme").
  Toggles hand-rolled antigos (AdminDashboard, NotifPrefs) ficam a migrar pra este primitivo.
- **Aba Changelog em accordion + sem scroll lateral.** Cada versão abre/fecha ao toque (a mais recente
  já aberta); conteúdo com `break-words`/`min-w-0` — fim do overflow horizontal que arrastava os menus
  de topo e base.
- **Modo manutenção agora BLOQUEIA de verdade** (antes só mostrava uma tarja). Logado não-admin vê uma
  **tela cheia turquesa** (`MaintenanceScreen`) com logo estática + mensagem editável do admin; o admin
  segue usando o app e vê só a faixa de lembrete; deslogado continua na landing. Gate em `AppShell`
  (`useMaintenance` + `isAppAdmin`); tour de onboarding suprimido na manutenção. (`src/components/layout/`)

---

## [1.11.0] — 2026-06-06

> Redesenho da área de **Grupos** + **personalização** (4 frentes). Componentes de seleção 100%
> web (sem nativo do SO). Validado: build, `db reset` (3 migrations novas aplicam limpo), RPCs +
> CHECK por SQL, e navegador (Playwright: /grupos, /ranking, /perfil/personalizar — console limpo).

### Adicionado
- **Select e Combobox custom (sem `<select>` nativo).** `components/ui/Select.tsx` (lista curta,
  teclado, dark-mode) e `components/ui/Combobox.tsx` (lista grande **com busca**). Trocados todos os
  selects nativos restantes (CompetiçõesTab, NovaLiga, BroadcastPanel, Feedback).
- **Resultadismo The Best — recortes por aba.** Na `/ranking`: **Todos** · **Que eu jogo** (corta a
  pontuação de todos ao conjunto de campeonatos que você joga — comparação justa) · **cada
  campeonato**. Removidos o ano e o select nativo. Alterna **pontos × detalhe** (cravadas/saldos/
  acertos/aproveitamento). Backend: `get_global_standings_multi`, `get_my_global_rank_multi`,
  `get_my_played_competition_ids` (migration `20260606000007`).
- **Prévia do RTB na `/grupos` com 3 pessoas.** Sempre você + vizinhos (1 acima / 1 abaixo; desloca
  nas pontas pra encher), via `get_global_rank_window`; fallback no pódio (top-3) se você ainda não
  pontuou. Expande pra **resumido × detalhado**.
- **Cards de grupo ricos.** Flâmula + nome + **sua posição no ranking do grupo**
  (`get_my_league_positions`, exata — delega ao `get_league_standings`), **escudos de membros
  sobrepostos** (+N), **convidar pelo WhatsApp** e **lápis** (admin). Posição some em grupo pendente.
- **Grupos públicos descobríveis.** Nova vitrine na `/grupos` com busca (`list_public_leagues`):
  qualquer Resultadista acha e entra (`join_public_league`: aberto → na hora; aprovação → pendente).
  Layout da `/grupos`: RTB → "Recebeu um convite?" → Seus grupos → Grupos públicos.
- **Personalização como PÁGINA** (`/perfil/personalizar`, multi-tela, editável pelo Perfil): time do
  coração (busca), seleção que torce (Brasil pré-marcado), campeonatos de interesse, **times de
  interesse** (acordeão por campeonato, "selecionar todos"), opt-in do RTB + código de convite.
  Tudo pulável; copy **conversacional** ("Qual é o seu time do coração?"). Após o tour, o 1º acesso
  cai aqui (`PersonalizationGate`, só na entrada — não sequestra deep-link de convite). Substitui o
  antigo modal. Colunas `profiles.followed_competition_ids[]` / `followed_team_ids[]` +
  `set_personalization` unificado (migration `20260606000008`).
- **Seed de campeonatos (rascunho) p/ a personalização.** Brasileirão A/B/C, Copa do Brasil,
  Libertadores, Sul-Americana e top-5 europeu entram como **rascunho** (`is_published=false`, **não**
  aparecem em Jogos) com `sync_enabled=true` — o sync ESPN popula os **times** (`teams.crest_url`).
  RPCs `list_personalization_competitions` / `get_teams_by_competition`.

### Alterado
- **Modelo Público/Privado travado no banco** (`leagues_visibility_join_policy_ck`, migration
  `20260606000006`): **privado ⇒ só convite**; **público ⇒ aberto ou por aprovação** (nunca convite).
  NovaLiga deriva a política da visibilidade (sem combinação inválida). Grupos existentes
  **normalizados** na migration (privado→invite; público+invite→approval).
- **CompetiçõesTab** passa a usar **Bolão / Confrontos** com o Select custom.

### Docs
- [`06-REGRAS-DE-NEGOCIO.md`](06-REGRAS-DE-NEGOCIO.md) §3 (recortes do RTB), §4 (modelo
  visibilidade↔entrada + vitrine), §9 (personalização). [`10-UX-WRITING.md`](10-UX-WRITING.md) §2
  (técnica "dialogue com o Resultadista").

---

## [1.10.1] — 2026-06-06

### Corrigido
- **Web Push voltou a sair (notificação no celular/PC): `verify_jwt=false` na `send-push`.** As
  notificações in-app funcionavam, mas o **push** nunca chegava: o trigger `notifications_push`
  chama a edge function `send-push` com o token de `sync_config.service_key`, e a `send-push` (ao
  contrário da `sync-football`) ainda exigia JWT no gateway. Depois que o `sync_config.service_key`
  virou o **`CRON_SECRET`** (estável, não-JWT, fix do sync 2.8.x), o gateway passou a barrar a chamada
  com **401** antes de a função rodar → nenhuma push. `verify_jwt=false` (`supabase/config.toml`)
  deixa o `CRON_SECRET` chegar à checagem própria da função (`timingSafeEqual`). Mesmo padrão da
  `sync-football`/`mercadopago-webhook`. (Pré-requisito p/ entregar: secrets `VAPID_*` no painel +
  `VITE_VAPID_PUBLIC_KEY` do client = par da privada. iOS exige PWA instalado, 16.4+.)

---

## [1.10.0] — 2026-06-06

### Adicionado
- **"Construa o Resultadismo com a gente!" — espaço de feedback (erros + sugestões).** Nova página
  **`/construa`** (link no Perfil): o usuário escolhe **🐞 Reportar erro** ou **💡 Sugerir melhoria**,
  com título + texto curto (estilo tweet, **300 caracteres** com contador). Em **erro**, captura
  automaticamente o **contexto** — página (seletor, sem precisar mandar print), **versão do app** e
  **navegador/aparelho** (sem PII); em **melhoria**, sem esse contexto. O usuário acompanha os
  próprios envios com **status** e a **resposta do time** ("Meus envios").
- **Gestão no admin (`Admin → Construa`).** Lista com filtro por status (Novos/Backlog/Resolvidos/
  Arquivados), contexto do erro em chips, autor (link pro perfil) + **e-mail** pra contato. Ciclo:
  **Arquivar** (ignora) · **Backlog** (desenvolvimento) · **Resolver** (responde e **notifica o
  autor** in-app + push) · **Reabrir**.
- **Integração com notificações:** novo report → `fan_notify_admins` avisa os app-admins (badge no
  sino); resolver → notificação `feedback_reply` pro autor com a resposta. Backend: tabela `feedback`
  (RLS — usuário só vê os próprios), RPCs `submit_feedback` / `admin_list_feedback` /
  `admin_update_feedback`, trigger `notify_admins_new_feedback`. Migration `20260606000005`. Evento
  GA `feedback_submit`. Validado de ponta a ponta (psql + navegador): enviar → admin notificado →
  resolver → autor notificado.

---

## [1.9.0] — 2026-06-06

**Reestruturação da área de Grupos — F1 a F5 + F7.** Crítica de design + estudo de UX (rankings + troféus) → execução em fases. F6 (sala de troféus stub) fica para a próxima leva.

### Adicionado
- **Resultadismo The Best** — classificação global de todos os Resultadistas. Rota `/ranking`
  (filtros por campeonato e ano). Hero adaptativo na `/grupos` mostra **sua posição global**
  ("Você é o Nº Resultadista"); sem grupos = top 3 mundial inline + CTA. Opt-out no `/perfil`
  (`profiles.show_in_global_ranking`, default true). Backend: RPCs `get_global_standings`,
  `get_my_global_rank`, `set_global_ranking_visibility` (migration `20260606000002`).
- **Confrontos em rota separada** — `/grupos/:slug/confrontos` agora é uma página dedicada para
  Liga/Copa. `ClassificacaoTab` foca em Bolão e mostra um CTA pra essa rota quando o grupo tem
  Confronto ativo. Reduz carga visual no detalhe; 2 modos = 2 lugares.
- **Onboarding de personalização** — modal aparece UMA VEZ na entrada (`personalization_done`
  default false). Pergunta: time do coração, seleção (default Brasil quando existe nos teams),
  código de convite (opcional — entra direto no grupo). Tudo pulável; pode editar depois no perfil.
  Migration `20260606000004`: colunas em profiles (`favorite_team_id`, `national_team_id`,
  `favorite_competition_id`, `favorite_group_id`, `personalization_done`) + RPCs `set_personalization`
  / `skip_personalization`.

### Alterado
- **Naming automático das disputas** (migration `20260606000003`): Bolão passa a se chamar
  **nome do campeonato** (ex.: "Copa do Mundo FIFA 2026"); Liga/Copa passam a ser **"Nª Liga {Grupo}"**
  / **"Nª Copa {Grupo}"** auto-numeradas. Trigger BEFORE INSERT em `league_competitions` sobrescreve
  o `name` com a regra canônica; função `generate_disputa_name(p_league_id, p_mode, p_competition_id)`
  expõe a regra. **Renomeia disputas existentes**. UI de criar disputa não pede mais nome — só
  escolhe campeonato + tipo; preview "Vai chamar: …" deixa claro o nome final.
- **Glossário (`10-UX-WRITING.md`):** **Bolão** e **Confrontos** canonizados como **modos** (Pontos/
  Tabela saem). Liga e Copa = formatos dentro de Confrontos. **Resultadista** = como chamamos o
  usuário em momentos sociais ("Você é o 27º Resultadista"). **Resultadismo The Best** = nome da
  classificação geral.
- **Bug do escudo redondo no detalhe do grupo corrigido.** O glob de flâmulas apontava para
  `../assets/grupos` (após o rename Federação→Grupo) mas os arquivos estavam em
  `../assets/federacoes`. Catálogo vazio → `CrestMask` caía no fallback de círculo. Movido
  `src/assets/federacoes` → `src/assets/grupos`.
- **`LigasPage`** com hero RTB sempre visível, ritmo das listas (`space-y-3` → `space-y-4`),
  empty state que ensina ("Aqui ficam seus grupos") e form de código posicionado conforme estado.
- **`10-UX-WRITING.md` ganhou a regra "textos curtos, decisão rápida"** — limites duros para
  título/descrição/botão/toast/push. Texto de 3+ linhas é pulado pela maioria; corte e reformule.

### Decisões
- **Sala de troféus (F6)** fica para a próxima leva — motor de cálculo (mensal/anual/badges)
  merece sessão dedicada. Vai aparecer como **vitrine na /grupos** (top 3 do user) + lista completa
  no /perfil.
- **Personalização avançada** (lista grande de times Série A/B/C/D + Libertadores + Sul-Americana +
  top-5 europeu, times de interesse, campeonatos de interesse) fica como **F7 ampliado** — depende
  de seed de teams. O onboarding atual usa apenas teams já no banco (vindos dos sync).

---

## [1.8.3] — 2026-06-06

### Corrigido
- **Sync ao vivo de fato voltou (e ficou observável): timeout do `pg_net` 5s → 30s.** Depois do
  fix de auth (1.8.2 + `CRON_SECRET`), o cron passou a chegar na função e sincronizar — mas a chamada
  `net.http_post` usava o timeout padrão do `pg_net` (5s) e a função leva ~5s (ESPN + football_data +
  gravação), então o `pg_net` registrava "Timeout of 5000 ms" / `status_code NULL` **apesar de o sync
  concluir** (`last_synced_at` atualizava, `last_sync_ok=true`). Subi `timeout_milliseconds := 30000`
  em `run_football_sync` (migration `20260606000001`) pra (1) o `pg_net` capturar o **200** (logs
  legíveis — é por `net._http_response` que se diagnostica o sync) e (2) dar folga em dias de muito
  jogo. **Confirmado em produção:** `last_synced_at` atualizando a cada minuto, `last_sync_ok=true`.

---

## [1.8.2] — 2026-06-06

### Corrigido
- **Sync ao vivo travado em produção (403) — auth do cron à prova de rotação de chave.** A edge
  function `sync-football` passou a rejeitar (**403**) toda chamada do cron porque o token enviado
  (`private.sync_config.service_key`) deixou de bater com a `service_role` key (o Supabase
  trocou/rotacionou a chave). O cron rodava a cada minuto, mas tudo era recusado → `last_synced_at`
  congelava. **Fix:** `verify_jwt=false` para a `sync-football` (`supabase/config.toml`), habilitando
  o caminho **`CRON_SECRET`** que a função já implementa — um segredo NOSSO, estável, imune à rotação
  da service_role key. (A função continua fazendo a própria autorização: `timingSafeEqual` do segredo
  ou JWT de app-admin.) Config do segredo é manual (painel + `sync_config`). Diagnóstico feito por
  `cron.job_run_details` + `net._http_response` (status 403) em produção.

---

## [1.8.1] — 2026-06-05

### Alterado
- **Regra de lint `react-hooks/set-state-in-effect` religada (`eslint .` exit 0 com a regra ativa).**
  Concluído o "próximo passe" prometido na [1.7.5]: os **12 pontos** que a violavam (11 arquivos)
  foram migrados para os padrões **"you might not need an effect"**, **sem mudança de comportamento**
  — e removido o override `"off"` do `eslint.config.js`. Por arquivo: `useFirstSeen` (lazy-init no
  `useState`, sem efeito); `InstallPrompt` (efeito redundante removido — a guarda de render já
  esconde quando instalado); `ThemeProvider` (tema `resolved` **derivado** no render a partir de
  `theme` + estado `systemDark`, com o `apply` no DOM num efeito só de `[resolved]`); `ConfirmDialog`
  (reset do passo via prop anterior `prevOpen`, no render); `CrestEditor` (reset de `activeDiv` por
  chave anterior `fill-stripeCount`); `NameRulesCard` e `PaymentAdmin` (form populado via referência
  anterior dos dados/configs async, no render); `NovaLigaPage` (default da Copa **derivado** em
  `effectiveCompetitionId`); `CompeticoesTab` (sugestão da Copa ao abrir, ajustada no render);
  `JogosPage` (dia efetivo **derivado**; troca de campeonato zera a escolha via `prevScope`);
  `PerfilPage` (estado do push lido no callback da promise, não síncrono no efeito). As demais regras
  de hooks seguem ativas (rules-of-hooks, exhaustive-deps, **purity**).
- **Validação:** `eslint .` exit 0 (regra ativa), `npm run build` ok, e no navegador (homologação
  local) os core — **tema** (claro/escuro/sistema, em montagem e ao trocar ao vivo, + `meta
  theme-color`), **ConfirmDialog** (2 passos + reset ao reabrir após fechar) e **JogosPage** (dia
  padrão correto + troca de escopo reseta o dia) — todos OK, sem warnings de re-render no console.

---

## [1.8.0] — 2026-06-05

### Adicionado
- **Central de avisos do admin (`Admin → Avisos`).** Disparo de notificação (in-app + push) por
  segmento, com pré-visualização de alcance antes de mandar e histórico do que já foi enviado.
  Segmentos: **todo mundo**, **não palpitou hoje** (tem jogo de hoje numa federação ativa e ainda
  não palpitou), **online agora** (presença < 90s), **um grupo** (membros de uma federação) e
  **topo de um grupo** (os N primeiros da classificação de uma competição, N de 1 a 50). Todo
  segmento já **desconta quem desligou avisos**. Disparo grande (> 50 pessoas) pede confirmação
  dupla. Backend: `admin_broadcast_preview`, `admin_send_broadcast` (grava em
  `notification_broadcasts`, insere 1 notificação por destinatário, audita em `admin_audit_log`),
  `admin_list_broadcasts`, `admin_list_group_targets` — todas com gate `is_app_admin()`.
- **Preferências de notificação por usuário (`Perfil → Notificações`).** Cada pessoa liga/desliga
  **lembretes de prazo**, **cutucadas** e **avisos do app**, valendo para a conta toda (in-app +
  push). Coluna `profiles.notif_prefs` (default tudo ligado); RPCs `get_notification_prefs` e
  `set_notification_pref`. Alertas operacionais do admin **não** respeitam preferência.
- **Alertas para o admin.** Notificação automática quando entra um **alerta de sincronização
  pendente** e quando uma **federação ativa fica com nome pendente de revisão**, com dedupe de 6h
  (`fan_notify_admins` + triggers em `sync_alerts` e `leagues`). Os triggers são fail-safe
  (`exception when others then return new`): nunca quebram a escrita-base.
- **Badge no ícone do app (PWA).** O número de não lidas aparece no ícone instalado via
  `navigator.setAppBadge` (no-op no navegador), zerado ao abrir as notificações. Nova RPC
  `get_unread_count`.
- **Dica de push no iOS.** No iOS fora do PWA instalado, um aviso curto explica que push só funciona
  com o app na tela de início (limitação do iOS 16.4+).

### Corrigido
- **Dropdown do sininho cortava no desktop.** O menu de notificações abre para a esquerda no mobile
  (sino no header, à direita) e para a direita no desktop (sino na sidebar, à esquerda), em vez de
  sair da tela.

### Segurança
- Funções internas (`wants_notification`, `private.broadcast_recipients`, `fan_notify_admins`) têm
  `execute` revogado de `public`/`anon`/`authenticated` — só rodam via outras funções/triggers. As
  chamáveis pelo cliente são `SECURITY DEFINER` com `search_path=''` e gate explícito
  (`is_app_admin()` para as de admin, `auth.uid()` para as de preferência). A tabela
  `notification_broadcasts` tem RLS ligado **sem policy** (leitura só via `admin_list_broadcasts`).
- **`notif_prefs` blindado contra escrita maliciosa.** Como a coluna é gravável direto via RLS, um
  usuário poderia gravar lixo (ex.: `broadcast: "maybe"`) e quebrar o cast em `wants_notification`,
  derrubando todo o broadcast do admin. Fechado em duas camadas: CHECK `profiles_notif_prefs_valid`
  (objeto com chaves booleanas) na escrita + cast tolerante (`jsonb_typeof` antes do `::boolean`,
  default `true`) na leitura. O trigger de revisão de nome só dispara em transição real de
  `name_approved` (não em qualquer edição de grupo).

---

## [1.7.5] — 2026-06-05

### Alterado
- **Lint do repo 100% limpo (`eslint .` exit 0).** Corrigidos **em código**: `Date.now()` no render
  (`RefundFederationButton` → captura na montagem, janela é de dias); variável morta `statusTone`
  (`ConfrontoViews`); aviso de Fast Refresh num utilitário exportado (`Onboarding`, disable por linha).
  A regra **experimental** do React Compiler `react-hooks/set-state-in-effect` — que sinalizava **12
  padrões idiomáticos pré-existentes** (popular formulário de dados async, resetar estado on prop
  change) em arquivos core/quentes — foi **desligada por ora** (justificada em `eslint.config.js`),
  para não arriscar componentes core num app ao vivo enquanto há sessões editando em paralelo. As
  demais regras de hooks seguem ativas (rules-of-hooks, exhaustive-deps, **purity**). _Migração
  dedicada desses 12 componentes para "you might not need an effect" fica como próximo passe._

---

## [1.7.4] — 2026-06-05

### Corrigido
- **Lint do React Compiler no `MatchCard` e em `predictions` (sem mudança de comportamento).**
  (1) O "ao vivo automático" lia `Date.now()` **durante o render** (impuro) — agora usa um estado
  `now` que já era atualizado pelo tick de 30s; (2) o auto-save chamava `setState` de forma síncrona
  no corpo do effect — movido para dentro do `setTimeout` do debounce; (3) removida a variável
  não-usada do _omit_ em `useMyPredictions`. Auto-save validado (palpite salva + indicador). _Restam
  ~15 erros pré-existentes da mesma classe em outros arquivos — fora deste passe._

---

## [1.7.3] — 2026-06-05

### Adicionado
- **Tagueamento de eventos no Google Analytics (funil).** Novo helper `track()`
  (`src/lib/analytics.ts`) dispara eventos GA4 respeitando o Consent Mode v2 (pings cookieless
  quando negado) e **sem PII** nos parâmetros. Eventos instrumentados:
  - **`login`** `{ method: "google" }` — clique em "Entrar com Google".
  - **`cta_click`** `{ location }` — CTAs de conversão (`hero`, `pricing`, `footer`, `match_card`,
    `como_funciona`).
  - **`save_prediction`**, **`set_joker`** `{ enabled }` — engajamento no palpite (nos hooks).
  - **`create_group`** `{ visibility }`, **`join_group`** `{ method: "code" }` — crescimento.
  - **`share`** `{ method: "whatsapp", content_type: "group_invite" }`, **`copy_invite`** — viralização.
  - **`nudge_sent`** — cutucada; **`consent_set`** `{ choice }` — aceite/recusa do banner.
  - Instrumentado preferencialmente nos hooks de mutation (1 ponto cobre todos os call sites).

---

## [1.7.2] — 2026-06-05

### Alterado
- **Ordenação do admin refeita (Usuários e Grupos) — campo + direção explícitos.** Novo
  `SortControl` reutilizável (`src/components/ui/SortControl.tsx`): escolhe-se o **campo** (chips) e a
  **direção** num botão sempre visível, com rótulo contextual (ex.: "A→Z", "Mais recentes", "Mais
  uso"). Substitui as pills que misturavam campo+direção ("Recentes/Antigos").
  - **Usuários:** ordenar por **Online**, **Nome**, **Entrada** (data de criação) ou **Uso**, cada um
    **crescente/decrescente** (padrão: Online primeiro).
  - **Grupos:** **busca** + ordenação (**Nome** ou **Criação**, crescente/decrescente) agora
    **sempre visíveis** — antes só apareciam com mais de 3 grupos, então sumiam de fato.
- **Usuários online muito mais claros:** selo verde **ONLINE** ao lado do nome, **anel** verde no
  card, ponto **pulsante** no avatar e contagem **"N online agora"** em destaque no topo.
  (`src/features/admin/UsuariosAdmin.tsx`, `LigasAdmin.tsx`)

---

## [1.7.1] — 2026-06-05

### Corrigido
- **Card ao vivo na primeira dobra não tem mais a borda cortada.** O teto de 2 linhas do teaser
  deslogado (1.7.0) passou a limitar a **quantidade** de cards renderizados, em vez de
  `overflow-hidden` — que clipava o anel (`ring`) dos jogos AO VIVO. Mesma regra (máx 2 linhas, sem
  espaço vazio), agora sem corte. (`FirstFold` + `JogosPage`)
- **"Online" e tempo de uso desacoplados da sala de espera.** Antes, a presença (quem está online,
  `last_active_at`, `usage_seconds`) era parasita da fila de acesso: só era alimentada quando havia
  sessão ativa em `access_sessions`. Como a fila vive **desligada** no dia a dia, ninguém aparecia
  online e o tempo de uso não acumulava. Agora todo usuário logado emite um heartbeat leve próprio
  (`touch_presence` + `PresenceTracker`), e o "online" é calculado por `profiles.last_active_at`
  recente (limiar único de 90s) no dashboard, na lista de usuários e no perfil. (migration
  `20260605000001`, `src/features/presence/PresenceTracker.tsx`)
- **Sala de espera não "pisca" mais quando está desligada.** Com a fila off, `request_access` admite
  sem criar sessão; o front iniciava o heartbeat mesmo assim e, a cada 20s, ele voltava `expired` e
  jogava a tela de espera por um instante. Agora o heartbeat de fila só roda com a fila **ligada**, e
  o `!ok` re-pede acesso sem pintar a espera de forma otimista. (`src/features/access/AccessGate.tsx`)
- **Placar ao vivo atualiza sozinho.** (1) O cron de placares passou de 5 min para **1 min**
  (`should_sync_scores()` continua barrando fora de jogo — custo de API só durante partidas). (2) Na
  visão "Todos os campeonatos" o app não assinava Realtime (o hook saía cedo sem competição) — agora
  assina a tabela inteira; e há um `refetchInterval` de 60s de segurança enquanto houver jogo ao vivo.
  (migration `20260605000001`, `src/features/matches/api.ts`)
- **Liberar a vaga da fila ao fechar a aba volta a funcionar.** `releaseAccess` usava
  `void supabase.rpc(...)` — o builder do supabase-js é lazy e, sem `await`, **nunca disparava** (a
  vaga só saía pelo TTL de 45s). Agora usa `fetch` com **`keepalive`** (sobrevive ao `pagehide`) na
  RPC `release_access` (grant `anon`, só precisa da apikey). (`src/features/access/api.ts`)

---

## [1.7.0] — 2026-06-05

### Alterado
- **Primeira dobra da home: no máximo 2 linhas de jogos.** O teaser deslogado deixa de usar a altura
  do viewport como teto e passa a mostrar **no máximo 2 linhas** de jogos (4 no desktop, 2 no mobile);
  o convite "Conheça o Resultadismo" cola **logo abaixo** dos jogos visíveis, acabando com o espaço
  vazio que sobrava em dias com poucos jogos. (`src/features/landing/FirstFold.tsx`)
- **Página de login removida.** `/login` deixou de existir; o **único** login é o bottom-sheet
  (`LoginModal`) com Google, aberto pelo botão "Entrar". Logout volta pra **Home** (`/`);
  `RequireAuth` e `AuthCallback` redirecionam pra `/`; CTAs "Entrar para palpitar"/"Entrar e jogar"
  abrem o modal. `LoginPage.tsx` excluído.

### Admin v2 — overhaul do painel administrativo (migrations `20260604000004`–`000007`)
- **Corrigido — toggle (Switch) do admin** com aparência invertida (translate arbitrário não
  animava); reescrito com `inline-flex` + classes padrão.
- **Corrigido — "jogo oculto não existe" também no "ao vivo":** `should_sync_scores()` e o
  `live_now` do dashboard ignoram `matches.hidden`.
- **Visão (dashboard) mais completa:** "Hoje" no lugar de "Próx. 24h"; banner de **grupos
  aguardando aprovação**; **alerta de pico** de online; atividade recente com **nome da entidade**;
  alertas com **competição + provedor (API)**.
- **Configurações editáveis no painel:** limiar do alerta de online + sala de espera (ligar/desligar
  + limite de simultâneos) — antes hardcoded/só-SQL (`app_settings.online_alert_threshold`; RPCs
  `admin_set_online_threshold` / `admin_update_access`).
- **Usuários:** busca + **ordenação** (nome/recentes/antigos/mais uso), **online** (só admin),
  **tempo de uso** acumulado por heartbeat (`profiles.usage_seconds`), data de entrada, **clique →
  perfil**.
- **Grupos:** ordenação + **data de criação** na lista.
- **Moderação de usuário (3 níveis, só app-admin, dupla verificação)** no perfil: **suspender**
  (reversível), **excluir** (e-mail recadastra), **excluir + bloquear e-mail**. Guard
  `private.assert_can_moderate`; `blocked_emails` + `handle_new_user` rejeita.
- **Competições:** catálogo **ESPN no cliente** (corrige o "Erro ao buscar catálogo"); jogos por
  competição em **acordeão** por data (só hoje aberto).
- _Pendente p/ depois (a pedido): tagueamento de eventos no Google Analytics._

---

## [1.6.2] — 2026-06-05

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

## [1.6.1] — 2026-06-05

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

## [1.6.0] — 2026-06-05

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

## [1.5.0] — 2026-06-05

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

## [1.4.1] — 2026-06-04

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

## [1.4.0] — 2026-06-04

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

## [1.3.1] — 2026-06-04

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

## [1.3.0] — 2026-06-04

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

## [1.2.2] — 2026-06-04

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

## [1.2.1] — 2026-06-04

### Alterado
- **Banner de consentimento (UI):** "Recusar" virou link discreto (texto cinza
  com sublinhado no hover) em vez de botão outline, pra não competir
  visualmente com o CTA "Aceitar". Comportamento e a11y mantidos (continua
  `<button>` focável).

---

## [1.2.0] — 2026-06-04

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

## [1.1.0] — 2026-06-04

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

## [1.0.0] — 2026-06-03

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

## [1.0.1] — AAAA-MM-DD
### Corrigido
- … (o que mudou, e por quê; cite arquivos/migrations se ajudar)
### Documentação
- Atualizado `.claude/0X-...md` por causa desta mudança.
-->
