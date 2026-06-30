// Harness de balanceamento do núcleo tático. Roda fora do app:
//   node --experimental-strip-types src/features/manager/redesign/_balance.ts
// Valida: (1) somas das matrizes ~0, (2) impacto tático na faixa 25-50%,
// (3) odds de título por tier (D quase impossível, ~1%).
import {
  FORMS, COMBOLA, SEMBOLA, BLOCOS, _matrices,
  sideStrength, type Tactic, type Form, type ComBola, type SemBola, type Bloco,
} from "./tactics.ts";

function mulberry32(a: number): () => number {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
const pad = (s: string, n: number) => (s + " ".repeat(n)).slice(0, n);

// ----------------------------------------------------- (1) somas das matrizes
console.log("=== (1) Somas das matrizes (linhas devem ~0) ===");
function checkRows(name: string, m: Record<string, Record<string, number>>) {
  let maxRow = 0;
  for (const k of Object.keys(m)) maxRow = Math.max(maxRow, Math.abs(sum(m[k])));
  // colunas
  const cols: Record<string, number> = {};
  for (const k of Object.keys(m)) for (const c of Object.keys(m[k])) cols[c] = (cols[c] || 0) + m[k][c];
  const colStr = Object.entries(cols).map(([c, v]) => `${c}:${v >= 0 ? "+" : ""}${v}`).join("  ");
  console.log(`${pad(name, 4)} linhas |max|=${maxRow}  colunas: ${colStr}`);
}
checkRows("C1", _matrices.C1 as any);
checkRows("C2", _matrices.C2 as any);
checkRows("C3", _matrices.C3 as any);
checkRows("E1", _matrices.E1 as any);
checkRows("E2", _matrices.E2 as any);

// ----------------------------------------------------- modelo de resultado
const GOALS_BASE = 1.35; // gols esperados de referência por lado
const FORCE_EXP = 1.7;   // inclina o resultado para a força base (separa tiers)
function xg(off: number, oppDef: number, pace: number): number {
  const oe = Math.pow(off, FORCE_EXP), de = Math.pow(oppDef, FORCE_EXP);
  const ratio = oe / (oe + de);
  return GOALS_BASE * (ratio / 0.5) * (1 + pace * 0.12);
}
function poisson(lambda: number, rnd: () => number): number {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
}
function simMatch(teamA: any, tA: Tactic, teamB: any, tB: Tactic, rnd: () => number) {
  const sA = sideStrength(teamA, tA, tB, teamB);
  const sB = sideStrength(teamB, tB, tA, teamA);
  const pace = (sA.paceLean + sB.paceLean) / 2;
  const ga = poisson(xg(sA.off, sB.def, pace), rnd);
  const gb = poisson(xg(sB.off, sA.def, pace), rnd);
  return ga === gb ? 0 : ga > gb ? 1 : -1; // empate=0
}
function winProb(teamA: any, tA: Tactic, teamB: any, tB: Tactic, n: number, seed: number) {
  const rnd = mulberry32(seed); let w = 0, d = 0;
  for (let i = 0; i < n; i++) { const r = simMatch(teamA, tA, teamB, tB, rnd); if (r === 1) w++; else if (r === 0) d++; }
  return (w + d * 0.5) / n; // pontos esperados normalizados
}

// ----------------------------------------------------- (2) impacto tático
console.log("\n=== (2) Impacto tático (dois times iguais, rival neutro) ===");
const equal = { a: 80, m: 80, d: 80, o: 80 };
const neutral: Tactic = { form: "4-4-2", comBola: "posse", semBola: "mista", bloco: "medio", postura: 50 };
let best = -1, worst = 2; let bestT: Tactic | null = null, worstT: Tactic | null = null;
const posturas = [25, 50, 75];
for (const form of FORMS) for (const cb of COMBOLA) for (const sb of SEMBOLA) for (const bl of BLOCOS) for (const po of posturas) {
  const t: Tactic = { form: form as Form, comBola: cb as ComBola, semBola: sb as SemBola, bloco: bl as Bloco, postura: po };
  const p = winProb(equal, t, equal, neutral, 1200, 42);
  if (p > best) { best = p; bestT = t; }
  if (p < worst) { worst = p; worstT = t; }
}
console.log(`melhor plano: ${(best * 100).toFixed(1)}% pts  ${JSON.stringify(bestT)}`);
console.log(`pior plano:   ${(worst * 100).toFixed(1)}% pts  ${JSON.stringify(worstT)}`);
console.log(`SWING tático = ${((best - worst) * 100).toFixed(1)} pontos percentuais  (alvo 25 a 50)`);

// equilíbrio por escolha: nenhuma opção pode dominar (alvo: tudo perto de 50%).
// média sobre adversários DIVERSOS, para lavar efeitos específicos de um rival.
console.log("\n=== (2b) Equilíbrio por escolha (média vs adversários diversos, ~50% = justo) ===");
const OPPS: Tactic[] = [
  { form:"4-3-3", comBola:"posse", semBola:"zona", bloco:"medio", postura:55 },
  { form:"3-4-3", comBola:"vertical", semBola:"mista", bloco:"alto", postura:62 },
  { form:"5-3-2", comBola:"contra", semBola:"libero", bloco:"baixo", postura:34 },
  { form:"4-4-2", comBola:"bola_longa", semBola:"individual", bloco:"medio", postura:50 },
  { form:"4-2-4", comBola:"drible", semBola:"dobra", bloco:"medio", postura:70 },
];
function avgByKey(pick: (t: Tactic) => string) {
  const acc: Record<string, { s: number; n: number }> = {};
  for (const form of FORMS) for (const cb of COMBOLA) for (const sb of SEMBOLA) for (const bl of BLOCOS) {
    const t: Tactic = { form: form as Form, comBola: cb as ComBola, semBola: sb as SemBola, bloco: bl as Bloco, postura: 50 };
    let p = 0; for (const o of OPPS) p += winProb(equal, t, equal, o, 260, 99); p /= OPPS.length;
    const k = pick(t); (acc[k] ||= { s: 0, n: 0 }); acc[k].s += p; acc[k].n++;
  }
  return Object.entries(acc).map(([k, v]) => `${k}:${((v.s / v.n) * 100).toFixed(1)}%`).join("  ");
}
console.log("com bola  ", avgByKey((t) => t.comBola));
console.log("sem bola  ", avgByKey((t) => t.semBola));
console.log("bloco     ", avgByKey((t) => t.bloco));

// ----------------------------------------------------- (3) odds de título por tier
console.log("\n=== (3) Odds de título por tier (bracket 16, single-elim) ===");
const TIER_OVR: Record<string, number> = { S: 92, A: 85, B: 78, C: 70, D: 62 };
const field: string[] = ["S","S","A","A","A","B","B","B","B","C","C","C","C","D","D","D"];
function teamOf(tier: string, jitter: () => number) { const o = TIER_OVR[tier] + (jitter() * 6 - 3); return { a: o, m: o, d: o, o, tier }; }
// cada time joga um plano "razoável": favorito manda no jogo, zebra segura.
function planFor(t: any, opp: any): Tactic {
  return t.o >= opp.o
    ? { form: "4-3-3", comBola: "posse", semBola: "zona", bloco: "medio", postura: 60 }
    : { form: "5-3-2", comBola: "contra", semBola: "libero", bloco: "baixo", postura: 34 };
}
const TOURN = 20000;
const champByTier: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0 };
const rndT = mulberry32(7);
for (let g = 0; g < TOURN; g++) {
  let alive = field.map((tier) => teamOf(tier, rndT));
  // embaralha
  for (let i = alive.length - 1; i > 0; i--) { const j = Math.floor(rndT() * (i + 1)); [alive[i], alive[j]] = [alive[j], alive[i]]; }
  while (alive.length > 1) {
    const next: any[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const A = alive[i], B = alive[i + 1];
      const r = simMatch(A, planFor(A, B), B, planFor(B, A), rndT);
      next.push(r === 1 ? A : r === -1 ? B : (rndT() < 0.5 ? A : B)); // empate = pênaltis (moeda)
    }
    alive = next;
  }
  champByTier[alive[0].tier]++;
}
console.log("campeão por tier (de " + TOURN + " torneios):");
for (const t of ["S","A","B","C","D"]) {
  const n = field.filter((x) => x === t).length;
  console.log(`  ${t} (${n} times): ${((champByTier[t] / TOURN) * 100).toFixed(2)}%  ` +
    `por time: ${((champByTier[t] / TOURN / n) * 100).toFixed(2)}%`);
}
