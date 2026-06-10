import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Maior número EM CIMA: rolar a coluna PARA CIMA = mais gols (pedido do PO).
const VALUES = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];
const ITEM_H = 56;

// Roleta de placar estilo placar de estádio: rolagem grande, dois polegares, sem
// teclado nativo. Já começa em 0×0 — palpite válido desde o primeiro segundo.
function Wheel({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = VALUES.indexOf(value);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const want = (idx < 0 ? VALUES.length - 1 : idx) * ITEM_H;
    if (Math.abs(el.scrollTop - want) > 2) el.scrollTo({ top: want });
  }, [idx]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.max(0, Math.min(VALUES.length - 1, Math.round(el.scrollTop / ITEM_H)));
    if (VALUES[i] !== value) onChange(VALUES[i]);
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-[56px] -translate-y-1/2 rounded-md border-2 border-gold-500"
        />
        <div
          ref={ref}
          onScroll={onScroll}
          role="listbox"
          aria-label={`Gols: ${label}`}
          className="no-scrollbar h-[168px] w-[88px] snap-y snap-mandatory overflow-y-scroll overscroll-contain rounded-lg bg-ink-950 py-[56px] shadow-soft"
        >
          {VALUES.map((v) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={v === value}
              onClick={() => onChange(v)}
              className={cn(
                "flex h-[56px] w-full snap-center items-center justify-center text-4xl font-bold tabular-nums transition-colors",
                v === value ? "text-gold-400" : "text-ink-500",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
      <span className="max-w-[88px] truncate text-[11px] font-semibold text-ink-500">{label}</span>
    </div>
  );
}

export function ScoreWheels({
  home,
  away,
  homeLabel,
  awayLabel,
  onHome,
  onAway,
}: {
  home: number;
  away: number;
  homeLabel: string;
  awayLabel: string;
  onHome: (v: number) => void;
  onAway: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <Wheel value={home} onChange={onHome} label={homeLabel} />
      <span className="pb-5 text-2xl font-bold text-ink-400">×</span>
      <Wheel value={away} onChange={onAway} label={awayLabel} />
    </div>
  );
}
