// Veredito dinâmico do Retrô. No formato COPA: emoji/manchete por FASE. No formato
// PONTOS: por faixa de pontos (não há "campeão/eliminado"). + "eliminado nos pênaltis"
// quando, na Copa com a barra ligada, a pessoa acertou o vencedor mas faltou saldo.
import type { ScoreType } from "@/lib/types";
import type { RetroFormat, RetroRunStatus } from "./api";

export type VerdictInput = {
  status: RetroRunStatus;
  stageReached: string | null;
  points: number;
  format: RetroFormat;
};

export function stageEmoji(v: VerdictInput): string {
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
