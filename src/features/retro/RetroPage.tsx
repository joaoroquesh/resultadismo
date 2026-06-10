import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";
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
  useRetroNext,
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
import { RetroStripes } from "./RetroFx";
import { RetroDemo } from "./RetroDemo";
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
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("home");
  const [mode, setMode] = useState<RetroMode>("acerto");
  const [pace, setPace] = useState<RetroPace>("resultadista");
  const [run, setRun] = useState<ActiveRun | null>(null);
  const startMut = useRetroStart();
  const answerMut = useRetroAnswer();
  const nextMut = useRetroNext();
  const myStats = useRetroMyStats();
  useRetroAnonHeartbeat();

  function start(daily: boolean) {
    if (startMut.isPending) return;
    startMut.mutate(
      { mode, pace, daily },
      {
        onSuccess: (s: RetroStart) => {
          track("retro_run_start", { mode: s.mode, pace: s.pace, daily });
          if (s.resumed) toast("Retomando a sua Copa do Dia de onde parou!", "info");
          retroMarkSeen(s.current?.match_id);
          const base: ActiveRun = {
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
          };
          if (s.current) {
            setRun(base);
            setPhase("play");
          } else {
            // retomada no meio: o slot atual ainda não foi servido — pede agora
            nextMut.mutate(
              { runId: s.run_id },
              {
                onSuccess: (cur) => {
                  retroMarkSeen(cur.match_id);
                  setRun({ ...base, current: cur });
                  setPhase("play");
                },
                onError: (e) => toast(e.message, "error"),
              },
            );
          }
        },
        onError: (e) => toast(e.message, "error"),
      },
    );
  }

  function submitGuess(home: number, away: number) {
    if (!run?.current || answerMut.isPending) return;
    answerMut.mutate(
      { runId: run.runId, home, away },
      {
        onSuccess: (ans) => {
          track("retro_guess", {
            slot: ans.run.slot,
            score_type: ans.result.score_type,
            timeout: ans.result.timeout,
          });
          if (ans.run.status !== "playing") {
            track("retro_run_end", {
              status: ans.run.status,
              stage_rank: ans.run.stage_rank ?? 0,
              points: ans.run.points,
              daily: run?.isDaily ?? false,
            });
          }
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
    if (!run || !ans || nextMut.isPending) return;
    if (ans.run.status !== "playing") {
      setPhase("done");
      return;
    }
    nextMut.mutate(
      { runId: run.runId },
      {
        onSuccess: (cur) => {
          retroMarkSeen(cur.match_id);
          setRun({ ...run, current: cur, lastAnswer: null });
          setPhase("play");
        },
        onError: (e) => toast(e.message, "error"),
      },
    );
  }

  function backHome() {
    setRun(null);
    setPhase("home");
  }

  const finished = toFinishedRun(run);

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo")) {
    return (
      <Page title="Resultadismo Retrô · demo">
        <RetroDemo />
      </Page>
    );
  }

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
          onGoMain={() => navigate("/")}
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
  onGoMain,
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
  onGoMain: () => void;
}) {
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* hero retrô: scanlines + listras nas cores da pontuação (D15) */}
      <Card className="retro-scanlines relative overflow-hidden border-2 border-ink-950 bg-brand-700 p-5 text-white">
        <RetroStripes className="absolute inset-x-0 top-0" />
        <RetroStripes className="absolute inset-x-0 bottom-0" />
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
        {/* empilhado (label em cima, controle largura cheia): nada de texto quebrando */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Modo</span>
          <SegmentedControl<RetroMode>
            className="w-full whitespace-nowrap"
            options={[
              { value: "acerto", label: "Acerto" },
              { value: "cravada", label: "Só Cravada" },
            ]}
            value={mode}
            onChange={setMode}
          />
          <p className="text-xs text-ink-500">
            {mode === "acerto"
              ? "Pontuou, avançou (na semi e na final só saldo ou cravada salvam)."
              : "Só o placar EXATO te leva adiante. Para quem não treme."}
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Ritmo</span>
          <SegmentedControl<RetroPace>
            className="w-full whitespace-nowrap"
            options={[
              { value: "resultadista", label: "Resultadista" },
              { value: "classico", label: "Clássico" },
              { value: "sempressa", label: "Sem Pressa" },
            ]}
            value={pace}
            onChange={setPace}
          />
          <p className="text-xs text-ink-500">{PACE_HINT[pace]}</p>
        </div>

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

      <Card className="p-4 text-center">
        <p className="text-sm text-ink-700">
          O Retrô é o irmão nostálgico do <b>Resultadismo</b> — lá você palpita nos jogos{" "}
          <b>reais de hoje</b> e disputa em grupos com os amigos.
        </p>
        <Button variant="ghost" className="mt-1 w-full" onClick={onGoMain}>
          ← Voltar pro Resultadismo
        </Button>
      </Card>
    </div>
  );
}
