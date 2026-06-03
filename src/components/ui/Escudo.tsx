import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  AVATAR_COLORS,
  avatarBackground,
  avatarTextColor,
  buildGenAvatar,
  parseGenAvatar,
  shapeStyle,
  type AvatarShape,
} from "@/lib/avatar";

// Tamanhos pensados pra escudo (mais "presença" que o avatar do jogador).
type Size = "sm" | "md" | "lg" | "xl";
const sizes: Record<Size, string> = {
  sm: "size-8 text-[10px]",
  md: "size-12 text-sm",
  lg: "size-16 text-base",
  xl: "size-24 text-lg",
};

// Estilos de escudo (corresponde ao que o usuário pediu: clássico/ogival/bandeira).
export const ESCUDO_SHAPES: { key: AvatarShape; label: string }[] = [
  { key: "shield", label: "Clássico" },
  { key: "ogival", label: "Ogival" },
  { key: "banner", label: "Bandeira" },
];

// Hash determinístico (djb2) — gera defaults estáveis a partir do nome.
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return Math.abs(h | 0);
}

/** Iniciais de até 2 letras (estilo escudo de clube): "Amigos Daqui" → "AD". */
export function crestInitials(name: string | null | undefined): string {
  if (!name) return "F";
  const words = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => !/^(de|da|do|das|dos|e|of|the|fc|sc|ec|cf)$/i.test(w));
  if (!words.length) return name[0]!.toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return (words[0]![0]! + words[1]![0]!).toUpperCase();
}

/** Default determinístico a partir do nome: shield + 2 cores estáveis. */
export function defaultEscudoFromName(name: string | null | undefined): string {
  const h = hashStr(name ?? "Federação");
  const c1 = AVATAR_COLORS[h % AVATAR_COLORS.length]!.key;
  const c2 = AVATAR_COLORS[(h >> 3) % AVATAR_COLORS.length]!.key;
  const colors = c1 === c2 ? [c1] : [c1, c2];
  const rot = [0, 45, 90, 135][h % 4]!;
  return buildGenAvatar("shield", colors, rot);
}

export function Escudo({
  src,
  name,
  size = "md",
  className,
}: {
  src?: string | null;
  name?: string | null;
  size?: Size;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  // Sem escudo salvo → usa o default determinístico. Liga nunca aparece "vazia".
  const effective = src ?? defaultEscudoFromName(name);
  const gen = parseGenAvatar(effective);

  if (gen) {
    const multi = gen.colors.length > 1;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center font-extrabold tracking-tight",
          sizes[size],
          className,
        )}
        style={{
          background: avatarBackground(gen.colors, gen.rotation),
          color: avatarTextColor(gen.colors),
          textShadow: multi ? "0 1px 2px rgba(0,0,0,0.35)" : undefined,
          ...shapeStyle(gen.shape),
        }}
        aria-label={name ?? "Escudo"}
      >
        {crestInitials(name)}
      </span>
    );
  }

  // URL custom (upload futuro): exibe como imagem, com fallback pro default.
  if (src && !errored) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden ring-1 ring-border",
          sizes[size],
          className,
        )}
        style={shapeStyle("shield")}
      >
        <img
          src={src}
          alt={name ?? ""}
          className="size-full object-cover"
          onError={() => setErrored(true)}
        />
      </span>
    );
  }

  // Fallback final (não deveria chegar aqui, mas garante).
  return (
    <Escudo src={defaultEscudoFromName(name)} name={name} size={size} className={className} />
  );
}
