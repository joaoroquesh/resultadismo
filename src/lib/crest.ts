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
// Catálogo de formas — montado AUTOMATICAMENTE a partir das pastas:
//   src/assets/escudos/escudo-<id>.svg    (perfil; "escudo-padrao" é o default)
//   src/assets/federacoes/flamula-<id>.svg (federação)
// Pra adicionar/remover/trocar uma forma, é só largar/apagar o SVG na pasta
// (nome no padrão "escudo-<id>.svg" / "flamula-<id>.svg") e rebuildar. O <id>
// vira o identificador salvo no crest, então mantenha nomes estáveis.
// import.meta.glob lê em tempo de build (Vite não enxerga a pasta public).
// ---------------------------------------------------------------------------
const ESCUDO_FILES = import.meta.glob("../assets/escudos/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;
const FLAMULA_FILES = import.meta.glob("../assets/federacoes/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

// id (estável) -> url empacotada. id = nome sem o prefixo e sem ".svg".
function buildCatalog(files: Record<string, string>, prefix: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const [path, url] of Object.entries(files)) {
    const stem = (path.split("/").pop() ?? "").replace(/\.svg$/i, "");
    const id = stem.startsWith(`${prefix}-`) ? stem.slice(prefix.length + 1) : stem;
    if (id) map.set(id, url);
  }
  return map;
}

// "padrao" primeiro; depois numéricos crescentes; depois alfabético.
function sortShapeIds(ids: string[]): string[] {
  return [...ids].sort((a, b) => {
    if (a === "padrao") return -1;
    if (b === "padrao") return 1;
    const na = Number(a);
    const nb = Number(b);
    const aNum = a !== "" && !Number.isNaN(na);
    const bNum = b !== "" && !Number.isNaN(nb);
    if (aNum && bNum) return na - nb;
    if (aNum) return -1;
    if (bNum) return 1;
    return a.localeCompare(b);
  });
}

const ESCUDO_CATALOG = buildCatalog(ESCUDO_FILES, "escudo");
const FLAMULA_CATALOG = buildCatalog(FLAMULA_FILES, "flamula");

export const ESCUDO_SHAPES: string[] = sortShapeIds([...ESCUDO_CATALOG.keys()]);
export const FLAMULA_SHAPES: string[] = sortShapeIds([...FLAMULA_CATALOG.keys()]);

// Default de cada tipo (resiliente: usa "padrao" se existir, senão a 1ª forma).
export const DEFAULT_ESCUDO_SHAPE =
  ESCUDO_CATALOG.has("padrao") ? "padrao" : ESCUDO_SHAPES[0] ?? "padrao";
export const DEFAULT_FLAMULA_SHAPE = FLAMULA_SHAPES[0] ?? "1";

/** URL empacotada da forma. Cai no default se o id não existir mais (forma removida). */
export function crestShapeUrl(kind: CrestKind, shape: string): string {
  const catalog = kind === "flamula" ? FLAMULA_CATALOG : ESCUDO_CATALOG;
  const fallback = kind === "flamula" ? DEFAULT_FLAMULA_SHAPE : DEFAULT_ESCUDO_SHAPE;
  return catalog.get(shape) ?? catalog.get(fallback) ?? "";
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
  const shape = parts[2] || (kind === "flamula" ? DEFAULT_FLAMULA_SHAPE : DEFAULT_ESCUDO_SHAPE);
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
      shape: DEFAULT_FLAMULA_SHAPE,
      fill: c2 === color ? "solid" : "stripes",
      colors: c2 === color ? [color] : [color, c2],
      rotation: 0,
    };
  }
  return { kind, shape: DEFAULT_ESCUDO_SHAPE, fill: "solid", colors: [color], rotation: 0 };
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
