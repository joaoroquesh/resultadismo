// Constrói os confrontos (cup_ties) a partir dos participantes + períodos (matchdays).
// Liga = round-robin (todos contra todos). Copa = chaveamento com seeding e byes.
// O resultado é o JSON consumido pela RPC draw_confronto.
import { roundRobin } from "./simulator";

export interface DrawParticipant {
  user_id: string;
  seed: number;
}

export interface DrawTie {
  round_order: number;
  round_label: string;
  slot: number;
  member_a: string | null;
  member_b: string | null;
  matchday: number | null;
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Ordem de seeds nas posições do chaveamento (1-based): size 4 → [1,4,2,3]. */
function seedOrder(size: number): number[] {
  const rounds = Math.round(Math.log2(size));
  let arr = [1, 2];
  for (let r = 1; r < rounds; r++) {
    const sum = arr.length * 2 + 1;
    const next: number[] = [];
    for (const s of arr) {
      next.push(s);
      next.push(sum - s);
    }
    arr = next;
  }
  return arr;
}

const COPA_FASES: Record<number, string> = {
  2: "Final",
  4: "Semifinais",
  8: "Quartas de final",
  16: "Oitavas de final",
  32: "Fase de 32",
};
const faseLabel = (slots: number) => COPA_FASES[slots * 2] ?? `Rodada de ${slots * 2}`;

export function buildParticipants(ids: string[]): DrawParticipant[] {
  return ids.map((user_id, i) => ({ user_id, seed: i + 1 }));
}

/** Liga: round-robin; cada rodada → um período (matchday). */
export function buildLigaFixtures(ids: string[], periods: number[]): DrawTie[] {
  const schedule = roundRobin(ids.length).slice(0, periods.length);
  return schedule.flatMap((pairings, r) =>
    pairings
      .filter((p) => p.b !== null)
      .map((p, slot) => ({
        round_order: r + 1,
        round_label: `Rodada ${r + 1}`,
        slot: slot + 1,
        member_a: ids[p.a]!,
        member_b: ids[p.b as number]!,
        matchday: periods[r] ?? null,
      })),
  );
}

/**
 * Copa: chaveamento. ids já vêm na ordem de força (seed 1 = mais forte).
 * Gera a 1ª rodada com pares e byes; rodadas seguintes como vagas (a preencher
 * conforme os vencedores avançam). Cada rodada → um período (matchday).
 */
export function buildCopaFixtures(ids: string[], periods: number[]): DrawTie[] {
  const n = ids.length;
  const size = nextPow2(Math.max(2, n));
  const order = seedOrder(size); // seeds (1-based) em ordem de posição
  const ties: DrawTie[] = [];

  // 1ª rodada
  const firstSlots = size / 2;
  for (let i = 0; i < firstSlots; i++) {
    const seedA = order[i * 2]!;
    const seedB = order[i * 2 + 1]!;
    const a = seedA <= n ? ids[seedA - 1]! : null;
    const b = seedB <= n ? ids[seedB - 1]! : null;
    ties.push({
      round_order: 1,
      round_label: faseLabel(firstSlots),
      slot: i + 1,
      member_a: a ?? b, // se um for bye, o real vai em member_a
      member_b: a && b ? b : null, // member_b null = bye (member_a avança)
      matchday: periods[0] ?? null,
    });
  }

  // rodadas seguintes (vagas a preencher por avanço)
  let round = 2;
  for (let slots = firstSlots / 2; slots >= 1; slots /= 2) {
    for (let i = 0; i < slots; i++) {
      ties.push({
        round_order: round,
        round_label: faseLabel(slots),
        slot: i + 1,
        member_a: null,
        member_b: null,
        matchday: periods[round - 1] ?? null,
      });
    }
    round++;
  }
  return ties;
}

/** Nº de rodadas necessárias por formato (p/ checar viabilidade no sorteio). */
export function roundsNeeded(formato: "liga" | "cup", n: number): number {
  if (formato === "cup") return Math.max(1, Math.round(Math.log2(nextPow2(Math.max(2, n)))));
  return Math.max(1, n - 1);
}
