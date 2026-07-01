// Resultadismo Manager: simulação de jogo real, minuto a minuto (Fase 2).
// Determinística (mulberry32). Tudo sai de força base + tática + aleatoriedade.
// Regra de ouro: nem tudo é narrado, mas tudo que é narrado entra nas estatísticas.
import { sideStrength, postureMul, type Tactic, type TeamLite } from "./tactics.ts";

export interface LiveStats {
  posse: [number, number];        // % (deriva dos minutos de posse)
  finalizacoes: [number, number]; // todas as tentativas
  chutesNoGol: [number, number];  // na direção do gol
  grandesChances: [number, number];
  escanteios: [number, number];
  passeCerto: [number, number];   // %
  faltas: [number, number];
}

export type EventKind =
  | "inicio" | "posse" | "perigo" | "grande_chance" | "finaliza_fora"
  | "defesa" | "escanteio" | "gol" | "falta" | "intervalo" | "fim";

export interface MatchEvent {
  minute: number;
  side: 0 | 1 | null; // lado que protagoniza (null = neutro)
  kind: EventKind;
  narrate: boolean;   // entra na transmissão?
  text?: string;      // preenchido pela camada de narração
}

export interface MatchState {
  seed: number;
  minute: number;
  half: 1 | 2;
  score: [number, number];
  posseMin: [number, number];
  passOk: [number, number];
  passTot: [number, number];
  stats: LiveStats;
  events: MatchEvent[];
  finished: boolean;
  teams: [TeamLite, TeamLite];
  tactics: [Tactic, Tactic];
  posseShareA: number;  // alvo de posse de A (0..1), recomputado se a tática muda
  ballSide: 0 | 1;      // quem está com a bola agora (para o destaque ao vivo)
  // bônus de identidade do treinador em unidades de sinal, por lado. Só o MEU lado (A)
  // costuma ter técnico; a IA fica 0. Some 0 em média entre arquétipos (tempero, não
  // decide) e entra no motor via sideStrength(archUnits). Ver archetypeBonus.
  archUnitsA: number;
  archUnitsB: number;
  rnd: () => number;
}

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// posse-alvo: meio forte, estilo de posse e bloco alto puxam a bola.
function possessionShare(state: MatchState): number {
  const [ta, tb] = state.teams;
  const [tacA, tacB] = state.tactics;
  const ctrl = (t: TeamLite, tac: Tactic) => {
    let c = 0.5 * t.m + 0.2 * t.a;
    if (tac.comBola === "posse") c *= 1.18;
    if (tac.comBola === "bola_longa" || tac.comBola === "contra") c *= 0.84;
    if (tac.bloco === "alto") c *= 1.08;
    if (tac.bloco === "baixo") c *= 0.9;
    c *= postureMul(tac.postura).off ** 0.4; // postura ofensiva busca mais a bola
    return c;
  };
  const ca = ctrl(ta, tacA), cb = ctrl(tb, tacB);
  return ca / (ca + cb);
}

export function recompute(state: MatchState): void {
  state.posseShareA = possessionShare(state);
}

export function createMatch(
  teamA: TeamLite, teamB: TeamLite, tacA: Tactic, tacB: Tactic, seed: number,
  archUnits: { a?: number; b?: number } = {},
): MatchState {
  const st: MatchState = {
    seed: seed >>> 0, minute: 0, half: 1, score: [0, 0],
    posseMin: [0, 0], passOk: [0, 0], passTot: [0, 0],
    stats: { posse: [50, 50], finalizacoes: [0, 0], chutesNoGol: [0, 0], grandesChances: [0, 0], escanteios: [0, 0], passeCerto: [0, 0], faltas: [0, 0] },
    events: [], finished: false, teams: [teamA, teamB], tactics: [tacA, tacB],
    posseShareA: 0.5, ballSide: 0,
    archUnitsA: archUnits.a ?? 0, archUnitsB: archUnits.b ?? 0,
    rnd: mulberry32((seed >>> 0) || 1),
  };
  recompute(st);
  return st;
}

const ev = (minute: number, side: 0 | 1 | null, kind: EventKind, narrate: boolean): MatchEvent => ({ minute, side, kind, narrate });

// avança 1 minuto e devolve os eventos do minuto.
export function stepMinute(state: MatchState): MatchEvent[] {
  if (state.finished) return [];
  state.minute++;
  const m = state.minute;
  const out: MatchEvent[] = [];
  const rnd = state.rnd;

  if (m === 1) out.push(ev(0, null, "inicio", true));

  // 1) posse do minuto: quem fica com a bola (suave, com leve inércia).
  const share = state.posseShareA;
  const withA = rnd() < share * 0.7 + (state.ballSide === 0 ? 0.3 : 0);
  const poss: 0 | 1 = withA ? 0 : 1;
  state.posseMin[poss]++;
  state.ballSide = poss;
  const opp: 0 | 1 = poss === 1 ? 0 : 1;

  // 2) passes do minuto (passe certo mantém posse). qualidade ~ meio + coerência.
  // archUnits injeta a identidade do treinador de cada lado (0 = sem técnico).
  const sA = sideStrength(state.teams[0], state.tactics[0], state.tactics[1], state.teams[1], state.archUnitsA);
  const sB = sideStrength(state.teams[1], state.tactics[1], state.tactics[0], state.teams[0], state.archUnitsB);
  const sMe = poss === 0 ? sA : sB;
  const sOpp = poss === 0 ? sB : sA;
  const passBase = 0.80 + 0.0016 * (state.teams[poss].m - 70);
  const passQual = Math.max(0.6, Math.min(0.95, passBase + (sMe.off - sOpp.def) * 0.0009));
  const passesThisMin = 7 + Math.floor(rnd() * 8);
  const okNow = Array.from({ length: passesThisMin }).reduce((acc: number) => acc + (rnd() < passQual ? 1 : 0), 0);
  state.passOk[poss] += okNow;
  state.passTot[poss] += passesThisMin;

  // razão de força suavizada (não zera o ataque do mais fraco; mantém zebra viva).
  // expoente baixo comprime a vantagem da força base: favorita ganha mais, mas
  // a zebra segue viva no jogo único (Copa é mata-mata, dá zebra).
  const ratio = sMe.off / (sMe.off + sOpp.def);
  const softRatio = Math.pow(ratio / 0.5, 0.42);

  // 3) chance de chegar a um ataque perigoso neste minuto.
  const attackProb = Math.min(0.6, 0.30 + (ratio - 0.5) * 0.30 + sMe.paceLean * 0.03);
  if (rnd() < attackProb) {
    out.push(ev(m, poss, "perigo", false)); // build-up, nem sempre narrado
    // grande chance?
    const bigProb = 0.22 + (ratio - 0.5) * 0.3;
    const isBig = rnd() < bigProb;
    if (isBig) { state.stats.grandesChances[poss]++; out.push(ev(m, poss, "grande_chance", true)); }

    // a chance vira finalização? (atacante pode furar, defensor pode tirar)
    const finalizaProb = isBig ? 0.82 : 0.6;
    if (rnd() < finalizaProb) {
      state.stats.finalizacoes[poss]++;
      // no alvo?
      const onTargetProb = 0.44 + (isBig ? 0.12 : 0) + (sMe.off - sOpp.def) * 0.0005;
      if (rnd() < Math.max(0.3, Math.min(0.74, onTargetProb))) {
        state.stats.chutesNoGol[poss]++;
        // gol, defesa (escanteio) ou defesa segura
        const convBase = isBig ? 0.4 : 0.24;
        const conv = Math.max(0.06, Math.min(0.6, convBase * softRatio));
        if (rnd() < conv) {
          state.score[poss]++;
          out.push(ev(m, poss, "gol", true));
        } else {
          out.push(ev(m, poss, "defesa", true));
          if (rnd() < 0.6) { state.stats.escanteios[poss]++; out.push(ev(m, poss, "escanteio", false)); }
        }
      } else {
        // para fora: pode sair escanteio (desvio) ou tiro de meta
        if (rnd() < 0.45) { state.stats.escanteios[poss]++; out.push(ev(m, poss, "escanteio", false)); }
        else out.push(ev(m, poss, "finaliza_fora", rnd() < 0.5));
      }
    } else if (rnd() < 0.16) {
      // pressão sem finalização que rende escanteio (cruzamento bloqueado, etc.)
      state.stats.escanteios[poss]++; out.push(ev(m, poss, "escanteio", false));
    }
  }

  // 4) falta: mais cometida por quem está defendendo; para o jogo, não muda posse.
  const foulProb = 0.26 + (state.tactics[opp].bloco === "alto" ? 0.05 : 0) + (state.tactics[opp].postura < 45 ? 0.03 : 0);
  if (rnd() < foulProb) {
    state.stats.faltas[opp]++;
    out.push(ev(m, opp, "falta", rnd() < 0.3));
  }

  // 5) atualiza % de posse e passe certo (sempre, fiel ao tempo de jogo).
  const totMin = state.posseMin[0] + state.posseMin[1] || 1;
  state.stats.posse = [Math.round((state.posseMin[0] / totMin) * 100), 0];
  state.stats.posse[1] = 100 - state.stats.posse[0];
  state.stats.passeCerto = [
    state.passTot[0] ? Math.round((state.passOk[0] / state.passTot[0]) * 100) : 0,
    state.passTot[1] ? Math.round((state.passOk[1] / state.passTot[1]) * 100) : 0,
  ];

  // fim de tempo
  if (m === 45) { state.half = 2; out.push(ev(45, null, "intervalo", true)); }
  if (m >= 90) { state.finished = true; out.push(ev(90, null, "fim", true)); }

  state.events.push(...out);
  return out;
}

export function simulateFull(state: MatchState): MatchState {
  while (!state.finished) stepMinute(state);
  return state;
}
