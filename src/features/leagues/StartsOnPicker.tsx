import { CalendarClock } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { clampDate, fmtDM, todayLocal } from "./startsOn";

/**
 * Seletor da data em que a pontuação do bolão começa a contar. Limitado ao
 * período da competição [min, max] (em BRT) e com atalhos pro início da Copa e
 * pra hoje. Presentacional: o pai controla value/onChange e passa os limites.
 */
export function StartsOnPicker({
  value,
  onChange,
  min,
  max,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  min?: string | null;
  max?: string | null;
  disabled?: boolean;
}) {
  const today = clampDate(todayLocal(), min, max);
  return (
    <div className="space-y-2">
      <Input
        type="date"
        aria-label="Data de início da pontuação"
        icon={<CalendarClock className="size-4" />}
        value={value}
        min={min ?? undefined}
        max={max ?? undefined}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      {min && max && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(min)}
            className="rounded-pill border border-ink-200 px-3 py-1 text-xs font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-50"
          >
            Desde o início da Copa ({fmtDM(min)})
          </button>
          <button
            type="button"
            disabled={disabled || value === today}
            onClick={() => onChange(today)}
            className="rounded-pill border border-ink-200 px-3 py-1 text-xs font-semibold text-ink-600 transition hover:bg-ink-50 disabled:opacity-50"
          >
            A partir de hoje
          </button>
        </div>
      )}
    </div>
  );
}
