import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Rótulo acessível do diálogo (lido por leitores de tela). */
  label?: string;
  /** Esconde o botão "X" no canto. */
  hideClose?: boolean;
  className?: string;
}

/**
 * Modal leve e acessível: overlay com blur, Esc para fechar, trava de foco e
 * trava de scroll do body. No mobile sobe como sheet (ancorado embaixo); no
 * desktop centraliza. Sem dependências novas — usa portal pro <body>.
 */
export function Modal({ open, onClose, children, label, hideClose, className }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;

    previouslyFocused.current = document.activeElement as HTMLElement | null;

    // trava scroll do body
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", handleKeyDown, true);

    // foca o primeiro elemento focável (ou o painel) ao abrir
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const firstFocusable = panel.querySelector<HTMLElement>(FOCUSABLE);
      (firstFocusable ?? panel).focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(focusTimer);
      // devolve o foco a quem abriu o modal
      previouslyFocused.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      {/* overlay */}
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink-950/50 backdrop-blur-sm"
      />

      {/* painel */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          "relative z-[1] w-full max-w-md bg-surface shadow-[var(--shadow-pop)] ring-1 ring-border focus:outline-none",
          // mobile: sheet colado embaixo, cantos arredondados em cima
          "max-h-[92dvh] overflow-y-auto rounded-t-xl pb-[max(1rem,env(safe-area-inset-bottom))]",
          // desktop: card centralizado
          "sm:rounded-xl sm:pb-0",
          "animate-pop-in",
          className,
        )}
      >
        {!hideClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-pill text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <X className="size-5" />
          </button>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
