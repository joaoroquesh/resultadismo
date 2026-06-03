// Constrói os confrontos (cup_ties) a partir dos participantes + períodos (matchdays).
// Liga = round-robin (todos contra todos). Copa = chaveamento com seeding e byes.
// O resultado é o JSON consumido pela RPC draw_confronto.
import { roundRobin } from "./simulator";

export interface DrawParticipant {
  user_id: string;
  seed: number;
}

/** Período da competição (fase ou semana) onde um confronto é decidido. */
export interface Period {
  kind: string; // 'matchday' | 'stage' | 'week'
  value: string; // '1'.. | 'LAST_16'.. | '2026-25'
  label: string;
  games?: number;
}

export interface DrawTie {
  round_order: number;
  round_label: string;
  slot: number;
  member_a: string | null;
  member_b: string | null;
  matchday: number | null;
  period_kind: string | null;
  period_value: string | null;
}

/** matchday (compat) quando o período é de grupo; senão null. */
function periodMatchday(p: Period | undefined): number | null {
  return p && p.kind === "matchday" ? Number(p.value) : null;
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

/**
 * Liga: round-robin; cada rodada → um período (matchday).
 * `targetRounds` (opcional) define quantas rodadas gerar — o admin escolhe no
 * simulador. Acima de n-1 vira turno e returno (returno inverte o mando).
 * Sem `targetRounds`, usa o turno completo que couber nos períodos disponíveis.
 */
export function buildLigaFixtures(
  ids: string[],
  periods: Period[],
  targetRounds?: number,
): DrawTie[] {
  const rr = roundRobin(ids.length); // turno completo: n-1 (ou n com folga p/ ímpar)
  const total = Math.max(1, Math.min(targetRounds ?? Math.min(rr.length, periods.length), periods.length));
  const schedule = Array.from({ length: total }, (_, r) => {
    const base = rr[r % rr.length]!;
    const returno = Math.floor(r / rr.length) % 2 === 1; // voltas alternam o mando
    return returno ? base.map((p) => (p.b !== null ? { a: p.b, b: p.a } : p)) : base;
  });
  return schedule.flatMap((pairings, r) => {
    const per = periods[r];
    return pairings
      .filter((p) => p.b !== null)
      .map((p, slot) => ({
        round_order: r + 1,
        round_label: per?.label ?? `Rodada ${r + 1}`,
        slot: slot + 1,
        member_a: ids[p.a]!,
        member_b: ids[p.b as number]!,
        matchday: periodMatchday(per),
        period_kind: per?.kind ?? null,
        period_value: per?.value ?? null,
      }));
  });
}

/**
 * Copa: chaveamento. ids já vêm na ordem de força (seed 1 = mais forte).
 * Gera a 1ª rodada com pares e byes; rodadas seguintes como vagas (a preencher
 * conforme os vencedores avançam). Cada fase do chaveamento → um período da Copa.
 */
export function buildCopaFixtures(ids: string[], periods: Period[]): DrawTie[] {
  const n = ids.length;
  const size = nextPow2(Math.max(2, n));
  const order = seedOrder(size); // seeds (1-based) em ordem de posição
  const ties: DrawTie[] = [];
  const per = (round: number): Period | undefined => periods[round - 1];

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
      matchday: periodMatchday(per(1)),
      period_kind: per(1)?.kind ?? null,
      period_value: per(1)?.value ?? null,
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
        matchday: periodMatchday(per(round)),
        period_kind: per(round)?.kind ?? null,
        period_value: per(round)?.value ?? null,
      });
    }
    round++;
  }
  return ties;
}

/** Chave canônica de um par (independe da ordem). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Suíço: monta a PRÓXIMA rodada pareando por classificação (`order`, melhor
 * primeiro) e evitando revanches (`played`). Ímpar → último ganha folga (bye).
 */
export function buildSwissNextRound(
  order: string[],
  played: Set<string>,
  period: Period,
  roundOrder: number,
): DrawTie[] {
  const remaining = [...order];
  const ties: DrawTie[] = [];
  const md = periodMatchday(period);
  let slot = 1;
  while (remaining.length > 1) {
    const a = remaining.shift()!;
    let idx = remaining.findIndex((b) => !played.has(pairKey(a, b)));
    if (idx === -1) idx = 0; // todos já se enfrentaram → revanche inevitável
    const b = remaining.splice(idx, 1)[0]!;
    ties.push({
      round_order: roundOrder,
      round_label: period.label,
      slot: slot++,
      member_a: a,
      member_b: b,
      matchday: md,
      period_kind: period.kind,
      period_value: period.value,
    });
  }
  if (remaining.length === 1) {
    ties.push({
      round_order: roundOrder,
      round_label: period.label,
      slot,
      member_a: remaining[0]!,
      member_b: null,
      matchday: md,
      period_kind: period.kind,
      period_value: period.value,
    });
  }
  return ties;
}

/** Nº de rodadas necessárias por formato (p/ checar viabilidade no sorteio). */
export function roundsNeeded(formato: "liga" | "cup", n: number): number {
  if (formato === "cup") return Math.max(1, Math.round(Math.log2(nextPow2(Math.max(2, n)))));
  return Math.max(1, n - 1);
}
