import { cn } from "@/lib/utils";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex gap-1 rounded-pill bg-ink-100 p-1", className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-all",
            value === opt.value
              ? "bg-surface text-ink-950 shadow-[var(--shadow-soft)]"
              : "text-ink-500 hover:text-ink-700",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
