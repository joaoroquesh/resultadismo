import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Team } from "@/lib/types";
import { teamCrestPath } from "@/lib/teamCrests";

/**
 * Escudo do time com cadeia de fallback (decisão #2): escudo VERSIONADO no repo
 * (public/teams, via CDN da Vercel, custo zero no Supabase) é a fonte primária;
 * depois o local_crest explícito, depois o crest_url externo do provedor, e por
 * fim as iniciais. Cada URL que falha avança pra próxima (onError).
 */
export function TeamCrest({
  team,
  name,
  src,
  size = 32,
  className,
  eager = false,
}: {
  team?: Team | null;
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
  /** true nos cards de jogo (acima da dobra): carrega já, sem lazy. */
  eager?: boolean;
}) {
  const label = name ?? team?.short_name ?? team?.name ?? "";

  const candidates = useMemo(() => {
    const repo = teamCrestPath(team?.short_name, team?.name, name);
    return [src, team?.local_crest, repo, team?.crest_url].filter(
      (u): u is string => !!u,
    );
  }, [src, team?.local_crest, team?.crest_url, team?.short_name, team?.name, name]);

  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const url = candidates.find((c) => !failed.has(c)) ?? null;

  if (!url) {
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
      key={url}
      src={url}
      alt={label}
      width={size}
      height={size}
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailed((prev) => new Set(prev).add(url))}
      className={cn("inline-block object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}
