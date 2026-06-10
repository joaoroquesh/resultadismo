import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";
import { useEffect } from "react";
import { teamCrestPath } from "@/lib/teamCrests";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import type { ScoreType } from "@/lib/types";
import {
  type RetroLevel,
  useRetroAnonHeartbeat,
  useRetroAnswer,
  useRetroMyStats,
  useRetroNext,
  useRetroReroll,
  useRetroStart,
  useRetroToday,
  type RetroAnswerResult,
  type RetroCurrent,
  type RetroMode,
  type RetroPace,
  type RetroStart,
} from "./api";
import { retroMarkSeen, warmRetroFlags } from "./retroLocal";
import { RetroCrest } from "./RetroCrest";
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
  rerolls: number;
  slots: (TrailSlot & { scoreType: ScoreType })[];
  current: RetroCurrent | null;
  lastAnswer: RetroAnswerResult | null;
  lastGuess: { home: number | null; away: number | null };
};

function viewStats(d: ReturnType<typeof useRetroMyStats>["data"]) {
  return {
    playedToday: d?.played_today ?? false,
    streak: d?.streak ?? 0,
    best: d?.best ?? null,
  };
}

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
  sempressa: "Sem cronômetro. Pensa à vontade, sem ranking.",
  resultadista: "10s → 8s → 7s por jogo. O ritmo que vale ranking.",
  classico: "", // aposentado na rodada 6 (valor segue válido p/ runs antigas)
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
  const [level, setLevel] = useState<RetroLevel>("padrao");
  const [run, setRun] = useState<ActiveRun | null>(null);
  const startMut = useRetroStart();
  const answerMut = useRetroAnswer();
  const nextMut = useRetroNext();
  const rerollMut = useRetroReroll();
  const myStats = useRetroMyStats();
  const today = useRetroToday();
  useRetroAnonHeartbeat();
  useEffect(() => warmRetroFlags(teamCrestPath), []);

  function start(daily: boolean) {
    if (startMut.isPending) return;
    startMut.mutate(
      { mode, pace, daily, level },
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
            rerolls: s.rerolls ?? 0,
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
                  rerolls: ans.run.rerolls,
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

  function rerollCurrent() {
    if (!run?.current || rerollMut.isPending || run.rerolls < 1) return;
    rerollMut.mutate(
      { runId: run.runId },
      {
        onSuccess: (cur) => {
          retroMarkSeen(cur.match_id);
          setRun({ ...run, current: cur, rerolls: cur.rerolls });
          toast("Jogo trocado! 🎲", "info");
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
  const stats = viewStats(myStats.data);

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo")) {
    return <RetroDemo />;
  }

  return (
    <div>
      {phase === "home" && (
        <Home
          mode={mode}
          pace={pace}
          level={level}
          setMode={setMode}
          setPace={setPace}
          setLevel={setLevel}
          todayTeam={today.data ?? null}
          starting={startMut.isPending}
          playedToday={stats.playedToday}
          streak={stats.streak}
          best={stats.best}
          isLogged={!!user}
          onLogin={openLogin}
          onStart={start}
          onGoMain={() => navigate("/")}
        />
      )}
      {phase === "play" && run?.current && (
        <div
          data-retro-play
          className="fixed inset-0 z-[70] flex flex-col bg-[var(--color-background)] px-3 pb-3 pt-2"
        >
          <button
            type="button"
            onClick={backHome}
            className="self-end pb-1 text-[11px] font-semibold text-ink-400"
          >
            sair ✕
          </button>
          <RunView
            key={run.current.match_id}
            current={run.current}
            points={run.points}
            rerolls={run.rerolls}
            slots={run.slots}
            answering={answerMut.isPending}
            rerolling={rerollMut.isPending}
            onSubmit={submitGuess}
            onReroll={rerollCurrent}
          />
        </div>
      )}
      {phase === "reveal" && run?.lastAnswer && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[var(--color-background)] p-4">
          <div className="w-full max-w-md">
            <Card className="p-5">
              <RevealCard answer={run.lastAnswer} guess={run.lastGuess} onNext={advanceFromReveal} />
            </Card>
          </div>
        </div>
      )}
      {phase === "done" && finished && (
        <ResultView
          run={finished}
          streak={user ? stats.streak : undefined}
          onPlayTraining={() => {
            setRun(null);
            start(false);
          }}
          onBackHome={backHome}
        />
      )}
    </div>
  );
}

function Home({
  mode,
  pace,
  level,
  setMode,
  setPace,
  setLevel,
  todayTeam,
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
  level: RetroLevel;
  setMode: (m: RetroMode) => void;
  setPace: (p: RetroPace) => void;
  setLevel: (l: RetroLevel) => void;
  todayTeam: { team_slug: string; team_name_pt: string } | null;
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
              { value: "acerto", label: "Vale Ponto" },
              { value: "cravada", label: "Vale Saldo" },
            ]}
            value={mode}
            onChange={setMode}
          />
          <p className="text-xs text-ink-500">
            {mode === "acerto"
              ? "Qualquer ponto avança — mas a semi pede SALDO e a final, CRAVADA."
              : "Acerto simples não vale: saldo/cravada sempre — e a final, CRAVADA."}
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Ritmo</span>
          <SegmentedControl<RetroPace>
            className="w-full whitespace-nowrap"
            options={[
              { value: "sempressa", label: "Sem Pressa" },
              { value: "resultadista", label: "Resultadista" },
            ]}
            value={pace}
            onChange={setPace}
          />
          <p className="text-xs text-ink-500">{PACE_HINT[pace]}</p>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-500">
            Dificuldade do Treino
          </span>
          <SegmentedControl<RetroLevel>
            className="w-full whitespace-nowrap"
            options={[
              { value: "facil", label: "Fácil" },
              { value: "padrao", label: "Padrão" },
              { value: "dificil", label: "Difícil" },
            ]}
            value={level}
            onChange={setLevel}
          />
          <p className="text-xs text-ink-500">
            Vale só no Treino (e o ranking de Treino compara o Padrão). A Copa do Dia tem
            dificuldade própria: do fácil ao difícil.
          </p>
        </div>

        {todayTeam && (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-brand-500/10 px-3 py-2">
            <RetroCrest slug={todayTeam.team_slug} name={todayTeam.team_name_pt} size={28} />
            <p className="text-sm font-bold text-brand-800">
              Hoje: a Copa de <span className="uppercase">{todayTeam.team_name_pt}</span>
              <span className="block text-[11px] font-medium text-ink-500">
                7 jogos da seleção, do mais fácil ao mais difícil
              </span>
            </p>
          </div>
        )}
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
