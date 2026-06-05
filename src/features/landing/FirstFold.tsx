import { type ReactNode } from "react";
import { ScrollCue } from "./ScrollCue";

const prefersReduced = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Primeira dobra da home pública (só visitantes deslogados).
 *
 * Renderiza o teaser de jogos (a quantidade já vem limitada a no máximo 2 linhas
 * pelo JogosPage — 4 no desktop, 2 no mobile) e cola o convite de rolagem logo
 * abaixo dos jogos. Sem `overflow:hidden`/clip, pra não cortar o anel (ring) dos
 * cards ao vivo. Clicar leva às seções de "venda" abaixo.
 */
export function FirstFold({
  children,
  scrollTargetId,
}: {
  children: ReactNode;
  scrollTargetId: string;
}) {
  const goMore = () => {
    const target = document.getElementById(scrollTargetId);
    const behavior: ScrollBehavior = prefersReduced() ? "auto" : "smooth";
    if (target) target.scrollIntoView({ behavior, block: "start" });
    else window.scrollTo({ top: window.innerHeight, behavior });
  };

  return (
    <div>
      {children}
      <div className="mt-5 flex justify-center">
        <ScrollCue onClick={goMore} />
      </div>
    </div>
  );
}
