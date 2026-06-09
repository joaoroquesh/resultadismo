import { Check, TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LigaFmt } from "../build";

/** Formato (Liga × Copa) + viabilidade na competição. Na Liga, deixa escolher
 * Turno / Ida e volta / Suíço (marcando o que não cabe). Só apresentação. */
export function FormatViabilityCard({
  Icon,
  isLiga,
  n,
  realRounds,
  viavel,
  P,
  loadingPeriods,
  turnoCabe,
  returnoCabe,
  ligaFmt,
  setLigaFmt,
  fullTurno,
  confrontosPorRodada,
}: {
  Icon: LucideIcon;
  isLiga: boolean;
  n: number;
  realRounds: number;
  viavel: boolean;
  P: number;
  loadingPeriods: boolean;
  turnoCabe: boolean;
  returnoCabe: boolean;
  ligaFmt: LigaFmt;
  setLigaFmt: (f: LigaFmt) => void;
  fullTurno: number;
  confrontosPorRodada: number;
}) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-md bg-surface-2 text-brand-600">
          <Icon className="size-5" strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-ink-950">
            {isLiga ? "Liga (todos contra todos)" : "Copa (mata-mata)"}
          </p>
          <p className="text-sm text-ink-500">
            {n} {n === 1 ? "jogador" : "jogadores"} · {realRounds}{" "}
            {realRounds === 1 ? "rodada" : "rodadas"}
            {!isLiga && " · mata-mata"}
          </p>
        </div>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold",
            viavel ? "bg-grass-600 text-white" : "bg-flame-600 text-white",
          )}
        >
          {viavel ? <Check className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
          {viavel ? "Cabe na competição" : "Não cabe"}
        </span>
      </div>

      {/* Formato da Liga: Turno / Turno e Returno / Suíço (escolhido aqui) */}
      {isLiga && P > 0 && (
        <div className="mt-4 border-t border-ink-100 pt-3">
          <p className="mb-2 text-sm font-semibold text-ink-800">Formato da Liga</p>
          <div className="flex gap-1 rounded-pill bg-ink-100 p-1">
            {(
              [
                { v: "turno", label: "Turno", ok: turnoCabe },
                { v: "returno", label: "Ida e volta", ok: returnoCabe },
                { v: "swiss", label: "Suíço", ok: true },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setLigaFmt(o.v)}
                title={!o.ok ? "Não cabe nos períodos da competição" : undefined}
                className={cn(
                  "flex-1 rounded-pill px-2 py-1.5 text-xs font-semibold transition-colors",
                  ligaFmt === o.v
                    ? "bg-surface text-brand-700 shadow-[var(--shadow-soft)]"
                    : o.ok
                      ? "text-ink-500"
                      : "text-ink-400",
                )}
              >
                {o.label}
                {!o.ok && <TriangleAlert className="ml-1 inline size-3 text-flame-500" />}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            {ligaFmt === "turno"
              ? `Todos contra todos uma vez (${fullTurno} ${fullTurno === 1 ? "rodada" : "rodadas"}).`
              : ligaFmt === "returno"
                ? `Todos contra todos, ida e volta (${2 * fullTurno} rodadas).`
                : `Cada rodada sai por classificação a cada fase, sem revanche (até ${Math.min(P, fullTurno)} rodadas).`}{" "}
            {confrontosPorRodada} por rodada · {P} {P === 1 ? "período" : "períodos"} disponíveis.
          </p>
        </div>
      )}

      {!viavel && P > 0 && (
        <p className="mt-3 rounded-md border-l-2 border-flame-600 bg-surface-2 px-3 py-2 text-xs leading-relaxed text-flame-700">
          {isLiga
            ? `Reduza as rodadas — a competição só tem ${P} períodos.`
            : `A Copa precisa de ${realRounds} fases e a competição só tem ${P} períodos. Use uma competição com mais rodadas.`}
        </p>
      )}
      {P === 0 && !loadingPeriods && (
        <p className="mt-3 rounded-md border-l-2 border-brand-600 bg-surface-2 px-3 py-2 text-xs text-brand-700">
          A competição ainda não tem rodadas (matchdays) para o sorteio.
        </p>
      )}
    </div>
  );
}
