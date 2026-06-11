import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFirstSeen } from "@/lib/useFirstSeen";

type Placement = "top" | "bottom";

type AnchorPos = {
  caretLeft: number; // centro do alvo, relativo ao wrapper
  bubbleLeft: number; // borda esquerda do balão, relativa ao wrapper (com clamp na viewport)
  ringLeft: number;
  ringTop: number;
  ringW: number;
  ringH: number;
};

/**
 * Dica de primeiro acesso (coachmark) que ancora num elemento-filho.
 *
 * Mostra um balão sobre/abaixo do conteúdo apenas na 1ª vez (controlado por
 * `storageKey` no localStorage — sem banco). Dispensável pelo X, pelo botão
 * "Entendi" ou tocando fora. Não altera o layout do filho.
 *
 * Com `caretTargetSelector`, a seta, o balão e o anel pulsante miram um
 * elemento específico dentro do conteúdo (ex.: uma aba no meio de uma fileira
 * rolável), em vez do canto. O alvo é trazido à vista e o balão é "clampado"
 * pra nunca vazar da tela.
 */
export function Coachmark({
  storageKey,
  title,
  content,
  children,
  placement = "bottom",
  align = "center",
  caretTargetSelector,
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
  /** Seletor (dentro do conteúdo) que a seta/balão/anel devem mirar. */
  caretTargetSelector?: string;
  className?: string;
  bubbleClassName?: string;
  /** Força aberto (ignora o storage) — útil para depurar. */
  defaultOpen?: boolean;
}) {
  const [pending, markSeen] = useFirstSeen(storageKey);
  const open = defaultOpen ?? pending;
  const ref = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<AnchorPos | null>(null);

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

  // posicionamento mirando um alvo específico (mede DOM → sistema externo, ok
  // em layout-effect; recalcula em resize). Sem alvo, usa o `align` por classe.
  useLayoutEffect(() => {
    // sem alvo/aberto não mede; o render já ignora `anchor` fora do modo mirado,
    // então não precisa (nem pode, por lint) resetar via setState aqui.
    if (!open || !caretTargetSelector) return;
    const measure = () => {
      const wrap = ref.current;
      const target = wrap?.querySelector<HTMLElement>(caretTargetSelector);
      if (!wrap || !target) return;
      // traz o alvo à vista se estiver num trilho rolável (não rola a página)
      target.scrollIntoView({ inline: "center", block: "nearest" });
      const wr = wrap.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      const vw = window.innerWidth;
      const margin = 8;
      const bubbleW = bubbleRef.current?.offsetWidth ?? Math.min(256, vw - 2 * margin);
      const targetCenterVp = tr.left + tr.width / 2;
      const bubbleLeftVp = Math.min(
        Math.max(targetCenterVp - bubbleW / 2, margin),
        vw - bubbleW - margin,
      );
      setAnchor({
        caretLeft: targetCenterVp - wr.left,
        bubbleLeft: bubbleLeftVp - wr.left,
        ringLeft: tr.left - wr.left,
        ringTop: tr.top - wr.top,
        ringW: tr.width,
        ringH: tr.height,
      });
    };
    // mede em rAF (nunca setState síncrono no effect); 2 frames p/ assentar o
    // scroll e o render do balão antes de posicionar.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      measure();
      raf2 = requestAnimationFrame(measure);
    });
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", measure);
    };
  }, [open, caretTargetSelector, content, title]);

  const isTop = placement === "top";
  const targeted = !!caretTargetSelector && !!anchor;
  // enquanto mede (tem alvo mas ainda sem posição), esconde balão/anel 1 frame
  const measuring = !!caretTargetSelector && !anchor;
  const alignClass =
    align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
  const caretAlign =
    align === "start" ? "left-5" : align === "end" ? "right-5" : "left-1/2 -translate-x-1/2";

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* anel pulsante de destaque: sobre o alvo (se houver) ou todo o conteúdo */}
      {open &&
        !measuring &&
        (targeted ? (
          <span
            aria-hidden
            className="animate-coachmark-pulse pointer-events-none absolute rounded-pill ring-2 ring-brand-500/70"
            style={{
              left: anchor!.ringLeft - 2,
              top: anchor!.ringTop - 2,
              width: anchor!.ringW + 4,
              height: anchor!.ringH + 4,
            }}
          />
        ) : (
          <span
            aria-hidden
            className="animate-coachmark-pulse pointer-events-none absolute -inset-1 rounded-xl ring-2 ring-brand-500/60"
          />
        ))}
      {children}

      {open && (
        <div
          ref={bubbleRef}
          role="dialog"
          aria-label={title ?? "Dica"}
          style={targeted ? { left: anchor!.bubbleLeft } : undefined}
          className={cn(
            "animate-pop-in absolute z-50 w-64 max-w-[calc(100vw-2rem)] rounded-md bg-ink-950 p-3 text-left text-ink-50 shadow-[var(--shadow-pop)]",
            !targeted && alignClass,
            measuring && "invisible", // mede sem flash: só posiciona no próximo frame
            isTop ? "bottom-full mb-2.5" : "top-full mt-2.5",
            bubbleClassName,
          )}
        >
          {/* seta */}
          <span
            aria-hidden
            style={targeted ? { left: anchor!.caretLeft - anchor!.bubbleLeft } : undefined}
            className={cn(
              "absolute size-3 rotate-45 bg-ink-950",
              targeted ? "-translate-x-1/2" : caretAlign,
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
