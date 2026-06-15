import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  fadeClassName,
  centerSelector,
  centerKey,
  dataTour,
}: {
  children: ReactNode;
  /** classes do wrapper (ex.: -mx-4 mb-3 pro bleed da página) */
  className?: string;
  /** classes da fileira interna (ex.: px-4) */
  innerClassName?: string;
  /** cor do degradê quando a fileira NÃO está sobre o fundo da página
   * (ex.: "from-[var(--color-ink-100)]" dentro do SegmentedControl) */
  fadeClassName?: string;
  /** seletor (dentro da fileira) do item que deve nascer CENTRALIZADO ao montar.
   * Com clamp: se o item está numa ponta, encosta na borda em vez de forçar. */
  centerSelector?: string;
  /** muda → re-centraliza o `centerSelector` (ex.: trocou de contexto). NÃO
   * mude isso a cada clique do usuário, senão a rolagem manual dele é desfeita. */
  centerKey?: string;
  /** âncora pro tour guiado (atributo data-tour no wrapper) */
  dataTour?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ left: false, right: false });

  // centraliza o item-alvo na 1ª pintura (e quando `centerKey` muda). Mede DOM
  // (sistema externo) em layout-effect: a fileira já nasce centralizada, sem
  // flash. O clamp natural do scrollLeft mantém o 1º/último item na ponta.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !centerSelector) return;
    let raf = 0;
    let tries = 0;
    let cancelled = false;
    const center = () => {
      if (cancelled) return;
      const target = el.querySelector<HTMLElement>(centerSelector);
      // largura 0 (load frio, layout ainda não pronto) ou alvo ausente → re-tenta
      if (!target || el.clientWidth === 0) {
        if (tries++ < 12) raf = requestAnimationFrame(center);
        return;
      }
      const cr = el.getBoundingClientRect();
      const tr = target.getBoundingClientRect();
      const delta = tr.left + tr.width / 2 - (cr.left + el.clientWidth / 2);
      const max = el.scrollWidth - el.clientWidth;
      el.scrollLeft = Math.max(0, Math.min(el.scrollLeft + delta, max));
    };
    // tentativa síncrona (antes do paint, sem flash) + retry p/ layout/dados async
    center();
    // fontes carregam depois do 1º paint e mudam as larguras → re-centra 1x
    let fontsDone = false;
    document.fonts?.ready?.then(() => {
      if (!cancelled && !fontsDone) {
        fontsDone = true;
        center();
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [centerSelector, centerKey]);

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
    <div data-tour={dataTour} className={cn("relative", className)}>
      <div ref={ref} className={cn("no-scrollbar flex gap-2 overflow-x-auto", innerClassName)}>
        {children}
      </div>
      {fade.left && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r to-transparent",
            fadeClassName ?? "from-[var(--color-background)]",
          )}
        />
      )}
      {fade.right && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l to-transparent",
            fadeClassName ?? "from-[var(--color-background)]",
          )}
        />
      )}
    </div>
  );
}
