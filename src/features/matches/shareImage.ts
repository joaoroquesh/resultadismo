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
  /** data curta do jogo ("QUA 10/06") — dá contexto quando a imagem junta dias. */
  date?: string | null;
  /** caminho do escudo já resolvido (ex.: pelo nome COMPLETO do time); se
   *  ausente, tenta resolver pelo nome de exibição. */
  homeCrest?: string | null;
  awayCrest?: string | null;
};

// Paleta da marca em hex (canvas não lê os tokens oklch do CSS).
// Exportada p/ outros geradores de imagem (ex.: classificação) reaproveitarem.
export const C = {
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

export function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Raio do "2×" desenhado na mão: o emoji ⚡ tem métrica própria (desalinha a
 *  linha) e é amarelo — some no fundo dourado da cravada. Polígono = cor e
 *  baseline 100% controladas. (x, baseline) ancoram no texto ao lado. */
function drawBolt(g: CanvasRenderingContext2D, x: number, baseline: number, color: string) {
  const t = baseline - 19; // topo do raio (altura ~20px, casa com fonte 26px)
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x + 7.5, t);
  g.lineTo(x + 1, t + 11);
  g.lineTo(x + 5.5, t + 11);
  g.lineTo(x + 3.5, t + 20);
  g.lineTo(x + 11, t + 8);
  g.lineTo(x + 6.5, t + 8);
  g.closePath();
  g.fill();
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
  const ROW = 190; // comporta a linha de data acima do placar
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

    // escudos (caminho já resolvido pelo chamador > nome de exibição)
    const homeCrest = r.homeCrest ?? teamCrestPath(r.homeName);
    const awayCrest = r.awayCrest ?? teamCrestPath(r.awayName);
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

    // centro: data pequena + placar real grande + palpite pequeno
    const cx = W / 2;
    if (r.date) {
      g.fillStyle = C.dim;
      g.font = "600 21px system-ui, -apple-system, sans-serif";
      g.fillText(r.date, cx, y + 32);
    }
    const score =
      r.homeScore != null && r.awayScore != null ? `${r.homeScore} × ${r.awayScore}` : "– × –";
    g.fillStyle = C.text;
    g.font = "800 56px system-ui, -apple-system, sans-serif";
    g.fillText(score, cx, y + 86);
    g.fillStyle = C.dim;
    g.font = "600 26px system-ui, -apple-system, sans-serif";
    g.fillText(`meu palpite ${r.homePred} × ${r.awayPred}`, cx, y + 122);

    // selo da pontuação — sem emoji: o raio do 2× é desenhado (drawBolt) pra
    // ficar na MESMA baseline do texto e com cor que contrasta no dourado.
    const pts = SCORE_POINTS[r.type] * (r.joker ? 2 : 1);
    const showBolt = r.joker && r.type !== "erro";
    const seg1 = `${r.type === "erro" ? "0" : `+${pts}`} ${SCORE_LABEL[r.type]}`;
    const seg2 = showBolt ? "2×" : "";
    const seg3 = r.live ? " · ao vivo" : "";
    g.font = "700 26px system-ui, -apple-system, sans-serif";
    const BOLT_W = 12; // largura do raio + respiro à direita
    const w1 = g.measureText(seg1).width;
    const w2 = seg2 ? 9 + BOLT_W + 2 + g.measureText(seg2).width : 0;
    const w3 = seg3 ? g.measureText(seg3).width : 0;
    const pw = w1 + w2 + w3 + 36;
    const px = cx - pw / 2;
    const py = y + ROW - 24;
    g.fillStyle = TYPE_COLOR[r.type];
    roundRect(g, px, py - 24, pw, 38, 19);
    g.fill();
    const ink = r.type === "cravada" ? C.goldInk : "#FFFFFF";
    const base = py + 4;
    g.fillStyle = ink;
    g.textAlign = "left";
    let tx = px + 18;
    g.fillText(seg1, tx, base);
    tx += w1;
    if (seg2) {
      drawBolt(g, tx + 9, base, ink);
      g.fillStyle = ink;
      g.fillText(seg2, tx + 9 + BOLT_W + 2, base);
      tx += w2;
    }
    if (seg3) g.fillText(seg3, tx, base);
    g.textAlign = "center"; // volta pro padrão das linhas seguintes
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
