import { useEffect, useState, type ReactNode } from "react";
import { Trophy, Target, Zap, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useFirstSeen } from "@/lib/useFirstSeen";

export const ONBOARDING_KEY = "resultadismo-onboarding-v1";

/** Evento p/ reabrir o tour manualmente (ex.: admin testando). */
const REPLAY_EVENT = "resultadismo:replay-onboarding";
export function replayOnboarding() {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

interface Slide {
  icon: ReactNode;
  iconWrap: string;
  title: string;
  body: ReactNode;
}

/** Pílula de pontuação reutilizada na lista de "como pontua". */
function PointRow({
  tone,
  points,
  label,
  desc,
}: {
  tone: "gold" | "grass" | "aqua";
  points: number;
  label: string;
  desc: string;
}) {
  const toneClass = {
    gold: "bg-gold-500 text-gold-950",
    grass: "bg-grass-600 text-white",
    aqua: "bg-aqua-700 text-white",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-md bg-ink-100 p-2.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-md text-base font-extrabold tabular-nums",
          toneClass,
        )}
      >
        +{points}
      </span>
      <div className="min-w-0 text-left">
        <p className="text-sm font-bold text-ink-900">{label}</p>
        <p className="text-xs leading-snug text-ink-500">{desc}</p>
      </div>
    </div>
  );
}

const SLIDES: Slide[] = [
  {
    icon: <Trophy className="size-9" />,
    iconWrap: "bg-brand-500/15 text-brand-600",
    title: "Bem-vindo ao Resultadismo!",
    body: (
      <p className="text-sm leading-relaxed text-ink-600">
        Palpite nos placares dos jogos, dispute com a galera e veja quem manja mais de futebol.
        Vamos te mostrar como funciona em 30 segundos.
      </p>
    ),
  },
  {
    icon: <Target className="size-9" />,
    iconWrap: "bg-gold-500/15 text-gold-700",
    title: "Como você pontua",
    body: (
      <div className="space-y-2">
        <p className="mb-3 text-sm leading-relaxed text-ink-600">
          Quanto mais perto do resultado, mais pontos:
        </p>
        <PointRow
          tone="gold"
          points={3}
          label="Cravou o placar"
          desc="Acertou o resultado exato. A pontuação máxima!"
        />
        <PointRow
          tone="grass"
          points={2}
          label="Acertou o saldo de gols"
          desc="Errou o placar, mas pegou a diferença. Cravar o empate conta aqui."
        />
        <PointRow
          tone="aqua"
          points={1}
          label="Acertou só quem venceu"
          desc="Foi no time certo, mas errou o saldo de gols."
        />
      </div>
    ),
  },
  {
    icon: <Zap className="size-9 fill-current" />,
    iconWrap: "bg-brand-500/15 text-brand-600",
    title: "Dobro de Pontos",
    body: (
      <p className="text-sm leading-relaxed text-ink-600">
        Confiante num jogo? Ative o{" "}
        <span className="inline-flex items-center gap-0.5 rounded-pill bg-brand-600 px-1.5 align-middle text-[11px] font-bold text-white">
          <Zap className="size-2.5 fill-white" /> 2×
        </span>{" "}
        no palpite e ele vale <span className="font-bold text-ink-900">o dobro</span>. Mas calma: são
        poucos por semana, então guarde para os palpites mais certeiros.
      </p>
    ),
  },
  {
    icon: <Users className="size-9" />,
    iconWrap: "bg-brand-500/15 text-brand-600",
    title: "Dispute em ligas",
    body: (
      <p className="text-sm leading-relaxed text-ink-600">
        Crie uma liga e chame os amigos, ou entre numa já existente. Cada liga tem sua
        classificação — é a sua disputa particular pra ver quem termina no topo. Bora palpitar!
      </p>
    ),
  },
];

/**
 * Carrossel de boas-vindas no 1º acesso de um usuário logado.
 * Gate por localStorage (ONBOARDING_KEY); some após "Começar" ou "Pular".
 */
export function Onboarding() {
  const { user, loading } = useAuth();
  const [pending, markSeen] = useFirstSeen(ONBOARDING_KEY);
  const [index, setIndex] = useState(0);
  const [forced, setForced] = useState(false);

  // Reabrir manualmente (admin testando): mostra mesmo já tendo visto.
  useEffect(() => {
    const onReplay = () => {
      setIndex(0);
      setForced(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  // Aparece no 1º acesso (pending) ou quando reaberto manualmente (forced).
  const visible = !loading && !!user && (pending || forced);

  // Trava o scroll do body enquanto o overlay está visível.
  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [visible]);

  if (!visible) return null;

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index]!;

  const close = () => {
    markSeen();
    setForced(false);
  };
  const next = () => (isLast ? close() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-ink-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Boas-vindas ao Resultadismo"
    >
      <div className="animate-rise flex w-full max-w-md flex-col rounded-t-xl bg-surface shadow-[var(--shadow-pop)] sm:rounded-xl">
        {/* topo: pular */}
        <div className="flex items-center justify-between px-4 pt-3">
          <span className="text-xs font-semibold text-ink-400">
            {index + 1} de {SLIDES.length}
          </span>
          <button
            type="button"
            onClick={close}
            className="rounded-pill px-2 py-1 text-xs font-semibold text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-700"
          >
            Pular
          </button>
        </div>

        {/* conteúdo do slide */}
        <div className="flex flex-col items-center px-6 pb-2 pt-4 text-center">
          <div
            className={cn(
              "animate-pop-in mb-4 flex size-20 items-center justify-center rounded-full",
              slide.iconWrap,
            )}
            key={index /* re-anima o ícone ao trocar de slide */}
          >
            {slide.icon}
          </div>
          <h2 className="mb-2 text-xl font-extrabold tracking-tight text-ink-950">{slide.title}</h2>
          <div className="w-full">{slide.body}</div>
        </div>

        {/* dots */}
        <div className="flex items-center justify-center gap-1.5 py-4">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ir para o slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-pill transition-all",
                i === index ? "w-5 bg-brand-600" : "w-1.5 bg-ink-300 hover:bg-ink-400",
              )}
            />
          ))}
        </div>

        {/* navegação (pb garante respiro mesmo sem safe-area no desktop) */}
        <div className="flex items-center gap-2 border-t border-border px-4 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {index > 0 ? (
            <button
              type="button"
              onClick={back}
              className="flex h-11 items-center gap-1 rounded-pill px-4 text-sm font-semibold text-ink-600 transition-colors hover:bg-ink-100"
            >
              <ChevronLeft className="size-4" /> Voltar
            </button>
          ) : (
            <span aria-hidden className="flex-1" />
          )}
          {index > 0 && <span className="flex-1" />}
          <button
            type="button"
            onClick={next}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-pill bg-brand-600 px-5 text-sm font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98]"
          >
            {isLast ? "Começar" : "Próximo"}
            {!isLast && <ChevronRight className="size-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
