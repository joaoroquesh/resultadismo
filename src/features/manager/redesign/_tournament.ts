// Fase 5 — balanceamento com o MOTOR REAL (sim.ts), não com proxy.
/* eslint-disable @typescript-eslint/no-explicit-any */
//   node --experimental-strip-types src/features/manager/redesign/_tournament.ts
import { createMatch, simulateFull } from "./sim.ts";
import { tacticFromPreset, type Tactic, type ComBola, type SemBola, type Bloco, COMBOLA, SEMBOLA, BLOCOS } from "./tactics.ts";

function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rnd = rng(20260630);

// resultado de uma partida via motor real: 1 = A vence, 0 = empate, -1 = B
function play(A: any, tA: Tactic, B: any, tB: Tactic, seed: number) {
  const st = simulateFull(createMatch(A, B, tA, tB, seed));
  return st.score[0] === st.score[1] ? 0 : st.score[0] > st.score[1] ? 1 : -1;
}
const planFor = (t: any, o: any): Tactic => t.o >= o.o ? tacticFromPreset("mandaNoJogo") : tacticFromPreset("ganharSofrendo");

// ---- (A) odds de título por tier, bracket 16, single-elim, motor real ----
const TIER_OVR: Record<string, number> = { S: 91, A: 84, B: 77, C: 70, D: 62 };
const field = ["S","S","A","A","A","B","B","B","B","C","C","C","C","D","D","D"];
const champ: Record<string, number> = { S:0, A:0, B:0, C:0, D:0 };
const TOURN = 3000;
let sm = 1;
for (let g = 0; g < TOURN; g++) {
  let alive = field.map((tier) => { const o = TIER_OVR[tier] + (rnd() * 6 - 3); return { a:o, m:o, d:o, o, tier }; });
  for (let i = alive.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [alive[i], alive[j]] = [alive[j], alive[i]]; }
  while (alive.length > 1) {
    const nx: any[] = [];
    for (let i = 0; i < alive.length; i += 2) {
      const A = alive[i], B = alive[i + 1];
      const r = play(A, planFor(A, B), B, planFor(B, A), sm++);
      nx.push(r === 1 ? A : r === -1 ? B : (rnd() < 0.5 ? A : B));
    }
    alive = nx;
  }
  champ[alive[0].tier]++;
}
console.log("=== (A) Título por tier (motor real, " + TOURN + " torneios, bracket 16) ===");
for (const t of ["S","A","B","C","D"]) {
  const n = field.filter((x) => x === t).length;
  console.log(`  ${t} (${n}): ${((champ[t]/TOURN)*100).toFixed(2)}% total | ${((champ[t]/TOURN/n)*100).toFixed(2)}%/seleção`);
}

// ---- (B) equilíbrio por escolha (motor real, times iguais, adversários diversos) ----
const equal = { a:80, m:80, d:80, o:80 };
const OPPS: Tactic[] = [
  { form:"4-3-3", comBola:"posse", semBola:"zona", bloco:"medio", postura:55 },
  { form:"3-4-3", comBola:"vertical", semBola:"mista", bloco:"alto", postura:62 },
  { form:"5-3-2", comBola:"contra", semBola:"libero", bloco:"baixo", postura:34 },
  { form:"4-4-2", comBola:"bola_longa", semBola:"individual", bloco:"medio", postura:50 },
  { form:"4-2-4", comBola:"drible", semBola:"dobra", bloco:"medio", postura:70 },
];
function pts(t: Tactic, n: number, s0: number) {
  let w = 0, d = 0; let s = s0;
  for (let i = 0; i < n; i++) for (const o of OPPS) { const r = play(equal, t, equal, o, s++); if (r === 1) w++; else if (r === 0) d++; }
  const tot = n * OPPS.length; return ((w + d * 0.5) / tot) * 100;
}
const base: Tactic = { form:"4-3-3", comBola:"posse", semBola:"zona", bloco:"medio", postura:50 };
console.log("\n=== (B) Equilíbrio por escolha (motor real, ~50% = justo) ===");
console.log("com bola  ", COMBOLA.map((cb) => `${cb}:${pts({ ...base, comBola: cb as ComBola }, 120, 11).toFixed(1)}`).join("  "));
console.log("sem bola  ", SEMBOLA.map((sb) => `${sb}:${pts({ ...base, semBola: sb as SemBola }, 120, 222).toFixed(1)}`).join("  "));
console.log("bloco     ", BLOCOS.map((bl) => `${bl}:${pts({ ...base, bloco: bl as Bloco }, 120, 333).toFixed(1)}`).join("  "));
console.log("postura   ", [20,35,50,65,80].map((po) => `${po}:${pts({ ...base, postura: po }, 120, 444).toFixed(1)}`).join("  "));
