import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollCue } from "./ScrollCue";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Teaser deslogado: no máximo 2 linhas de jogos. */
const MAX_ROWS = 2;

/**
 * Primeira dobra da home pública (só visitantes deslogados).
 *
 * Mostra **no máximo 2 linhas de jogos** (4 no desktop, 2 no mobile) e o convite
 * de rolagem cola **logo abaixo** dos jogos visíveis — sem espaço vazio:
 *  - 1–2 linhas de jogos → a dobra tem o tamanho exato dos jogos;
 *  - mais que isso → corta na 2ª linha (as demais ficam pra quem entra) e o
 *    convite segue logo abaixo.
 *
 * Teaser: o visitante vê que tem jogo e é convidado a descer pras seções.
 */
export function FirstFold({
  children,
  scrollTargetId,
}: {
  children: ReactNode;
  scrollTargetId: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [maxH, setMaxH] = useState<number>();

  const measure = useCallback(() => {
    const grid = contentRef.current?.firstElementChild as HTMLElement | null;
    if (!grid) return;
    const cards = Array.from(grid.children) as HTMLElement[];
    // nº de colunas atual (responsivo) lido direto do CSS grid
    const cols =
      getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length || 1;
    const limit = cols * MAX_ROWS;
    if (cards.length > limit) {
      // teto = base da última carta da 2ª linha (corta a 3ª linha em diante)
      const top = grid.getBoundingClientRect().top;
      const lastVisible = cards[limit - 1]!;
      setMaxH(Math.round(lastVisible.getBoundingClientRect().bottom - top));
    } else {
      setMaxH(undefined); // cabe em ≤2 linhas → sem corte, encolhe pro conteúdo
    }
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    const t = window.setTimeout(measure, 250); // fontes/layout assentam
    const ro = new ResizeObserver(measure); // jogos carregam async / quebra de coluna
    if (contentRef.current) ro.observe(contentRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [measure]);

  const goMore = () => {
    const target = document.getElementById(scrollTargetId);
    const behavior: ScrollBehavior = prefersReduced() ? "auto" : "smooth";
    if (target) target.scrollIntoView({ behavior, block: "start" });
    else window.scrollTo({ top: window.innerHeight, behavior });
  };

  const clamped = maxH != null;

  return (
    <div>
      <div
        ref={contentRef}
        className={clamped ? "overflow-hidden" : undefined}
        style={clamped ? { maxHeight: maxH } : undefined}
      >
        {children}
      </div>

      {/* convite cola logo abaixo dos jogos visíveis (sem espaço vazio) */}
      <div className="mt-5 flex justify-center">
        <ScrollCue onClick={goMore} />
      </div>
    </div>
  );
}
