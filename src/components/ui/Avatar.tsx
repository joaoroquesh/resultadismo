import { useState } from "react";
import { cn, initials } from "@/lib/utils";
import { parseGenAvatar, shapeStyle, avatarBackground, avatarTextColor } from "@/lib/avatar";

type Size = "xs" | "sm" | "md" | "lg" | "xl";

const sizes: Record<Size, string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
  xl: "size-20 text-2xl",
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
  const gen = parseGenAvatar(src);

  // Avatar gerado (forma + cores + inicial)
  if (gen) {
    const multi = gen.colors.length > 1;
    const initial = (name?.trim()?.[0] ?? "?").toUpperCase();
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center font-bold", sizes[size], className)}
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

  const showImg = src && !errored;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-100 font-bold text-brand-800 ring-1 ring-border",
        sizes[size],
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
