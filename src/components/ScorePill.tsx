import { Zap } from "lucide-react";
import type { ScoreType } from "@/lib/types";
import { SCORE_POINTS, SCORE_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<ScoreType, string> = {
  cravada: "bg-gold-500 text-gold-950",
  saldo: "bg-grass-600 text-white",
  acerto: "bg-aqua-700 text-white",
  erro: "bg-ink-200 text-ink-500",
};

/** Selo +3/+2/+1 colorido pelo tipo de acerto. `doubled` aplica o Joker (2×).
 * `showZap=false` esconde o raio interno (quando já há um ⚡ 2× ao lado). */
export function ScorePill({
  type,
  withLabel = false,
  doubled = false,
  showZap = true,
  className,
}: {
  type: ScoreType;
  withLabel?: boolean;
  doubled?: boolean;
  showZap?: boolean;
  className?: string;
}) {
  const pts = SCORE_POINTS[type] * (doubled ? 2 : 1);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-bold tabular-nums",
        styles[type],
        className,
      )}
    >
      {type === "erro" ? "0" : `+${pts}`}
      {withLabel && <span className="font-semibold">{SCORE_LABEL[type]}</span>}
      {showZap && doubled && type !== "erro" && <Zap className="size-3 fill-current" />}
    </span>
  );
}
