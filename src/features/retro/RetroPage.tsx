import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";
import { useEffect } from "react";
import { teamCrestPath } from "@/lib/teamCrests";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import type { ScoreType } from "@/lib/types";
import {
  useRetroAbandon,
  useRetroAnswer,
  useRetroMyStats,
  useRetroNext,
  useRetroReroll,
  useRetroConfig,
  useRetroStart,
  useRetroToday,
  type RetroAnswerResult,
  type RetroCurrent,
  type RetroFormat,
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
  format: RetroFormat;
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
    stageReached: ans.run.stage_reached,
    points: ans.run.points,
    totalMs: ans.run.total_ms,
    shareCode: run.shareCode,
    isDaily: run.isDaily,
    format: run.format,
    pace: run.pace,
    slots: run.slots,
  };
}

const PACE_HINT: Record<RetroPace, string> = {
  sempressa: "Sem cronômetro. Pensa à vontade, sem ranking.",
  resultadista: "10s → 8s → 7s por jogo. O ritmo que vale ranking.",
  classico: "", // aposentado na rodada 6 (valor segue válido p/ runs antigas)
};

// /retro — a casa do mini-jogo: landing + Seleção do Dia + Jogo livre + a run em si.
export function RetroPage() {
  const { user, isAppAdmin } = useAuth();
  const { open: openLogin } = useLoginModal();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("home");
  const [format, setFormat] = useState<RetroFormat>("copa");
  const [pace, setPace] = useState<RetroPace>("resultadista");
  const [run, setRun] = useState<ActiveRun | null>(null);
  const startMut = useRetroStart();
  const answerMut = useRetroAnswer();
  const nextMut = useRetroNext();
  const rerollMut = useRetroReroll();
  const abandonMut = useRetroAbandon();
  const [confirmExit, setConfirmExit] = useState(false);
  const [startKind, setStartKind] = useState<"daily" | "training" | null>(null);
  const myStats = useRetroMyStats();
  const today = useRetroToday();
  const config = useRetroConfig();
  useEffect(() => warmRetroFlags(teamCrestPath), []);

  function start(daily: boolean) {
    if (startMut.isPending) return;
    setStartKind(daily ? "daily" : "training");
    startMut.mutate(
      { format, pace, daily, level: "facil" },
      {
        onSuccess: (s: RetroStart) => {
          track("retro_run_start", { format: s.format, pace: s.pace, daily });
          if (s.resumed) toast("Retomando a sua Seleção do Dia de onde parou!", "info");
          retroMarkSeen(s.current?.match_id);
          const base: ActiveRun = {
            runId: s.run_id,
            shareCode: s.share_code,
            format: s.format,
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
        onSettled: () => setStartKind(null),
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

  // sair no meio da run: Treino abandona direto; Copa do Dia pede confirmação
  // (perde o ranking do dia — W.O. no resto, sem retomada)
  function requestExit() {
    if (!run) return;
    if (run.isDaily) setConfirmExit(true);
    else doAbandon();
  }

  function doAbandon() {
    if (!run) return;
    setConfirmExit(false);
    abandonMut.mutate(
      { runId: run.runId },
      { onSettled: backHome },
    );
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
          format={format}
          pace={pace}
          setFormat={setFormat}
          setPace={setPace}
          todayTeam={today.data ?? null}
          startingDaily={startKind === "daily"}
          startingTraining={startKind === "training"}
          anyStarting={startMut.isPending}
          playedToday={stats.playedToday}
          streak={stats.streak}
          best={stats.best}
          isLogged={!!user}
          isAdmin={isAppAdmin}
          onLogin={openLogin}
          onStart={start}
          onGoMain={() => navigate("/")}
          onFeedback={() => navigate("/retro/feedback")}
          onRules={() => navigate("/retro/regras")}
          onAdmin={() => navigate("/admin/retro")}
        />
      )}
      {phase === "play" && run?.current && (
        <div
          data-retro-play
          className="fixed inset-0 z-[70] flex flex-col bg-[var(--color-background)] px-3 pb-3 pt-2"
        >
          <RunView
            key={run.current.match_id}
            current={run.current}
            format={run.format}
            enforce={config.data?.enforce_knockout_bar ?? false}
            points={run.points}
            rerolls={run.rerolls}
            slots={run.slots}
            answering={answerMut.isPending}
            rerolling={rerollMut.isPending}
            onSubmit={submitGuess}
            onReroll={rerollCurrent}
            onExit={requestExit}
          />
          <ConfirmDialog
            open={confirmExit}
            title="Sair da Seleção do Dia?"
            message="Saindo agora, você PERDE o ranking de hoje: os jogos restantes viram W.O. e a campanha fica como está. Não dá pra continuar depois."
            step2Message="Última chance: a Seleção do Dia de hoje encerra de vez. Confirma a saída?"
            confirmLabel="Sair e encerrar"
            loading={abandonMut.isPending}
            onConfirm={doAbandon}
            onCancel={() => setConfirmExit(false)}
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
  format,
  pace,
  setFormat,
  setPace,
  todayTeam,
  startingDaily,
  startingTraining,
  anyStarting,
  playedToday,
  streak,
  best,
  isLogged,
  isAdmin,
  onLogin,
  onStart,
  onGoMain,
  onFeedback,
  onRules,
  onAdmin,
}: {
  format: RetroFormat;
  pace: RetroPace;
  setFormat: (f: RetroFormat) => void;
  setPace: (p: RetroPace) => void;
  todayTeam: { team_slug: string; team_name_pt: string } | null;
  startingDaily: boolean;
  startingTraining: boolean;
  anyStarting: boolean;
  playedToday: boolean;
  streak: number;
  best: { stage_reached: string | null; points: number; total_ms: number; format: RetroFormat } | null;
  isLogged: boolean;
  isAdmin: boolean;
  onLogin: () => void;
  onStart: (daily: boolean) => void;
  onGoMain: () => void;
  onFeedback: () => void;
  onRules: () => void;
  onAdmin: () => void;
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
                melhor: {best.format === "pontos" ? `${best.points} pts` : best.stage_reached} ({fmtMs(best.total_ms)})
              </>
            )}
          </p>
        )}
      </Card>

      <Card className="space-y-3 p-4">
        {/* empilhado (label em cima, controle largura cheia): nada de texto quebrando */}
        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Formato</span>
          <SegmentedControl<RetroFormat>
            className="w-full whitespace-nowrap"
            options={[
              { value: "copa", label: "Copa 🏆" },
              { value: "pontos", label: "Pontos 🎯" },
            ]}
            value={format}
            onChange={setFormat}
          />
          <p className="text-xs text-ink-500">
            {format === "copa"
              ? "Eliminatório: erre e tá fora. Sobreviva aos 7 e seja campeão."
              : "Joga os 7 jogos e soma. Quem faz mais pontos vence — sem eliminação."}
          </p>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Ritmo · com ou sem tempo</span>
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

        {todayTeam && (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-brand-500/10 px-3 py-2">
            <RetroCrest slug={todayTeam.team_slug} name={todayTeam.team_name_pt} size={28} />
            <p className="text-sm font-bold text-brand-800">
              Hoje: <span className="uppercase">{todayTeam.team_name_pt}</span>
              <span className="block text-[11px] font-medium text-ink-500">
                7 jogos da seleção, do mais fácil ao mais difícil
              </span>
            </p>
          </div>
        )}
        {playedToday ? (
          <div className="rounded-lg bg-ink-100 p-3 text-center text-sm">
            ✅ Você já jogou a Seleção do Dia. <b>Volte amanhã</b> — ou jogue livre.
          </div>
        ) : (
          <Button
            size="lg"
            className="w-full text-base font-bold"
            loading={startingDaily}
            disabled={anyStarting}
            onClick={() => onStart(true)}
          >
            Jogar a Seleção do Dia ⚽
          </Button>
        )}
        <div>
          <Button
            variant="secondary"
            className="w-full font-bold"
            loading={startingTraining}
            disabled={anyStarting}
            onClick={() => onStart(false)}
          >
            Jogo livre
          </Button>
          <p className="mt-1 text-center text-[11px] text-ink-500">jogos aleatórios, sem ranking</p>
        </div>
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
          <li>Aparece um jogo real de Copa — segundos pra cravar o placar.</li>
          <li>
            <b className="text-gold-700">Cravada +3</b> · <b className="text-grass-600">saldo +2</b>{" "}
            · <b className="text-aqua-700">acerto +1</b>.
          </li>
          <li><b>Copa 🏆</b>: erre e tá fora. <b>Pontos 🎯</b>: joga os 7 e soma.</li>
        </ol>
        <button
          type="button"
          onClick={onRules}
          className="text-xs font-semibold text-brand-700 underline-offset-2 hover:underline"
        >
          Ver todas as regras →
        </button>
      </Card>

      <RetroLeaderboard />

      {/* ponte pro jogo-mãe: o Retrô é a isca, o bolão da Copa é o destino */}
      <Card className="relative overflow-hidden border-2 border-brand-500 p-4 text-center">
        <p className="text-base font-bold text-ink-900">Quer fazer um bolão com os amigos? ⚽</p>
        <p className="mt-1 text-sm text-ink-600">
          No <b>Resultadismo</b> você crava o placar dos jogos da <b>Copa de verdade</b>, que está
          acontecendo agora, e disputa em grupo com a galera. De graça.
        </p>
        <Button className="mt-3 w-full font-bold" onClick={onGoMain}>
          Bora pro bolão da Copa →
        </Button>
      </Card>

      <div className="flex flex-col items-center gap-1.5 pt-1">
        <button
          type="button"
          onClick={onRules}
          className="text-xs font-semibold text-ink-500 underline-offset-2 hover:underline"
        >
          📖 Como funciona o Retrô (regras)
        </button>
        {isLogged && (
          <button
            type="button"
            onClick={onFeedback}
            className="text-xs font-semibold text-ink-500 underline-offset-2 hover:underline"
          >
            💬 Achou um bug ou tem uma ideia pro Retrô?
          </button>
        )}
        {isAdmin && (
          <button
            type="button"
            onClick={onAdmin}
            className="text-xs font-semibold text-ink-400 underline-offset-2 hover:underline"
          >
            ⚙️ Admin do Retrô
          </button>
        )}
      </div>
    </div>
  );
}
