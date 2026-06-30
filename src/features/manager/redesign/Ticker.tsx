// Transmissão (feed do boleiro). Consome eventos já com .text do buildticker
// (concordância de gênero feita na narração). Ícone por tipo de evento em SVG
// inline (nada de emoji) e tom de cor pelo sistema do Resultadismo. Mesma altura
// do painel de estatísticas (as duas abas empatam em altura).
import type { MatchEvent, EventKind } from "./sim.ts";
import { BallIcon, GoalNetIcon, WhistleIcon, FlagIcon, CardIcon, ShieldIcon, DotIcon } from "./icons";

function toneClass(kind: EventKind): string {
  switch (kind) {
    case "gol":
      return "font-extrabold text-grass-700";
    case "grande_chance":
      return "font-bold text-brand-700";
    case "defesa":
      return "text-aqua-700";
    case "finaliza_fora":
      return "text-ink-600";
    case "falta":
      return "text-flame-700";
    case "inicio":
    case "intervalo":
    case "fim":
      return "font-semibold text-ink-500";
    default:
      return "text-ink-800";
  }
}

function EventIcon({ kind }: { kind: EventKind }) {
  const common = "shrink-0";
  switch (kind) {
    case "gol":
      return <BallIcon size={15} className={common} color="var(--color-grass-600)" />;
    case "grande_chance":
      return <FlagIcon size={15} className={`${common} text-brand-600`} />;
    case "defesa":
      return <ShieldIcon size={15} className={`${common} text-aqua-700`} />;
    case "finaliza_fora":
      return <GoalNetIcon size={15} className={`${common} text-ink-500`} />;
    case "escanteio":
      return <FlagIcon size={15} className={`${common} text-ink-500`} />;
    case "falta":
      return <CardIcon size={14} className={`${common} text-flame-600`} />;
    case "inicio":
    case "fim":
    case "intervalo":
      return <WhistleIcon size={15} className={`${common} text-ink-500`} />;
    default:
      return <DotIcon size={10} className={`${common} text-ink-400`} />;
  }
}

export function Ticker({
  events,
  emptyHint = "A transmissão começa quando a bola rolar.",
}: {
  events: MatchEvent[];
  emptyHint?: string;
}) {
  // mais recente no topo
  const lines = events.slice().reverse();
  return (
    <div
      aria-live="polite"
      aria-label="Narração da partida"
      className="flex h-64 flex-col overflow-y-auto rounded-[14px] border border-border bg-surface px-1.5 py-1 text-[13px]"
    >
      {lines.length === 0 ? (
        <div className="flex flex-1 items-center justify-center px-4 text-center text-[12.5px] text-ink-500">{emptyHint}</div>
      ) : (
        lines.map((l, i) => (
          <div
            key={`${l.minute}-${l.kind}-${i}`}
            className={`flex items-start gap-2 border-b border-border px-1.5 py-1.5 last:border-b-0 ${toneClass(l.kind)}`}
          >
            <span className="mt-px flex shrink-0 items-center">
              <EventIcon kind={l.kind} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="mr-1.5 font-mono text-[11px] font-bold tabular-nums text-ink-400">{l.minute}'</span>
              {l.text}
            </span>
          </div>
        ))
      )}
    </div>
  );
}
