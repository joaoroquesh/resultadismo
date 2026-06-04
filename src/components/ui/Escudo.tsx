import { cn } from "@/lib/utils";
import { isCrest } from "@/lib/crest";
import {
  parseGenAvatar,
  shapeStyle,
  avatarBackground,
  avatarTextColor,
} from "@/lib/avatar";
import { CrestMask } from "./CrestMask";

// Flâmula do grupo: recorta cores/listras/grade/bola pela máscara do SVG.
// Sem letra (grupos são só cores). Mantém compat com logos antigas (gen:)
// e com URL crua (upload futuro).

type Size = "sm" | "md" | "lg" | "xl";
const px: Record<Size, number> = { sm: 32, md: 48, lg: 64, xl: 96 };
const cls: Record<Size, string> = {
  sm: "size-8",
  md: "size-12",
  lg: "size-16",
  xl: "size-24",
};

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
  // Novo sistema (flâmula recortando cores) — e null → flâmula padrão do nome.
  if (isCrest(src) || !src) {
    return (
      <CrestMask
        src={src}
        name={name}
        px={px[size]}
        defaultKind="flamula"
        className={className}
      />
    );
  }

  // Legado: logo gerada por clip-path (gen:forma:cores:rotação)
  const gen = parseGenAvatar(src);
  if (gen) {
    const multi = gen.colors.length > 1;
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center font-extrabold tracking-tight",
          cls[size],
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
        {(name?.trim()?.[0] ?? "F").toUpperCase()}
      </span>
    );
  }

  // Legado: imagem crua
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md ring-1 ring-border",
        cls[size],
        className,
      )}
    >
      <img src={src} alt={name ?? ""} className="size-full object-cover" />
    </span>
  );
}
