import { type Dispatch, type SetStateAction } from "react";
import { Users, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_JOGADORES } from "../simulator";

/** Simulador hipotético "testar com mais jogadores" — só preview, não altera o
 * sorteio real. Só apresentação. */
export function TestPlayersCard({
  testOpen,
  setTestOpen,
  testN,
  setTestN,
  isLiga,
  testRounds,
  testViavel,
  P,
}: {
  testOpen: boolean;
  setTestOpen: Dispatch<SetStateAction<boolean>>;
  testN: number;
  setTestN: (n: number) => void;
  isLiga: boolean;
  testRounds: number;
  testViavel: boolean;
  P: number;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
      <button
        type="button"
        onClick={() => setTestOpen((v) => !v)}
        aria-expanded={testOpen}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-ink-700"
      >
        <span className="inline-flex items-center gap-2">
          <Users className="size-4 text-brand-600" /> Testar com mais jogadores
        </span>
        <ChevronDown className={cn("size-4 transition-transform", testOpen && "rotate-180")} />
      </button>
      {testOpen && (
        <div className="space-y-2 border-t border-ink-100 px-4 py-3">
          <p className="text-xs text-ink-500">Só simulação — não altera o sorteio real.</p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={2}
              max={MAX_JOGADORES}
              value={testN}
              onChange={(e) => setTestN(Number(e.target.value))}
              className="h-1.5 flex-1 accent-brand-600"
              aria-label="Jogadores no teste"
            />
            <span className="w-16 text-right text-sm font-bold tabular-nums text-ink-900">
              {testN} jog.
            </span>
          </div>
          <p className="text-xs leading-relaxed text-ink-600">
            {isLiga
              ? `Turno completo: ${Math.max(1, testN - 1)} rodadas · ${Math.floor(testN / 2)} confrontos por rodada.`
              : `Mata-mata: ${testRounds} fases (chave de ${1 << testRounds}).`}{" "}
            <span className={testViavel ? "text-grass-700" : "text-flame-600"}>
              {P === 0 ? "" : testViavel ? "Cabe na competição." : `Não cabe nos ${P} períodos.`}
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
