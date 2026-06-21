import { useEffect } from "react";
import { cn, formatScore } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { ScorePill } from "@/components/ScorePill";
import type { ScoreType } from "@/lib/types";
import type { RetroAnswerResult } from "./api";
import { Confetti } from "./RetroFx";
import { sfxChampion, sfxScore, sfxToken, sfxZerou } from "./retroSfx";
import { verdictBadge } from "./verdict";

const VERDICT: Record<ScoreType, { label: string; cls: string }> = {
  cravada: { label: "CRAVADA!", cls: "bg-gold-500 text-gold-950" },
  saldo: { label: "NO SALDO!", cls: "bg-grass-600 text-white" },
  acerto: { label: "ACERTOU O VENCEDOR", cls: "bg-aqua-700 text-white" },
  erro: { label: "FORA!", cls: "bg-flame-600 text-white" },
};

// O reveal pós-palpite (3 batidas): placar real vira na tela → carimbo do veredito →
// status da campanha. Animação "fliperama" deliberada (exceção registrada ao motion
// sutil do app-mãe — doc 12).
export function RevealCard({
  answer,
  guess,
  onNext,
}: {
  answer: RetroAnswerResult;
  guess: { home: number | null; away: number | null };
  onNext: () => void;
}) {
  const r = answer.result;
  const run = answer.run;
  const verdict = VERDICT[r.score_type];
  const finished = run.status !== "playing";
  const penaltyOut = run.status === "eliminated" && r.score_type === "acerto" && run.slot >= 6;

  // som + vibração no reveal: acerto, ficha ganha e fanfarra de campeão/zerou
  useEffect(() => {
    sfxScore(r.timeout ? "erro" : r.score_type);
    if (r.reroll_earned) window.setTimeout(sfxToken, 320);
    if (run.status === "champion") {
      const zerou = verdictBadge({ level: run.level, points: run.points }) === "zerou";
      window.setTimeout(zerou ? sfxZerou : sfxChampion, 280);
    }
    // só no mount deste reveal (1 jogo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative">
      {/* campeão = celebração maior (confete denso) que uma cravada qualquer */}
      {run.status === "champion" ? <Confetti tall /> : r.score_type === "cravada" && <Confetti />}
      <div className={cn("space-y-4 text-center", r.score_type === "erro" && "animate-retro-shake")}>
        <div
          className={cn(
            "animate-retro-stamp mx-auto inline-block rounded-lg px-5 py-2 text-2xl font-bold tracking-wide",
            verdict.cls,
          )}
        >
          {r.timeout ? "TEMPO ESGOTADO!" : verdict.label}
        </div>

        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Placar real</p>
          <p className="animate-retro-flip mx-auto mt-1 inline-block rounded-lg bg-[var(--retro-board)] px-6 py-2 text-5xl font-bold tabular-nums text-[var(--retro-board-digit)] shadow-pop">
            {formatScore(r.home_score, r.away_score)}
          </p>
          <p className="mt-1 min-h-4 text-xs text-ink-500">
            {[
              r.went_extra_time && "com prorrogação",
              r.pens_home != null && `pênaltis ${r.pens_home}–${r.pens_away} (não contam)`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <div className="flex items-center justify-center gap-3 text-sm">
          <span className="text-ink-500">
            Seu palpite: <b className="tabular-nums">{formatScore(guess.home, guess.away)}</b>
          </span>
          <ScorePill type={r.score_type} withLabel />
        </div>
        {r.reroll_earned && (
          <p className="animate-retro-stamp text-sm font-bold text-gold-700">
            +1 🎲 ficha de troca de jogo — guarde para a hora certa!
          </p>
        )}
        {penaltyOut && (
          <p className="text-sm font-semibold text-aqua-700">
            Eliminado nos pênaltis 😬 — aqui só <b>saldo ou cravada</b> passava.
          </p>
        )}

        {finished ? (
          <Button onClick={onNext} className="w-full" size="lg">
            {run.status === "champion" ? "VER MINHA CAMPANHA 🏆" : "Ver minha campanha"}
          </Button>
        ) : (
          <Button onClick={onNext} className="w-full" size="lg">
            {r.passed ? "PRÓXIMO JOGO →" : "Continuar"}
          </Button>
        )}
      </div>
    </div>
  );
}
