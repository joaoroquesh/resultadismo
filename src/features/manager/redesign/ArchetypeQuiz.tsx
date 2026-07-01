// Quiz de arquétipo de técnico: os 5 DILEMAS -> resolveArchetype. Pulável (dá pra
// jogar sem perfil). Microinterações (TASK 5): progresso animado, seleção que "acende"
// antes de avançar, transição suave entre os dilemas (remonta com animate-manager-screen)
// e um reveal satisfatório do arquétipo. Tudo coberto pelo kill-switch global de
// prefers-reduced-motion (index.css): quem pede menos animação recebe troca instantânea.
import { useEffect, useRef, useState } from "react";
import type { ArchetypeKey } from "./archetypes.ts";
import { DILEMAS, resolveArchetype, ARCHETYPES } from "./archetypes.ts";
import { CompassIcon, ArrowLeftIcon, CheckIcon } from "./icons";

type Scores = Partial<Record<ArchetypeKey, number>>;

function mergeScores(base: Scores, add: Partial<Record<ArchetypeKey, number>>): Scores {
  const out: Scores = { ...base };
  for (const k of Object.keys(add) as ArchetypeKey[]) out[k] = (out[k] ?? 0) + (add[k] ?? 0);
  return out;
}

export function ArchetypeCard({ keyId }: { keyId: ArchetypeKey }) {
  const a = ARCHETYPES[keyId];
  return (
    <div className="rounded-[16px] border border-border bg-surface p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid size-10 place-items-center rounded-full bg-brand-500/15 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
          <CompassIcon size={20} />
        </span>
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-brand-600 dark:text-brand-300">Técnico</div>
          <div className="text-[18px] font-black leading-tight text-ink-900">{a.nome}</div>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-snug text-ink-700">{a.lente}</p>
      <div className="mt-3 flex flex-col gap-1.5">
        <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">Inspiração</div>
        <div className="flex flex-wrap gap-1.5">
          {a.treinadores.map((t) => (
            <span key={t} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-ink-700">
              {t}
            </span>
          ))}
        </div>
      </div>
      <p className="mt-3 text-[11.5px] leading-snug text-ink-500">Brilha em: {a.brilha}</p>
    </div>
  );
}

export function ArchetypeQuiz({
  onDone,
  onSkip,
  onBack,
}: {
  onDone: (key: ArchetypeKey) => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [step, setStep] = useState(0);
  const [scores, setScores] = useState<Scores>({});
  const [result, setResult] = useState<ArchetypeKey | null>(null);
  // índice da opção que o jogador acabou de tocar (acende antes de avançar).
  const [picked, setPicked] = useState<number | null>(null);
  const advanceTimer = useRef<number | null>(null);

  const total = DILEMAS.length;

  // limpa qualquer timer pendente ao desmontar (evita setState fora da árvore).
  useEffect(() => () => {
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
  }, []);

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="animate-rise text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-500/15 text-brand-700 animate-pop-in dark:bg-brand-500/20 dark:text-brand-300">
            <CompassIcon size={28} />
          </span>
          <div className="mt-3 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">A sua escola é</div>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-500">
            Ela dá um tempero leve à sua tática. Você pode mudar a qualquer momento.
          </p>
        </div>
        <div className="animate-rise" style={{ animationDelay: "80ms" }}>
          <ArchetypeCard keyId={result} />
        </div>
        <button
          type="button"
          onClick={() => onDone(result)}
          className="animate-rise flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 text-[15px] font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98]"
          style={{ animationDelay: "140ms" }}
        >
          <CheckIcon size={16} /> Usar este perfil
        </button>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setStep(0);
            setScores({});
            setPicked(null);
          }}
          className="text-center text-[12.5px] font-semibold text-ink-500 underline-offset-2 hover:underline"
        >
          Refazer o teste
        </button>
      </div>
    );
  }

  const d = DILEMAS[step];

  const choose = (opt: { pontos: Partial<Record<ArchetypeKey, number>> }, i: number) => {
    if (picked !== null) return; // já escolheu neste dilema (evita duplo toque)
    setPicked(i);
    const next = mergeScores(scores, opt.pontos);
    // pequeno respiro pra o estado "aceso" aparecer antes de avançar/revelar.
    advanceTimer.current = window.setTimeout(() => {
      setScores(next);
      setPicked(null);
      if (step + 1 >= total) setResult(resolveArchetype(next));
      else setStep(step + 1);
    }, 240);
  };

  // fração de progresso preenchida (barra contínua que "escorre" ao avançar).
  const pct = Math.round((step / total) * 100);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => (step === 0 ? onBack() : setStep(step - 1))}
          className="flex items-center gap-1 text-[13px] font-semibold text-ink-600 hover:text-ink-900"
          aria-label={step === 0 ? "Voltar" : "Pergunta anterior"}
        >
          <ArrowLeftIcon size={16} /> Voltar
        </button>
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500 tabular-nums">
          {step + 1} de {total}
        </span>
      </div>

      {/* progresso: trilho contínuo animado + degraus por dilema */}
      <div>
        <div
          className="h-1.5 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-valuenow={step + 1}
          aria-valuemin={1}
          aria-valuemax={total}
          aria-label="Progresso do teste"
        >
          <span
            className="block h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(pct, 6)}%` }}
          />
        </div>
      </div>

      {/* dilema: remonta por step (key) pra ganhar a transição de entrada */}
      <div key={step} className="animate-manager-screen flex flex-col gap-4">
        <h2 className="text-[18px] font-bold leading-snug text-ink-900">{d.pergunta}</h2>

        <div className="flex flex-col gap-2" role="group" aria-label="Escolha uma resposta">
          {d.opcoes.map((o, i) => {
            const on = picked === i;
            const dim = picked !== null && !on;
            return (
              <button
                key={i}
                type="button"
                onClick={() => choose(o, i)}
                aria-pressed={on}
                className={`flex min-h-[54px] items-center justify-between gap-3 rounded-[14px] border px-4 py-3 text-left text-[14px] font-semibold transition-[transform,border-color,background-color,box-shadow,opacity] duration-200 ease-out active:scale-[0.98] ${
                  on
                    ? "border-transparent bg-brand-600 text-white shadow-sm"
                    : "border-border bg-surface text-ink-800 hover:border-brand-400 hover:bg-surface-2"
                } ${dim ? "opacity-45" : ""}`}
              >
                <span>{o.texto}</span>
                {on && <CheckIcon size={17} className="shrink-0 text-white" />}
              </button>
            );
          })}
        </div>
      </div>

      <button type="button" onClick={onSkip} className="mt-1 text-center text-[12.5px] font-semibold text-ink-500 underline-offset-2 hover:underline">
        Pular e jogar sem perfil
      </button>
    </div>
  );
}
