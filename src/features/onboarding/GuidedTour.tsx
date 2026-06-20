import { useEffect, useLayoutEffect, useReducer, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useFirstSeen } from "@/lib/useFirstSeen";
import { useMaintenance } from "@/components/layout/maintenance";
import { usePersonalizationState } from "./personalizationApi";
import { ONBOARDING_KEY } from "./Onboarding";

export const TOUR_KEY = "resultadismo-tour-v1";

/** Evento p/ reabrir o tour manualmente (admin testando). */
const REPLAY_EVENT = "resultadismo:replay-tour";
// Utilitário (não-componente) exportado junto do componente: só silencia o aviso
// de Fast Refresh (HMR em dev) — zero impacto em runtime.
// eslint-disable-next-line react-refresh/only-export-components
export function replayTour() {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

type Place = "top" | "bottom" | "right";

interface Step {
  /** valor do data-tour do elemento-alvo (o controlador acha o visível) */
  target: string;
  title: string;
  body: ReactNode;
}

// Os passos miram itens REAIS da navegação (data-tour), que é fixa: Jogos,
// Grupos e Perfil. Por isso o tour roda inteiro em "/" sem precisar navegar.
const STEPS: Step[] = [
  {
    target: "nav-jogos",
    title: "Aqui é onde você palpita",
    body: (
      <>
        Em <b className="text-ink-50">Jogos</b> cada partida é um card: toque, crave o placar e ganhe
        pontos. No topo dá pra filtrar entre os <b className="text-ink-50">seus interesses</b> e{" "}
        <b className="text-ink-50">todos</b> os jogos.
      </>
    ),
  },
  {
    target: "nav-grupos",
    title: "Crie seu grupo",
    body: (
      <>
        Em <b className="text-ink-50">Grupos</b> você monta a sua turma e chama a galera. E o{" "}
        <b className="text-ink-50">Resultadismo The Best</b> junta todos os resultadistas num pódio
        só, onde dá pra provar que você entende mais de bola que o Brasil inteiro.
      </>
    ),
  },
  {
    target: "nav-perfil",
    title: "Seu perfil",
    body: (
      <>
        No <b className="text-ink-50">Perfil</b> você ajusta seu nome, escudo e o que mais quiser. É
        a sua cara no Resultadismo.
      </>
    ),
  },
];

const PAD = 8; // respiro do destaque ao redor do alvo
const GAP = 12; // distância do balão até o alvo
const BW = 288; // largura do balão (w-72)

type Geom = {
  // retângulo do destaque (já com PAD)
  top: number;
  left: number;
  width: number;
  height: number;
  // balão
  place: Place;
  bubbleLeft: number;
  bubbleTop: number;
  caret: number; // deslocamento da seta ao longo da borda voltada ao alvo
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function carouselSeen(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) != null;
  } catch {
    return false;
  }
}

/** Acha o elemento [data-tour=target] que está realmente visível (mobile×desktop). */
function pickVisible(target: string): HTMLElement | null {
  const els = Array.from(document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`));
  return els.find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }) ?? null;
}

function computeGeom(raw: DOMRect): Geom {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const top = raw.top - PAD;
  const left = raw.left - PAD;
  const width = raw.width + PAD * 2;
  const height = raw.height + PAD * 2;
  const right = left + width;
  const bottom = top + height;
  const cx = left + width / 2;

  // Onde cabe o balão: item ESTREITO encostado à esquerda (item de sidebar no
  // desktop) → à direita; algo na metade de baixo (bottom nav / conteúdo) → acima;
  // senão abaixo. O check de largura evita jogar o balão da barra de filtros (larga,
  // colada na esquerda) pra fora da tela.
  let place: Place;
  if (left < 220 && width < 280 && bottom < vh - 140) place = "right";
  else if (raw.top > vh / 2) place = "top";
  else place = "bottom";

  let bubbleLeft: number;
  let bubbleTop: number;
  if (place === "right") {
    bubbleLeft = right + GAP;
    bubbleTop = clamp(top, PAD, vh - 220);
  } else {
    bubbleLeft = clamp(cx - BW / 2, PAD, vw - BW - PAD);
    bubbleTop = place === "bottom" ? bottom + GAP : top - GAP; // "top" usa translateY(-100%)
  }
  // seta aponta para o centro do alvo, presa dentro do balão
  const caret =
    place === "right"
      ? clamp(raw.top + raw.height / 2 - bubbleTop, 16, 180)
      : clamp(cx - bubbleLeft, 20, BW - 20);

  return { top, left, width, height, place, bubbleLeft, bubbleTop, caret };
}

/**
 * Tour guiado de 1º acesso: coach-marks em sequência que apontam elementos REAIS
 * da UI (Jogos → Grupos → Perfil). Vem DEPOIS da personalização e do carrossel de
 * boas-vindas (gate por personalization_done + ONBOARDING_KEY + TOUR_KEY no
 * localStorage). Reusa a linguagem visual do Coachmark (anel turquesa + balão escuro).
 */
export function GuidedTour() {
  const { user, loading, isAppAdmin } = useAuth();
  const { data: maint } = useMaintenance();
  const { data: perso } = usePersonalizationState();
  const onHome = useLocation().pathname === "/";
  const [pending, markSeen] = useFirstSeen(TOUR_KEY);
  const [index, setIndex] = useState(0);
  const [forced, setForced] = useState(false);
  const [geom, setGeom] = useState<Geom | null>(null);
  const [, force] = useReducer((x) => x + 1, 0);

  // Reabrir manualmente (admin) + reavaliar quando o carrossel fecha.
  useEffect(() => {
    const onReplay = () => {
      setIndex(0);
      setForced(true);
    };
    const onDone = () => force(); // carrossel terminou → revalida o gate
    window.addEventListener(REPLAY_EVENT, onReplay);
    window.addEventListener("resultadismo:onboarding-done", onDone);
    return () => {
      window.removeEventListener(REPLAY_EVENT, onReplay);
      window.removeEventListener("resultadismo:onboarding-done", onDone);
    };
  }, []);

  const underMaintenance = !!maint?.maintenance_mode && !isAppAdmin;
  const personalizationDone = !!perso?.personalization_done;
  const visible =
    !loading &&
    !!user &&
    !underMaintenance &&
    onHome &&
    (forced || (pending && personalizationDone && carouselSeen()));

  // Trava o scroll do body enquanto o tour está ativo (os alvos já estão à vista).
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  // Mede o alvo do passo atual; re-mede em resize/scroll. Se o alvo ainda não
  // existe (dado/layout assentando), tenta por ~3s; persistindo, pula o passo.
  useLayoutEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let tries = 0;
    let timer = 0;
    const tick = () => {
      if (cancelled) return;
      const el = pickVisible(STEPS[index]!.target);
      if (el) {
        setGeom(computeGeom(el.getBoundingClientRect()));
      } else if (tries++ < 20) {
        timer = window.setTimeout(tick, 150);
      } else if (index < STEPS.length - 1) {
        setIndex((i) => i + 1); // alvo ausente de vez → segue o fluxo
      } else {
        finish();
      }
    };
    tick();
    const onMove = () => {
      const el = pickVisible(STEPS[index]!.target);
      if (el) setGeom(computeGeom(el.getBoundingClientRect()));
    };
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, index]);

  // Esc fecha (= pular)
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function finish() {
    markSeen();
    setForced(false);
    setIndex(0);
    setGeom(null);
    // avisa quem espera o tour terminar (ex.: modal de novidade na home) pra
    // não aparecerem dois overlays ao mesmo tempo.
    window.dispatchEvent(new Event("resultadismo:tour-done"));
  }
  const isLast = index === STEPS.length - 1;
  const next = () => (isLast ? finish() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  if (!visible || !geom) return null;
  const step = STEPS[index]!;
  const { place } = geom;

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label={step.title}>
      {/* captura cliques (app fica inerte); o escurecimento vem do box-shadow do destaque */}
      <div className="absolute inset-0" aria-hidden onClick={() => {}} />

      {/* destaque: buraco do tamanho do alvo, sombra gigante escurece o resto */}
      <div
        aria-hidden
        className="pointer-events-none absolute rounded-xl"
        style={{
          top: geom.top,
          left: geom.left,
          width: geom.width,
          height: geom.height,
          boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.62)",
        }}
      />
      {/* anel turquesa pulsante sobre o alvo */}
      <span
        aria-hidden
        className="animate-coachmark-pulse pointer-events-none absolute rounded-xl ring-2 ring-brand-500"
        style={{ top: geom.top, left: geom.left, width: geom.width, height: geom.height }}
      />

      {/* balão */}
      <div
        className="animate-pop-in absolute w-72 max-w-[calc(100vw-2rem)] rounded-lg bg-ink-950 p-3.5 text-left text-ink-50 shadow-[var(--shadow-pop)]"
        style={{
          left: geom.bubbleLeft,
          top: geom.bubbleTop,
          transform: place === "top" ? "translateY(-100%)" : undefined,
        }}
      >
        {/* seta apontando para o alvo */}
        <span
          aria-hidden
          className="absolute size-3 rotate-45 bg-ink-950"
          style={
            place === "right"
              ? { left: -6, top: geom.caret }
              : place === "top"
                ? { bottom: -6, left: geom.caret }
                : { top: -6, left: geom.caret }
          }
        />

        <div className="mb-1 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Passo {index + 1} de {STEPS.length}
          </span>
          <button
            type="button"
            onClick={finish}
            aria-label="Fechar tour"
            className="-mr-1 -mt-1 rounded-full p-1 text-ink-400 transition-colors hover:bg-ink-50/10 hover:text-ink-50"
          >
            <X className="size-3.5" />
          </button>
        </div>

        <p className="text-sm font-bold leading-snug text-ink-50">{step.title}</p>
        <div className="mt-1 text-xs leading-relaxed text-ink-300">{step.body}</div>

        {/* progresso */}
        <div className="mt-3 flex items-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-pill transition-all",
                i === index ? "w-4 bg-brand-500" : "w-1.5 bg-ink-700",
              )}
            />
          ))}
        </div>

        {/* navegação */}
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="rounded-pill px-2 py-1 text-xs font-semibold text-ink-400 transition-colors hover:text-ink-100"
          >
            Pular
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={back}
                className="inline-flex h-8 items-center gap-1 rounded-pill px-3 text-xs font-semibold text-ink-200 transition-colors hover:bg-ink-50/10"
              >
                <ChevronLeft className="size-3.5" /> Voltar
              </button>
            )}
            <button
              type="button"
              onClick={next}
              className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-brand-600 px-4 text-xs font-bold text-white transition-colors hover:bg-brand-500"
            >
              {isLast ? "Bora!" : "Próximo"}
              {!isLast && <ChevronRight className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
