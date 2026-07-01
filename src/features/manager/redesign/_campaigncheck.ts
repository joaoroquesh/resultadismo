// Smoke test do adaptador de CAMPANHA (redesign/campaign.ts) com o MOTOR REAL.
//   node --experimental-strip-types src/features/manager/redesign/_campaigncheck.ts
// Exercita: 2026 comecando no R32 (convidada), avanco ate campeao/eliminado, e uma
// edicao antiga completa (grupos + mata-mata). As minhas partidas sao jogadas pelo sim
// do redesign (createMatch/simulateFull) e o placar volta pro engine.
import { createMatch, simulateFull } from "./sim.ts";
import { tacticFromPreset } from "./tactics.ts";
import { toLite } from "./data";
import { poolForYear } from "../engine";
import type { Campaign } from "../types";
import {
  buildKnockout2026,
  buildFullCampaign,
  nextUserMatch,
  applyUserMatch,
  matchSeedFor,
} from "./campaign";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("  FAIL:", msg);
    failures++;
  }
}

// joga a proxima partida MINHA com o sim do redesign e devolve o placar.
function playMyMatch(camp: Campaign): { gf: number; ga: number } | null {
  const nm = nextUserMatch(camp);
  if (!nm) return null;
  const seed = matchSeedFor(camp, nm.opp);
  const myTac = tacticFromPreset("mandaNoJogo");
  const oppTac = tacticFromPreset("ganharSofrendo");
  const st = simulateFull(createMatch(toLite(camp.myTeam), toLite(nm.opp), myTac, oppTac, seed));
  return { gf: st.score[0], ga: st.score[1] };
}

// roda uma campanha inteira (todas as minhas partidas) com guard anti-loop.
function runCampaign(camp: Campaign, tag: string): void {
  let guard = 0;
  const stages: string[] = [];
  while (camp.alive && guard < 40) {
    const nm = nextUserMatch(camp);
    if (!nm) {
      console.error(`  [${tag}] alive mas sem proxima partida (guard ${guard}) - advanceToUserMatch deveria ter fechado`);
      break;
    }
    stages.push(nm.kind + " vs " + nm.opp.n);
    const res = playMyMatch(camp);
    if (!res) break;
    const seed = matchSeedFor(camp, nm.opp);
    applyUserMatch(camp, res.gf, res.ga, seed);
    guard++;
  }
  assert(guard < 40, `[${tag}] campanha nao terminou em <40 partidas (loop?)`);
  assert(!camp.alive, `[${tag}] campanha deveria ter encerrado (alive=false)`);
  assert(camp.placement != null, `[${tag}] placement deveria estar definido`);
  console.log(`  [${tag}] partidas minhas: ${stages.length} | placement: ${camp.placement} | campeao: ${camp.champion}`);
  console.log(`         sequencia: ${stages.join(" -> ")}`);
}

import { FORMATS } from "../engine";
const ED2026 = FORMATS.find((e) => e.year === 2026)!;

console.log("== 2026 R32 (favorita) ==");
{
  const pool = poolForYear(2026);
  const fav = pool[0];
  const camp = buildKnockout2026(ED2026, fav, 20260701, "real");
  const nm = nextUserMatch(camp);
  assert(camp.alive, "2026 fav: campanha deveria comecar viva");
  assert(nm != null, "2026 fav: deveria ter uma primeira partida no R32");
  assert(nm?.kind === "knockout", "2026 fav: primeira partida deveria ser knockout (R32)");
  // o meu time nao deve ter jogos de grupo no historico ao chegar aqui.
  assert(camp.history.length === 0, "2026 fav: nao deveria ter historico de grupo (comeca no R32)");
  assert(camp.myTeam.s === fav.s, "2026 fav: myTeam preservado");
  runCampaign(camp, "2026-fav");
}

console.log("== 2026 R32 (zebra, convidada que nao passaria) ==");
{
  const pool = poolForYear(2026);
  const zebra = pool[pool.length - 1]; // mais fraca
  const camp = buildKnockout2026(ED2026, zebra, 424242, "real");
  const nm = nextUserMatch(camp);
  assert(nm != null && nm.kind === "knockout", "2026 zebra: comeca no R32");
  assert(camp.history.length === 0, "2026 zebra: sem historico de grupo");
  // a zebra tem de estar no chaveamento (convidada): o proximo confronto e dela.
  runCampaign(camp, "2026-zebra");
}

console.log("== Copa antiga completa (2018, grupos + mata-mata) ==");
{
  const pool = poolForYear(2018);
  const mid = pool[Math.floor(pool.length / 2)];
  const camp = buildFullCampaign(FORMATS.find((e) => e.year === 2018)!, mid, 20180614, "real");
  const nm = nextUserMatch(camp);
  assert(nm != null, "2018: deveria ter primeira partida");
  assert(nm?.kind === "groups", "2018: primeira partida deveria ser de grupos (campanha completa)");
  runCampaign(camp, "2018");
}

console.log("== Copa antiga (1970) ==");
{
  const pool = poolForYear(1970);
  const t = pool[2];
  const camp = buildFullCampaign(FORMATS.find((e) => e.year === 1970)!, t, 19700621, "alt");
  const nm = nextUserMatch(camp);
  assert(nm != null, "1970: deveria ter primeira partida");
  runCampaign(camp, "1970");
}

console.log("== 1950 (quadrangular final, sem mata-mata) ==");
{
  const ed = FORMATS.find((e) => e.year === 1950);
  if (ed) {
    const pool = poolForYear(1950);
    const t = pool[1];
    const camp = buildFullCampaign(ed, t, 19500624, "real");
    const nm = nextUserMatch(camp);
    assert(nm != null, "1950: deveria ter primeira partida");
    runCampaign(camp, "1950");
  } else {
    console.log("  (1950 ausente do FORMATS; pulado)");
  }
}

console.log("");
if (failures === 0) console.log("TODOS OS CHECKS PASSARAM");
else console.error(`${failures} CHECK(S) FALHARAM`);
process.exit(failures === 0 ? 0 : 1);
