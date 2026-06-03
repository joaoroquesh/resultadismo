// Sistema de escudos/flâmulas baseado em MÁSCARA de SVG.
// O SVG (em /public/escudos ou /public/federacoes) recorta um fundo de cor
// (sólido, listras, grade ou bola) ou uma foto. A identidade visual fica
// codificada numa string `crest:` salva em profiles.avatar_url e leagues.logo_url.
//
// Formato (posicional, separado por ":"):
//   crest:<kind>:<shape>:<fill>:<cor1-cor2-...>:<rotação>:<fotoEncoded>
// Ex.: crest:escudo:padrao:stripes:verde-dourado:45:
//      crest:flamula:2:ball:azul-dourado:0:
//      crest:escudo:3:photo:grafite::https%3A%2F%2F...
//
// A foto é encodeURIComponent — então nunca contém ":" e não quebra o split.
import { AVATAR_COLORS } from "./avatar";

export type CrestKind = "escudo" | "flamula";
export type CrestFill = "solid" | "stripes" | "grid" | "ball" | "photo";

// ---------------------------------------------------------------------------
// Catálogo de formas (precisa bater com os arquivos em /public)
// ---------------------------------------------------------------------------
// 15 escudos opcionais + o padrão (recorte da logo). "padrao" é o default.
export const ESCUDO_SHAPES: string[] = [
  "padrao",
  ...Array.from({ length: 15 }, (_, i) => String(i + 1)),
];

// 3 flâmulas (federação).
export const FLAMULA_SHAPES: string[] = ["1", "2", "3"];

export function crestShapeUrl(kind: CrestKind, shape: string): string {
  if (kind === "flamula") return `/federacoes/flamula-${shape}.svg`;
  return shape === "padrao" ? "/escudos/escudo-padrao.svg" : `/escudos/escudo-${shape}.svg`;
}

// ---------------------------------------------------------------------------
// Cores (reaproveita a paleta do avatar)
// ---------------------------------------------------------------------------
export const CREST_COLORS = AVATAR_COLORS;
export const CREST_ROTATIONS = [0, 45, 90, 135];

function hexOf(key: string): string {
  return AVATAR_COLORS.find((c) => c.key === key)?.hex ?? AVATAR_COLORS[0]!.hex;
}
function isDark(key: string): boolean {
  return !!AVATAR_COLORS.find((c) => c.key === key)?.dark;
}

// ---------------------------------------------------------------------------
// Config + encode/parse
// ---------------------------------------------------------------------------
export type CrestConfig = {
  kind: CrestKind;
  shape: string;
  fill: CrestFill;
  colors: string[];
  rotation: number;
  photo?: string;
};

export function isCrest(src: string | null | undefined): boolean {
  return !!src && src.startsWith("crest:");
}

export function buildCrest(cfg: CrestConfig): string {
  const colors = cfg.colors.join("-");
  const photo = cfg.fill === "photo" && cfg.photo ? encodeURIComponent(cfg.photo) : "";
  return `crest:${cfg.kind}:${cfg.shape}:${cfg.fill}:${colors}:${Math.round(cfg.rotation)}:${photo}`;
}

export function parseCrest(src: string | null | undefined): CrestConfig | null {
  if (!isCrest(src)) return null;
  const parts = src!.split(":");
  const kind: CrestKind = parts[1] === "flamula" ? "flamula" : "escudo";
  const shape = parts[2] || (kind === "flamula" ? "1" : "padrao");
  const fill = (parts[3] as CrestFill) || "solid";
  const colors = (parts[4] || "").split("-").filter(Boolean);
  const rotation = Number.parseInt(parts[5] ?? "0", 10) || 0;
  // foto vem encodada e sem ":", mas faço join por segurança.
  const photoEnc = parts.slice(6).join(":");
  const photo = photoEnc ? safeDecode(photoEnc) : undefined;
  return {
    kind,
    shape,
    fill,
    colors: colors.length ? colors : ["turquesa"],
    rotation,
    photo,
  };
}

function safeDecode(s: string): string | undefined {
  try {
    return decodeURIComponent(s);
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------
// Hash estável (djb2) p/ defaults determinísticos a partir do nome.
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return Math.abs(h | 0);
}

/** Default de todo mundo: escudo padrão (recorte da logo) com cor estável do nome. */
export function defaultCrestFromName(
  name: string | null | undefined,
  kind: CrestKind = "escudo",
): CrestConfig {
  const h = hashStr(name ?? "Resultadismo");
  const color = AVATAR_COLORS[h % AVATAR_COLORS.length]!.key;
  if (kind === "flamula") {
    const c2 = AVATAR_COLORS[(h >> 3) % AVATAR_COLORS.length]!.key;
    return {
      kind,
      shape: "1",
      fill: c2 === color ? "solid" : "stripes",
      colors: c2 === color ? [color] : [color, c2],
      rotation: 0,
    };
  }
  return { kind, shape: "padrao", fill: "solid", colors: [color], rotation: 0 };
}

// ---------------------------------------------------------------------------
// Render do fundo (CSS background) para a config
// ---------------------------------------------------------------------------
/** background CSS que será recortado pela máscara do SVG. */
export function crestBackground(cfg: CrestConfig): string {
  const c = cfg.colors.map(hexOf);
  const rot = cfg.rotation;
  switch (cfg.fill) {
    case "photo":
      // sem foto: cai num sólido (a letra entra por cima no Avatar)
      return cfg.photo
        ? `center / cover no-repeat url("${cfg.photo}")`
        : c[0] ?? hexOf("turquesa");
    case "stripes":
      if (c.length <= 1) return c[0] ?? hexOf("turquesa");
      if (c.length === 2)
        return `linear-gradient(${rot}deg, ${c[0]} 0 50%, ${c[1]} 50% 100%)`;
      return `linear-gradient(${rot}deg, ${c[0]} 0 33.34%, ${c[1]} 33.34% 66.67%, ${c[2]} 66.67% 100%)`;
    case "grid": {
      // 2x2 via conic-gradient. Ordem das cores em leitura natural:
      // [0]=sup-esq, [1]=sup-dir, [2]=inf-esq, [3]=inf-dir.
      // Setores do conic (from 0deg): 0–90=sup-dir, 90–180=inf-dir,
      // 180–270=inf-esq, 270–360=sup-esq.
      const tl = c[0];
      const tr = c[1] ?? c[0];
      const bl = c[2] ?? c[0];
      const br = c[3] ?? c[1] ?? c[0];
      return `conic-gradient(from ${rot}deg at 50% 50%, ${tr} 0 90deg, ${br} 90deg 180deg, ${bl} 180deg 270deg, ${tl} 270deg 360deg)`;
    }
    case "ball": {
      // fundo + bola central (flâmula). cor2 = bola, cor1 = fundo.
      const bg = c[0] ?? hexOf("verde");
      const ball = c[1] ?? hexOf("dourado");
      return `radial-gradient(circle at 50% 50%, ${ball} 0 30%, ${bg} 30.5% 100%)`;
    }
    case "solid":
    default:
      return c[0] ?? hexOf("turquesa");
  }
}

/** cor de texto da inicial (perfil) — contraste sobre o fundo. */
export function crestTextColor(cfg: CrestConfig): string {
  // multicolor / grade / foto: branco com sombra; sólido: contraste pela cor.
  if (cfg.fill === "solid" || (cfg.fill === "photo" && !cfg.photo)) {
    return isDark(cfg.colors[0] ?? "") ? "#232323" : "#ffffff";
  }
  return "#ffffff";
}

/** quantas cores cada padrão usa (p/ os editores). */
export function colorsForFill(fill: CrestFill): number {
  switch (fill) {
    case "solid":
      return 1;
    case "ball":
      return 2;
    case "grid":
      return 4;
    case "stripes":
      return 2; // editor permite alternar 2 ou 3
    default:
      return 1;
  }
}
