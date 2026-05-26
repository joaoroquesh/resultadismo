import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Team } from "@/lib/types";

export function TeamCrest({
  team,
  name,
  src,
  size = 32,
  className,
}: {
  team?: Team | null;
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  const url = src ?? team?.local_crest ?? team?.crest_url ?? null;
  const label = name ?? team?.short_name ?? team?.name ?? "";

  if (!url || errored) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center rounded-full bg-ink-100 font-bold text-ink-400",
          className,
        )}
        style={{ width: size, height: size, fontSize: size * 0.36 }}
      >
        {label.slice(0, 3).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      src={url}
      alt={label}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setErrored(true)}
      className={cn("inline-block object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
