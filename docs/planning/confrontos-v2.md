# Confrontos v2 — design (branch `feat/confrontos`)

> Modelo definitivo dos modos de disputa + sorteio + telas. Foco: Copa do Mundo 2026.
> Construído isolado em branch (outras chats mexem no `main`).

## 1. Conceitos e hierarquia

```
Federação (grupo social + membros + pagamento)
 └─ Disputa (vinculada a 1 campeonato; ex.: Copa do Mundo)
     modo:
       • Pontos     → ranking por acúmulo (aberto, entra quando quiser)
       • Confronto  → mano a mano. formato:
            – Liga   → todos contra todos → tabela 3/1/0
            – Copa   → mata-mata (chaveamento), eliminação simples
```

- **Pontos** e **Confronto** são os dois MODOS. Dentro de Confronto: **Liga** e **Copa**.
- Pontos: qualquer membro ativo conta; não tem sorteio; entra a qualquer momento.
- Confronto: precisa de **sorteio** (trava participantes + monta os confrontos).

## 2. Ciclo de vida de um Confronto (visibilidade de status — Nielsen #1)

1. **Rascunho** — recém-criado. Admin configura (formato, período), vê o **simulador**, ajusta. Nada travado.
2. **Sorteada** — admin clicou **Sortear**:
   - tira um **snapshot dos participantes** (trava quem está dentro);
   - **monta os confrontos** (pares do round-robin / chaveamento) encaixados nas janelas disponíveis do calendário;
   - a partir daqui, **quem entrar na federação NÃO entra nesta Liga/Copa** (entra na federação, no Pontos e em confrontos futuros);
   - os confrontos pontuam conforme os jogos terminam.
3. **Encerrada** — tudo decidido → campeão. Histórico read-only.

## 3. Sorteio (o coração do fluxo) — controle e prevenção de erro (Nielsen #3, #5)

- Ação deliberada e confirmada, com consequência clara:
  > "Sortear vai **travar os N participantes** atuais e montar os confrontos. Quem entrar depois não joga esta [Liga/Copa]. Dá pra refazer enquanto nenhuma rodada começa."
- **Desfazer / Refazer** (Nielsen #3): enquanto **Sorteada e nenhuma rodada começou** (nenhum jogo da 1ª janela iniciou), o admin pode **Refazer sorteio** (regera) ou **Cancelar** (volta a Rascunho). Depois que a 1ª janela começa, trava (integridade) — comunicado com clareza.
- Implementação atômica: RPC `draw_confronto` (security-definer, admin-only) insere snapshot + cup_ties + estado=sorteada numa transação. `undo_confronto_draw` reverte se ainda não começou.

## 4. Períodos do confronto (repensado p/ a Copa)

Cada confronto é decidido num **período** = janela do calendário da Copa. Opções (foco Copa):
- **Por fase/rodada** (padrão): cada rodada da fase de grupos + cada fase do mata-mata = um período. Poucos, mas com jogos suficientes (duelo justo).
- **Semanal**: cada semana da Copa = um período.
- *(Diário sai do foco da Copa — poucos jogos/dia; volta em campeonatos densos no futuro.)*

Pontuação no período: soma os pontos de palpite (com Joker 2×) dos jogos da janela; quem fez mais **vence o confronto** (Liga: 3/1/0; Copa: avança). Empate de pontos no período: Liga 1/1; Copa decide por critérios (saldo de pontos no período → pontos totais → sorteio).

## 5. Estrutura por nº de jogadores (simulador encaixa no calendário real)

- **Liga (round-robin)**: precisa de `N−1` períodos. Cabe para grupos pequenos na janela curta da Copa. Acima disso o simulador avisa e sugere **Copa** (ou menos participantes / Liga em grupos — extensão futura).
- **Copa (mata-mata)**: precisa de `teto(log2 N)` períodos. **Cabe em qualquer tamanho** (4–30), com byes para fechar potência de 2; seeding pelo ranking de Pontos (ou ordem de entrada).
- O **simulador** mostra ANTES do sorteio: estrutura, períodos, quem joga quando, e **viabilidade** ("cabe / não cabe → sugestão"), lendo o calendário real (matchdays + fases).

## 6. Telas (UX impecável — Nielsen)

**Admin (criar/configurar/sortear):**
- **Criar disputa**: escolher **Pontos** ou **Confronto**; se Confronto → **Liga** ou **Copa** (com explicação + ícone). Competição + período.
- **Configurar + Simular**: simulador embutido (estrutura, viabilidade, quem joga quando) p/ o nº atual de participantes. Ajusta.
- **Sortear**: diálogo de confirmação (aviso de trava) → sorteia.
- **Pós-sorteio**: Refazer / Cancelar sorteio (enquanto permitido) + lista de participantes travados.

**Todos (ver):**
- **Visão da disputa**: Pontos → tabela atual; **Liga** → tabela 3/1/0 + rodadas + "meu confronto da rodada"; **Copa** → chaveamento + "meu confronto".
- **Meu confronto (período atual)**: card em destaque — eu × adversário, o período, meus pontos x os dele (ao vivo conforme os jogos saem), os jogos do período, quem está ganhando.
- **Detalhe do confronto**: eu × adversário no período, jogo a jogo (meu palpite + pontos vs o dele), placar parcial/final, vencedor.
- **Rodada/fase**: todos os confrontos daquela rodada.
- **Participantes**: quem foi sorteado.

## 7. Heurísticas de Nielsen (checklist aplicado)
1. **Status visível**: estados (Rascunho/Sorteada/Encerrada), "período atual", "quem está ganhando" ao vivo.
2. **Mundo real**: confronto, rodada, mata-mata, chaveamento — linguagem de futebol.
3. **Controle/liberdade**: refazer/cancelar sorteio antes de começar; voltar sempre; sem becos.
4. **Consistência**: modos nomeados igual em todo o app (Pontos/Confronto/Liga/Copa); tokens de design reaproveitados.
5. **Prevenção de erro**: confirmação do sorteio com consequência; viabilidade bloqueia sorteio impossível.
6. **Reconhecer > lembrar**: simulador mostra a estrutura visual antes de comprometer.
7. **Flexibilidade**: simulador "e se" (testar nº de jogadores), atalhos para o admin.
8. **Estético/minimalista**: tabelas/bracket limpos, divulgação progressiva.
9. **Recuperação de erro**: mensagens claras ("não cabe → sugestão"), desfazer.
10. **Ajuda**: "Como funciona" explica os modos de confronto.

## 8. Banco (aditivo, na branch)
- `confronto_participants` (league_competition_id, user_id, seed) — snapshot no sorteio.
- `league_competitions`: `confronto_state` (draft|drawn|finished) default draft, `period_kind` (phase|week), `drawn_at`.
- `cup_ties`: já tem round_order/slot/member_a/b/points_a/b/winner/matchday/window. Para Copa: avanço (vencedor → próximo slot).
- RPCs: `get_confronto_standings` (Liga, ✓), `get_confronto_bracket` (Copa), `get_my_confronto(lc,user)` (confronto atual), `draw_confronto`/`undo_confronto_draw` (transacional, admin).

## 9. Ordem de build (incrementos verificados na branch)
1. DB: participantes + estados + draw/undo RPC + bracket RPC.
2. Simulador melhorado (foco Copa: períodos por fase/semana; viabilidade pelo calendário real).
3. Criar disputa (Pontos|Confronto→Liga/Copa) + Sortear (confirmar/undo).
4. Telas de visão: Liga (tabela+rodadas+meu confronto), Copa (bracket+meu confronto), detalhe.
5. Auditoria MVP de consistência (nomenclatura em todas as superfícies).
6. Verificação end-to-end (desktop+mobile, Nielsen) → entregar a branch.
