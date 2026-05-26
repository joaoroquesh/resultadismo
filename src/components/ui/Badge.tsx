import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "gold" | "grass" | "aqua" | "flame" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  brand: "bg-brand-100 text-brand-800",
  gold: "bg-gold-100 text-gold-800",
  grass: "bg-grass-100 text-grass-800",
  aqua: "bg-aqua-100 text-aqua-800",
  flame: "bg-flame-100 text-flame-700",
  outline: "border border-ink-200 text-ink-600",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-semibold",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
