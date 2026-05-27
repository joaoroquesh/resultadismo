// Avatar gerado: forma geométrica + cor + inicial do nome.
// Codificado no campo avatar_url como "gen:<forma>:<cor>" — assim funciona em
// qualquer lugar que já renderiza o avatar pela url, sem mudança de schema.
import type { CSSProperties } from "react";

export type AvatarShape = "circle" | "squircle" | "shield" | "hexagon" | "diamond";

export const AVATAR_SHAPES: { key: AvatarShape; label: string }[] = [
  { key: "circle", label: "Círculo" },
  { key: "squircle", label: "Quadrado" },
  { key: "shield", label: "Escudo" },
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

export function shapeStyle(shape: AvatarShape): CSSProperties {
  switch (shape) {
    case "squircle":
      return { borderRadius: "32%" };
    case "shield":
      return { clipPath: "polygon(0% 0%, 100% 0%, 100% 62%, 50% 100%, 0% 62%)" };
    case "hexagon":
      return { clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)" };
    case "diamond":
      return { clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)" };
    case "circle":
    default:
      return { borderRadius: "50%" };
  }
}

export function buildGenAvatar(shape: AvatarShape, color: string): string {
  return `gen:${shape}:${color}`;
}

export function parseGenAvatar(
  src: string | null | undefined,
): { shape: AvatarShape; color: string } | null {
  if (!src || !src.startsWith("gen:")) return null;
  const [, shape, color] = src.split(":");
  return { shape: (shape as AvatarShape) ?? "circle", color: color ?? "turquesa" };
}

export function avatarColorHex(colorKey: string): { bg: string; text: string } {
  const c = AVATAR_COLORS.find((x) => x.key === colorKey) ?? AVATAR_COLORS[0]!;
  return { bg: c.hex, text: c.dark ? "#232323" : "#ffffff" };
}
