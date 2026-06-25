import { useEffect, useRef, useState } from "react";

/**
 * Arrastar pro lado pra trocar de dia, com a sensação de "arrastei e deslizou".
 *
 * O trilho tem três painéis lado a lado (dia anterior · atual · próximo) e segue
 * o dedo via `translateX` (escrito direto no DOM, sem re-render por frame). Ao
 * soltar passando do limite, o vizinho desliza até o centro e o dia troca; senão
 * volta com mola. O dia novo entra SEM salto: reposiciono o trilho onde o vizinho
 * já estava e animo até 0.
 *
 * O listener de `touchmove` é NATIVO com `{passive:false}` — só assim dá pra
 * `preventDefault()` e travar o scroll vertical, e só depois que o gesto é
 * classificado como horizontal (nunca atrapalha a rolagem vertical legítima).
 *
 * Retorna o ref do trilho e `active` (quando os painéis vizinhos devem existir —
 * em repouso só o central é renderizado, custo zero).
 */
const EASE = "transform 0.4s var(--ease-out-expo)";

/** O toque começou DENTRO de um scroller horizontal interno (ex.: os tabs de
 * grupos em "Palpites da galera")? Aí o arraste-dia não engata — o scroll
 * lateral nativo daquele elemento é que deve mandar. */
function startsInHScroller(node: EventTarget | null, stop: Element): boolean {
  let n = node instanceof Element ? node : null;
  while (n && n !== stop) {
    const cs = getComputedStyle(n);
    if (/(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
    n = n.parentElement;
  }
  return false;
}

export function useDaySwipe(opts: {
  enabled: boolean;
  index: number;
  count: number;
  onPick: (dir: 1 | -1) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);

  // Espelha o estado mais recente pro listener nativo (criado uma vez) não ficar
  // com closure velha de index/count/onPick. Atualizado em effect (não no render).
  const st = useRef(opts);
  useEffect(() => {
    st.current = opts;
  });

  useEffect(() => {
    const el = railRef.current;
    if (!el || !opts.enabled) return;

    let startX = 0;
    let startY = 0;
    let axis: null | "x" | "y" = null;
    let dragging = false;
    let curOff = 0;
    let innerScroll = false; // toque começou num scroller horizontal interno (tabs de grupos)

    const resist = (dx: number) => {
      const { index, count } = st.current;
      const atStart = index <= 0 && dx > 0;
      const atEnd = index >= count - 1 && dx < 0;
      return atStart || atEnd ? dx / 3 : dx; // mola nas pontas
    };

    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      axis = null;
      dragging = false;
      // se o toque nasceu num scroller horizontal interno (tabs de grupos em
      // "Palpites da galera"), o arraste-dia fica fora — o scroll nativo manda.
      innerScroll = startsInHScroller(e.target, el);
    };

    const onMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t || innerScroll) return;
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;
      if (axis === null) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // ainda indeciso
        axis = Math.abs(dx) > Math.abs(dy) * 1.2 ? "x" : "y";
        if (axis === "x") {
          dragging = true;
          setActive(true);
        }
      }
      if (axis !== "x") return;
      e.preventDefault(); // trava o scroll vertical SÓ no gesto horizontal
      curOff = resist(dx);
      el.style.transition = "none";
      el.style.transform = `translateX(${curOff}px)`;
    };

    const onEnd = () => {
      if (axis !== "x" || !dragging) {
        axis = null;
        return;
      }
      axis = null;
      dragging = false;
      const { index, count, onPick } = st.current;
      const w = el.clientWidth || window.innerWidth;
      const thresh = Math.min(80, w * 0.25);
      let dir: 0 | 1 | -1 = 0;
      if (curOff <= -thresh && index < count - 1) dir = 1;
      else if (curOff >= thresh && index > 0) dir = -1;

      if (dir !== 0) {
        onPick(dir); // troca o dia → re-render dos painéis
        // mantém o vizinho exatamente onde está (sem transição)…
        el.style.transition = "none";
        el.style.transform = `translateX(${dir * w + curOff}px)`;
        // …e no frame seguinte desliza até o centro (com transição).
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            el.style.transition = EASE;
            el.style.transform = "translateX(0)";
          }),
        );
      } else {
        el.style.transition = EASE; // volta com mola
        el.style.transform = "translateX(0)";
      }
      curOff = 0;
    };

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === "transform" && !dragging) {
        setActive(false); // anima terminou: desmonta os vizinhos
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    el.addEventListener("transitionend", onTransitionEnd);
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
      el.removeEventListener("transitionend", onTransitionEnd);
    };
  }, [opts.enabled]);

  return { railRef, active };
}
