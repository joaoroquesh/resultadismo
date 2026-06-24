import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Cabeçalho de contexto da tela de Jogos — desenhado pra NUNCA "piscar".
 *
 * Os carrosséis (filtros + dias) ficam em FLUXO NORMAL e somem ao rolar: não
 * colapsam, então não mexem na altura da página. Logo abaixo vem uma barra
 * fininha STICKY de ALTURA FIXA. No topo ela mostra o resumo do dia (`summary`:
 * pontos do dia + dobros); ao "grudar" (carrosséis já fora da tela) troca pro
 * contexto `stuckBar` (competição · dia · pontos · dobros). Como a barra tem
 * altura fixa e os dois estados ocupam exatamente o mesmo espaço, NADA muda de
 * layout ao trocar — sem realimentação no scroll, sem oscilar no limite.
 *
 * O "grudou?" sai de um sentinela + IntersectionObserver (sem listener de
 * scroll, sem histerese, sem número mágico de pixel besteado a cada frame).
 */
export function MatchesStickyHeader({
  carousels,
  summary,
  stuckBar,
}: {
  /** Filtros + dias. Fluxo normal: rolam pra fora sem colapsar. */
  carousels: ReactNode;
  /** Conteúdo da barra no topo (resumo do dia). */
  summary: ReactNode;
  /** Conteúdo da barra quando grudada (competição · dia · resumo). */
  stuckBar: ReactNode;
}) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    // A barra gruda em top-14 (56px, logo abaixo do Header mobile). Quando o
    // sentinela — colado acima dela — cruza essa linha, a barra grudou.
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), {
      rootMargin: "-56px 0px 0px 0px",
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* carrosséis: fluxo normal, somem ao rolar (sem colapso → sem mudar altura) */}
      {carousels}
      {/* sentinela invisível: dispara o "grudou" um instante antes da barra */}
      <div ref={sentinel} aria-hidden className="h-px w-full" />
      {/* barra fininha: sticky e de ALTURA FIXA (h-11) nos dois estados → não pisca */}
      <div className="sticky top-14 z-20 -mx-4 mb-3 flex h-11 items-center border-b border-border bg-background px-4 lg:top-0">
        {stuck ? stuckBar : summary}
      </div>
    </>
  );
}
