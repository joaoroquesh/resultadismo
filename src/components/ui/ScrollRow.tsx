import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fileira horizontal rolável com DEGRADÊ nas bordas indicando que há mais
 * conteúdo (pedido do João: "a pessoa precisa entender que tem coisa pra
 * arrastar"). O fade aparece só do lado que ainda tem conteúdo escondido e
 * some quando o scroll chega no fim. Usa o token de fundo da página.
 */
export function ScrollRow({
  children,
  className,
  innerClassName,
}: {
  children: ReactNode;
  /** classes do wrapper (ex.: -mx-4 mb-3 pro bleed da página) */
  className?: string;
  /** classes da fileira interna (ex.: px-4) */
  innerClassName?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Medição de DOM (sistema externo): roda async (rAF/eventos), nunca no
    // corpo do efeito — sem cascata de render.
    const update = () => {
      const left = el.scrollLeft > 4;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setFade((p) => (p.left === left && p.right === right ? p : { left, right }));
    };
    const raf = requestAnimationFrame(update);
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div ref={ref} className={cn("no-scrollbar flex gap-2 overflow-x-auto", innerClassName)}>
        {children}
      </div>
      {fade.left && (
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[var(--color-background)] to-transparent" />
      )}
      {fade.right && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-[var(--color-background)] to-transparent" />
      )}
    </div>
  );
}
