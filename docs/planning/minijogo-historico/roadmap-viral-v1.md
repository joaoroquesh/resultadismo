# Resultadismo Retrô — Roadmap de viralização (v1)

> Análise consolidada (2026-06-11) a partir de auditoria multiagente do Retrô vivo + dos estudos
> existentes (Octalysis, plano-v1, decisões fechadas). Branch de trabalho: **`feat/retro-melhorias`**
> (partindo do `origin/main` atualizado). **Nada foi codado** — este doc alimenta o Portão A.
> Objetivo do PO: tornar o Retrô um jogo **viral, divertido e que empolga**, e decidir se ele vira
> um **produto mais separado** (subdomínio `retro.resultadismo.com`).

---

## 1. Tese (o que a análise diz)

O Retrô **já é o produto mais forte de gamificação da casa** — pontua **393/800** no Octalysis
contra **339/800** do bolão. Ele acerta o que o bolão erra: atrito quase zero (joga sem login),
reveal "fliperama" com confete, cronômetro, mata-mata de morte súbita, selos raros (📜 HISTÓRICA, 👾
ZEROU O GAME), streak 🔥 e um share viral sem spoiler. **O motor de diversão já está pronto.**

Mas tem **dois furos claros** que impedem a viralização — e os dois **não dependem do bolão**, ou
seja, casam com a ideia de separar o Retrô:

1. **Posse / coleção (CD4 = 30/100, o eixo mais fraco).** Nada se acumula ou se coleciona. A única
   coisa "possuível" é a ficha de reroll — e ela é efêmera, gasta na run. Sem perfil, sem álbum, sem
   conquistas permanentes, o jogador não constrói nada que o faça voltar e se identificar.
2. **Social interno (CD5 = 42/100).** O Retrô viraliza **pra fora** (share lindo), mas **por dentro**
   é solitário: ranking global de estranhos, sem "meu grupo / meus amigos", sem **desafio 1-a-1**.
   Quem manda o link "acha que faz melhor?" nunca descobre se o amigo topou nem o placar dele.

E um **furo de retenção** transversal: a Seleção do Dia tem appointment diário + streak, mas
**nenhum lembrete traz a pessoa de volta** — o "Volte amanhã" é texto morto, o streak é mostrado mas
nunca *defendido* ("seu 🔥 acaba hoje"), e não há push. É o gancho de retorno mais barato do Wordle e
hoje está zerado.

**Direção estratégica recomendada:** parar de pensar o Retrô como isca do bolão e **construir nele
identidade e laço social próprios** (perfil, coleção, desafio, ranking de amigos). Isso é exatamente
o que justifica separar o envelope (marca/URL próprios) — ver §6.

---

## 2. Roadmap por ondas (impacto × esforço)

Legenda: impacto ★★★ alto / ★★ médio / ★ baixo · esforço **P** (≤1 dia) / **M** (dias) / **G**
(semana+). Cada item traz o gatilho viral/diversão que aciona.

### Onda 0 — Quick wins (dias soltos, alto retorno)
| # | O quê | Impacto | Esf. | Por quê |
|---|---|---|---|---|
| 0.1 | **Medir o funil**: evento `retro_open` (abriu /retro, com origem) — hoje só medimos `retro_run_start` (depois do clique). A conversão "abriu→jogou" é cega. | ★★★ | P | sem isso não dá pra otimizar nada |
| 0.2 | **Streak em risco + countdown** na home: trocar "Volte amanhã" por "Nova Seleção em HH:MM" e "sua sequência de N dias acaba hoje 🔥". | ★★★ | P | gancho de retorno do Wordle, de graça |
| 0.3 | **Nomear a Seleção do Dia + nº de edição** no share (texto e imagem): "Retrô #12 · BRASIL". | ★★★ | P | cria o ritual "Wordle do dia" compartilhável |
| 0.4 | **"Você seria ~Nº"** pro anônimo no fim da run (em vez de "não entra no ranking"). | ★★★ | P | converte login no pico de empolgação |
| 0.5 | **Som + vibração** mínimos (WebAudio, zero assets): tick nos 3s finais, ping na cravada, buzz no erro, fanfarra de campeão. | ★★★ | M | maior salto de "feel" por linha de código |
| 0.6 | **Celebração de campeão > cravada**: hoje virar campeão usa o mesmo confete de 16 partículas de uma cravada qualquer. Dar um clímax. | ★★ | P | o ápice tem que *parecer* o ápice |
| 0.7 | **Link de desafio cai na MESMA Copa**: hoje "/retro/r/:code → Jogar a minha Copa" inicia run aleatória. No daily já é determinístico — só rotear pro daily de hoje. | ★★★ | P | fecha metade do loop de desafio quase de graça |
| 0.8 | Encurtar/animar o **"Valendo…" de 1,2s** no 1º jogo da sessão (acelera o time-to-fun). | ★ | P | tira tempo morto antes da 1ª dopamina |

### Onda 1 — Identidade, coleção & conquistas (ataca CD4 Posse)
| # | O quê | Impacto | Esf. |
|---|---|---|---|
| 1.1 | **Estante de conquistas** persistentes: `retro_achievements` + `retro_player_achievements`. Badges reais (1ª cravada, 1º campeão, run perfeita, X seleções, streak 7/30…). **Nunca mais cadeado fantasma.** | ★★★ | M |
| 1.2 | **Perfil "Minha Copa Retrô"** (`/retro/eu`): escudo, streak atual + recorde, melhor campanha, total de runs/títulos/cravadas, vitrine de badges. | ★★★ | M |
| 1.3 | **Coleção de seleções (álbum de figurinhas)**: agregar de `retro_run_matches` quais seleções/Copas o jogador já cravou/venceu ("15/58 seleções"). | ★★ | G |
| 1.4 | **Recordes pessoais** + "NOVO RECORDE 🏅" na tela final (best_streak, best_points por modo, run mais rápida). | ★★ | P |
| 1.5 | **Níveis/títulos por XP** com sabor de futebol (ex.: Reserva → Titular → Craque → Lenda). | ★★ | M |

### Onda 2 — Social, desafio & rivalidade (ataca CD5 Social)
| # | O quê | Impacto | Esf. |
|---|---|---|---|
| 2.1 | **Duelo fechado**: B joga a MESMA campanha de A (mesma seed), e o resultado volta lado a lado ("Você 14 × 11 Fulano"). Vincular a run ao `share_code` de origem. | ★★★ | G |
| 2.2 | **OG dinâmico por resultado** no `/retro/r/:code`: a prévia no WhatsApp mostra o placar/seleção/escudo de quem postou, não o card fixo. | ★★★ | M |
| 2.3 | **Ranking de amigos / por grupo** reusando o grafo social do app-mãe (grupos/federações). | ★★★ | M |
| 2.4 | **Apelido + escudo leve pro anônimo** no fim da run (sem login Google), gravado no token anônimo — o card deixa de ser "Alguém jogou". | ★★ | M |
| 2.5 | **Hall da Fama / "The Best" do Retrô**: quem mais zerou 👾, mais campanhas 📜, maior streak; coroar o campeão da Seleção do Dia de ontem na home. | ★★ | M |
| 2.6 | **Vizinhança no ranking** (2 acima / 2 abaixo + "faltam X pts pro 46º") em vez do "Você: 47º" seco. | ★ | P |

### Onda 3 — Retenção diária (transversal)
| # | O quê | Impacto | Esf. |
|---|---|---|---|
| 3.1 | **Push diário opt-in** da Seleção do Dia: reusa o `subscribePush`/`push.ts` do app-mãe + cron `pg_cron` pra quem ainda não jogou hoje. | ★★★ | M |
| 3.2 | **Proteger & recompensar a streak**: marcos 3/7/30 (com selo compartilhável), "streak freeze" mensal, aviso de sequência acabando. | ★★ | M |
| 3.3 | **Streak local pro anônimo** (localStorage) + CTA "crie conta pra não perder sua sequência". | ★★ | M |

### Onda 4 — Dicas por partida (pedido do PO) — ver §5
Curiosidade histórica curta aparecendo a cada jogo. **Esforço M**, alto encanto, baixo risco. Pode
entrar cedo (a coluna de dados já existe). Detalhe no §5.

---

## 3. O que já está bom (preservar)
- **Atrito quase zero** (joga sem login, modal de 4 linhas) — vantagem de viralização; não estragar.
- **Share sem spoiler** (card-imagem PNG + grade de emoji + "acha que faz melhor?") — modelo de loop.
- **Selos raros de verdade** (📜/👾) e o reveal fliperama — o pico de dopamina já existe.
- **Motor 100% no banco**, RLS-first, anti-cheat (gabarito nunca desce) — base sólida pra tudo acima.

---

## 4. Furos críticos confirmados no código (resumo)
- Funil cego no topo (sem `retro_open`). · Modal-paredão de regras no pico de intenção.
- "Volte amanhã" estático, streak nunca defendido, sem push. · Loop sonoro/háptico **mudo**.
- Reveal sem história do jogo (crava Brasil 1×7 Alemanha e não recebe o "7×1"). · Link-desafio sem
  retorno nem mesma campanha. · Sem perfil/coleção/conquistas persistentes. · Ranking só de estranhos.

---

## 5. Sistema de DICAS por partida (desenho completo)

**Boa notícia: a infra já está provisionada.** A coluna `retro_matches.fact_pt` (text, NULL) **já
existe** (criada de propósito no seed) e está **100% vazia** (0/964). E o **gate anti-spoiler já
existe**: `retro_match_payload()` é a ÚNICA função que monta o JSON que desce pro jogador e hoje só
manda campos não-spoiler (ano, sede, fase, times, dificuldade) — o placar só sai **depois** do
palpite. É exatamente onde a dica entra.

**Desenho:**
1. **Armazenamento:** reusar `fact_pt` (1 dica curta por jogo, ~90 chars). + 2 colunas leves de
   curadoria: `fact_source` ('manual'|'ia-curado') e opcional `fact_reviewed`. Sem tabela nova.
2. **Entrega no payload:** `retro_match_payload` passa a incluir `fact: m.fact_pt`. Herda toda a
   proteção anti-cheat. `fact = null` → a UI não mostra nada (degradação graciosa: **não precisa
   cobrir os 964 antes de lançar**).
   > **Refino do PO (rodada 21.1):** a dica NÃO é curiosidade aleatória — é uma **pista curtíssima
   > (1 linha)** que ajuda a **reconhecer o jogo e puxar a memória do placar**: apelido ou lance
   > marcante. Ex.: "Gol de mão do Maradona", "Maracanazzo", "Mineiraço". Limite **90 chars**.
3. **UX (RunView):** pílula discreta "💡 {pista}" abaixo do confronto e **antes** do cronômetro,
   durante o respiro "Valendo…" — não rouba foco das roletas, não consome o tempo (o deadline já tem
   folga). Curtíssima pra caber no mobile.
4. **Anti-spoiler (a dica aparece ANTES do palpite):** o apelido PODE evocar o jogo (é o objetivo:
   lembrar o placar) — o que não pode é **dar o placar de forma literal**.
   - **Validação automática** (`retro_fact_is_spoiler`): rejeita ao **publicar** dígitos que formem
     placar ("4 a 1", "4x1", "4-1") ou verbos literais de resultado (venceu/goleou/campeão). Apelidos
     ("Maracanazzo") passam. Rascunho de IA pode entrar mesmo assim, pra revisão.
   - **Curadoria humana** é o backstop.
5. **Fonte das dicas (recomendado: híbrido):** IA gera **rascunho** em lote (recebendo só
   ano/sede/fase/times) → você **revisa/aprova no admin** antes de publicar. Cobre os 964 rápido com
   sua voz e veracidade conferida. (openfootball é CC0 mas só dá dado seco; Wikipedia é CC BY-SA, só
   como insumo, nunca colar literal.)
6. **Admin:** painel "Curiosidades" no `/admin/retro`: lista de jogos (filtrar "sem dica"), textarea +
   `admin_set_match_fact(match_id, texto)` (SECURITY DEFINER + `is_app_admin()`), contador de
   cobertura ("312/964"), e a regra anti-spoiler em destaque. O admin é o único lugar onde o placar
   pode aparecer ao lado da dica pra conferência.

**Esforço total: M.** Lançável com um subconjunto (ex.: começar pelos jogos-lenda) e ir preenchendo.

---

## 6. Separação: Retrô vs app-mãe & `retro.resultadismo.com`

**Recomendação (atualizada — decisão do PO, rodada 21.1): separar o ENVELOPE COM login único.**
Marca, OG, PWA, analytics e URL próprios (`retro.resultadismo.com`), banco e `profiles` únicos, **e
LOGIN ÚNICO entre os dois jogos (e jogos futuros)**. O PO quer favorecer a UX de uma plataforma
multi-jogo: logou em um, está logado em todos.

**Como (viável e padrão de mercado):** trocar o storage de sessão do supabase-js de `localStorage`
(por-origem) para um **cookie de sessão com escopo `domain=.resultadismo.com`** (domínio-pai),
compartilhado por `www`, `retro` e qualquer `*.resultadismo.com` futuro. Isso dá SSO real entre os
subdomínios **sem** postMessage/hand-off — esforço **M**, e vira a fundação do login único da
plataforma. (Pré-requisito: todos os jogos vivem em subdomínios de `resultadismo.com`. Domínio
totalmente distinto exigiria OAuth/redirect — fora de escopo.) O Retrô segue jogável **sem** login;
o SSO só beneficia quem loga (ranking/escudo/coleção).

**O que já está separado** (a fronteira existe): UI (`RetroShell`), presença/tempo (`retro_touch`),
OG/SEO em conteúdo (`build-retro-html.mjs` + rewrite). **O que falta** é só o "envelope".

**Caminho em 2 fases:**
- **Fase 1 (P/M, zero risco pro bolão):** subir `retro.resultadismo.com` no **mesmo** projeto Vercel
  servindo o mesmo `dist`, com rewrite por host entregando `retro.html` na raiz do subdomínio; PWA
  (manifest/SW) e GA4 próprios condicionados ao host; 301 de `/retro` → subdomínio + canonical/URLs de
  share atualizados. Entrega a identidade de produto viral (marca, card, métrica limpa, instalável
  como app próprio) com esforço contido.
- **Fase 2 (só com tração):** avaliar build/deploy separado do slice Retrô.

**O que NÃO fazer agora:** reabsorver o Retrô no AppShell (anda contra a tese).

**Implicação pro roadmap:** se vamos separar, faz mais sentido o Retrô ter **identidade/coleção
próprias** (Onda 1) em vez de só emprestar o perfil do bolão — as duas decisões se reforçam. E o
**login único** (cookie de domínio-pai) é a base de plataforma pra esse e os próximos jogos.

---

## 7. Decisões (Portão A) — ✅ tomadas em 11/06
1. **Separação:** ✅ subdomínio `retro.resultadismo.com` (envelope) **com LOGIN ÚNICO** entre os
   jogos (cookie de sessão escopo `.resultadismo.com`).
2. **Prioridade:** ✅ Quick wins (Onda 0) + **Dicas** (§5) primeiro.
3. **Dicas:** ✅ **híbrido** (IA rascunha → admin aprova). Dica = **pista curta/apelido** (rodada
   21.1). Lançar com subconjunto + degradação graciosa (null não mostra nada).
4. **Escopo da branch:** trabalho tudo na `feat/retro-melhorias`; só vai pra `main` (deploy) com OK
   por onda.

> **Status (11/06):** infra de Dicas construída na branch (migrations `150017`/`150018`, painel admin,
> pílula no jogo, 5 apelidos-exemplo). **Pendente:** lote de rascunhos via IA (apelido/lance) pros
> jogos notáveis → revisão no admin; Onda 0 (quick wins); subdomínio + login único.
