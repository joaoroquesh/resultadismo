import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "brand" | "gold" | "grass" | "aqua" | "flame" | "outline";

const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700",
  brand: "bg-brand-600 text-white",
  gold: "bg-gold-500 text-gold-950",
  grass: "bg-grass-600 text-white",
  aqua: "bg-aqua-700 text-white",
  flame: "bg-flame-600 text-white",
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
