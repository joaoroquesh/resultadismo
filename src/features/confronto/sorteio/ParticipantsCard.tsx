import { cn } from "@/lib/utils";
import type { DrawPlayer } from "./types";

/** Participantes da disputa: lista de inscritos (opt-in), seleção do admin, ou
 * resumo (membro comum). Em Copa, admin pode fechar o mata-mata num limite de vagas.
 * Só apresentação — toda a regra vive no SorteioPanel. */
export function ParticipantsCard({
  isOptin,
  optedSet,
  allPlayers,
  isAdmin,
  sel,
  setSelected,
  playersLen,
  isLiga,
  cap,
  setCap,
}: {
  isOptin: boolean;
  optedSet: Set<string>;
  allPlayers: DrawPlayer[];
  isAdmin: boolean;
  sel: Record<string, boolean>;
  setSelected: (v: Record<string, boolean>) => void;
  playersLen: number;
  isLiga: boolean;
  cap: number | null;
  setCap: (n: number | null) => void;
}) {
  return (
    <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-800">{isOptin ? "Inscritos" : "Participantes"}</p>
        <span className="text-xs text-ink-400">
          {playersLen} de {allPlayers.length}
        </span>
      </div>

      {isOptin ? (
        optedSet.size === 0 ? (
          <p className="text-xs leading-relaxed text-ink-500">
            Ninguém se inscreveu ainda. Cada membro confirma com “Quero jogar”.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {allPlayers
              .filter((p) => optedSet.has(p.id))
              .map((p) => (
                <li
                  key={p.id}
                  className="rounded-pill bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700"
                >
                  {p.name}
                </li>
              ))}
          </ul>
        )
      ) : isAdmin ? (
        <>
          <div className="mb-2 flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => setSelected(Object.fromEntries(allPlayers.map((p) => [p.id, true])))}
              className="font-semibold text-brand-600"
            >
              Todos
            </button>
            <span className="text-ink-300">·</span>
            <button
              type="button"
              onClick={() => setSelected(Object.fromEntries(allPlayers.map((p) => [p.id, false])))}
              className="font-semibold text-ink-500"
            >
              Limpar
            </button>
          </div>
          <ul className="no-scrollbar max-h-44 space-y-0.5 overflow-y-auto">
            {allPlayers.map((p) => (
              <li key={p.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-ink-50">
                  <input
                    type="checkbox"
                    checked={!!sel[p.id]}
                    onChange={(e) => setSelected({ ...sel, [p.id]: e.target.checked })}
                    className="size-4 accent-brand-600"
                  />
                  <span className="min-w-0 truncate text-ink-800">{p.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-xs text-ink-500">
          {playersLen} {playersLen === 1 ? "jogador entra" : "jogadores entram"} nesta disputa.
        </p>
      )}

      {/* Limite de vagas (Copa: fechar potência de 2) */}
      {!isLiga && isAdmin && allPlayers.length > 2 && (
        <div className="mt-3 border-t border-ink-100 pt-3">
          <p className="mb-1.5 text-xs font-medium text-ink-700">Fechar mata-mata (limite de vagas)</p>
          <div className="flex flex-wrap gap-1.5">
            {[4, 8, 16, 32]
              .filter((s) => s <= allPlayers.length)
              .map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCap(s)}
                  className={cn(
                    "rounded-pill px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                    cap === s ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                  )}
                >
                  {s}
                </button>
              ))}
            <button
              type="button"
              onClick={() => setCap(null)}
              className={cn(
                "rounded-pill px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                cap === null ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
              )}
            >
              sem limite
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
