import { ArrowRight } from "lucide-react";
import type { DrawTie } from "../build";

/** Prévia do sorteio — exatamente o que será criado (rodada 1 + resumo). Só
 * apresentação; os confrontos vêm prontos do SorteioPanel. */
export function DrawPreviewCard({
  previewRound1,
  isLiga,
  previewRoundsCount,
  previewByes,
  nameOf,
  isSwiss,
  P,
  fullTurno,
  bracketFases,
}: {
  previewRound1: DrawTie[];
  isLiga: boolean;
  previewRoundsCount: number;
  previewByes: number;
  nameOf: (id: string | null) => string;
  isSwiss: boolean;
  P: number;
  fullTurno: number;
  bracketFases: string[];
}) {
  if (previewRound1.length === 0) return null;

  return (
    <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-800">Prévia do sorteio</p>
        <span className="text-xs text-ink-400">
          {isLiga
            ? `${previewRoundsCount} ${previewRoundsCount === 1 ? "rodada" : "rodadas"}`
            : `chave de ${1 << previewRoundsCount}${previewByes ? ` · ${previewByes} bye${previewByes > 1 ? "s" : ""}` : ""}`}
        </span>
      </div>

      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-600">
        {isLiga ? "Rodada 1" : (previewRound1[0]?.round_label ?? "1ª fase")}
      </p>
      <ul className="space-y-1">
        {previewRound1.map((t) => (
          <li
            key={`${t.round_order}-${t.slot}`}
            className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-right font-semibold text-ink-900">
              {nameOf(t.member_a)}
            </span>
            {t.member_b === null ? (
              <span className="shrink-0 rounded-pill bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                passa (bye)
              </span>
            ) : (
              <span className="shrink-0 text-xs font-bold text-ink-300">×</span>
            )}
            <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">
              {t.member_b === null ? "" : nameOf(t.member_b)}
            </span>
          </li>
        ))}
      </ul>

      {isSwiss && (
        <p className="mt-2 text-xs text-ink-400">
          Suíço: sorteamos só a 1ª rodada. As próximas saem por classificação a cada fase (até{" "}
          {Math.min(P, fullTurno)} rodadas), sem revanche.
        </p>
      )}
      {isLiga && !isSwiss && previewRoundsCount > 1 && (
        <p className="mt-2 text-xs text-ink-400">
          + {previewRoundsCount - 1} {previewRoundsCount - 1 === 1 ? "rodada" : "rodadas"} com outros
          adversários (cada um joga {previewRoundsCount} confrontos).
        </p>
      )}
      {!isLiga && bracketFases.length > 1 && (
        <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-ink-400">
          {bracketFases.map((f, i) => (
            <span key={f} className="inline-flex items-center gap-1">
              {i > 0 && <ArrowRight className="size-3 text-ink-300" />}
              {f}
            </span>
          ))}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
        A ordem dos confrontos é sorteada. É exatamente o confronto que será criado.
      </p>
    </div>
  );
}
