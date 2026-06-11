import type { ScoreType } from "@/lib/types";
import { SCORE_LABEL, SCORE_POINTS } from "@/lib/types";
import { teamCrestPath } from "@/lib/teamCrests";

/** Uma linha (jogo) da imagem compartilhada. */
export type ShareRow = {
  homeName: string;
  awayName: string;
  homePred: number;
  awayPred: number;
  homeScore: number | null;
  awayScore: number | null;
  live: boolean;
  type: ScoreType;
  joker: boolean;
};

// Paleta da marca em hex (canvas não lê os tokens oklch do CSS).
const C = {
  bg: "#101820",
  card: "#1A232C",
  line: "#2A343E",
  text: "#F4F7F6",
  dim: "#93A1AB",
  brand: "#06DDBB",
  gold: "#E8B931",
  goldInk: "#3D2F05",
  grass: "#3FA052",
  aqua: "#3187A2",
  inkPill: "#3A444E",
};
const TYPE_COLOR: Record<ScoreType, string> = {
  cravada: C.gold,
  saldo: C.grass,
  acerto: C.aqua,
  erro: C.inkPill,
};

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function drawCrestFallback(g: CanvasRenderingContext2D, x: number, y: number, size: number, name: string) {
  g.fillStyle = C.inkPill;
  roundRect(g, x, y, size, size, size / 4);
  g.fill();
  g.fillStyle = C.dim;
  g.font = `700 ${Math.round(size * 0.34)}px system-ui, -apple-system, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(name.slice(0, 3).toUpperCase(), x + size / 2, y + size / 2 + 1);
}

/**
 * Gera a imagem dos palpites (1+ jogos) no estilo da marca: fundo escuro,
 * escudos do repo, palpite × placar e o selo da pontuação por jogo.
 */
export async function buildScoreShareImage(rows: ShareRow[], playerName: string): Promise<Blob> {
  const W = 1080;
  const HEADER = 168;
  const ROW = 168;
  const FOOTER = 92;
  const PAD = 48;
  const H = HEADER + rows.length * (ROW + 16) + FOOTER;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;

  // fundo
  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  // header: logo + título + jogador
  const logo = await loadImage("/brand/Resultadismo.svg");
  if (logo) g.drawImage(logo, PAD, 40, 88, 88);
  g.fillStyle = C.text;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.font = "800 44px system-ui, -apple-system, sans-serif";
  g.fillText("Resultadismo", PAD + 108, 84);
  g.fillStyle = C.dim;
  g.font = "500 30px system-ui, -apple-system, sans-serif";
  g.fillText(`Palpites de ${playerName}`, PAD + 108, 124);

  // total no canto
  const total = rows.reduce((s, r) => s + SCORE_POINTS[r.type] * (r.joker ? 2 : 1), 0);
  g.fillStyle = C.brand;
  g.textAlign = "right";
  g.font = "800 52px system-ui, -apple-system, sans-serif";
  g.fillText(`${total} pts`, W - PAD, 104);

  // linhas dos jogos
  const crestSize = 76;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]!;
    const y = HEADER + i * (ROW + 16);

    g.fillStyle = C.card;
    roundRect(g, PAD - 16, y, W - 2 * (PAD - 16), ROW, 24);
    g.fill();

    // escudos
    const homeCrest = teamCrestPath(r.homeName);
    const awayCrest = teamCrestPath(r.awayName);
    const cy = y + ROW / 2 - crestSize / 2 - 10;
    const hi = homeCrest ? await loadImage(homeCrest) : null;
    const ai = awayCrest ? await loadImage(awayCrest) : null;
    if (hi) g.drawImage(hi, PAD + 8, cy, crestSize, crestSize);
    else drawCrestFallback(g, PAD + 8, cy, crestSize, r.homeName);
    const axX = W - PAD - 8 - crestSize;
    if (ai) g.drawImage(ai, axX, cy, crestSize, crestSize);
    else drawCrestFallback(g, axX, cy, crestSize, r.awayName);

    // nomes (embaixo dos escudos)
    g.fillStyle = C.dim;
    g.font = "600 24px system-ui, -apple-system, sans-serif";
    g.textAlign = "center";
    g.fillText(r.homeName.slice(0, 14), PAD + 8 + crestSize / 2, y + ROW - 18);
    g.fillText(r.awayName.slice(0, 14), axX + crestSize / 2, y + ROW - 18);

    // centro: placar real grande + palpite pequeno
    const cx = W / 2;
    const score =
      r.homeScore != null && r.awayScore != null ? `${r.homeScore} × ${r.awayScore}` : "– × –";
    g.fillStyle = C.text;
    g.font = "800 56px system-ui, -apple-system, sans-serif";
    g.fillText(score, cx, y + 66);
    g.fillStyle = C.dim;
    g.font = "600 26px system-ui, -apple-system, sans-serif";
    g.fillText(`meu palpite ${r.homePred} × ${r.awayPred}`, cx, y + 102);

    // selo da pontuação
    const pts = SCORE_POINTS[r.type] * (r.joker ? 2 : 1);
    const label = `${r.type === "erro" ? "0" : `+${pts}`} ${SCORE_LABEL[r.type]}${r.joker && r.type !== "erro" ? " ⚡2×" : ""}${r.live ? " · ao vivo" : ""}`;
    g.font = "700 26px system-ui, -apple-system, sans-serif";
    const tw = g.measureText(label).width;
    const pw = tw + 36;
    const px = cx - pw / 2;
    const py = y + ROW - 22;
    g.fillStyle = TYPE_COLOR[r.type];
    roundRect(g, px, py - 24, pw, 38, 19);
    g.fill();
    g.fillStyle = r.type === "cravada" ? C.goldInk : "#FFFFFF";
    g.fillText(label, cx, py + 4);
  }

  // rodapé
  g.fillStyle = C.dim;
  g.font = "600 28px system-ui, -apple-system, sans-serif";
  g.textAlign = "center";
  g.fillText("www.resultadismo.com · bolão da Copa 2026", W / 2, H - 36);

  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

/** Compartilha (Web Share c/ arquivo) ou baixa a imagem. Retorna como foi. */
export async function shareImageBlob(blob: Blob, filename: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: "image/png" });
  if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return "shared";
    } catch {
      /* cancelou ou falhou → cai no download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
