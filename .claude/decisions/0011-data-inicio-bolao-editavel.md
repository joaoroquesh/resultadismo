# ADR 0011 — Data de início do bolão escolhida e editável pelo dono

**Status:** aceito · **Data:** 2026-06-15 · **PO:** João

## Contexto
O ADR [`0010`](0010-grupo-ativo-moderacao-reativa.md) ligou `league_competitions.starts_on`
na criação do grupo via um **toggle binário**: "A partir de hoje" (hoje) × "Contar jogos já
feitos" (null). O João quis mais controle: o dono precisa poder **escolher o dia exato** em que a
pontuação do bolão começa a valer — pra trás, pra incluir gente que já vinha jogando quando o grupo
foi criado tarde; ou pra frente, pra todo mundo começar junto (ex.: criar hoje e valer dia 20) — e
poder **mudar essa data depois**. A data já fica visível a todos na Classificação.

## Decisão
1. **Escolha de data na criação:** seletor de data (default **hoje**) no lugar do toggle, limitado
   ao **período da competição** `[1º jogo … último jogo]` (em BRT). Atalhos "Desde o início da Copa"
   (= conta tudo) e "A partir de hoje". Componente `StartsOnPicker`.
2. **Edição pelo dono:** novo card `StartsOnCard` na **aba Competições** (admin do grupo). Grava
   `starts_on` por UPDATE direto (RLS já restringe ao admin), igual ao recorte de seleções.
3. **Janela de edição:** **editável enquanto a Copa não terminou** (existe jogo não-finalizado);
   **trava quando a Copa acaba** (todos finished/cancelled). É o **oposto** do recorte de seleções
   (que trava no **começo** da Copa) — aqui o João aceitou o recálculo retroativo durante o torneio
   em troca da flexibilidade. Mudar a data **recalcula** a classificação; o front mostra um aviso.
4. **Limites enforçados no banco:** a data tem de cair dentro de `[1º jogo, último jogo]`. Trigger
   `trg_lc_starts_on_window` (`guard_starts_on_window`) valida janela + limites; RPCs
   `starts_on_window(lc_id)` (estado + limites, espelho do front) e `competition_period(competition_id)`
   (limites do seletor na criação). Migration `20260615190000`.
5. **Corte por DIA em BRT (correção):** `get_league_standings` passou a comparar
   `(kickoff_at AT TIME ZONE 'America/Sao_Paulo')::date >= starts_on` (antes era UTC) — o "dia" do
   bolão é o mesmo do dobro/semana/tela de Jogos. `get_my_league_positions` e `get_group_rank_window`
   **delegam** e herdam o ajuste.
6. **Escopo:** vale **só** pro ranking de pontos do bolão (modes `points`/`table`). Confronto e o
   ranking geral (`Resultadismo The Best`) **não** usam `starts_on`. Palpites seguem globais por
   usuário; só a **contagem** do grupo muda.

## Consequências
- O dono organiza o bolão começando todo mundo junto, sem perder quem entra depois (palpita normal,
  conta a partir da data). A data fica **à mostra pra todos** na Classificação.
- Mudar a data **reescreve** a classificação que a galera está vendo — por isso o aviso no front e a
  trava ao fim da Copa (resultado final não muda mais).
- Grupos antigos com `starts_on` nulo seguem contando tudo; o dono pode passar a definir a data pelo
  novo card (o card trata `null` como "desde o início da Copa").
- A correção de fuso (BRT) pode incluir/excluir jogos da **virada do dia** que antes caíam no dia
  errado (UTC) — comportamento agora correto e alinhado ao resto do app.
