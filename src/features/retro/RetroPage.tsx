import { useState } from "react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import type { ScoreType } from "@/lib/types";
import {
  useRetroAnonHeartbeat,
  useRetroAnswer,
  useRetroMyStats,
  useRetroStart,
  type RetroAnswerResult,
  type RetroCurrent,
  type RetroMode,
  type RetroPace,
  type RetroStart,
} from "./api";
import { retroMarkSeen } from "./retroLocal";
import { RunView } from "./RunView";
import { RevealCard } from "./RevealCard";
import { ResultView } from "./ResultView";
import { fmtMs, type FinishedRun } from "./share";
import { RetroLeaderboard } from "./RetroLeaderboard";
import type { TrailSlot } from "./CampaignTrail";

type Phase = "home" | "play" | "reveal" | "done";

type ActiveRun = {
  runId: string;
  shareCode: string;
  mode: RetroMode;
  pace: RetroPace;
  isDaily: boolean;
  points: number;
  slots: (TrailSlot & { scoreType: ScoreType })[];
  current: RetroCurrent | null;
  lastAnswer: RetroAnswerResult | null;
  lastGuess: { home: number | null; away: number | null };
};

function toFinishedRun(run: ActiveRun | null): FinishedRun | null {
  const ans = run?.lastAnswer;
  if (!run || !ans || ans.run.status === "playing") return null;
  return {
    status: ans.run.status,
    stageReached: ans.run.stage_reached ?? "",
    points: ans.run.points,
    totalMs: ans.run.total_ms,
    shareCode: run.shareCode,
    isDaily: run.isDaily,
    mode: run.mode,
    pace: run.pace,
    slots: run.slots,
  };
}

const PACE_HINT: Record<RetroPace, string> = {
  resultadista: "10s → 8s → 7s por jogo. O único ritmo que vale ranking.",
  classico: "14s → 12s → 10s por jogo. Mais folga, sem ranking.",
  sempressa: "Sem cronômetro. Pensa à vontade, sem ranking.",
};

// /retro — a casa do mini-jogo: landing + Copa do Dia + Treino + a run em si.
export function RetroPage() {
  const { user } = useAuth();
  const { open: openLogin } = useLoginModal();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("home");
  const [mode, setMode] = useState<RetroMode>("acerto");
  const [pace, setPace] = useState<RetroPace>("resultadista");
  const [run, setRun] = useState<ActiveRun | null>(null);
  const startMut = useRetroStart();
  const answerMut = useRetroAnswer();
  const myStats = useRetroMyStats();
  useRetroAnonHeartbeat();

  function start(daily: boolean) {
    if (startMut.isPending) return;
    startMut.mutate(
      { mode, pace, daily },
      {
        onSuccess: (s: RetroStart) => {
          if (s.resumed) toast("Retomando a sua Copa do Dia de onde parou!", "info");
          retroMarkSeen(s.current.match_id);
          setRun({
            runId: s.run_id,
            shareCode: s.share_code,
            mode: s.mode,
            pace: s.pace,
            isDaily: daily,
            points: s.points,
            slots: [],
            current: s.current,
            lastAnswer: null,
            lastGuess: { home: null, away: null },
          });
          setPhase("play");
        },
        onError: (e) => toast(e.message, "error"),
      },
    );
  }

  function submitGuess(home: number | null, away: number | null) {
    if (!run?.current || answerMut.isPending) return;
    answerMut.mutate(
      { runId: run.runId, home, away },
      {
        onSuccess: (ans) => {
          setRun((r) =>
            r && r.current
              ? {
                  ...r,
                  points: ans.run.points,
                  slots: [...r.slots, { slot: r.current.slot, scoreType: ans.result.score_type }],
                  lastAnswer: ans,
                  lastGuess: { home, away },
                }
              : r,
          );
          setPhase("reveal");
        },
        onError: (e) => toast(e.message, "error"),
      },
    );
  }

  function advanceFromReveal() {
    const ans = run?.lastAnswer;
    if (!run || !ans) return;
    if (ans.run.status === "playing" && ans.next) {
      retroMarkSeen(ans.next.match_id);
      setRun({ ...run, current: ans.next, lastAnswer: null });
      setPhase("play");
    } else {
      setPhase("done");
    }
  }

  function backHome() {
    setRun(null);
    setPhase("home");
  }

  const finished = toFinishedRun(run);

  return (
    <Page title="Resultadismo Retrô">
      {phase === "home" && (
        <Home
          mode={mode}
          pace={pace}
          setMode={setMode}
          setPace={setPace}
          starting={startMut.isPending}
          playedToday={myStats.data?.played_today ?? false}
          streak={myStats.data?.streak ?? 0}
          best={myStats.data?.best ?? null}
          isLogged={!!user}
          onLogin={openLogin}
          onStart={start}
        />
      )}
      {phase === "play" && run?.current && (
        <RunView
          key={run.current.match_id}
          current={run.current}
          points={run.points}
          slots={run.slots}
          answering={answerMut.isPending}
          onSubmit={submitGuess}
        />
      )}
      {phase === "reveal" && run?.lastAnswer && (
        <div className="mx-auto w-full max-w-md">
          <Card className="p-5">
            <RevealCard answer={run.lastAnswer} guess={run.lastGuess} onNext={advanceFromReveal} />
          </Card>
        </div>
      )}
      {phase === "done" && finished && (
        <ResultView
          run={finished}
          streak={user ? myStats.data?.streak : undefined}
          onPlayTraining={() => {
            setRun(null);
            start(false);
          }}
          onBackHome={backHome}
        />
      )}
    </Page>
  );
}

function Home({
  mode,
  pace,
  setMode,
  setPace,
  starting,
  playedToday,
  streak,
  best,
  isLogged,
  onLogin,
  onStart,
}: {
  mode: RetroMode;
  pace: RetroPace;
  setMode: (m: RetroMode) => void;
  setPace: (p: RetroPace) => void;
  starting: boolean;
  playedToday: boolean;
  streak: number;
  best: { stage_reached: string; points: number; total_ms: number } | null;
  isLogged: boolean;
  onLogin: () => void;
  onStart: (daily: boolean) => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* hero retrô: listras nas cores da pontuação (identidade adaptada de leve — D15) */}
      <Card className="relative overflow-hidden bg-brand-600 p-5 text-white">
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-1.5"
          style={{
            background:
              "linear-gradient(90deg, var(--color-gold-500) 0 25%, var(--color-grass-600) 0 50%, var(--color-aqua-700) 0 75%, var(--color-brand-400) 0)",
          }}
        />
        <Badge tone="gold" className="mb-2">
          RETRÔ · 1930–2022
        </Badge>
        <h2 className="text-2xl font-bold leading-tight">Você lembra desse placar?</h2>
        <p className="mt-1 text-sm text-white/90">
          7 jogos reais de Copas do Mundo, segundos para cravar cada um. Passe da fase de grupos,
          sobreviva ao mata-mata e seja campeão da <b>sua</b> Copa.
        </p>
        {isLogged && (streak > 0 || best) && (
          <p className="mt-3 text-xs font-semibold text-white/95">
            {streak > 0 && <>🔥 {streak} dia{streak > 1 ? "s" : ""} seguidos</>}
            {streak > 0 && best && " · "}
            {best && (
              <>
                melhor campanha: {best.stage_reached} ({best.points} pts · {fmtMs(best.total_ms)})
              </>
            )}
          </p>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">Modo</span>
          <SegmentedControl<RetroMode>
            options={[
              { value: "acerto", label: "Acerto" },
              { value: "cravada", label: "Só Cravada" },
            ]}
            value={mode}
            onChange={setMode}
          />
        </div>
        <p className="text-xs text-ink-500">
          {mode === "acerto"
            ? "Pontuou, avançou (na semi e na final só saldo ou cravada salvam)."
            : "Só o placar EXATO te leva adiante. Para quem não treme."}
        </p>

        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-bold">Ritmo</span>
          <SegmentedControl<RetroPace>
            options={[
              { value: "resultadista", label: "Resultadista" },
              { value: "classico", label: "Clássico" },
              { value: "sempressa", label: "Sem Pressa" },
            ]}
            value={pace}
            onChange={setPace}
          />
        </div>
        <p className="text-xs text-ink-500">{PACE_HINT[pace]}</p>

        {playedToday ? (
          <div className="rounded-lg bg-ink-100 p-3 text-center text-sm">
            ✅ Você já jogou a Copa do Dia. <b>Volte amanhã</b> — ou treine à vontade.
          </div>
        ) : (
          <Button size="lg" className="w-full text-base font-bold" loading={starting} onClick={() => onStart(true)}>
            Jogar a Copa Retrô de hoje ⚽
          </Button>
        )}
        <Button variant="secondary" className="w-full" disabled={starting} onClick={() => onStart(false)}>
          Treino livre (jogos aleatórios, sem ranking)
        </Button>
        {!isLogged && (
          <p className="text-center text-xs text-ink-500">
            Dá pra jogar sem conta!{" "}
            <button type="button" className="font-semibold text-brand-700 underline" onClick={onLogin}>
              Entre com Google
            </button>{" "}
            para ranking e sequência 🔥
          </p>
        )}
      </Card>

      <Card className="space-y-2 p-4 text-sm">
        <h3 className="font-bold">Como funciona</h3>
        <ol className="list-decimal space-y-1 pl-5 text-ink-700">
          <li>Aparece um jogo real de alguma Copa — você tem segundos para cravar o placar.</li>
          <li>
            <b className="text-gold-700">Cravada</b> vale 3, <b className="text-grass-600">saldo</b>{" "}
            vale 2, <b className="text-aqua-700">acerto</b> vale 1 — pontuou, avançou.
          </li>
          <li>Grupos: passe em 2 de 3. Mata-mata: errou, caiu. Sobreviveu aos 7? Campeão! 🏆</li>
        </ol>
        <p className="text-xs text-ink-500">
          Vale o placar final com prorrogação; pênaltis não contam. Máximo da run: 21 pontos.
        </p>
      </Card>

      <RetroLeaderboard />
    </div>
  );
}
