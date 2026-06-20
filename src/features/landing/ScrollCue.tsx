import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Convite de rolagem da home pública. Sutil (deriva, sem bounce — DESIGN.md),
 * clicável e acessível: leva o visitante às seções de "venda" abaixo da dobra.
 */
export function ScrollCue({
  label = "Conheça o Resultadismo",
  onClick,
  className,
}: {
  label?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${label}: rolar para ver mais`}
      className={cn(
        "group flex flex-col items-center gap-1.5 rounded-pill px-4 py-1.5 text-ink-400 transition-colors hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50",
        className,
      )}
    >
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">{label}</span>
      <span className="grid size-9 place-items-center rounded-full bg-surface text-brand-600 shadow-[var(--shadow-soft)] ring-1 ring-border transition-all duration-200 [transition-timing-function:var(--ease-out-quart)] group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-pop)] group-hover:ring-brand-300">
        <ChevronDown className="size-4 animate-scroll-cue" strokeWidth={2.5} />
      </span>
    </button>
  );
}
