// Partida ao vivo em tempo real. Roda o motor com createMatch + stepMinute num
// intervalo; velocidades 1x/2x/4x, pausar e pular tempo. Placar no formato Copa
// 2026 (Scoreboard), abas Transmissão/Estatísticas de mesma altura. AO VIVO, só a
// postura é ajustável (muta a tática + recompute(state)); nada de Pressionar/Recuar.
// Para no minuto 45 e chama o Vestiário (intervalo); termina aos 90.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Team } from "../types";
import { recompute } from "./sim.ts";
import type { MatchState, MatchEvent } from "./sim.ts";
import { stepMinute } from "./sim.ts";
import { buildTicker } from "./narration.ts";
import { Scoreboard, type ScoreboardGoal } from "./Scoreboard";
import { StatsPanel } from "./Stats";
import { Ticker } from "./Ticker";
import { PosturaSlider } from "./TacticPicker";
import { BroadcastIcon, ChartIcon, PlayIcon, PauseIcon, SkipIcon } from "./icons";

export type LiveSpeed = 1 | 2 | 4;

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 1x: cada tempo (45 min de relógio) dura ~45s reais.
const SECONDS_PER_HALF = 45;
const BASE_MS_PER_MIN = (SECONDS_PER_HALF * 1000) / 45;
const TICK_MS = 60;
const msPerMin = (speed: number) => BASE_MS_PER_MIN / speed;

// ==== barra de controle (velocidade + pausar + pular tempo) ====
function ControlBar({
  speed,
  onSpeed,
  paused,
  onTogglePause,
  onSkip,
  skipLabel,
  disabled,
}: {
  speed: LiveSpeed;
  onSpeed: (s: LiveSpeed) => void;
  paused: boolean;
  onTogglePause: () => void;
  onSkip: () => void;
  skipLabel: string;
  disabled: boolean;
}) {
  const opts: LiveSpeed[] = [1, 2, 4];
  return (
    <div className="flex items-center gap-2">
      <div role="group" aria-label="Velocidade da transmissão" className="flex flex-1 gap-1 rounded-[12px] border border-border bg-surface-2 p-1">
        {opts.map((s) => {
          const on = speed === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              aria-label={`Velocidade ${s} vezes`}
              disabled={disabled || paused}
              onClick={() => onSpeed(s)}
              className={`flex min-h-[40px] flex-1 items-center justify-center rounded-[9px] text-[13px] font-black tabular-nums transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.95] disabled:opacity-45 ${
                on ? "scale-[1.04] bg-brand-600 text-white shadow-sm" : "text-ink-600 hover:text-ink-800"
              }`}
            >
              {s}x
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onTogglePause}
        disabled={disabled}
        aria-pressed={paused}
        aria-label={paused ? "Retomar a partida" : "Pausar a partida"}
        className={`flex min-h-[40px] items-center gap-1.5 rounded-[12px] border px-3 text-[13px] font-bold transition-colors active:scale-[0.98] disabled:opacity-45 ${
          paused ? "border-brand-500 bg-brand-600 text-white" : "border-border bg-surface text-ink-800 hover:bg-surface-2"
        }`}
      >
        {paused ? <PlayIcon size={14} /> : <PauseIcon size={14} />}
        {paused ? "Retomar" : "Pausar"}
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={disabled || paused}
        aria-label={skipLabel}
        className="flex min-h-[40px] items-center gap-1.5 rounded-[12px] border border-border bg-surface px-3 text-[13px] font-bold text-ink-800 transition-colors hover:bg-surface-2 active:scale-[0.98] disabled:opacity-45"
      >
        <SkipIcon size={14} />
        Pular tempo
      </button>
    </div>
  );
}

function Tabs({ value, onChange }: { value: "feed" | "stats"; onChange: (v: "feed" | "stats") => void }) {
  const tabs: { id: "feed" | "stats"; label: string; Icon: typeof BroadcastIcon }[] = [
    { id: "feed", label: "Transmissão", Icon: BroadcastIcon },
    { id: "stats", label: "Estatísticas", Icon: ChartIcon },
  ];
  return (
    <div role="tablist" aria-label="Visão da partida" className="flex gap-1 rounded-[13px] border border-border bg-surface-2 p-1">
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`rd-live-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`rd-live-panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-bold transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
              on ? "scale-[1.02] bg-brand-600 text-white shadow-sm" : "text-ink-600 hover:text-ink-800"
            }`}
          >
            <t.Icon size={15} />
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export interface LiveResult {
  score: [number, number];
  state: MatchState;
}

export function LiveMatchView({
  teamA,
  teamB,
  state,
  onPosturaChange,
  onHalftime,
  onFinish,
}: {
  teamA: Team;
  teamB: Team;
  // estado do motor é DONO do orquestrador (sobrevive ao Vestiário, que é uma tela
  // sobreposta). 1º e 2º tempo usam o MESMO state.
  state: MatchState;
  // postura ajustada ao vivo (sobe pro orquestrador manter o plano do 2º tempo)
  onPosturaChange?: (postura: number) => void;
  // dispara no minuto 45 com o estado atual (abre o Vestiário)
  onHalftime: (state: MatchState) => void;
  // dispara no fim (90) com o resultado
  onFinish: (result: LiveResult) => void;
}) {
  // estado do motor vive na ref recebida; espelhamos o que a UI precisa em useState.
  const stateRef = useRef<MatchState>(state);

  // se já passou do 45 (voltando pro 2º tempo), o intervalo já foi mostrado.
  const resuming = state.minute >= 45;

  const [minute, setMinute] = useState(state.minute);
  const [score, setScore] = useState<[number, number]>([state.score[0], state.score[1]]);
  const [possA, setPossA] = useState(state.stats.posse[0]);
  const [ballSide, setBallSide] = useState<0 | 1>(state.ballSide);
  const [pop, setPop] = useState<0 | 1 | null>(null);
  const [tickerEvents, setTickerEvents] = useState<MatchEvent[]>([]);
  const [stats, setStats] = useState(() => state.stats);
  const [tab, setTab] = useState<"feed" | "stats">("feed");
  const [speed, setSpeed] = useState<LiveSpeed>(1);
  const [paused, setPaused] = useState(false);
  const [finished, setFinished] = useState(state.finished);
  const [postura, setPostura] = useState(state.tactics[0].postura);

  const speedRef = useRef<LiveSpeed>(1);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const halftimeShownRef = useRef(resuming);
  const popTimerRef = useRef<number | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const syncFromState = useCallback(() => {
    const st = stateRef.current!;
    setMinute(st.minute);
    setScore([st.score[0], st.score[1]]);
    setPossA(st.stats.posse[0]);
    setBallSide(st.ballSide);
    setStats({ ...st.stats, posse: [st.stats.posse[0], st.stats.posse[1]] });
    setTickerEvents(buildTicker(st.events, [teamA.n, teamB.n], st.seed));
  }, [teamA.n, teamB.n]);

  const flashGoal = useCallback((side: 0 | 1) => {
    setPop(side);
    if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
    popTimerRef.current = window.setTimeout(() => setPop(null), 600);
  }, []);

  // um minuto de jogo
  const advanceOne = useCallback(() => {
    const st = stateRef.current!;
    if (st.finished) return;
    const evs = stepMinute(st);
    for (const e of evs) if (e.kind === "gol" && (e.side === 0 || e.side === 1)) flashGoal(e.side);
    syncFromState();
  }, [flashGoal, syncFromState]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const openHalftime = useCallback(() => {
    if (halftimeShownRef.current) return;
    halftimeShownRef.current = true;
    stopTimer();
    syncFromState();
    onHalftime(stateRef.current!);
  }, [onHalftime, stopTimer, syncFromState]);

  const endMatch = useCallback(() => {
    stopTimer();
    const st = stateRef.current!;
    syncFromState();
    setFinished(true);
    onFinish({ score: [st.score[0], st.score[1]], state: st });
  }, [onFinish, stopTimer, syncFromState]);

  const frame = useCallback(() => {
    const st = stateRef.current!;
    if (st.finished) return;
    const now = performance.now();
    accRef.current += now - lastRef.current;
    lastRef.current = now;
    const mpm = msPerMin(speedRef.current);
    let steps = Math.floor(accRef.current / mpm);
    if (steps <= 0) return;
    accRef.current -= steps * mpm;
    while (steps-- > 0) {
      // para no intervalo (minuto 45) antes de seguir
      if (st.minute >= 45 && !halftimeShownRef.current) {
        openHalftime();
        return;
      }
      advanceOne();
      if (st.minute === 45 && !halftimeShownRef.current) {
        openHalftime();
        return;
      }
      if (st.finished) {
        endMatch();
        return;
      }
    }
  }, [advanceOne, endMatch, openHalftime]);

  const startTimer = useCallback(() => {
    stopTimer();
    lastRef.current = performance.now();
    accRef.current = 0;
    timerRef.current = window.setInterval(frame, TICK_MS);
  }, [frame, stopTimer]);

  // arranca a partida ao montar (1º tempo) e ao retomar (2º tempo, mesmo state).
  // halftimeShownRef já vem true no 2º tempo, então o frame NÃO reabre o Vestiário.
  useEffect(() => {
    syncFromState();
    if (!stateRef.current.finished) startTimer();
    return () => {
      stopTimer();
      if (popTimerRef.current) window.clearTimeout(popTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const togglePause = useCallback(() => {
    if (finished) return;
    setPaused((p) => {
      const next = !p;
      if (next) stopTimer();
      else startTimer();
      return next;
    });
  }, [finished, startTimer, stopTimer]);

  const skipHalf = useCallback(() => {
    const st = stateRef.current!;
    if (st.finished) return;
    stopTimer();
    if (st.minute < 45 && !halftimeShownRef.current) {
      while (st.minute < 45 && !st.finished) advanceOne();
      openHalftime();
      return;
    }
    while (st.minute < 90 && !st.finished) advanceOne();
    endMatch();
  }, [advanceOne, endMatch, openHalftime, stopTimer]);

  // postura ao vivo: muta a tática do motor + recompute (sem Pressionar/Recuar).
  const changePostura = useCallback(
    (v: number) => {
      setPostura(v);
      const st = stateRef.current!;
      st.tactics[0].postura = v;
      recompute(st);
      onPosturaChange?.(v);
    },
    [onPosturaChange],
  );

  const skipLabel = minute < 45 ? "Pular para o intervalo" : "Pular para o fim";

  const feedPanel = (
    <Ticker events={tickerEvents} />
  );
  const statsPanel = <StatsPanel stats={stats} myName={teamA.n} oppName={teamB.n} />;

  const tacPanel = (
    <div className="rounded-[14px] border border-border bg-surface p-3.5">
      <PosturaSlider
        value={postura}
        onChange={changePostura}
        disabled={finished}
        label="Ajuste ao vivo: postura"
        hint="Único ajuste no meio do jogo. Mais ofensiva arrisca pra atacar, mais recuada protege o resultado."
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-20 -mx-1 bg-background/85 px-1 pb-1 pt-0.5 backdrop-blur-sm">
        <Scoreboard
          teamA={teamA}
          teamB={teamB}
          score={score}
          goals={tickerEvents.filter((e) => e.kind === "gol" && (e.side === 0 || e.side === 1)).map((e) => ({ side: e.side as 0 | 1, minute: e.minute })) as ScoreboardGoal[]}
          minute={minute}
          finished={finished}
          possA={possA}
          ballSide={ballSide}
          pop={pop}
        />
        {!finished && (
          <div className="mt-2">
            <ControlBar
              speed={speed}
              onSpeed={setSpeed}
              paused={paused}
              onTogglePause={togglePause}
              onSkip={skipHalf}
              skipLabel={skipLabel}
              disabled={finished}
            />
          </div>
        )}
      </div>

      {/* mobile: abas; desktop: lado a lado */}
      <div className="lg:hidden">
        <Tabs value={tab} onChange={setTab} />
        <div className="mt-2">
          {tab === "feed" ? (
            <div role="tabpanel" id="rd-live-panel-feed" aria-labelledby="rd-live-tab-feed">{feedPanel}</div>
          ) : (
            <div role="tabpanel" id="rd-live-panel-stats" aria-labelledby="rd-live-tab-stats">{statsPanel}</div>
          )}
        </div>
        {!finished && <div className="mt-3">{tacPanel}</div>}
      </div>

      <div className="hidden gap-4 lg:grid lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            <BroadcastIcon size={13} /> Transmissão ao vivo
          </div>
          {feedPanel}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
              <ChartIcon size={13} /> Estatísticas ao vivo
            </div>
            {statsPanel}
          </div>
          {!finished && tacPanel}
        </div>
      </div>
      {REDUCED ? null : null}
    </div>
  );
}
