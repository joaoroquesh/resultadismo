import { cn } from "@/lib/utils";
import { ScrollRow } from "@/components/ui/ScrollRow";

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
    <div className={cn("rounded-pill bg-ink-100 p-1", className)}>
      {/* conteúdo rola DENTRO da pílula quando as opções não cabem (mobile com
          muitas abas) — labels não quebram linha nem estouram a página; o
          degradê do ScrollRow (na cor da pílula) avisa que tem mais. */}
      <ScrollRow innerClassName="gap-1" fadeClassName="from-[var(--color-ink-100)]">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            data-value={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "flex-1 whitespace-nowrap rounded-pill px-3 py-1.5 text-sm font-semibold transition-all",
              value === opt.value
                ? "bg-surface text-ink-950 shadow-[var(--shadow-soft)]"
                : "text-ink-500 hover:text-ink-700",
            )}
          >
            {opt.label}
          </button>
        ))}
      </ScrollRow>
    </div>
  );
}
