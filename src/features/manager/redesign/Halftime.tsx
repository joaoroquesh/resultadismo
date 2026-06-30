// Vestiário (intervalo, minuto 45). O rival foi revelado: aparece uma aba NOVA de
// encaixe (matchupSignals) ao lado das suas coerências (que continuam valendo).
// Dica de otimização de postura vs o adversário e o placar, em frase (sem número
// de tática). Dá pra trocar rápido/tático e replanejar o 2º tempo.
import { useMemo, useState } from "react";
import type { Team } from "../types";
import type { Tactic, SignalLevel } from "./tactics.ts";
import { matchupSignals, coherenceSignals } from "./tactics.ts";
import { CoherenceList, MatchupList } from "./Signals";
import { TacticPicker, type PickerMode } from "./TacticPicker";
import { ManagerCrest } from "../components";
import { CompassIcon, ShieldIcon, ArrowUpIcon, ArrowDownIcon, EqualIcon } from "./icons";

// pontua um conjunto de sinais (pp=+2..mm=-2) só pra orientar a frase de postura.
function signalScore(signals: { level: SignalLevel }[]): number {
  const v: Record<SignalLevel, number> = { pp: 2, p: 1, z: 0, m: -1, mm: -2 };
  return signals.reduce((acc, s) => acc + v[s.level], 0);
}

// dica de postura: honesta, derivada do placar + do encaixe (não aleatória).
function posturaHint(
  score: [number, number],
  attackFit: number,
  defenseFit: number,
): { tone: "up" | "down" | "hold"; text: string } {
  const diff = score[0] - score[1];
  if (diff < 0) {
    return {
      tone: "up",
      text:
        attackFit >= 0
          ? "Você está atrás e o seu ataque encaixa contra eles. Subir a postura pra buscar o empate faz sentido."
          : "Você está atrás. Subir a postura ajuda a pressionar, mas cuidado: o seu ataque não está encaixando.",
    };
  }
  if (diff > 0) {
    return {
      tone: "down",
      text:
        defenseFit >= 0
          ? "Você está na frente e a sua marcação segura o rival. Recuar a postura protege o resultado."
          : "Você está na frente, mas a defesa sofre. Recuar com cautela e fechar os espaços pode segurar a vitória.",
    };
  }
  return {
    tone: "hold",
    text:
      attackFit >= defenseFit
        ? "Empate equilibrado. Seu ataque encaixa um pouco melhor: dá pra arriscar um passo à frente."
        : "Empate equilibrado. Sua marcação está mais sólida: segurar a postura e explorar o erro deles é prudente.",
  };
}

function HintIcon({ tone }: { tone: "up" | "down" | "hold" }) {
  if (tone === "up") return <ArrowUpIcon size={16} className="text-grass-700" />;
  if (tone === "down") return <ArrowDownIcon size={16} className="text-aqua-700" />;
  return <EqualIcon size={16} className="text-ink-600" />;
}

export function Halftime({
  myTeam,
  oppTeam,
  score,
  tac,
  oppTac,
  mode,
  onModeChange,
  onChange,
  onResume,
}: {
  myTeam: Team;
  oppTeam: Team;
  score: [number, number];
  tac: Tactic;
  oppTac: Tactic;
  mode: PickerMode;
  onModeChange: (m: PickerMode) => void;
  onChange: (t: Tactic) => void;
  onResume: () => void;
}) {
  const [pane, setPane] = useState<"plano" | "encaixe">("encaixe");
  const matchups = useMemo(() => matchupSignals(tac, oppTac), [tac, oppTac]);
  const coherences = useMemo(() => coherenceSignals(tac), [tac]);

  // encaixe ofensivo = ataque vs defesa + ataque vs bloco; defensivo = os do meu bloco/defesa.
  const attackFit = useMemo(
    () => signalScore(matchups.filter((m) => m.key === "ataque_vs_defesa" || m.key === "ataque_vs_bloco")),
    [matchups],
  );
  const defenseFit = useMemo(
    () => signalScore(matchups.filter((m) => m.key === "defesa_vs_ataque" || m.key === "ataque_rival_vs_meu_bloco")),
    [matchups],
  );
  const hint = useMemo(() => posturaHint(score, attackFit, defenseFit), [score, attackFit, defenseFit]);

  return (
    <div className="flex flex-col gap-4">
      <header className="rounded-[16px] border border-border bg-surface p-4">
        <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
          <ShieldIcon size={14} /> Vestiário, intervalo
        </div>
        <div className="mt-2 flex items-center justify-center gap-3 text-ink-900">
          <span className="flex items-center gap-2">
            <ManagerCrest slug={myTeam.s} name={myTeam.n} size={26} />
            <span className="text-[14px] font-bold">{myTeam.n}</span>
          </span>
          <span className="text-[26px] font-black tabular-nums text-brand-700">
            {score[0]} <span className="text-ink-400">x</span> {score[1]}
          </span>
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-bold">{oppTeam.n}</span>
            <ManagerCrest slug={oppTeam.s} name={oppTeam.n} size={26} />
          </span>
        </div>
      </header>

      {/* dica de postura (honesta) */}
      <section className="flex items-start gap-2.5 rounded-[14px] bg-surface-2 px-3.5 py-3">
        <span className="mt-0.5">
          <HintIcon tone={hint.tone} />
        </span>
        <div>
          <div className="text-[12px] font-bold text-ink-900">Sugestão da comissão</div>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-700">{hint.text}</p>
        </div>
      </section>

      {/* abas: encaixe (rival revelado) e o seu plano */}
      <div role="tablist" aria-label="Leitura do intervalo" className="flex gap-1 rounded-[13px] border border-border bg-surface-2 p-1">
        {([
          { id: "encaixe", label: "Encaixe com o rival" },
          { id: "plano", label: "Seu plano" },
        ] as const).map((t) => {
          const on = pane === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setPane(t.id)}
              className={`flex min-h-[42px] flex-1 items-center justify-center rounded-[10px] text-[12.5px] font-bold transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
                on ? "bg-brand-600 text-white shadow-sm" : "text-ink-600 hover:text-ink-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {pane === "encaixe" ? (
        <section className="rounded-[14px] border border-border bg-surface p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <CompassIcon size={16} className="text-brand-600" />
            <h3 className="text-[12.5px] font-bold text-ink-900">Como a sua tática encaixa contra {oppTeam.n}</h3>
          </div>
          <MatchupList signals={matchups} />
        </section>
      ) : (
        <section className="rounded-[14px] border border-border bg-surface p-3.5">
          <div className="mb-2 flex items-center gap-2">
            <CompassIcon size={16} className="text-brand-600" />
            <h3 className="text-[12.5px] font-bold text-ink-900">As suas escolhas continuam combinando</h3>
          </div>
          <CoherenceList signals={coherences} />
        </section>
      )}

      {/* replanejar o 2º tempo (rápido/tático) */}
      <section>
        <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Replaneje o segundo tempo</h3>
        <TacticPicker tac={tac} onChange={onChange} mode={mode} onModeChange={onModeChange} blind={false} />
      </section>

      <button
        type="button"
        onClick={onResume}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 text-[15px] font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98]"
      >
        Voltar para o segundo tempo
      </button>
    </div>
  );
}
