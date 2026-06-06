import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = {
  value: string;
  label: string;
  /** texto auxiliar à direita (ex.: contagem) */
  hint?: string;
};

// Select custom (não-nativo): dropdown estilizado, dark-mode, acessível por
// teclado. Substitui <select> nativo em todo o app — nada de UI do SO.
// Para listas grandes + busca, usar <Combobox> (a criar). Este é o seletor
// simples (poucas opções).
export function Select({
  value,
  onChange,
  options,
  placeholder = "Selecionar…",
  ariaLabel,
  disabled,
  className,
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  // Fecha ao clicar fora / Esc.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Ao abrir, ativa a opção selecionada.
  useEffect(() => {
    if (open) setActive(options.findIndex((o) => o.value === value));
  }, [open, value, options]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && active >= 0) {
      e.preventDefault();
      choose(options[active]!.value);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onKeyDown}
        className={cn(
          "flex h-11 w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 text-left text-sm transition-colors",
          "outline-none focus-visible:border-brand-500 focus-visible:ring-2 focus-visible:ring-brand-500/20",
          open ? "border-brand-500 ring-2 ring-brand-500/20" : "border-ink-200 hover:border-ink-300",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className={cn("truncate", selected ? "text-ink-900" : "text-ink-400")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-ink-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          id={listId}
          className="absolute z-50 mt-1.5 max-h-64 w-full overflow-auto rounded-md border border-border bg-surface p-1 shadow-[var(--shadow-pop)]"
        >
          {options.map((o, i) => {
            const isSel = o.value === value;
            return (
              <li key={o.value} role="option" aria-selected={isSel}>
                <button
                  type="button"
                  onClick={() => choose(o.value)}
                  onMouseEnter={() => setActive(i)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded px-2.5 py-2 text-left text-sm transition-colors",
                    i === active ? "bg-brand-500/10 text-ink-950" : "text-ink-700",
                    isSel && "font-semibold text-brand-700",
                  )}
                >
                  <span className="truncate">{o.label}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {o.hint && <span className="text-xs text-ink-400">{o.hint}</span>}
                    {isSel && <Check className="size-4 text-brand-600" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
