import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { track } from "@/lib/analytics";
import { teamCrestPath } from "@/lib/teamCrests";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import type { ScoreType } from "@/lib/types";
import {
  LEVEL_EMOJI,
  LEVEL_LABEL,
  useRetroAbandon,
  useRetroAnswer,
  useRetroDailyExtras,
  useRetroMyStats,
  useRetroNext,
  useRetroReroll,
  useRetroConfig,
  useRetroStart,
  useRetroToday,
  type RetroAnswerResult,
  type RetroCurrent,
  type RetroLevel,
  type RetroPace,
  type RetroStart,
} from "./api";
import { dailyEdition } from "./share";
import { retroMarkSeen, warmRetroFlags } from "./retroLocal";
import { RetroCrest } from "./RetroCrest";
import { RunView } from "./RunView";
import { RevealCard } from "./RevealCard";
import { ResultView } from "./ResultView";
import { RetroIntro } from "./RetroIntro";
import { type FinishedRun } from "./share";
import { RetroLeaderboard } from "./RetroLeaderboard";
import { RetroStripes } from "./RetroFx";
import { RetroDemo } from "./RetroDemo";
import type { TrailSlot } from "./CampaignTrail";

type Phase = "home" | "play" | "reveal" | "done";

type ActiveRun = {
  runId: string;
  shareCode: string;
  level: RetroLevel;
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

function toFinishedRun(
  run: ActiveRun | null,
  today: { daily_date: string; team_name_pt: string } | null,
): FinishedRun | null {
  const ans = run?.lastAnswer;
  if (!run || !ans || ans.run.status === "playing") return null;
  return {
    status: ans.run.status,
    stageReached: ans.run.stage_reached,
    stageRank: ans.run.stage_rank,
    points: ans.run.points,
    totalMs: ans.run.total_ms,
    shareCode: run.shareCode,
    isDaily: run.isDaily,
    format: "copa",
    level: run.level,
    pace: run.pace,
    dailyDate: run.isDaily ? today?.daily_date ?? null : null,
    dailyTeam: run.isDaily ? today?.team_name_pt ?? null : null,
    slots: run.slots,
  };
}

// /retro — a casa do mini-jogo: landing + Seleção do Dia + Jogo livre + a run em si.
export function RetroPage() {
  const { user, isAppAdmin } = useAuth();
  const { open: openLogin } = useLoginModal();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("home");
  const [level, setLevel] = useState<RetroLevel>("classico");
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
  const dailyExtras = useRetroDailyExtras();
  const config = useRetroConfig();
  useEffect(() => warmRetroFlags(teamCrestPath), []);

  // veio de um link-desafio (/retro?play=daily&vs=CODE): cai direto na MESMA Seleção
  // do Dia e guarda o código do rival (ref — lido só no fim da run, sem re-render).
  const challengeCodeRef = useRef<string | null>(null);
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("play") === "daily" && phase === "home" && !startMut.isPending) {
      autoStarted.current = true;
      challengeCodeRef.current = params.get("vs");
      window.history.replaceState({}, "", "/retro");
      start(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function start(daily: boolean) {
    if (startMut.isPending) return;
    setStartKind(daily ? "daily" : "training");
    startMut.mutate(
      { pace: "resultadista", daily, level: daily ? "classico" : level },
      {
        onSuccess: (s: RetroStart) => {
          track("retro_run_start", { level: s.level, daily });
          if (s.resumed) toast("Retomando a sua Seleção do Dia de onde parou!", "info");
          retroMarkSeen(s.current?.match_id);
          const base: ActiveRun = {
            runId: s.run_id,
            shareCode: s.share_code,
            level: s.level,
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
          // no daily, se a seleção do dia já não tinha outro jogo, veio um aleatório
          toast(
            cur.random_fallback
              ? "Acabaram os jogos dessa seleção — esse veio de outra Copa 🎲"
              : "Jogo trocado! 🎲",
            "info",
          );
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

  const finished = toFinishedRun(run, today.data ?? null);
  const stats = viewStats(myStats.data);

  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has("demo")) {
    return <RetroDemo />;
  }

  return (
    <div>
      {phase === "home" && (
        <Home
          level={level}
          setLevel={setLevel}
          todayTeam={today.data ?? null}
          edition={dailyEdition(today.data?.daily_date)}
          dailyExtras={dailyExtras.data ?? null}
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
          challengeCode={challengeCodeRef.current}
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

// Conta regressiva até a próxima Seleção do Dia (meia-noite de São Paulo, UTC-3).
function Countdown() {
  const [left, setLeft] = useState(msToSpMidnight);
  useEffect(() => {
    const id = window.setInterval(() => setLeft(msToSpMidnight()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const h = Math.floor(left / 3_600_000);
  const m = Math.floor((left % 3_600_000) / 60_000);
  const s = Math.floor((left % 60_000) / 1000);
  return (
    <span className="tabular-nums">
      {String(h).padStart(2, "0")}:{String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
    </span>
  );
}
function msToSpMidnight(): number {
  const now = new Date();
  const sp = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const next = new Date(sp);
  next.setHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - sp.getTime());
}

type DailyExtras = {
  champion: { display_name: string; avatar_url: string | null; team_name_pt: string | null; points: number } | null;
  playedToday: number;
} | null;

// O card da Seleção do Dia: edição + time, countdown, streak em risco/protegida,
// prova social (quantos jogaram), e a coroação do campeão de ontem.
function DailyCard({
  todayTeam,
  edition,
  dailyExtras,
  playedToday,
  streak,
  streakAtRisco,
  startingDaily,
  anyStarting,
  onStart,
}: {
  todayTeam: { team_slug: string; team_name_pt: string } | null;
  edition: number | null;
  dailyExtras: DailyExtras;
  playedToday: boolean;
  streak: number;
  streakAtRisco: boolean;
  startingDaily: boolean;
  anyStarting: boolean;
  onStart: (daily: boolean) => void;
}) {
  return (
    <Card className="space-y-2 border-2 border-brand-500 p-4">
      {todayTeam && (
        <div className="flex items-center justify-center gap-2">
          <RetroCrest slug={todayTeam.team_slug} name={todayTeam.team_name_pt} size={30} />
          <p className="text-sm font-bold text-brand-800">
            Seleção do Dia{edition ? ` #${edition}` : ""}:{" "}
            <span className="uppercase">{todayTeam.team_name_pt}</span>
          </p>
        </div>
      )}
      {playedToday ? (
        <div className="space-y-1 rounded-lg bg-ink-100 p-3 text-center text-sm">
          <p>✅ Você já fez a de hoje{streak > 0 && <> · 🔥 {streak} dia{streak > 1 ? "s" : ""}</>}</p>
          <p className="text-xs text-ink-500">
            Nova Seleção em <b className="text-ink-700"><Countdown /></b> — ou jogue à vontade abaixo.
          </p>
        </div>
      ) : (
        <>
          {streakAtRisco && (
            <p className="rounded-md bg-flame-50 px-3 py-1.5 text-center text-xs font-bold text-flame-700 ring-1 ring-flame-200">
              🔥 Sua sequência de {streak} dia{streak > 1 ? "s" : ""} acaba à meia-noite — jogue pra manter!
            </p>
          )}
          <Button
            size="lg"
            className="w-full text-base font-bold"
            loading={startingDaily}
            disabled={anyStarting}
            onClick={() => onStart(true)}
          >
            Jogar a Seleção do Dia ⚽
          </Button>
          <p className="text-center text-[11px] text-ink-400">
            Nova seleção em <Countdown />
            {dailyExtras && dailyExtras.playedToday > 0 && ` · ${dailyExtras.playedToday} já jogaram hoje`}
          </p>
        </>
      )}
      {dailyExtras?.champion && (
        <p className="border-t border-border pt-2 text-center text-[11px] text-ink-500">
          🏆 Ontem: <b className="text-ink-700">{dailyExtras.champion.display_name}</b> levou a{" "}
          {dailyExtras.champion.team_name_pt ?? "Seleção do Dia"} com {dailyExtras.champion.points} pts
        </p>
      )}
    </Card>
  );
}

function Home({
  level,
  setLevel,
  todayTeam,
  edition,
  dailyExtras,
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
  level: RetroLevel;
  setLevel: (l: RetroLevel) => void;
  todayTeam: { team_slug: string; team_name_pt: string } | null;
  edition: number | null;
  dailyExtras: DailyExtras;
  startingDaily: boolean;
  startingTraining: boolean;
  anyStarting: boolean;
  playedToday: boolean;
  streak: number;
  best: { stage_reached: string | null; points: number; total_ms: number } | null;
  isLogged: boolean;
  isAdmin: boolean;
  onLogin: () => void;
  onStart: (daily: boolean) => void;
  onGoMain: () => void;
  onFeedback: () => void;
  onRules: () => void;
  onAdmin: () => void;
}) {
  const streakAtRisco = streak > 0 && !playedToday;
  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      {/* modal de 1º acesso: como o jogo funciona, em 4 linhas */}
      <RetroIntro onRules={onRules} />
      {/* hero curto */}
      <Card className="retro-scanlines relative overflow-hidden border-2 border-ink-950 bg-brand-700 p-4 text-white">
        <RetroStripes className="absolute inset-x-0 top-0" />
        <RetroStripes className="absolute inset-x-0 bottom-0" />
        <h2 className="text-xl font-bold leading-tight">Você lembra desse placar? 🕹️</h2>
        <p className="mt-0.5 text-sm text-white/90">7 jogos de Copas antigas, segundos pra cravar cada um.</p>
        {isLogged && (streak > 0 || best) && (
          <p className="mt-2 text-xs font-semibold text-white/95">
            {streak > 0 && <>🔥 {streak} dia{streak > 1 ? "s" : ""}{streakAtRisco && " — não perca hoje!"}</>}
            {streak > 0 && best && " · "}
            {best && <>melhor: {best.stage_reached}</>}
          </p>
        )}
      </Card>

      <DailyCard
        todayTeam={todayTeam}
        edition={edition}
        dailyExtras={dailyExtras}
        playedToday={playedToday}
        streak={streak}
        streakAtRisco={streakAtRisco}
        startingDaily={startingDaily}
        anyStarting={anyStarting}
        onStart={onStart}
      />

      {/* JOGO LIVRE — o jogo do dia a dia; 3 modos de dificuldade, ranking por modo */}
      <Card className="space-y-2 p-4">
        <SegmentedControl<RetroLevel>
          className="w-full whitespace-nowrap"
          options={(["amistoso", "classico", "lenda"] as const).map((l) => ({
            value: l,
            label: `${LEVEL_LABEL[l]} ${LEVEL_EMOJI[l]}`,
          }))}
          value={level}
          onChange={setLevel}
        />
        <Button
          variant="secondary"
          className="w-full font-bold"
          loading={startingTraining}
          disabled={anyStarting}
          onClick={() => onStart(false)}
        >
          Jogar livre
        </Button>
        <p className="text-center text-[11px] text-ink-500">
          {level === "amistoso"
            ? "Placares famosos, pra aquecer."
            : level === "classico"
              ? "O desafio de sempre."
              : "Só placar cabeludo. 21 pts aqui = ZEROU O GAME 👾"}{" "}
          {isLogged ? "Entra no ranking 🏆" : (
            <button type="button" className="font-semibold text-brand-700 underline" onClick={onLogin}>
              Entre pra rankear
            </button>
          )}
        </p>
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
