import { cn } from "@/lib/utils";

/**
 * Toggle on/off acessível — o ÚNICO primitivo de switch do projeto; use sempre
 * este (evita a divergência de toggles hand-rolled). Posicionamento à prova de
 * falha com `inline-flex items-center` + classes padrão `translate-x-*` (nada de
 * `absolute`/translate arbitrário, que já causou o bug do thumb que não animava).
 */
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        "disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-ink-300",
      )}
    >
      <span
        className={cn(
          "size-5 rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </button>
  );
}
