import { cn } from "@/lib/utils";
import type { ScoreType } from "@/lib/types";
import type { RetroFormat } from "./api";

const COPA_SHORT = ["G1", "G2", "G3", "8ª", "4ª", "SF", "F"];
const PONTOS_SHORT = ["J1", "J2", "J3", "J4", "J5", "J6", "J7"];

const DOT_BY_TYPE: Record<ScoreType, string> = {
  cravada: "bg-gold-500 text-gold-950 border-gold-500",
  saldo: "bg-grass-600 text-white border-grass-600",
  acerto: "bg-aqua-700 text-white border-aqua-700",
  erro: "bg-flame-600 text-white border-flame-600",
};

export type TrailSlot = { slot: number; scoreType: ScoreType | null };

// A trilha da campanha: G1 G2 G3 · 8ª 4ª SF F — colorida pelo que já aconteceu.
export function CampaignTrail({
  slots,
  currentSlot,
  format = "copa",
}: {
  slots: TrailSlot[];
  currentSlot: number | null;
  format?: RetroFormat;
}) {
  // Pontos não tem fases: vira J1..J7 (jogo 1 a 7), sem o divisor do mata-mata.
  const labels = format === "pontos" ? PONTOS_SHORT : COPA_SHORT;
  return (
    <div className="flex items-center justify-center gap-1.5" aria-label="Campanha">
      {labels.map((label, i) => {
        const slot = i + 1;
        const done = slots.find((s) => s.slot === slot)?.scoreType ?? null;
        const isCurrent = currentSlot === slot;
        return (
          <span key={label} className="flex items-center gap-1.5">
            {format === "copa" && slot === 4 && <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />}
            <span
              className={cn(
                "grid size-7 place-items-center rounded-full border text-[10px] font-bold transition-colors",
                done
                  ? DOT_BY_TYPE[done]
                  : isCurrent
                    ? "border-brand-500 bg-brand-500/10 text-brand-700 ring-2 ring-brand-500/30"
                    : "border-border bg-surface text-ink-400",
              )}
            >
              {label}
            </span>
          </span>
        );
      })}
    </div>
  );
}
