import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { ScrollCue } from "./ScrollCue";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Primeira dobra da home pública (só visitantes deslogados): mostra os jogos
 * apenas até a altura do viewport — cortando onde estiver — com um fade no fim
 * e um convite de rolagem fixo na base. Clicar (ou rolar) revela as seções de
 * "venda" abaixo. A ideia é teaser: o visitante vê que tem jogo e é convidado a
 * descer, sem despejar a lista inteira num dia cheio.
 */
export function FirstFold({
  children,
  scrollTargetId,
}: {
  children: ReactNode;
  scrollTargetId: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      // distância do topo do bloco até o documento; com a página no topo isso é
      // o quanto sobra até o fim do viewport. Cap mínimo pra telas baixinhas.
      const docTop = el.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(280, Math.round(window.innerHeight - docTop - 8)));
    };
    compute();
    window.addEventListener("resize", compute);
    // recalcula depois que fontes/layout assentam (evita corte no lugar errado)
    const t = window.setTimeout(compute, 250);
    return () => {
      window.removeEventListener("resize", compute);
      window.clearTimeout(t);
    };
  }, []);

  const goMore = () => {
    const target = document.getElementById(scrollTargetId);
    const behavior: ScrollBehavior = prefersReduced() ? "auto" : "smooth";
    if (target) target.scrollIntoView({ behavior, block: "start" });
    else window.scrollTo({ top: window.innerHeight, behavior });
  };

  return (
    <div ref={ref} className="relative overflow-hidden" style={height ? { height } : undefined}>
      {children}

      {/* fade do corte + convite, fixos na base da dobra */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
        <div className="h-28 w-full bg-gradient-to-t from-background via-background/85 to-transparent" />
        <div className="pointer-events-auto flex w-full justify-center bg-background pb-2">
          <ScrollCue onClick={goMore} />
        </div>
      </div>
    </div>
  );
}
