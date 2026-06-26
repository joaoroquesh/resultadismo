// ITEM 10 — disputa de pênaltis cobrança a cobrança (sequencial, com suspense).
// A simulação (simulatePenalties) é DETERMINÍSTICA e roda de uma vez; aqui só
// REVELAMOS cada cobrança no tempo, em duas fases (batedor "vai bater…" → desfecho),
// alternando batedor × goleiro. UI client-side, legível em claro e escuro (tokens do
// tema), respeita prefers-reduced-motion e toque ≥44px. Ao final, `onDone` segue pro
// resultado (com o vencedor já decidido — bate com o knockoutResult do mesmo seed).
import { useEffect, useMemo, useRef, useState } from "react";
import type { PenKick, Shootout, Team } from "./types";
import { simulatePenalties } from "./engine";
import { ManagerCrest } from "./components";
import { teamColors } from "./teamColors";
import { Button } from "@/components/ui/Button";

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const RESULT_LABEL: Record<PenKick["result"], { txt: string; icon: string; good: boolean }> = {
  gol: { txt: "CONVERTEU!", icon: "⚽", good: true },
  defesa: { txt: "DEFENDEU!", icon: "🧤", good: false },
  trave: { txt: "NA TRAVE!", icon: "🪵", good: false },
  fora: { txt: "PRA FORA!", icon: "❌", good: false },
};

export function PenaltyShootout({
  myTeam,
  opp,
  seed,
  onDone,
}: {
  myTeam: Team;
  opp: Team;
  seed: number;
  onDone: (winnerIsMine: boolean) => void;
}) {
  // disputa inteira já decidida (determinística); revelamos cobrança a cobrança.
  const shootout: Shootout = useMemo(() => simulatePenalties(myTeam, opp, seed), [myTeam, opp, seed]);
  const total = shootout.kicks.length;

  // máquina de revelação: `done` = nº de cobranças com DESFECHO já mostrado.
  // `phase` 'aim' = batedor mirando (suspense); 'hit' = desfecho exibido.
  const [done, setDone] = useState(0);
  const [phase, setPhase] = useState<"aim" | "hit">("aim");
  const [skipped, setSkipped] = useState(false);
  const timerRef = useRef<number | null>(null);

  const finished = skipped || done >= total;

  // MELHORIA 2.4 — cadência com mais suspense: a mira (batedor "vai bater…") segura
  // mais antes do desfecho, e o desfecho respira antes da próxima cobrança. Com
  // prefers-reduced-motion, sem suspense (revela quase imediato).
  useEffect(() => {
    if (finished) return;
    const clear = () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
    };
    if (phase === "aim") {
      // mira: pausa longa de tensão antes de revelar (cobrança → pausa).
      timerRef.current = window.setTimeout(() => setPhase("hit"), REDUCED ? 240 : 1250);
    } else {
      // desfecho: deixa o resultado na tela um tempo antes de seguir (→ desfecho).
      timerRef.current = window.setTimeout(() => {
        setDone((d) => d + 1);
        setPhase("aim");
      }, REDUCED ? 240 : 1050);
    }
    return clear;
  }, [phase, finished]);

  function skip() {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    setSkipped(true);
  }

  // placar exibido: soma das cobranças já com desfecho.
  const shownCount = skipped ? total : phase === "hit" ? done + 1 : done;
  const shown = shootout.kicks.slice(0, shownCount);
  const lastShown = shown[shown.length - 1] ?? null;
  const scoreA = lastShown ? lastShown.scoreA : 0;
  const scoreB = lastShown ? lastShown.scoreB : 0;

  // cobrança corrente (a que está mirando/sendo revelada).
  const current = !finished ? shootout.kicks[done] : null;

  const cMine = teamColors(myTeam.s, myTeam.n);
  const cOpp = teamColors(opp.s, opp.n);
  const myMarks = shown.filter((k) => k.side === "A");
  const oppMarks = shown.filter((k) => k.side === "B");

  return (
    <div className="flex flex-col">
      <div className="mt-[4vh] text-center text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        Decisão por pênaltis
      </div>
      <h2 className="mt-1 text-center text-[22px] font-bold text-ink-950">Marca da cal</h2>

      {/* placar da disputa */}
      <div
        className="relative my-3 overflow-hidden rounded-[18px] border border-white/10 p-4 text-white"
        style={{ background: "var(--color-board)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <ShootTeam name={myTeam.n} slug={myTeam.s} c={cMine} align="left" />
          <div
            className="flex shrink-0 items-center justify-center gap-2.5 px-1 text-[44px] font-black tabular-nums leading-none text-gold-400"
            aria-live="polite"
            aria-label={`${scoreA} a ${scoreB}`}
          >
            <span>{scoreA}</span>
            <span className="text-[18px] font-bold text-white/35">×</span>
            <span>{scoreB}</span>
          </div>
          <ShootTeam name={opp.n} slug={opp.s} c={cOpp} align="right" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 border-t border-white/10 pt-2.5">
          <MarkRow kicks={myMarks} align="left" />
          <MarkRow kicks={oppMarks} align="right" />
        </div>
      </div>

      {/* lance corrente */}
      <div className="min-h-[116px] rounded-[14px] border border-border bg-surface p-4 text-center" aria-live="polite">
        {!finished && current ? (
          phase === "hit" ? (
            <KickOutcome kick={current} myName={myTeam.n} oppName={opp.n} />
          ) : (
            <KickAim
              shooterName={current.side === "A" ? myTeam.n : opp.n}
              keeperName={current.side === "A" ? opp.n : myTeam.n}
            />
          )
        ) : (
          <FinalCall
            winnerIsMine={shootout.winner === "A"}
            myName={myTeam.n}
            oppName={opp.n}
            pens={shootout.pens}
          />
        )}
      </div>

      {!finished ? (
        <Button variant="outline" fullWidth className="mt-3" onClick={skip}>
          Pular animação ⏩
        </Button>
      ) : (
        <Button
          size="lg"
          fullWidth
          className="mt-3 bg-gold-600 font-bold text-ink-950 hover:bg-gold-700"
          onClick={() => onDone(shootout.winner === "A")}
        >
          {shootout.winner === "A" ? "Continuar ›" : "Ver desfecho ›"}
        </Button>
      )}
    </div>
  );
}

function ShootTeam({
  name,
  slug,
  c,
  align,
}: {
  name: string;
  slug: string;
  c: { bg: string; text: string };
  align: "left" | "right";
}) {
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <ManagerCrest slug={slug} name={name} size={26} className="shrink-0" />
      {/* ROBUSTEZ (v9): nome longo QUEBRA em até 2 linhas no placar dos pênaltis em vez de
          truncar — par com o placar do ao vivo e do resultado. */}
      <span
        className="min-w-0 rounded-md px-1.5 py-0.5 text-[12px] font-black leading-[1.08] [overflow-wrap:anywhere]"
        style={{ background: c.bg, color: c.text }}
      >
        {name}
      </span>
    </div>
  );
}

// fileira de marcadores ●(gol) ×(erro) na ordem das cobranças de um time.
function MarkRow({ kicks, align }: { kicks: PenKick[]; align: "left" | "right" }) {
  return (
    <div className={`flex flex-wrap items-center gap-1 ${align === "right" ? "justify-end" : "justify-start"}`}>
      {kicks.length === 0 && <span className="text-[11px] text-white/30">—</span>}
      {kicks.map((k) => (
        <span
          key={k.index}
          aria-hidden
          title={`Cobrança ${k.index}`}
          className={`grid h-4 w-4 place-items-center rounded-full text-[9px] font-black ${
            k.result === "gol" ? "bg-gold-400 text-ink-950" : "border border-white/35 text-white/45"
          }`}
        >
          {k.result === "gol" ? "" : "×"}
        </span>
      ))}
    </div>
  );
}

function KickAim({ shooterName, keeperName }: { shooterName: string; keeperName: string }) {
  return (
    <div>
      <div aria-hidden className={`text-[30px] leading-none ${REDUCED ? "" : "animate-pulse-live"}`}>
        🎯
      </div>
      <div className="mt-1 text-[15px] font-bold text-ink-800">
        <b className="text-ink-950">{shooterName}</b> vai bater…
      </div>
      <div className="mt-0.5 text-[12px] text-ink-500">{keeperName} no gol, escolhendo o canto.</div>
    </div>
  );
}

function KickOutcome({ kick, myName, oppName }: { kick: PenKick; myName: string; oppName: string }) {
  const r = RESULT_LABEL[kick.result];
  const shooter = kick.side === "A" ? myName : oppName;
  return (
    <div className={REDUCED ? "" : "animate-pop-in"}>
      <div aria-hidden className="text-[34px] leading-none">
        {r.icon}
      </div>
      <div className={`mt-1 text-[18px] font-black ${r.good ? "text-grass-700" : "text-flame-700"}`}>
        {r.txt}
      </div>
      <div className="mt-0.5 text-[12px] text-ink-600">
        {kick.index}ª cobrança de <b className="text-ink-900">{shooter}</b>
      </div>
    </div>
  );
}

function FinalCall({
  winnerIsMine,
  myName,
  oppName,
  pens,
}: {
  winnerIsMine: boolean;
  myName: string;
  oppName: string;
  pens: string;
}) {
  return (
    <div className={REDUCED ? "" : "animate-pop-in"}>
      <div aria-hidden className="text-[30px] leading-none">
        {winnerIsMine ? "🎉" : "💔"}
      </div>
      <div className={`mt-1 text-[19px] font-black ${winnerIsMine ? "text-grass-700" : "text-flame-700"}`}>
        {winnerIsMine ? `${myName} passou!` : `${oppName} avançou.`}
      </div>
      <div className="mt-0.5 text-[12px] font-bold tabular-nums text-ink-600">Pênaltis {pens}</div>
    </div>
  );
}
