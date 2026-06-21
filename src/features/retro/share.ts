// Helpers puros do resultado/share (fora dos componentes — fast refresh feliz).
import type { ScoreType } from "@/lib/types";
import { LEVEL_EMOJI, LEVEL_LABEL, type RetroFormat, type RetroLevel, type RetroPace } from "./api";
import { stageEmoji, verdictBadge } from "./verdict";

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
  stageRank: number | null;
  points: number;
  totalMs: number | null;
  shareCode: string;
  isDaily: boolean;
  format: RetroFormat;
  level: RetroLevel | null;
  pace: RetroPace;
  dailyDate: string | null;
  dailyTeam: string | null;
  slots: { slot: number; scoreType: ScoreType }[];
};

// Rótulo do modo: só no Jogo livre (a Seleção do Dia não tem escolha de dificuldade)
export function modeLabel(run: Pick<FinishedRun, "isDaily" | "level">): string | null {
  if (run.isDaily || !run.level) return null;
  return `${LEVEL_LABEL[run.level]} ${LEVEL_EMOJI[run.level]}`;
}

// Nº de edição da Seleção do Dia (estilo Wordle do dia). Dia 0 = 2026-06-10 = ed. #1.
const RETRO_EPOCH = Date.UTC(2026, 5, 10);
export function dailyEdition(dailyDate: string | null | undefined): number | null {
  if (!dailyDate) return null;
  const d = Date.parse(`${dailyDate}T00:00:00Z`);
  if (Number.isNaN(d)) return null;
  return Math.floor((d - RETRO_EPOCH) / 86_400_000) + 1;
}

// "Seleção do Dia #12 · BRASIL" / "Jogo livre" — etiqueta do topo do share. withMode
// inclui o modo no Jogo livre (texto, que não tem pílula; na imagem a pílula já mostra).
export function shareSubtitle(
  run: Pick<FinishedRun, "isDaily" | "level" | "dailyDate" | "dailyTeam">,
  withMode = false,
): string {
  if (run.isDaily) {
    const ed = dailyEdition(run.dailyDate);
    const team = run.dailyTeam ? ` · ${run.dailyTeam.toUpperCase()}` : "";
    return `Seleção do Dia${ed ? ` #${ed}` : ""}${team}`;
  }
  return `Jogo livre${withMode && run.level ? ` · ${LEVEL_LABEL[run.level]}` : ""}`;
}

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
  // emoji dinâmico (mesmo da imagem): 🏆 🥈 🔥 💪 👏 😅 — nunca fixo no choro
  const v = { status: run.status, stageReached: run.stageReached, points: run.points, format: run.format, level: run.level };
  const emoji = stageEmoji(v);
  const badge = verdictBadge(v);
  const headline =
    badge === "zerou"
      ? `${emoji} ZEROU O GAME! 21/21 no modo Lenda`
      : run.format === "pontos"
        ? `${emoji} Fiz ${run.points} pts na minha Copa Retrô!`
        : run.status === "champion"
          ? `${emoji} CAMPEÃO da minha Copa Retrô!`
          : `${emoji} Caí: ${run.stageReached}`;
  const badgeLine = badge === "historico" ? "📜 Campanha HISTÓRICA no modo Lenda!" : null;
  return [
    `⚽ Resultadismo Retrô — ${shareSubtitle(run, true)}`,
    `Grupos ${groups}${ko ? ` · ${ko}` : ""}`,
    `${headline} · ${run.points} pts · ${fmtMs(run.totalMs)}${streak ? ` · 🔥 ${streak} dia${streak > 1 ? "s" : ""}` : ""}`,
    ...(badgeLine ? [badgeLine] : []),
    `Acha que faz melhor? 👉 https://www.resultadismo.com/retro/r/${run.shareCode}`,
  ].join("\n");
}
