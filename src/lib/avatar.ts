// Avatar gerado: forma geométrica + 1 a 3 cores (com rotação da divisão) + inicial.
// Codificado em avatar_url como "gen:<forma>:<cor1-cor2-cor3>:<rotacao>".
import type { CSSProperties } from "react";

export type AvatarShape =
  | "shield"
  | "ogival"
  | "banner"
  | "circle"
  | "squircle"
  | "hexagon"
  | "diamond";

export const AVATAR_SHAPES: { key: AvatarShape; label: string }[] = [
  // escudos de clube primeiro
  { key: "shield", label: "Escudo" },
  { key: "ogival", label: "Ogival" },
  { key: "banner", label: "Bandeira" },
  // formas geométricas
  { key: "circle", label: "Círculo" },
  { key: "squircle", label: "Quadrado" },
  { key: "hexagon", label: "Hexágono" },
  { key: "diamond", label: "Losango" },
];

export const AVATAR_COLORS: { key: string; hex: string; dark?: boolean }[] = [
  { key: "turquesa", hex: "#1CB19C" },
  { key: "verde", hex: "#43921E" },
  { key: "azul", hex: "#05A4B5" },
  { key: "dourado", hex: "#EFC703", dark: true },
  { key: "laranja", hex: "#F97316" },
  { key: "vermelho", hex: "#E21818" },
  { key: "roxo", hex: "#7C3AED" },
  { key: "grafite", hex: "#3D3D3D" },
];

export const AVATAR_ROTATIONS = [0, 45, 90, 135];

// polígonos em % (escalam em qualquer tamanho). Crests com vértices suficientes
// para um silhueta de escudo de futebol limpa.
const SHIELD = "polygon(3% 0, 97% 0, 97% 46%, 88% 68%, 68% 88%, 50% 100%, 32% 88%, 12% 68%, 3% 46%)";
const OGIVAL =
  "polygon(50% 0, 73% 4%, 92% 17%, 100% 39%, 100% 51%, 90% 73%, 68% 92%, 50% 100%, 32% 92%, 10% 73%, 0 51%, 0 39%, 8% 17%, 27% 4%)";
const BANNER = "polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%)";

export function shapeStyle(shape: AvatarShape): CSSProperties {
  switch (shape) {
    case "squircle":
      return { borderRadius: "32%" };
    case "shield":
      return { clipPath: SHIELD };
    case "ogival":
      return { clipPath: OGIVAL };
    case "banner":
      return { clipPath: BANNER };
    case "hexagon":
      return { clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" };
    case "diamond":
      return { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" };
    case "circle":
    default:
      return { borderRadius: "50%" };
  }
}

export type AvatarConfig = { shape: AvatarShape; colors: string[]; rotation: number };

export function buildGenAvatar(shape: AvatarShape, colors: string[], rotation: number): string {
  return `gen:${shape}:${colors.join("-")}:${rotation}`;
}

export function parseGenAvatar(src: string | null | undefined): AvatarConfig | null {
  if (!src || !src.startsWith("gen:")) return null;
  const parts = src.split(":");
  const shape = (parts[1] as AvatarShape) || "circle";
  const colors = (parts[2] || "turquesa").split("-").filter(Boolean);
  const rotation = Number.parseInt(parts[3] ?? "0", 10) || 0;
  return { shape, colors: colors.length ? colors : ["turquesa"], rotation };
}

function hexOf(key: string): string {
  return AVATAR_COLORS.find((c) => c.key === key)?.hex ?? AVATAR_COLORS[0]!.hex;
}

/** background (sólido ou gradiente de divisões) para a config de cores. */
export function avatarBackground(colors: string[], rotation: number): string {
  const c = colors.map(hexOf);
  if (c.length <= 1) return c[0] ?? AVATAR_COLORS[0]!.hex;
  if (c.length === 2) {
    return `linear-gradient(${rotation}deg, ${c[0]} 0 50%, ${c[1]} 50% 100%)`;
  }
  return `linear-gradient(${rotation}deg, ${c[0]} 0 33.34%, ${c[1]} 33.34% 66.67%, ${c[2]} 66.67% 100%)`;
}

/** cor do texto: contraste para 1 cor; branco (com sombra) para multicolor. */
export function avatarTextColor(colors: string[]): string {
  if (colors.length === 1) {
    return AVATAR_COLORS.find((x) => x.key === colors[0])?.dark ? "#232323" : "#ffffff";
  }
  return "#ffffff";
}
