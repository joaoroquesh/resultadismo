// Veredito dinâmico do Retrô: emoji/manchete por FASE da Copa + selos do modo Lenda
// (rodada 18): >15 pts = HISTÓRICO 📜 · 21 pts = ZEROU O GAME 👾. O ramo "pontos" é
// LEGADO (modo removido na entrada) — mantém links de share antigos renderizando.
import type { ScoreType } from "@/lib/types";
import type { RetroFormat, RetroLevel, RetroRunStatus } from "./api";

export type VerdictInput = {
  status: RetroRunStatus;
  stageReached: string | null;
  points: number;
  format: RetroFormat;
  level?: RetroLevel | null;
};

// Selo do modo Lenda: 21 pts (7 cravadas, campeão perfeito) = zerou; >15 = histórico.
export type VerdictBadge = "zerou" | "historico" | null;
export function verdictBadge(v: Pick<VerdictInput, "level" | "points">): VerdictBadge {
  if (v.level !== "lenda") return null;
  if (v.points >= 21) return "zerou";
  if (v.points > 15) return "historico";
  return null;
}

export function stageEmoji(v: VerdictInput): string {
  if (verdictBadge(v) === "zerou") return "👾";
  if (v.format === "pontos") {
    if (v.points >= 18) return "🏆";
    if (v.points >= 13) return "🔥";
    if (v.points >= 8) return "👏";
    return "😅";
  }
  const s = v.stageReached ?? "";
  if (v.status === "champion" || /Campeã/i.test(s)) return "🏆";
  if (/Vice/i.test(s)) return "🥈";
  if (/Semi/i.test(s)) return "🔥";
  if (/Quartas/i.test(s)) return "💪";
  if (/Oitavas/i.test(s)) return "👏";
  return "😅";
}

export function verdictHeadline(v: VerdictInput): string {
  if (verdictBadge(v) === "zerou") return "ZEROU O GAME!";
  if (v.format === "pontos") return `${v.points} ponto${v.points === 1 ? "" : "s"}!`;
  const s = v.stageReached ?? "";
  if (v.status === "champion") return "CAMPEÃO DO MUNDO!";
  if (/Vice/i.test(s)) return "VICE! Foi até a final 🥈";
  if (/Semi/i.test(s)) return "SEMIFINAL! Quase lá 🔥";
  if (/Quartas/i.test(s)) return "QUARTAS DE FINAL 💪";
  if (/Oitavas/i.test(s)) return "OITAVAS DE FINAL 👏";
  return "Caiu na fase de grupos 😅";
}

// "Eliminado nos pênaltis": acertou o vencedor, mas faltou saldo/cravada na semi/final.
export function isPenaltyOut(
  status: RetroRunStatus,
  slots: { slot: number; scoreType: ScoreType }[],
): boolean {
  if (status !== "eliminated") return false;
  const last = slots.reduce<{ slot: number; scoreType: ScoreType } | null>(
    (acc, s) => (acc && acc.slot > s.slot ? acc : s),
    null,
  );
  return !!last && last.slot >= 6 && last.scoreType === "acerto";
}
