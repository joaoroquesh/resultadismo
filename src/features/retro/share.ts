// Helpers puros do resultado/share (fora dos componentes — fast refresh feliz).
import type { ScoreType } from "@/lib/types";
import type { RetroFormat, RetroPace } from "./api";

// Emojis casados com as cores do app: cravada=dourado 🟨 · saldo=verde 🟩 · acerto=azul 🟦
export const SCORE_EMOJI: Record<ScoreType, string> = {
  cravada: "🟨",
  saldo: "🟩",
  acerto: "🟦",
  erro: "🟥",
};

export type FinishedRun = {
  status: "eliminated" | "champion" | "finished";
  stageReached: string | null;
  points: number;
  totalMs: number | null;
  shareCode: string;
  isDaily: boolean;
  format: RetroFormat;
  pace: RetroPace;
  slots: { slot: number; scoreType: ScoreType }[];
};

export function fmtMs(ms: number | null): string {
  if (ms == null) return "–";
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// Texto do share (D7): grade de emojis SEM spoiler + manchete + link-desafio.
export function buildShareText(run: FinishedRun, streak: number | undefined): string {
  const groups = run.slots
    .filter((s) => s.slot <= 3)
    .map((s) => SCORE_EMOJI[s.scoreType])
    .join("");
  const koLabels = ["Oitavas", "Quartas", "Semi", "FINAL"];
  const ko = run.slots
    .filter((s) => s.slot >= 4)
    .map((s) => `${koLabels[s.slot - 4]} ${SCORE_EMOJI[s.scoreType]}`)
    .join(" · ");
  const headline =
    run.format === "pontos"
      ? `Fiz ${run.points} pts na minha Copa Retrô!`
      : run.status === "champion"
        ? "CAMPEÃO da minha Copa Retrô! 🏆"
        : `Caí: ${run.stageReached} 😭`;
  const fmtLabel = run.format === "pontos" ? " · Pontos" : "";
  return [
    `⚽ Resultadismo Retrô — ${run.isDaily ? "Seleção do Dia" : "Jogo livre"}${fmtLabel}`,
    `Grupos ${groups}${ko ? ` · ${ko}` : ""}`,
    `${headline} · ${run.points} pts · ${fmtMs(run.totalMs)}${streak ? ` · 🔥 ${streak} dia${streak > 1 ? "s" : ""}` : ""}`,
    `Acha que faz melhor? 👉 https://www.resultadismo.com/retro/r/${run.shareCode}`,
  ].join("\n");
}
