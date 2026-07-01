// Ponte entre o fluxo reformulado (redesign) e o MOTOR DE CAMPANHA no ar (engine.ts).
// Reaproveita o engine tal e qual: buildCampaign monta a edição (grupos + mata-mata da
// estrutura real), e as minhas partidas sao jogadas pelo sim do redesign (createMatch/
// stepMinute) -> o placar volta pra o engine (resolve*/advance) pra avancar o chaveamento.
// Os jogos que NAO sao meus saem por simAIvsAI dentro do engine (worldMode "real" usa o
// placar real quando existe; senao simula deterministico).
//
// NADA de numero cru de tatica vaza daqui: o modulo so orquestra placares e estado de
// campanha. A UI le overall/forcas/postura/stats/placares/tabela - como o resto do jogo.
import type { Campaign, Edition, Team, WorldMode, MatchKind } from "../types";
import type {
  GroupsStageState,
  FinalGroupStageState,
  KnockoutStageState,
} from "../types";
import {
  buildCampaign,
  advanceCampaign,
  myNextMatch,
  finishGroupsStage,
  finishFinalGroup,
  finishKnockoutStage,
  resolveGroupMatch,
  resolveFinalGroupMatch,
  resolveKnockoutMatch,
  knockoutResult,
  recordFinalRound,
  recordThirdRound,
  sortStandings,
} from "../engine";

// ---------------------------------------------------------------------------
// SEED de uma partida MINHA (mesma formula do ManagerPage, pra determinismo).
// ---------------------------------------------------------------------------
export function matchSeedFor(camp: Campaign, opp: Team): number {
  return (camp.seed ^ (opp.o * 40503 + camp.stageIdx * 7349 + camp.history.length * 131)) >>> 0;
}

// próximo confronto que EU jogo (ou null se a fase precisa ser fechada só com a IA).
export type NextMatch = { opp: Team; kind: MatchKind };
export function nextUserMatch(camp: Campaign): NextMatch | null {
  return myNextMatch(camp);
}

// ---------------------------------------------------------------------------
// Fecha, sem jogo meu, qualquer fase em que EU nao tenho partida (bye no mata-mata
// ou a fase de grupos ja "vazia" pra mim numa campanha que comeca no mata-mata).
// Espelha o closeStageAndAdvance do ManagerPage, mas so pros casos sem o meu jogo -
// o loop do orquestrador chama isto ate aparecer um myNextMatch ou a campanha acabar.
// Retorna true se avancou algo (o chamador re-checa nextUserMatch).
// ---------------------------------------------------------------------------
export function closeStageWithoutUserMatch(camp: Campaign): boolean {
  const st = camp.state;
  if (!camp.alive || !st) return false;
  // se ainda tenho jogo nesta fase, nao fecho nada.
  if (myNextMatch(camp)) return false;

  if (st.kind === "groups") {
    const advanced = finishGroupsStage(camp);
    advanceCampaign(camp, advanced);
    return true;
  }
  if (st.kind === "final_group") {
    advanceCampaign(camp, finishFinalGroup(camp));
    return true;
  }
  if (st.kind === "knockout") {
    const ko = st as KnockoutStageState;
    // bye: eu avanco sem jogar. finishKnockoutStage(true) empurra o meu time.
    const iWin = ko.bye ? true : false;
    finishKnockoutStage(camp, iWin);
    advanceCampaign(camp, iWin);
    return true;
  }
  if (st.kind === "third_place") {
    // eu nao estou na disputa de 3o: fecha (nao mexe no meu destino, ja eliminado).
    advanceCampaign(camp, false);
    return true;
  }
  if (st.kind === "final") {
    // eu nao estou na final: encerra a campanha.
    camp.alive = false;
    camp.placement = camp.placement ?? "Eliminado";
    return true;
  }
  return false;
}

// avança a campanha até o meu próximo jogo (ou até ela acabar). Idempotente/seguro:
// para no primeiro myNextMatch. Guard anti-loop.
export function advanceToUserMatch(camp: Campaign): void {
  let guard = 0;
  while (camp.alive && !myNextMatch(camp) && guard < 32) {
    const moved = closeStageWithoutUserMatch(camp);
    if (!moved) break;
    guard++;
  }
}

// ---------------------------------------------------------------------------
// APLICA o placar de uma partida MINHA (jogada pelo sim do redesign) no engine e
// avança o chaveamento. Espelha commitMatchResult do ManagerPage (a referencia).
// `seedMatch` deve ser o mesmo matchSeedFor usado pra criar a partida (coerencia dos
// penaltis reais quando houver). Depois de aplicar, avanca ate o proximo jogo meu.
// ---------------------------------------------------------------------------
export function applyUserMatch(camp: Campaign, gf: number, ga: number, seedMatch: number): void {
  const st = camp.state;
  if (!st) return;
  const nm = myNextMatch(camp);
  if (!nm) return;
  const kind = nm.kind;
  const opp = nm.opp;

  if (kind === "groups") {
    resolveGroupMatch(camp, gf, ga);
    const gs = camp.state as GroupsStageState;
    if (gs.myMatchIdx >= gs.myOpps.length) {
      const advanced = finishGroupsStage(camp);
      advanceCampaign(camp, advanced);
    }
  } else if (kind === "final_group") {
    resolveFinalGroupMatch(camp, gf, ga);
    const fg = camp.state as FinalGroupStageState;
    if (fg.myMatchIdx >= fg.myOpps.length) {
      advanceCampaign(camp, finishFinalGroup(camp));
    }
  } else if (kind === "knockout") {
    const iWin = resolveKnockoutMatch(camp, gf, ga, seedMatch);
    finishKnockoutStage(camp, iWin);
    advanceCampaign(camp, iWin);
  } else if (kind === "third_place") {
    const kr = knockoutResult(camp.myTeam, opp, gf, ga, seedMatch);
    const iWin = kr.winner === "A";
    camp.history.push({
      stage: "3º lugar",
      opp,
      gf,
      ga,
      pens: kr.pens,
      win: iWin,
      draw: false,
      ptsLabel: iWin ? "3º lugar" : "4º lugar",
      ko: true,
    });
    recordThirdRound(camp, opp, gf, ga, iWin, kr.pens);
    advanceCampaign(camp, iWin);
  } else if (kind === "final") {
    const kr = knockoutResult(camp.myTeam, opp, gf, ga, seedMatch);
    const iWin = kr.winner === "A";
    camp.history.push({
      stage: "Final",
      opp,
      gf,
      ga,
      pens: kr.pens,
      win: iWin,
      draw: false,
      ptsLabel: iWin ? "Campeão" : "Vice",
      ko: true,
    });
    recordFinalRound(camp, opp, gf, ga, iWin, kr.pens);
    advanceCampaign(camp, iWin);
  }

  // depois de qualquer resultado, empurra a campanha ate o proximo jogo meu (fecha
  // byes e fases sem o meu jogo com a IA), pra o hub sempre ter um "proximo" claro.
  advanceToUserMatch(camp);
}

// ---------------------------------------------------------------------------
// CAMPANHA COMPLETA (edicoes antigas): estrutura REAL da edicao, do primeiro estagio
// (grupos) ao mata-mata. Eu jogo os meus jogos (inclusive os de grupo). Nada de
// atalho: e o buildCampaign do engine, so avancado ate o meu primeiro jogo.
// ---------------------------------------------------------------------------
export function buildFullCampaign(
  edition: Edition,
  myTeam: Team,
  seed: number,
  worldMode: WorldMode,
): Campaign {
  const camp = buildCampaign(edition, myTeam, seed, worldMode);
  advanceToUserMatch(camp);
  return camp;
}

// ---------------------------------------------------------------------------
// MATA-MATA 2026 comecando no R32 ("16 avos"), com a minha selecao como convidada.
// Estrategia (autorizada pelo brief): monta a campanha 2026 (grupos reais via
// groups.json), APURA a fase de grupos com a IA (deterministico), e leva o campo de 32
// classificados pro R32 reusando o initKnockout do engine. Como o engine NAO apura os
// meus jogos de grupo (playGroupPair pula o meu par), a minha selecao normalmente NAO
// se classifica sozinha - entao a INJETAMOS no campo de 32 (trocando o classificado mais
// fraco que nao seja eu), garantindo o "mudar a historia": eu entro no mata-mata mesmo
// sem ter passado. A partir dai o chaveamento e 100% do engine (koPairs + projectBracket).
//
// Observacao honesta de dados: results.json vai ate 2022, entao 2026 NAO tem placar real.
// worldMode "real" continua valido (o engine cai no fallback de simulacao deterministica);
// os jogos que nao sao meus sao simulados de forma estavel, nao "resultados reais de 2026".
// ---------------------------------------------------------------------------
export function buildKnockout2026(
  edition: Edition,
  myTeam: Team,
  seed: number,
  worldMode: WorldMode,
): Campaign {
  const camp = buildCampaign(edition, myTeam, seed, worldMode);

  // Se, por algum motivo, a edicao nao comecar em grupos (estrutura inesperada), cai
  // pro fluxo completo - seguro e sempre renderizavel.
  if (!camp.state || camp.state.kind !== "groups") {
    advanceToUserMatch(camp);
    return camp;
  }

  // 1) apura a fase de grupos com a IA (os meus jogos de grupo ficam de fora - eu sou
  // convidado direto ao mata-mata). qualified = os classificados reais do campo.
  finishGroupsStage(camp);
  const gs = camp.state as GroupsStageState;
  const qualified = (gs.qualified ?? []).slice();

  // 2) garante a minha selecao no campo de 32. Se eu ja estiver (raro, so se o dataset
  // me colocasse fora do meu grupo), nao duplica. Senao, troco o classificado mais fraco
  // que nao seja eu pelo meu time (o "mudar a historia": entro no lugar de um que passou).
  const iAmIn = qualified.some((t) => t.s === myTeam.s);
  if (!iAmIn) {
    if (qualified.length === 0) {
      qualified.push(myTeam);
    } else {
      // ordena por forca desc; o ultimo (mais fraco) que nao sou eu sai pra minha entrada.
      const ranked = sortStandingsByOverall(qualified);
      let replaceIdx = -1;
      for (let i = ranked.length - 1; i >= 0; i--) {
        if (ranked[i].s !== myTeam.s) {
          replaceIdx = i;
          break;
        }
      }
      if (replaceIdx >= 0) {
        // acha o indice no array original do time escolhido pra sair e o substitui.
        const outSlug = ranked[replaceIdx].s;
        const at = qualified.findIndex((t) => t.s === outSlug);
        if (at >= 0) qualified[at] = myTeam;
        else qualified.push(myTeam);
      } else {
        qualified.push(myTeam);
      }
    }
    gs.qualified = qualified;
    gs.myAdvanced = true;
  }

  // 3) avanca do grupo pro R32 levando o campo (com a minha selecao dentro). O engine
  // seta carryTeams = qualified e chama initKnockout(R32) - koPairsFromTeams faz o
  // emparelhamento real (ranking + swap deterministico). Eu passo a ter myNextMatch.
  advanceCampaign(camp, true);
  advanceToUserMatch(camp);
  return camp;
}

// ordena uma lista de Team por overall desc (helper local; nao muta o array de entrada).
function sortStandingsByOverall(teams: Team[]): Team[] {
  return teams.slice().sort((a, b) => b.o - a.o);
}

// evita "import nao usado" quando o tree-shaking reclama: sortStandings do engine e
// reexportado como utilitario opcional pra a UI de tabela (mantem a fonte unica).
export { sortStandings };
