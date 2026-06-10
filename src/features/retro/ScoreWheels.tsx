import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const VALUES: (number | null)[] = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const ITEM_H = 56;

// Roleta de placar (pedido do PO, D5): coluna com ROLAGEM, bem grande, na parte de
// baixo da tela — dois polegares, sem teclado nativo. "–" no topo = ainda sem palpite
// (precedente do stepper do jogo principal: sem toque, sem palpite).
function Wheel({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idx = VALUES.indexOf(value);

  // mantém a roda alinhada quando o valor muda por fora (reset entre jogos)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const want = (idx < 0 ? 0 : idx) * ITEM_H;
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
        {/* janela de seleção */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-[56px] -translate-y-1/2 rounded-md border-2 border-brand-500 bg-brand-500/5"
        />
        <div
          ref={ref}
          onScroll={onScroll}
          role="listbox"
          aria-label={`Gols: ${label}`}
          className="no-scrollbar h-[168px] w-[88px] snap-y snap-mandatory overflow-y-scroll overscroll-contain rounded-lg border border-border bg-surface py-[56px]"
        >
          {VALUES.map((v) => (
            <button
              key={String(v)}
              type="button"
              role="option"
              aria-selected={v === value}
              onClick={() => onChange(v)}
              className={cn(
                "flex h-[56px] w-full snap-center items-center justify-center text-3xl font-bold tabular-nums transition-colors",
                v === value ? "text-ink-900" : "text-ink-300",
              )}
            >
              {v ?? "–"}
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
  home: number | null;
  away: number | null;
  homeLabel: string;
  awayLabel: string;
  onHome: (v: number | null) => void;
  onAway: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-4">
      <Wheel value={home} onChange={onHome} label={homeLabel} />
      <span className="pb-5 text-2xl font-bold text-ink-400">×</span>
      <Wheel value={away} onChange={onAway} label={awayLabel} />
    </div>
  );
}
