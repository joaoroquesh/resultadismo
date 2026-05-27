import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirstSeen } from "@/lib/useFirstSeen";

type Placement = "top" | "bottom";

/**
 * Dica de primeiro acesso (coachmark) que ancora num elemento-filho.
 *
 * Mostra um balão sobre/abaixo do conteúdo apenas na 1ª vez (controlado por
 * `storageKey` no localStorage — sem banco). Dispensável pelo X, pelo botão
 * "Entendi" ou tocando fora. Não altera o layout do filho.
 */
export function Coachmark({
  storageKey,
  title,
  content,
  children,
  placement = "bottom",
  align = "center",
  className,
  bubbleClassName,
  defaultOpen,
}: {
  storageKey: string;
  title?: string;
  /** Texto/markup da dica exibido no balão. */
  content?: ReactNode;
  children: ReactNode;
  placement?: Placement;
  align?: "start" | "center" | "end";
  className?: string;
  bubbleClassName?: string;
  /** Força aberto (ignora o storage) — útil para depurar. */
  defaultOpen?: boolean;
}) {
  const [pending, markSeen] = useFirstSeen(storageKey);
  const open = defaultOpen ?? pending;
  const ref = useRef<HTMLDivElement>(null);

  // fecha ao tocar/clicar fora do alvo ou via Esc
  useEffect(() => {
    if (!open) return;
    function onPointer(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) markSeen();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") markSeen();
    }
    // adia 1 tick p/ não capturar o mesmo clique que montou o balão
    const t = setTimeout(() => {
      document.addEventListener("pointerdown", onPointer, true);
      document.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, markSeen]);

  const isTop = placement === "top";
  const alignClass =
    align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  const caretAlign =
    align === "start" ? "left-5" : align === "end" ? "right-5" : "left-1/2 -translate-x-1/2";

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* anel pulsante de destaque, atrás do conteúdo */}
      {open && (
        <span
          aria-hidden
          className="animate-coachmark-pulse pointer-events-none absolute -inset-1 rounded-xl ring-2 ring-brand-500/60"
        />
      )}
      {children}

      {open && (
        <div
          role="dialog"
          aria-label={title ?? "Dica"}
          className={cn(
            "animate-pop-in absolute z-50 w-64 max-w-[calc(100vw-2rem)] rounded-md bg-ink-950 p-3 text-left text-ink-50 shadow-[var(--shadow-pop)]",
            alignClass,
            isTop ? "bottom-full mb-2.5" : "top-full mt-2.5",
            bubbleClassName,
          )}
        >
          {/* seta */}
          <span
            aria-hidden
            className={cn(
              "absolute size-3 rotate-45 bg-ink-950",
              caretAlign,
              isTop ? "-bottom-1.5" : "-top-1.5",
            )}
          />
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {title && <p className="text-sm font-bold leading-snug text-ink-50">{title}</p>}
              {content && (
                <div className={cn("text-xs leading-relaxed text-ink-300", title && "mt-0.5")}>
                  {content}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={markSeen}
              aria-label="Dispensar dica"
              className="-mr-1 -mt-1 shrink-0 rounded-full p-1 text-ink-400 transition-colors hover:bg-ink-50/10 hover:text-ink-50"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={markSeen}
              className="rounded-pill bg-brand-600 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-brand-500"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
