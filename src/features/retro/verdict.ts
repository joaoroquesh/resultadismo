// Veredito dinâmico do Retrô: emoji por fase (nada de choro pra quem foi longe) +
// a brincadeira "eliminado nos pênaltis" quando a pessoa acertou o vencedor mas
// faltou saldo/cravada na semi/final. Usado no reveal, na tela final e no share.
import type { ScoreType } from "@/lib/types";

// Emoji que combina com até onde a pessoa chegou (celebra fase alta, brinca na baixa).
export function stageEmoji(stageReached: string, status: "champion" | "eliminated"): string {
  if (status === "champion" || /Campeã/i.test(stageReached)) return "🏆";
  if (/Vice/i.test(stageReached)) return "🥈";
  if (/Semi/i.test(stageReached)) return "🔥";
  if (/Quartas/i.test(stageReached)) return "💪";
  if (/Oitavas/i.test(stageReached)) return "👏";
  return "😅"; // fase de grupos
}

// Manchete curta e com clima por fase.
export function verdictHeadline(stageReached: string, status: "champion" | "eliminated"): string {
  if (status === "champion") return "CAMPEÃO DO MUNDO!";
  if (/Vice/i.test(stageReached)) return "VICE! Foi até a final 🥈";
  if (/Semi/i.test(stageReached)) return "SEMIFINAL! Quase lá 🔥";
  if (/Quartas/i.test(stageReached)) return "QUARTAS DE FINAL 💪";
  if (/Oitavas/i.test(stageReached)) return "OITAVAS DE FINAL 👏";
  return "Caiu na fase de grupos 😅";
}

// "Eliminado nos pênaltis": acertou o vencedor, mas faltou saldo/cravada na semi/final.
export function isPenaltyOut(
  status: "playing" | "eliminated" | "champion",
  slots: { slot: number; scoreType: ScoreType }[],
): boolean {
  if (status !== "eliminated") return false;
  const last = slots.reduce<{ slot: number; scoreType: ScoreType } | null>(
    (acc, s) => (acc && acc.slot > s.slot ? acc : s),
    null,
  );
  return !!last && last.slot >= 6 && last.scoreType === "acerto";
}
