// Card-imagem do share (pedido do PO, 10/06): PNG 1080×1350 gerado no client com a
// identidade do Retrô (placar eletrônico + listras), compartilhado via Web Share API
// com fallback para download + texto. Cores lidas dos tokens CSS em runtime.
import type { ScoreType } from "@/lib/types";
import { buildShareText, fmtMs, type FinishedRun } from "./share";
import { isPenaltyOut, stageEmoji, verdictHeadline } from "./verdict";

const W = 1080;
const H = 1350;
const SLOT_SHORT = ["G1", "G2", "G3", "8ª", "4ª", "SF", "F"];

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function stripe(ctx: CanvasRenderingContext2D, y: number, h: number, cores: string[]) {
  const w = W / cores.length;
  cores.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect(i * w, y, w + 1, h);
  });
}

export async function buildShareImage(run: FinishedRun, streak?: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas indisponível");

  const board = cssVar("--retro-board", "#161b21");
  const digit = cssVar("--retro-board-digit", "#e3b341");
  const cores = {
    cravada: cssVar("--color-gold-500", "#d9a400"),
    saldo: cssVar("--color-grass-600", "#43921e"),
    acerto: cssVar("--color-aqua-700", "#0a93a3"),
    erro: cssVar("--color-flame-600", "#e21818"),
  } as Record<ScoreType, string>;
  const brand = cssVar("--color-brand-500", "#1CB19C");
  const faixa = [cores.cravada, cores.saldo, cores.acerto, brand];
  const font = (px: number, weight = 700) => `${weight} ${px}px Ubuntu, system-ui, sans-serif`;

  // fundo placar eletrônico + listras retrô
  ctx.fillStyle = board;
  ctx.fillRect(0, 0, W, H);
  stripe(ctx, 0, 18, faixa);
  stripe(ctx, H - 18, 18, faixa);
  ctx.textAlign = "center";

  // header
  ctx.fillStyle = "#ffffff";
  ctx.font = font(56);
  ctx.fillText("RESULTADISMO RETRÔ", W / 2, 130);
  ctx.fillStyle = "rgba(255,255,255,0.65)";
  ctx.font = font(34, 500);
  const sub = `${run.isDaily ? "Seleção do Dia" : "Jogo livre"}${run.format === "pontos" ? " · Pontos" : ""}`;
  ctx.fillText(sub, W / 2, 190);

  // veredito (emoji + manchete por fase — dinâmico, sem choro pra quem foi longe)
  const champion = run.status === "champion";
  ctx.font = font(140);
  const v = { status: run.status, stageReached: run.stageReached, points: run.points, format: run.format };
  ctx.fillText(stageEmoji(v), W / 2, 380);
  ctx.fillStyle = champion ? digit : "#ffffff";
  ctx.font = font(64);
  ctx.fillText(verdictHeadline(v), W / 2, 500);
  if (isPenaltyOut(run.status, run.slots)) {
    ctx.fillStyle = cores.acerto;
    ctx.font = font(40, 500);
    ctx.fillText("eliminado nos pênaltis 😬", W / 2, 565);
  }

  // trilha da campanha (círculos coloridos por veredito)
  const cy = 740;
  const r = 52;
  const gap = 132;
  const x0 = W / 2 - 3 * gap;
  for (let i = 0; i < 7; i++) {
    const slot = run.slots.find((s) => s.slot === i + 1);
    const x = x0 + i * gap;
    ctx.beginPath();
    ctx.arc(x, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = slot ? cores[slot.scoreType] : "rgba(255,255,255,0.12)";
    ctx.fill();
    ctx.fillStyle = slot && slot.scoreType === "cravada" ? "#3d2e00" : slot ? "#ffffff" : "rgba(255,255,255,0.4)";
    ctx.font = font(34);
    ctx.fillText(SLOT_SHORT[i], x, cy + 12);
  }

  // pontos · tempo · streak
  ctx.fillStyle = digit;
  ctx.font = font(96);
  ctx.fillText(`${run.points} pts`, W / 2, 960);
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.font = font(44, 500);
  const extras = [`tempo ${fmtMs(run.totalMs)}`, streak ? `🔥 ${streak} dia${streak > 1 ? "s" : ""}` : null]
    .filter(Boolean)
    .join("  ·  ");
  ctx.fillText(extras, W / 2, 1035);

  // CTA-desafio
  ctx.fillStyle = brand;
  ctx.font = font(46);
  ctx.fillText("Acha que faz melhor? 😏", W / 2, 1170);
  ctx.fillStyle = "#ffffff";
  ctx.font = font(40, 500);
  ctx.fillText("www.resultadismo.com/retro", W / 2, 1235);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob falhou"))), "image/png");
  });
}

// Compartilha IMAGEM + texto (Web Share API nível 2); cai para texto (wa.me) sem suporte.
export async function shareCampaign(
  run: FinishedRun,
  streak: number | undefined,
  toast: (msg: string) => void,
): Promise<void> {
  const text = buildShareText(run, streak);
  try {
    const blob = await buildShareImage(run, streak);
    const file = new File([blob], "copa-retro.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return; // usuário cancelou
    /* sem imagem? segue pros fallbacks */
  }
  // desktop sem share de arquivos: copia a IMAGEM pro clipboard (cola direto no WhatsApp Web)
  try {
    const blob = await buildShareImage(run, streak);
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("Imagem copiada! É só colar (Ctrl+V) na conversa 😉");
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
      return;
    }
  } catch {
    /* clipboard de imagem indisponível — segue */
  }
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if ((e as DOMException)?.name === "AbortError") return;
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  try {
    await navigator.clipboard.writeText(text);
    toast("Texto copiado também!");
  } catch {
    /* wa.me já resolve */
  }
}

export async function downloadShareImage(run: FinishedRun, streak?: number): Promise<void> {
  const blob = await buildShareImage(run, streak);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "copa-retro.png";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 300);
}
