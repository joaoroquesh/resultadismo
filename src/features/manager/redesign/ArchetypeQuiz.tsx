// Quiz de arquétipo de técnico: os 5 DILEMAS -> resolveArchetype. Pulável (dá pra
// jogar sem perfil). No fim mostra o card do arquétipo (nome, lente, treinadores).
import { useState } from "react";
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
        <span className="grid size-10 place-items-center rounded-full bg-brand-500/15 text-brand-700">
          <CompassIcon size={20} />
        </span>
        <div>
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-brand-600">Técnico</div>
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

  const total = DILEMAS.length;

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="text-center">
          <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">Seu perfil de técnico</div>
          <p className="mt-1 text-[12.5px] text-ink-500">Ele dá um tempero leve à sua tática. Você pode mudar a qualquer momento.</p>
        </div>
        <ArchetypeCard keyId={result} />
        <button
          type="button"
          onClick={() => onDone(result)}
          className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 text-[15px] font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98]"
        >
          <CheckIcon size={16} /> Usar este perfil
        </button>
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setStep(0);
            setScores({});
          }}
          className="text-center text-[12.5px] font-semibold text-ink-500 underline-offset-2 hover:underline"
        >
          Refazer o teste
        </button>
      </div>
    );
  }

  const d = DILEMAS[step];

  const choose = (opt: { pontos: Partial<Record<ArchetypeKey, number>> }) => {
    const next = mergeScores(scores, opt.pontos);
    setScores(next);
    if (step + 1 >= total) {
      setResult(resolveArchetype(next));
    } else {
      setStep(step + 1);
    }
  };

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
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
          {step + 1} de {total}
        </span>
      </div>

      {/* progresso */}
      <div className="flex h-1.5 gap-1" aria-hidden>
        {DILEMAS.map((_, i) => (
          <span key={i} className={`h-full flex-1 rounded-full ${i <= step ? "bg-brand-500" : "bg-surface-2"}`} />
        ))}
      </div>

      <h2 className="text-[17px] font-bold leading-snug text-ink-900">{d.pergunta}</h2>

      <div className="flex flex-col gap-2">
        {d.opcoes.map((o, i) => (
          <button
            key={i}
            type="button"
            onClick={() => choose(o)}
            className="min-h-[52px] rounded-[14px] border border-border bg-surface px-4 py-3 text-left text-[14px] font-semibold text-ink-800 transition-[transform,border-color,background-color] duration-150 ease-out hover:border-brand-400 hover:bg-surface-2 active:scale-[0.98]"
          >
            {o.texto}
          </button>
        ))}
      </div>

      <button type="button" onClick={onSkip} className="mt-1 text-center text-[12.5px] font-semibold text-ink-500 underline-offset-2 hover:underline">
        Pular e jogar sem perfil
      </button>
    </div>
  );
}
