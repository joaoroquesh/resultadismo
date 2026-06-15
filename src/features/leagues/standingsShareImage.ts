import type { StandingRow } from "@/lib/types";
import { formatBRL } from "@/lib/pricing";
import { C, roundRect, loadImage } from "@/features/matches/shareImage";

/** Cores do pódio (espelham a StandingsTable: ouro/prata/bronze). */
const RANK_COLOR = ["#E8B931", "#C7CDD3", "#B08D57"];

/**
 * Imagem da classificação do grupo no estilo da marca (mesmo motor do share de
 * placar): fundo escuro, logo, uma linha por jogador com posição/nome/pontos +
 * CRA e aproveitamento, e o selo 💰 do prêmio (quando o bolão paga). Top 20.
 */
export async function buildStandingsShareImage(
  rows: StandingRow[],
  opts: { leagueName: string; prizeByUserId?: Map<string, number> },
): Promise<Blob> {
  const list = rows.slice(0, 20);
  const W = 1080;
  const HEADER = 200;
  const COLH = 56; // cabeçalho das colunas
  const ROW = 92;
  const FOOTER = 92;
  const PAD = 48;
  const H = HEADER + COLH + list.length * ROW + FOOTER;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d")!;

  g.fillStyle = C.bg;
  g.fillRect(0, 0, W, H);

  // header: logo + título + nome do grupo
  const logo = await loadImage("/brand/Resultadismo.svg");
  if (logo) g.drawImage(logo, PAD, 44, 88, 88);
  g.fillStyle = C.text;
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  g.font = "800 44px system-ui, -apple-system, sans-serif";
  g.fillText("Resultadismo", PAD + 108, 88);
  g.fillStyle = C.dim;
  g.font = "500 30px system-ui, -apple-system, sans-serif";
  g.fillText("Classificação", PAD + 108, 128);
  // nome do grupo em destaque
  g.fillStyle = C.brand;
  g.font = "800 40px system-ui, -apple-system, sans-serif";
  g.fillText(truncate(g, opts.leagueName, W - 2 * PAD), PAD, 184);

  // colunas (à direita): CRA · % · PTS
  const ptsX = W - PAD;
  const pctX = ptsX - 130;
  const craX = pctX - 110;
  const colY = HEADER + 36;
  g.font = "700 26px system-ui, -apple-system, sans-serif";
  g.fillStyle = C.dim;
  g.textAlign = "center";
  g.fillText("CRA", craX, colY);
  g.fillText("%", pctX, colY);
  g.textAlign = "right";
  g.fillText("PTS", ptsX, colY);

  // linhas
  for (let i = 0; i < list.length; i++) {
    const r = list[i]!;
    const y = HEADER + COLH + i * ROW;
    // faixa do card
    g.fillStyle = C.card;
    roundRect(g, PAD - 12, y + 6, W - 2 * (PAD - 12), ROW - 12, 18);
    g.fill();

    const cy = y + ROW / 2;
    g.textBaseline = "middle";

    // posição
    g.fillStyle = RANK_COLOR[i] ?? C.dim;
    g.font = "800 34px system-ui, -apple-system, sans-serif";
    g.textAlign = "center";
    g.fillText(String(r.rank), PAD + 18, cy);

    // nome + selo de prêmio
    const prize = opts.prizeByUserId?.get(r.user_id);
    g.textAlign = "left";
    g.fillStyle = C.text;
    g.font = "700 32px system-ui, -apple-system, sans-serif";
    const nameX = PAD + 56;
    let nameMax = craX - 80 - nameX;
    let prizeW = 0;
    if (prize != null) {
      g.font = "800 24px system-ui, -apple-system, sans-serif";
      prizeW = g.measureText(`💰 ${formatBRL(prize)}`).width + 16;
      nameMax -= prizeW;
    }
    g.fillStyle = C.text;
    g.font = "700 32px system-ui, -apple-system, sans-serif";
    const name = truncate(g, r.display_name ?? "—", Math.max(80, nameMax));
    g.fillText(name, nameX, cy);
    if (prize != null) {
      const nw = g.measureText(name).width;
      g.fillStyle = C.gold;
      g.font = "800 24px system-ui, -apple-system, sans-serif";
      g.fillText(`💰 ${formatBRL(prize)}`, nameX + nw + 14, cy + 1);
    }

    // números: CRA · % · PTS
    g.textAlign = "center";
    g.fillStyle = C.gold;
    g.font = "700 28px system-ui, -apple-system, sans-serif";
    g.fillText(String(r.cravadas), craX, cy);
    g.fillStyle = C.dim;
    g.fillText(`${r.aproveitamento}%`, pctX, cy);
    g.textAlign = "right";
    g.fillStyle = C.text;
    g.font = "800 36px system-ui, -apple-system, sans-serif";
    g.fillText(String(r.pontos), ptsX, cy);
  }

  // rodapé
  g.fillStyle = C.dim;
  g.font = "600 28px system-ui, -apple-system, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  g.fillText("www.resultadismo.com · bolão da Copa 2026", W / 2, H - 36);

  return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/png"));
}

/** corta com reticências pra caber em `maxW` px na fonte atual de `g`. */
function truncate(g: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (g.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && g.measureText(s + "…").width > maxW) s = s.slice(0, -1);
  return s + "…";
}
