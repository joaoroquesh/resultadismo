// Validação agregada da simulação. Roda com:
//   node --experimental-strip-types src/features/manager/redesign/_simcheck.ts
import { createMatch, simulateFull, type MatchState } from "./sim.ts";
import { tacticFromPreset, type Tactic } from "./tactics.ts";

const equal = { a: 80, m: 80, d: 80, o: 80 };
const neutral: Tactic = { form: "4-4-2", comBola: "posse", semBola: "mista", bloco: "medio", postura: 50 };

function aggregate(n: number, tA: Tactic, tB: Tactic, teamA = equal, teamB = equal) {
  const acc = { gA: 0, gB: 0, finA: 0, sotA: 0, bigA: 0, cornA: 0, foulA: 0, passA: 0, posseA: 0 };
  let invFail = 0, golEventMismatch = 0;
  for (let i = 0; i < n; i++) {
    const st = simulateFull(createMatch(teamA, teamB, tA, tB, 1000 + i));
    acc.gA += st.score[0]; acc.gB += st.score[1];
    acc.finA += st.stats.finalizacoes[0]; acc.sotA += st.stats.chutesNoGol[0];
    acc.bigA += st.stats.grandesChances[0]; acc.cornA += st.stats.escanteios[0];
    acc.foulA += st.stats.faltas[0]; acc.passA += st.stats.passeCerto[0]; acc.posseA += st.stats.posse[0];
    // invariantes
    if (st.stats.chutesNoGol[0] > st.stats.finalizacoes[0]) invFail++;
    if (st.stats.posse[0] + st.stats.posse[1] !== 100) invFail++;
    if (st.score[0] > st.stats.chutesNoGol[0]) invFail++;
    const golEv = st.events.filter((e) => e.kind === "gol" && e.side === 0).length;
    if (golEv !== st.score[0]) golEventMismatch++;
  }
  const d = (x: number) => (x / n).toFixed(2);
  return { acc, d, invFail, golEventMismatch };
}

console.log("=== Simulação: médias por jogo (times iguais, plano neutro) ===");
const r = aggregate(3000, neutral, neutral);
console.log(`gols A:${r.d(r.acc.gA)} B:${r.d(r.acc.gB)}  (total ~${r.d(r.acc.gA + r.acc.gB)})`);
console.log(`finalizações:${r.d(r.acc.finA)}  no alvo:${r.d(r.acc.sotA)}  grandes chances:${r.d(r.acc.bigA)}`);
console.log(`escanteios:${r.d(r.acc.cornA)}  faltas:${r.d(r.acc.foulA)}  passe certo:${r.d(r.acc.passA)}%  posse:${r.d(r.acc.posseA)}%`);
console.log(`invariantes violadas: ${r.invFail}  | eventos de gol != placar: ${r.golEventMismatch}  (ambos devem ser 0)`);

console.log("\n=== Determinismo ===");
const a1 = simulateFull(createMatch(equal, equal, neutral, neutral, 777));
const a2 = simulateFull(createMatch(equal, equal, neutral, neutral, 777));
console.log(`mesmo seed -> mesmo placar: ${a1.score.join("-")} vs ${a2.score.join("-")} : ${a1.score.join() === a2.score.join() ? "OK" : "FALHOU"}`);
console.log(`mesmo seed -> mesmas finalizações: ${a1.stats.finalizacoes[0] === a2.stats.finalizacoes[0] ? "OK" : "FALHOU"}`);

console.log("\n=== Tática influencia o jogo (3000 jogos cada) ===");
const ofensivo: Tactic = { form: "4-2-4", comBola: "drible", semBola: "individual", bloco: "alto", postura: 80 };
const retranca: Tactic = { form: "5-4-1", comBola: "contra", semBola: "libero", bloco: "baixo", postura: 22 };
const ro = aggregate(3000, ofensivo, neutral);
const rr = aggregate(3000, retranca, neutral);
console.log(`A ofensivo:  gols ${ro.d(ro.acc.gA)}  finalizações ${ro.d(ro.acc.finA)}  posse ${ro.d(ro.acc.posseA)}%`);
console.log(`A retranca:  gols ${rr.d(rr.acc.gA)}  finalizações ${rr.d(rr.acc.finA)}  posse ${rr.d(rr.acc.posseA)}%`);

console.log("\n=== Forte x Fraca (preset manda no jogo vs ganhar sofrendo) ===");
const forte = { a: 90, m: 90, d: 90, o: 90 };
const fraca = { a: 66, m: 66, d: 66, o: 66 };
const fx = aggregate(3000, tacticFromPreset("mandaNoJogo"), tacticFromPreset("ganharSofrendo"), forte, fraca);
console.log(`forte gols:${fx.d(fx.acc.gA)}  fraca gols:${fx.d(fx.acc.gB)}  posse forte:${fx.d(fx.acc.posseA)}%`);
