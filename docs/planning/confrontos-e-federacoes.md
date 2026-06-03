# Plano técnico — Federações, modos (Pontos / Liga / Copa) e multi-campeonato

> ✅ **Implementado e em produção** (gated por `confronto_enabled`) em 2026-06-01 → 06-03. O que de fato foi construído, com migrations, telas, validações e cuidados, está em **[`../sessao-2026-06-03-confrontos.md`](../sessao-2026-06-03-confrontos.md)**. Este arquivo é o **plano original** — preservado como referência de design; alguns detalhes evoluíram na implementação (ex.: confronto resolve por **período**/fase-semana, formato da Liga escolhido no **sorteio**, sorteio **agendável**).
>
> _(Rascunho original abaixo.)_ Mexe fundo no domínio de ligas → **alta colisão com a outra sessão** (ver no fim). Migrations vão a prod no push.

## Decisões já tomadas (João)
- **3 modos**, todos **dentro de uma Federação**, e em cada um dá pra **palpitar vários campeonatos juntos**:
  - **Pontos** — corrida de pontos (ranking único).
  - **Liga** — confronto direto em formato de pontos corridos (tabela 3/1/0). *(é o que eu chamava de "Confronto")*
  - **Copa** — confronto direto em mata-mata (chaveamento).
- **Confronto** (o "duelo") é o motor que alimenta **Liga** e **Copa**: dia a dia, quem faz mais pontos no dia "marca um gol"; quem vence mais dias leva o confronto (3/1/0).
- Formato (Liga/Copa) automático por nº de jogadores (4–8 e 9–30).
- Nome (usuário e federação): 1×/mês + aprovação do admin.

---

## 1. Hierarquia e nomenclatura

```
Federação (container social — era "Liga/Grupo")
 ├─ membros, escudo, visibilidade, entrada, aprovação, pagamento
 └─ Disputas (1+)
     ├─ Disputa A  · modo: Pontos · campeonatos: [Copa do Mundo]
     ├─ Disputa B  · modo: Liga   · campeonatos: [Copa do Mundo, Brasileirão]
     └─ Disputa C  · modo: Copa   · campeonatos: [Brasileirão]
```

- **Federação** = renomeia o atual "Liga/Grupo". A **tabela continua `leagues`** (renomear tabela seria migration cara e quebraria a outra sessão); muda só o **rótulo na UI** e adiciona campos.
- **Disputa** = uma competição interna com um **modo** + **vários campeonatos**. Reaproveita a tabela `league_competitions` (já tem `league_id`, `name`, `mode`, `settings`, `starts_on`, `status`).
- ⚠️ **Repurpose de "Liga"**: hoje "Liga" = o container (vira Federação). No novo modelo, "Liga" = um **modo de disputa** (pontos corridos com confronto). É uma troca de significado proposital; sinalizo para alinharmos os textos.

---

## 2. Multi-campeonato por disputa (novo)

Hoje cada `league_competitions` aponta para **1** competição. Novo: uma disputa pode reunir **N** campeonatos.

- **Nova tabela N:N** `disputa_competicoes` (`league_competition_id`, `competition_id`).
- `league_competitions.competition_id` legado vira opcional (migro os existentes para a N:N).
- Os palpites já são globais por (usuário, jogo). A disputa passa a **agregar os palpites de todos os seus campeonatos**.

---

## 3. Modelo de dados (migrations aditivas)

- **`leagues` (Federação)**: + `crest text` (escudo gen), + `name_changed_at timestamptz`. Mantém `payment_status` (da outra sessão), status/aprovação, etc.
- **`league_competitions` (Disputa)**: `mode` passa a `pontos | liga | copa` (migração do enum: `table`→`pontos`, `points`→`pontos`/removido, `cup`→`copa`, novo `liga`). `settings` guarda regras (pontos por cravada/saldo/acerto, regra do confronto 3/1/0, config de formato).
- **`disputa_competicoes`** (N:N) — novo.
- **`confrontos`** (reusa **`cup_ties`**, já existe): `league_competition_id` (a disputa), `round_order`, `round_label`, `group_label` (novo), `member_a`, `member_b`, `goals_a`/`goals_b` (dias vencidos), `winner_id`, `window_start`/`window_end`, `status`.
- **`name_change_requests`** (novo, serve p/ perfil e federação): `entity_type (profile|federacao)`, `entity_id`, `requested_name`, `requested_by`, `status (pending|approved|rejected)`, `decided_by`, `decided_at`.

---

## 4. Pontuação

- **Dia de uma disputa** = soma dos pontos de palpite do usuário em **todos os campeonatos da disputa** naquele dia (com dobros).
- **Pontos**: total acumulado na disputa → ranking (ordena por pontos → cravadas → saldos → aproveitamento → acertividade). É a lógica de hoje, generalizada para N campeonatos.
- **Liga**: confrontos em pontos corridos. Cada confronto tem uma janela; dentro dela, duelos diários geram "gols" (dias vencidos); fim da janela → 3/1/0. Tabela = pontos de confronto, desempate por saldo de dias.
- **Copa**: confrontos em mata-mata; vencedor do confronto avança no chaveamento.
- **Empate de pontos num dia** → 0×0 no dia (ninguém marca). *(default; me avise se preferir 1 gol p/ cada)*

---

## 5. Formato automático por tamanho (Liga e Copa)

- **Liga** — 4–8: todos contra todos (turno único). 9–30: grupos de 4–5 (round-robin); opcional fase final.
- **Copa** — chaveamento por nº de jogadores, com *byes* quando não for potência de 2. Mín. 4, máx. 30.
- Owner pode ajustar (tamanho de grupo, turno/returno) — defaults sensatos por faixa.

---

## 6. Funções/RPCs (espelham `get_league_standings`)

- `generate_disputa_fixtures(p_lc_id)` — monta os `confrontos` (round-robin ou chaveamento) ao iniciar Liga/Copa.
- `get_disputa_standings(p_lc_id)` — tabela de Pontos **ou** de Liga (3/1/0), agregando os N campeonatos.
- `get_disputa_bracket(p_lc_id)` — chaveamento da Copa.
- `settle_confrontos()` — fecha janelas vencidas, calcula gols/vencedor, avança o mata-mata (cron).

---

## 7. Telas

- **Federação**: header com escudo; abas **Disputas**, **Membros**, **Campeonatos**.
- **Criar/editar disputa**: nome, **modo** (Pontos / Liga / Copa), **escolher 1+ campeonatos**, formato (auto por nº, ajustável).
- **Ver disputa**: Pontos → tabela de pontos; Liga → tabela 3/1/0 + confrontos da rodada; Copa → bracket.
- **Confronto detail**: A × B, dia a dia (somando os campeonatos da disputa), placar de gols, janela.

---

## 8. Governança de nome (federação + usuário) — req novo

- Trocar nome (de usuário OU federação) exige **aprovação do admin** e é limitado a **1×/mês**.
- `name_change_requests` (acima) + `profiles.display_name_changed_at` / `leagues.name_changed_at`.
- Fluxo: solicita → **notifica admins** (RPC security-definer inserindo `notifications` p/ `profiles.is_app_admin`, espelha `nudge_member`) → admin aprova no painel → aplica e trava por 1 mês.
- ⚠️ UI de aprovação fica no **painel admin** (área da outra sessão) → coordenar.

---

## 9. Escudos

- **Federação**: escudo quadrado, 1-3 cores (reusa o gerador do perfil, travado em quadrado). Coluna `leagues.crest`.
- **Perfil**: adicionar ~6-8 **crests estilo clube** (SVG: escudo clássico, banner, flâmula, circular com borda...) além dos shapes genéricos. **Independente das ligas → pode ser feito já.**

---

## 10. ⚠️ Colisão e ordem de execução

Esta reestruturação mexe **fundo** no domínio de ligas (disputas, enum de modo, multi-campeonato) — exatamente onde a outra sessão está trabalhando (pagamentos em `leagues`/`database.ts`). **Não dá para tocar nisso em paralelo sem conflito grave.**

**Recomendação:**
1. **Crests de perfil (§9)** — independente, faço **já**.
2. **Congelar/combinar o schema de ligas** com a outra sessão (ou esperar o trabalho de pagamentos deles ser commitado e estabilizar).
3. **Base de disputas + multi-campeonato + modo Pontos** (generaliza `league_competitions`).
4. **Modo Liga** (confronto round-robin) — usa `cup_ties`.
5. **Modo Copa** (mata-mata) + `settle_confrontos` cron.
6. **Federação**: rename UI + escudo + governança de nome (perfil e federação).

Cada passo é uma leva de migrations aditivas; confirmo o deploy a cada um.

---

## 11. Confronto na Copa do Mundo (aprofundamento)

### Problema
A Copa tem **poucos jogos por dia** e ainda menos no mata-mata (às vezes 1/dia). Decidir o confronto "dia a dia" fica injusto — 1 palpite decide o duelo.

### Princípios da solução
1. **Unidade = RODADA (bloco de jogos), não o dia.** Uma rodada de confronto = um bloco do calendário da Copa com jogos suficientes (uma rodada da fase de grupos; ou uma fase do mata-mata). Quem fizer **mais pontos na rodada** vence o confronto → **3/1/0**; empate de pontos = 1/1; desempate por pontos totais → cravadas.
2. **Liga, Copa e Pontos são competições SEPARADAS e simultâneas** (não um combo grupos→mata-mata). Cada uma é uma disputa própria na Federação, sobre os mesmos jogos da Copa do Mundo. Um jogador pode estar nas três ao mesmo tempo.
3. **Sistema suíço para muita gente:** ranqueia 9–30 jogadores em **poucas rodadas** (sem precisar de N-1 rodadas nem grupos artificiais). Round-robin só para poucos (≤8).
4. **Viabilidade pelo calendário:** o nº de rodadas que a Copa oferece é limitado. Antes de criar uma disputa, é preciso checar se cabem os confrontos necessários (ver abaixo). O simulador encaixa as rodadas sobre o calendário real e **avisa quando não couber**.
5. **Todo mundo sempre palpita:** o ranking de **Pontos** roda em paralelo (palpite sempre conta). Quem é eliminado da Copa segue no Pontos e numa **consolação** opcional — ninguém fica "de fora" assistindo.

### Quantas rodadas a Copa do Mundo oferece?
A Copa 2026 dura ~5–6 semanas (≈ 11/jun a 19/jul). Quantas **rodadas de confronto** cabem depende da granularidade (o simulador calcula do calendário real sincronizado):
- **Por semana** → ~6 rodadas.
- **Por bloco** (rodada de grupos / fase do mata-mata) → ~8 (3 de grupos + 5 do mata-mata).
- **Por dia com jogos** → ~25–35 (mas muitos dias com poucos jogos = duelos fracos).

### Viabilidade por modo (o ponto crítico)
- **Copa (mata-mata)** — precisa de `teto(log2(participantes))` rodadas. 30 jogadores → bracket de 32 → **5 rodadas**. **Cabe em qualquer tamanho ≤30** (≤ disponível), com duelos fartos.
- **Liga (round-robin completo)** — precisa de `N-1` rodadas. Só cabe para **poucos** (≤7–8) por semana/bloco. Acima disso, o round-robin completo **não cabe** na Copa.
- **Liga grande → suíço** — usa as rodadas disponíveis (~6–8) e ranqueia todos sem precisar de N-1. É a forma de ter "Liga" com 9–30 jogadores numa janela curta como a Copa.

### Cenários — Copa (competição separada)
| Jogadores | Bracket | Rodadas | Cabe? |
|---|---|---|---|
| 4 | 4 (semis) | 2 | ✅ |
| 5–8 | 8 (com byes) | 3 | ✅ |
| 9–16 | 16 | 4 | ✅ |
| 17–30 | 32 (com byes) | 5 | ✅ |

*Seeding pelo ranking de Pontos paralelo (ou aleatório). Consolação opcional p/ eliminados.*

### Cenários — Liga (competição separada)
| Jogadores | Formato | Rodadas | Observação |
|---|---|---|---|
| 4–7 | Round-robin completo | N-1 (3–6) | cabe em semana/bloco |
| 8 | Round-robin | 7 | cabe em bloco (~8) |
| 9–30 | **Suíço** | ~6–8 | round-robin completo não cabe → suíço ranqueia todos |

> Liga e Copa são disputas **separadas**: a Federação pode rodar as duas (e o Pontos) **ao mesmo tempo**, sobre os mesmos jogos. O jogador entra em quantas quiser.

## 12. Simulador de estrutura (pré-início)
Antes de iniciar a disputa, o **admin da Federação** abre o simulador e vê a estrutura completa **sem persistir nada**:
- Nº de jogadores (atual ou um "e se" que ele digita).
- Quantas rodadas de Liga, o modelo de pareamento (round-robin/suíço), quantos avançam, o chaveamento da Copa.
- Encaixe nas **datas reais** da Copa + **quantos jogos cada rodada de confronto terá** (mostra a "justiça" de cada duelo).
- Prévia visual: mini-calendário + bracket.
- Ele ajusta as opções e re-simula; quando aprovar, **"Iniciar"** persiste (gera os `confrontos`).

Função pura `simularEstrutura(nJogadores, calendario, opcoes)` → devolve o plano (rodadas, pareamentos, avanço, chaveamento, datas). O mesmo motor alimenta o simulador (preview) e o `generate_disputa_fixtures` (execução).

### Decisões em aberto (para refinar juntos)
- **Granularidade** padrão das rodadas de confronto: por semana, por bloco (rodada/fase) ou por dia?
- **Copa**: todos entram no bracket (com byes) — e o *seeding* vem do ranking de Pontos ou é aleatório?
- **Eliminados da Copa**: consolação (seguem em duelos) ou só o ranking de Pontos paralelo?
- **Liga acima de 8 jogadores**: confirmar o **suíço** como padrão (round-robin completo não cabe na Copa).
