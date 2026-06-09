import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/Skeleton";

type PeriodRow = { period_index: number; label: string; games: number };

/** Forma das rodadas: por fase (grupos+mata-mata) ou por semana, com a lista de
 * períodos da competição e quantos jogos cada um tem. Só apresentação. */
export function RoundsShapeCard({
  kind,
  setKind,
  loadingPeriods,
  periods,
  P,
}: {
  kind: "phase" | "week";
  setKind: (k: "phase" | "week") => void;
  loadingPeriods: boolean;
  periods: PeriodRow[] | undefined;
  P: number;
}) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-800">Forma das rodadas</p>
        <div className="inline-flex rounded-pill bg-ink-100 p-0.5 text-xs font-semibold">
          {(["phase", "week"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={cn(
                "rounded-pill px-2.5 py-1 transition-colors",
                kind === k ? "bg-surface text-brand-700 shadow-[var(--shadow-soft)]" : "text-ink-500",
              )}
            >
              {k === "phase" ? "Por fase" : "Por semana"}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed text-ink-500">
        {kind === "phase"
          ? "Cada fase do campeonato (grupos + mata-mata) é uma rodada de confronto."
          : "Cada semana do calendário é uma rodada de confronto."}
      </p>
      {loadingPeriods ? (
        <Skeleton className="mt-3 h-16 w-full" />
      ) : P > 0 ? (
        <ul className="no-scrollbar mt-3 max-h-44 space-y-1 overflow-y-auto">
          {periods!.map((p) => (
            <li
              key={p.period_index}
              className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs"
            >
              <span className="min-w-0 truncate font-medium text-ink-700">
                {p.period_index}. {p.label}
              </span>
              <span className="shrink-0 tabular-nums text-ink-400">
                {p.games} {p.games === 1 ? "jogo" : "jogos"}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
