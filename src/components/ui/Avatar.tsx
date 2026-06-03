import { useState } from "react";
import { cn, initials } from "@/lib/utils";
import { parseGenAvatar, shapeStyle, avatarBackground, avatarTextColor } from "@/lib/avatar";
import { isCrest } from "@/lib/crest";
import { CrestMask } from "./CrestMask";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

// px + classe de fonte da inicial por tamanho
const sizes: Record<Size, { px: number; text: string; cls: string }> = {
  xs: { px: 24, text: "text-[10px]", cls: "size-6 text-[10px]" },
  sm: { px: 32, text: "text-xs", cls: "size-8 text-xs" },
  md: { px: 40, text: "text-sm", cls: "size-10 text-sm" },
  lg: { px: 56, text: "text-lg", cls: "size-14 text-lg" },
  xl: { px: 80, text: "text-2xl", cls: "size-20 text-2xl" },
};

export function Avatar({
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
  const s = sizes[size];

  // Novo sistema: escudo recortando cores/foto (e null → escudo padrão do nome).
  if (isCrest(src) || !src) {
    return (
      <CrestMask
        src={src}
        name={name}
        px={s.px}
        defaultKind="escudo"
        withLetter
        className={className}
      />
    );
  }

  // Legado: avatar gerado por clip-path (gen:forma:cores:rotação)
  const gen = parseGenAvatar(src);
  if (gen) {
    const multi = gen.colors.length > 1;
    const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center font-bold", s.cls, className)}
        style={{
          background: avatarBackground(gen.colors, gen.rotation),
          color: avatarTextColor(gen.colors),
          textShadow: multi ? "0 1px 2px rgba(0,0,0,0.35)" : undefined,
          ...shapeStyle(gen.shape),
        }}
      >
        {initial}
      </span>
    );
  }

  // Legado: foto crua (URL do Google salva direto)
  const showImg = src && !errored;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-bold text-brand-800 ring-1 ring-border",
        s.cls,
        className,
      )}
    >
      {showImg ? (
        <img
          src={src}
          alt={name ?? ""}
          className="size-full object-cover"
          onError={() => setErrored(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}
