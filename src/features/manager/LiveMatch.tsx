import { useCallback, useEffect, useRef, useState } from "react";
import type { Campaign, MatchEvent, MatchState, Tactic } from "./types";
import {
  applyCommand,
  createMatch,
  possessionState,
  sideStrength,
  stageLong,
  stepMinute,
  P,
} from "./engine";
import {
  ESTILO_NM,
  FORM_NM,
  MARC_NM,
  POSTURA_NM,
  TICKER_BUILDUP,
  TICKER_CONCLUSION,
  TICKER_INTERRUPT,
  aiReadHint,
  mulberryUi,
} from "./ui";
import { FormGrid, SegBlock } from "./components";
import { ESTILO_OPTS, FORM_OPTS, MARC_OPTS, POSTURA_OPTS } from "./ui";
import { Button } from "@/components/ui/Button";

// ITEM 3: tempo configurável. ~40s por tempo (80s/jogo). Mude SECONDS_PER_HALF.
const SECONDS_PER_HALF = 40;
const TICK_MS = 50;

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 45 minutos de relógio por tempo; um tiquinho mais rápido sem animações.
const MS_PER_MIN = (SECONDS_PER_HALF * 1000) / 45 / (REDUCED ? 1 / 0.78 : 1);
// suspense entre build-up e desfecho
const BUILDUP_DELAY_MS = Math.max(420, Math.min(900, MS_PER_MIN * 1.7));

type TickerKind = "info" | "buildup" | "goal" | "miss" | "cmd";
interface TickerLine {
  id: number;
  min: number;
  kind: TickerKind;
  html: string; // texto já com o nome do time embutido (negrito via <strong>)
}

interface Pending {
  lineId: number;
  ev: MatchEvent;
  due: number;
  interrupted: boolean;
}

function nowMs(): number {
  return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
}
function fmtClock(min: number): string {
  return ("0" + Math.min(min, 90)).slice(-2) + ":00";
}
function pickArr<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
function fillTeam(tpl: string, name: string): string {
  return tpl.replace(/\[Time\]/g, "<strong>" + name + "</strong>");
}

export function LiveMatch({
  campaign,
  opp,
  myTac,
  aiTac,
  matchSeed,
  onMyTacChange,
  onFinish,
}: {
  campaign: Campaign;
  opp: import("./types").Team;
  myTac: Tactic;
  aiTac: Tactic;
  matchSeed: number;
  onMyTacChange: (tac: Tactic) => void;
  onFinish: (gA: number, gB: number) => void;
}) {
  const stateRef = useRef<MatchState | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const pendingRef = useRef<Pending[]>([]);
  const lineSeq = useRef(0);
  const uiRnd = useRef(mulberryUi(20020630 ^ (matchSeed >>> 0)));
  const halftimeShownRef = useRef(false);

  const [score, setScore] = useState({ a: 0, b: 0 });
  const [minute, setMinute] = useState(0);
  const [pop, setPop] = useState<"A" | "B" | null>(null);
  const [lines, setLines] = useState<TickerLine[]>([]);
  const [phase, setPhase] = useState<"live" | "halftime">("live");
  const [cmdStat, setCmdStat] = useState("Aguarde o apito inicial…");
  // espelho render-safe do estado do motor (a render NÃO lê stateRef durante o render)
  const [view, setView] = useState({
    gA: 0,
    gB: 0,
    shareA: 0.5,
    gameVol: 1,
    cooldownUntilMin: -999,
    finished: false,
  });
  const syncView = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    setView({
      gA: st.gA,
      gB: st.gB,
      shareA: st.shareA,
      gameVol: st.gameVol,
      cooldownUntilMin: st.cmdA.cooldownUntilMin,
      finished: st.finished,
    });
  }, []);

  const pushLine = useCallback((min: number, html: string, kind: TickerKind): number => {
    const id = ++lineSeq.current;
    setLines((cur) => [{ id, min, kind, html }, ...cur].slice(0, 40));
    return id;
  }, []);
  const replaceLine = useCallback((id: number, html: string, kind: TickerKind) => {
    setLines((cur) => cur.map((l) => (l.id === id ? { ...l, html, kind } : l)));
  }, []);

  // ----- relógio do banco (leitura de posse) -----
  const refreshCmdStat = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    const m = st.minute;
    const cs = st.cmdA;
    let txt = "";
    if (cs.type && m < cs.untilMin) {
      txt = (cs.type === "press" ? "Pressionando" : "Recuando") + ` — ${cs.untilMin - m}' restantes`;
    } else if (m < cs.cooldownUntilMin) {
      txt = `Banco respirando — ${cs.cooldownUntilMin - m}' p/ reusar`;
    } else if (m > 0 && m < 90) {
      const ps = possessionState(st, "A");
      txt = ps.withBall
        ? "Com a bola agora — boa hora de pressionar."
        : ps.without
          ? "Sem a bola agora — boa hora de recuar."
          : "Jogo disputado — leia antes de apertar.";
    }
    setCmdStat(txt);
  }, []);

  // ----- comandos do jogador -----
  const issuePlayerCmd = useCallback(
    (type: "press" | "recuo") => {
      const st = stateRef.current;
      if (!st || st.finished) return;
      const res = applyCommand(st, "A", type);
      if (res.ok) {
        const base =
          type === "press" ? "PRESSIONA! Sobe a linha pra prensar." : "RECUA! Fecha atrás e cede o campo.";
        const tag = ` (${res.hint})`;
        pushLine(st.minute, `<strong>Você</strong> ${base}${tag}`, "cmd");
        syncView();
        refreshCmdStat();
      }
    },
    [pushLine, refreshCmdStat, syncView],
  );

  // ----- suspense em 2 etapas -----
  const stageChance = useCallback(
    (ev: MatchEvent) => {
      const attackerSide = ev.ownerSide;
      const atkTac = attackerSide === "A" ? myTac : aiTac;
      const styleKey = TICKER_BUILDUP[atkTac.estilo] ? atkTac.estilo : "lados";
      const html = fillTeam(pickArr(uiRnd.current, TICKER_BUILDUP[styleKey]), ev.team);
      const lineId = pushLine(ev.m, html, "buildup");
      const interrupted = ev.kind !== "goal" && uiRnd.current() < 0.38;
      pendingRef.current.push({ lineId, ev, due: nowMs() + BUILDUP_DELAY_MS, interrupted });
    },
    [aiTac, myTac, pushLine],
  );

  const resolveBuildup = useCallback(
    (p: Pending) => {
      const st = stateRef.current;
      if (!st) return;
      const ev = p.ev;
      const mn = `${ev.m}' `;
      if (p.interrupted) {
        replaceLine(p.lineId, mn + pickArr(uiRnd.current, TICKER_INTERRUPT), "miss");
      } else if (ev.kind === "goal") {
        replaceLine(p.lineId, mn + fillTeam(pickArr(uiRnd.current, TICKER_CONCLUSION.gol), ev.team), "goal");
        setScore({ a: st.gA, b: st.gB });
        syncView();
        if (!REDUCED) {
          setPop(ev.team === st.teamA.n ? "A" : "B");
          window.setTimeout(() => setPop(null), 420);
        }
      } else {
        const bank = TICKER_CONCLUSION[ev.kind] || TICKER_CONCLUSION.fora;
        replaceLine(p.lineId, mn + fillTeam(pickArr(uiRnd.current, bank), ev.team), "miss");
      }
    },
    [replaceLine, syncView],
  );

  const flushPending = useCallback(() => {
    if (!pendingRef.current.length) return;
    const now = nowMs();
    const keep: Pending[] = [];
    for (const p of pendingRef.current) {
      if (now >= p.due) resolveBuildup(p);
      else keep.push(p);
    }
    pendingRef.current = keep;
  }, [resolveBuildup]);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const openHalftime = useCallback(() => {
    if (halftimeShownRef.current) return;
    halftimeShownRef.current = true;
    stopTimer();
    setPhase("halftime");
  }, [stopTimer]);

  const endMatch = useCallback(() => {
    stopTimer();
    const st = stateRef.current;
    if (!st) return;
    onFinish(st.gA, st.gB);
  }, [onFinish, stopTimer]);

  const liveTick = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    const r = stepMinute(st);
    setMinute(r.minute);
    r.events.forEach((ev) => stageChance(ev));
    syncView();
    refreshCmdStat();
  }, [refreshCmdStat, stageChance, syncView]);

  const liveFrame = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    flushPending();
    const now = nowMs();
    accRef.current += now - lastRef.current;
    lastRef.current = now;
    const steps = Math.floor(accRef.current / MS_PER_MIN);
    if (steps <= 0) return;
    accRef.current -= steps * MS_PER_MIN;
    for (let i = 0; i < steps; i++) {
      if (st.finished) break;
      if (st.minute >= 45 && !halftimeShownRef.current) {
        openHalftime();
        return;
      }
      liveTick();
      if (st.minute === 45 && !halftimeShownRef.current) {
        openHalftime();
        return;
      }
      if (st.finished) {
        endMatch();
        return;
      }
    }
  }, [endMatch, flushPending, liveTick, openHalftime]);

  const startTimer = useCallback(() => {
    lastRef.current = nowMs();
    accRef.current = 0;
    timerRef.current = window.setInterval(liveFrame, TICK_MS);
  }, [liveFrame]);

  // ----- bootstrap da partida -----
  useEffect(() => {
    const st = createMatch(campaign.myTeam, opp, myTac, aiTac, matchSeed || 1);
    stateRef.current = st;
    halftimeShownRef.current = false;
    pushLine(0, `Bola rolando! <strong>${campaign.myTeam.n}</strong> × <strong>${opp.n}</strong>.`, "info");
    syncView();
    refreshCmdStat();
    startTimer();
    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // retoma 2º tempo após o intervalo (aplica a tática nova ao meu lado)
  const resumeSecondHalf = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    // recalcula minhas forças com a tática nova — efeito a partir do 2º tempo
    const SA = sideStrength(campaign.myTeam, myTac, aiTac);
    const SB = sideStrength(opp, aiTac, myTac);
    st.SA = SA;
    st.SB = SB;
    st.tacA = myTac;
    const ftA = Math.pow(SA.ft, P.SHARE_SOFT);
    const ftB = Math.pow(SB.ft, P.SHARE_SOFT);
    st.shareA = ftA / (ftA + ftB);
    pendingRef.current = [];
    pushLine(
      45,
      `Começa o 2º tempo. Seu plano: ${FORM_NM[myTac.form]} · ${POSTURA_NM[myTac.postura]}.`,
      "cmd",
    );
    setPhase("live");
    syncView();
    refreshCmdStat();
    startTimer();
  }, [aiTac, campaign.myTeam, myTac, opp, pushLine, refreshCmdStat, startTimer, syncView]);

  // render lê só de `view`/`minute`/`phase` (state) — nunca de stateRef durante o render
  const canCmd = minute < 90 && !view.finished && minute >= view.cooldownUntilMin;
  const stage = campaign.stages[campaign.stageIdx];
  const hot = (minute >= 43 && minute <= 45) || minute >= 87;

  // ---- intervalo ----
  if (phase === "halftime") {
    const sh = Math.round(view.shareA * 100);
    const aiFormLabel = FORM_OPTS.find((o) => o[0] === aiTac.form)?.[1] ?? aiTac.form;
    return (
      <div className="flex flex-col">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
          Intervalo · 45&apos;
        </div>
        <h2 className="mb-2 mt-1.5 text-[22px] font-bold text-ink-950">Vestiário</h2>
        <Scoreboard myName={campaign.myTeam.n} oppName={opp.n} a={view.gA} b={view.gB} small />
        <div className="mt-3 rounded-[14px] border border-border bg-surface p-3.5">
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            🔍 O que o {opp.n} está fazendo
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[aiFormLabel, ESTILO_NM[aiTac.estilo], POSTURA_NM[aiTac.postura], MARC_NM[aiTac.marcacao]].map(
              (chip) => (
                <span
                  key={chip}
                  className="rounded-md bg-surface-2 px-2 py-1 text-[12px] font-bold text-ink-800"
                >
                  {chip}
                </span>
              ),
            )}
          </div>
          <div className="mt-2 text-sm text-ink-600">{aiReadHint(aiTac)}</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
          <span className="rounded-md bg-surface-2 px-2 py-1 font-semibold text-ink-700">
            Posse de chances: você {sh}% · {100 - sh}%
          </span>
          <span className="rounded-md bg-surface-2 px-2 py-1 font-semibold text-ink-700">
            Jogo {view.gameVol > 1.05 ? "aberto" : view.gameVol < 0.92 ? "truncado" : "equilibrado"}
          </span>
        </div>

        <div className="mb-1.5 mt-4 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
          Ajuste sua tática (2º tempo)
        </div>
        <FormGrid opts={FORM_OPTS} value={myTac.form} onPick={(v) => onMyTacChange({ ...myTac, form: v })} />
        <SegBlock
          label="Estilo"
          opts={ESTILO_OPTS}
          value={myTac.estilo}
          onPick={(v) => onMyTacChange({ ...myTac, estilo: v })}
        />
        <SegBlock
          label="Postura"
          opts={POSTURA_OPTS}
          value={myTac.postura}
          onPick={(v) => onMyTacChange({ ...myTac, postura: v })}
        />
        <SegBlock
          label="Marcação"
          opts={MARC_OPTS}
          value={myTac.marcacao}
          onPick={(v) => onMyTacChange({ ...myTac, marcacao: v })}
        />
        <PlanSummary tac={myTac} />
        <Button size="lg" fullWidth className="mt-3.5 bg-gold-600 text-ink-950 hover:bg-gold-700" onClick={resumeSecondHalf}>
          Apitar o 2º tempo ›
        </Button>
      </div>
    );
  }

  // ---- ao vivo ----
  return (
    <div className="flex flex-col">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        {stageLong(stage)}
      </div>
      <Scoreboard myName={campaign.myTeam.n} oppName={opp.n} a={score.a} b={score.b} pop={pop}>
        <div
          role="timer"
          aria-live="off"
          className={`text-center font-mono text-[13px] tracking-[0.12em] ${hot ? "text-flame-400" : "text-white/60"}`}
        >
          {fmtClock(minute)}
        </div>
        <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-white/15">
          <span
            className="block h-full rounded-full bg-grass-500 transition-[width] duration-100"
            style={{ width: `${Math.min(100, (minute / 90) * 100)}%` }}
          />
        </div>
      </Scoreboard>

      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        Transmissão ao vivo
      </div>
      <div
        aria-live="polite"
        aria-label="Narração da partida"
        className="mt-1 flex h-40 flex-col justify-start overflow-y-auto rounded-[14px] border border-border bg-surface px-3 py-1.5 text-[13.5px]"
      >
        {lines.map((l) => (
          <div
            key={l.id}
            className={`border-b border-border py-1.5 last:border-b-0 ${tickerToneClass(l.kind)}`}
          >
            {l.kind !== "buildup" && l.kind !== "info" && l.kind !== "cmd" ? null : null}
            <span dangerouslySetInnerHTML={{ __html: l.html }} />
          </div>
        ))}
      </div>

      <div className="mb-1.5 mt-3.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        Seu banco — leia posse e placar
      </div>
      <div className="grid grid-cols-2 gap-2">
        <CmdButton
          label="Pressionar"
          sub="sobe a linha · com a bola"
          icon="⬆️"
          disabled={!canCmd}
          onClick={() => issuePlayerCmd("press")}
        />
        <CmdButton
          label="Recuar"
          sub="fecha atrás · sem a bola"
          icon="🛡️"
          disabled={!canCmd}
          onClick={() => issuePlayerCmd("recuo")}
        />
      </div>
      <div className="mt-2 min-h-[18px] text-center text-[12px] text-ink-600" aria-live="polite">
        {cmdStat}
      </div>
    </div>
  );
}

function tickerToneClass(kind: TickerKind): string {
  switch (kind) {
    case "buildup":
      return "italic font-semibold text-ink-400";
    case "goal":
      return "font-extrabold text-grass-700";
    case "miss":
      return "text-ink-700";
    case "cmd":
      return "font-bold text-brand-700";
    default:
      return "text-ink-800";
  }
}

function Scoreboard({
  myName,
  oppName,
  a,
  b,
  pop,
  small,
  children,
}: {
  myName: string;
  oppName: string;
  a: number;
  b: number;
  pop?: "A" | "B" | null;
  small?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative my-2 overflow-hidden rounded-[18px] border border-white/10 p-4 text-white"
      style={{ background: "var(--color-board, oklch(0.2 0.025 232))" }}
    >
      <div className="flex justify-between gap-2 text-[12px] font-extrabold uppercase tracking-wide text-white/80">
        <span className="max-w-[42%] truncate">{myName}</span>
        <span className="max-w-[42%] truncate">{oppName}</span>
      </div>
      <div
        className={`flex items-center justify-center gap-5 font-mono font-extrabold tabular-nums text-gold-400 ${
          small ? "text-[40px]" : "text-[52px]"
        } leading-none`}
        style={{ margin: "3px 0 2px" }}
      >
        <span className={pop === "A" && !REDUCED ? "animate-[managerPop_0.4s_ease]" : undefined}>{a}</span>
        <span className="text-[24px] text-white/40">×</span>
        <span className={pop === "B" && !REDUCED ? "animate-[managerPop_0.4s_ease]" : undefined}>{b}</span>
      </div>
      {children}
    </div>
  );
}

function CmdButton({
  label,
  sub,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  icon: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex min-h-[60px] flex-col items-center justify-center gap-0.5 rounded-[14px] border border-border bg-surface px-2 py-2 text-center font-bold text-ink-900 transition-all active:scale-[0.98] disabled:opacity-45"
    >
      <span aria-hidden className="text-base">
        {icon}
      </span>
      <span className="text-[13px]">{label}</span>
      <span className="text-[10px] font-medium text-ink-500">{sub}</span>
    </button>
  );
}

// resumo do plano: apenas ECOA as escolhas do jogador, neutro, sem ⚠/✓ nem "ideal"
export function PlanSummary({ tac }: { tac: Tactic }) {
  return (
    <div className="mt-2.5 rounded-[10px] bg-surface-2 px-3 py-2 text-[12px] font-semibold text-ink-600">
      Seu plano: <b className="text-ink-900">{FORM_NM[tac.form]}</b> · {ESTILO_NM[tac.estilo]} ·{" "}
      {POSTURA_NM[tac.postura]} · {MARC_NM[tac.marcacao]}
    </div>
  );
}
