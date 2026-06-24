import { useEffect, useRef, type RefObject } from "react";

// Topo grudado (Header 56 + barra 44) = 100. O jogo destacado para um pouco
// ABAIXO disso (FOCUS_OFFSET), deixando um PEDAÇO do card de cima aparecer — fica
// claro que há jogos pra cima, sem precisar de tira/aviso.
const STICKY = 100;
const PEEK = 52; // fatia visível do card logo acima do destacado
const FOCUS_OFFSET = STICKY + PEEK;
const DUR = 420; // duração da animação própria
const HOLD = 18; // frames que segura o alinhamento depois de chegar (~0.3s)

type G = { id: string; status: string };
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Ao ENTRAR num dia (uma vez por dia/aba), leva a lista até o jogo destacado:
 *  - se há AO VIVO no dia → vai pra ele (sempre);
 *  - senão, se há jogos ENCERRADOS e o próximo a começar está ABAIXO da primeira
 *    dobra → vai pra ele.
 * Para sempre deixando um pedacinho do card anterior à mostra (FOCUS_OFFSET).
 *
 * A rolagem é uma animação PRÓPRIA (rAF eased), que re-mede o alvo a cada frame
 * (vence o layout que assenta tarde) e segura o alinhamento por um instante
 * (vence scroll programático concorrente, ex.: coachmark/foco). Só um gesto do
 * usuário (wheel/touch/teclado) cancela. Retorna o setter de ref por card.
 */
export function useGamesScroll(opts: {
  games: G[];
  resetKey: string;
  enabled: boolean;
  /** Quando o ref está true, pula o auto-scroll desta vez (ex.: troca de dia por
   * swipe — rolar verticalmente durante o deslize horizontal fica estranho). */
  skipRef?: RefObject<boolean>;
}) {
  const { games, resetKey, enabled, skipRef } = opts;
  const idsKey = games.map((g) => g.id).join(",");
  const refs = useRef(new Map<string, HTMLElement | null>());
  const setRef = (id: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(id, el);
    else refs.current.delete(id);
  };

  const done = useRef("");
  useEffect(() => {
    if (!enabled) return;
    if (done.current === resetKey) return;
    if (skipRef?.current) {
      skipRef.current = false; // consome: troca por swipe não auto-rola
      done.current = resetKey;
      return;
    }
    const live = games.find((g) => g.status === "live");
    const hasFinished = games.some((g) => g.status === "finished");
    const upcoming = games.find((g) => g.status !== "live" && g.status !== "finished");
    const target = live ?? (hasFinished ? upcoming : undefined);
    if (!target) {
      done.current = resetKey;
      return;
    }
    if (!refs.current.get(target.id)) return; // refs ainda não montaram; tenta no próximo render
    done.current = resetKey;

    const id = target.id;
    const isLive = !!live;
    let cancelled = false;
    let raf = 0;
    let t0 = 0;
    const fromY = window.scrollY;
    let held = 0;
    const onUser = () => {
      cancelled = true;
    };
    window.addEventListener("wheel", onUser, { passive: true });
    window.addEventListener("touchmove", onUser, { passive: true });
    window.addEventListener("keydown", onUser);
    const stop = () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("wheel", onUser);
      window.removeEventListener("touchmove", onUser);
      window.removeEventListener("keydown", onUser);
    };
    const tick = (now: number) => {
      if (cancelled) return stop();
      if (!t0) t0 = now;
      const node = refs.current.get(id);
      if (!node) {
        raf = requestAnimationFrame(tick);
        return;
      }
      // posição do alvo no documento (estável a `scrollY`; muda só se o layout mexe)
      const absTop = window.scrollY + node.getBoundingClientRect().top;
      if (!isLive && absTop < window.innerHeight * 0.9) return stop(); // próximo já visível
      const want = Math.max(0, absTop - FOCUS_OFFSET);
      const elapsed = now - t0;
      if (elapsed < DUR) {
        window.scrollTo(0, fromY + (want - fromY) * easeOutCubic(elapsed / DUR));
        raf = requestAnimationFrame(tick);
      } else {
        window.scrollTo(0, want); // segura alinhado, vencendo concorrentes
        held += 1;
        if (held < HOLD) raf = requestAnimationFrame(tick);
        else stop();
      }
    };
    raf = requestAnimationFrame(tick);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, resetKey, idsKey]);

  return { setRef };
}
