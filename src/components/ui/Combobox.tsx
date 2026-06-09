import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ComboOption = {
  value: string;
  label: string;
  /** visual à esquerda (escudo, bandeira) */
  leading?: ReactNode;
  /** texto auxiliar à direita */
  hint?: string;
  /** termo extra pra busca (ex.: país) */
  keywords?: string;
};

// Combobox custom (não-nativo): seletor único COM BUSCA, pra listas grandes
// (times, seleções). Lista rolável, filtro por texto, teclado e dark-mode.
// Para listas curtas, usar <Select>.
export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Selecionar…",
  searchPlaceholder = "Buscar…",
  emptyText = "Nada encontrado.",
  ariaLabel,
  allowClear = false,
  disabled,
  className,
}: {
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  ariaLabel?: string;
  allowClear?: boolean;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.keywords ? o.keywords.toLowerCase().includes(q) : false),
    );
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Foco no campo de busca ao abrir (efeito de DOM puro, sem setState). O reset de
  // query/active ao abrir e ao digitar vive nos handlers (botão e input).
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && filtered[active]) {
      e.preventDefault();
      choose(filtered[active]!.value);
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
        onClick={() => {
          if (disabled) return;
          const next = !open;
          setOpen(next);
          if (next) {
            setQuery("");
            setActive(0);
          }
        }}
        className={cn(
          "flex h-12 w-full items-center justify-between gap-2 rounded-md border bg-surface px-3 text-left text-sm transition-colors",
          open ? "border-brand-500 ring-2 ring-brand-500/20" : "border-ink-200 hover:border-ink-300",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {selected?.leading}
          <span className={cn("truncate", selected ? "font-medium text-ink-900" : "text-ink-400")}>
            {selected?.label ?? placeholder}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1">
          {allowClear && selected && (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="grid size-6 place-items-center rounded text-ink-400 hover:bg-ink-100 hover:text-ink-700"
            >
              <X className="size-3.5" />
            </span>
          )}
          <ChevronDown
            className={cn("size-4 text-ink-400 transition-transform", open && "rotate-180")}
          />
        </span>
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-md border border-border bg-surface shadow-[var(--shadow-pop)]">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-ink-400" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={searchPlaceholder}
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-ink-400"
            />
          </div>
          <ul role="listbox" id={listId} className="max-h-64 overflow-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-6 text-center text-sm text-ink-400">{emptyText}</li>
            ) : (
              filtered.map((o, i) => {
                const isSel = o.value === value;
                return (
                  <li key={o.value} role="option" aria-selected={isSel}>
                    <button
                      type="button"
                      onClick={() => choose(o.value)}
                      onMouseEnter={() => setActive(i)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded px-2.5 py-2 text-left text-sm transition-colors",
                        i === active ? "bg-ink-100 text-ink-950" : "text-ink-700",
                        isSel && "font-semibold",
                      )}
                    >
                      {o.leading}
                      <span className="min-w-0 flex-1 truncate">{o.label}</span>
                      {o.hint && <span className="shrink-0 text-xs text-ink-400">{o.hint}</span>}
                      {isSel && <Check className="size-4 shrink-0 text-brand-600" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
