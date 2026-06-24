import { useCallback, useEffect, useRef, useState } from "react";
import type { Campaign, MatchEvent, MatchState, Tactic } from "./types";
import {
  applyCommand,
  createMatch,
  deriveMatchStats,
  possessionState,
  reactiveAiPosture,
  recomputeStrengths,
  stageLong,
  stepMinute,
  P,
} from "./engine";
import type { MatchStats } from "./types";
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
import { FormGrid, ManagerCrest, MatchStatsPanel, MatchupBadges, SegBlock } from "./components";
import { ESTILO_OPTS, FORM_OPTS, MARC_OPTS, POSTURA_OPTS, TICKER_ICON } from "./ui";
import { teamColors } from "./teamColors";
import { loadSpeed, saveSpeed } from "./managerLocal";
import { Button } from "@/components/ui/Button";

// ITEM 3: tempo configurável. ~40s por tempo (80s/jogo). Mude SECONDS_PER_HALF.
const SECONDS_PER_HALF = 40;
const TICK_MS = 50;

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 45 minutos de relógio por tempo; um tiquinho mais rápido sem animações.
// BASE = ritmo 1x. O acelerador (item 2) divide pelo `speed` em runtime.
const BASE_MS_PER_MIN = (SECONDS_PER_HALF * 1000) / 45 / (REDUCED ? 1 / 0.78 : 1);
// derivados em função da velocidade (1x ou 2x) — o motor é independente do relógio.
function msPerMin(speed: number): number {
  return BASE_MS_PER_MIN / speed;
}
// suspense entre build-up e desfecho (encolhe junto com a velocidade)
function buildupDelayMs(speed: number): number {
  return Math.max(300, Math.min(900, msPerMin(speed) * 1.7));
}

type TickerKind = "info" | "buildup" | "goal" | "miss" | "cmd";
interface TickerLine {
  id: number;
  min: number;
  kind: TickerKind;
  html: string; // texto já com o nome do time embutido (negrito via <strong>)
  // ITEM 6: prefixo escaneável — escudo do time + ícone do desfecho.
  icon?: string; // emoji do desfecho (⚽ 🧤 ❌ …)
  teamSlug?: string;
  teamName?: string;
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
  onFinish: (
    gA: number,
    gB: number,
    goals: { side: "A" | "B"; m: number }[],
    stats: MatchStats,
  ) => void;
}) {
  const stateRef = useRef<MatchState | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const pendingRef = useRef<Pending[]>([]);
  const lineSeq = useRef(0);
  const uiRnd = useRef(mulberryUi(20020630 ^ (matchSeed >>> 0)));
  const halftimeShownRef = useRef(false);
  // ITEM 2: velocidade do relógio (1x/2x), lida via ref dentro do loop pra não
  // reiniciar o setInterval ao alternar — o próximo passo já usa o novo ritmo.
  const [speed, setSpeed] = useState<1 | 2>(() => loadSpeed());
  const speedRef = useRef<1 | 2>(speed);

  const [score, setScore] = useState({ a: 0, b: 0 });
  const [minute, setMinute] = useState(0);
  const [pop, setPop] = useState<"A" | "B" | null>(null);
  // ITEM 7: ajuste tático AO VIVO (estilo/postura/marcação; formação travada até o
  // intervalo). `liveTac` é o que a UI mostra; `liveTacRef` o que o loop lê; o
  // cooldown próprio evita "metralhar" os eixos.
  const [liveTac, setLiveTac] = useState<Tactic>(myTac);
  const liveTacRef = useRef<Tactic>(myTac);
  const liveTacCooldownRef = useRef(-999);
  const [liveTacCooldownUntil, setLiveTacCooldownUntil] = useState(-999);
  const [tacDrawerOpen, setTacDrawerOpen] = useState(false);
  // ITEM 14 reativo: postura corrente da IA (pode mudar conforme o placar ao vivo).
  const aiPostureRef = useRef(aiTac.postura);
  const [lines, setLines] = useState<TickerLine[]>([]);
  const [phase, setPhase] = useState<"live" | "halftime">("live");
  const [cmdStat, setCmdStat] = useState("Aguarde o apito inicial…");
  // ITEM 4: posse de bola — pisca no card do time dono da chance em build-up.
  const [possSide, setPossSide] = useState<"A" | "B" | null>(null);
  // ITEM 16: timeline de gols (minuto + lado), derivada dos eventos de gol.
  const [goals, setGoals] = useState<{ side: "A" | "B"; m: number }[]>([]);
  const goalsRef = useRef<{ side: "A" | "B"; m: number }[]>([]);
  // ITEM 12: snapshot de stats no intervalo (parcial — leitura do 1º tempo).
  const [halftimeStats, setHalftimeStats] = useState<MatchStats | null>(null);
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

  const pushLine = useCallback(
    (min: number, html: string, kind: TickerKind, meta?: Partial<TickerLine>): number => {
      const id = ++lineSeq.current;
      setLines((cur) => [{ id, min, kind, html, ...meta }, ...cur].slice(0, 40));
      return id;
    },
    [],
  );
  const replaceLine = useCallback(
    (id: number, html: string, kind: TickerKind, meta?: Partial<TickerLine>) => {
      setLines((cur) => cur.map((l) => (l.id === id ? { ...l, html, kind, ...meta } : l)));
    },
    [],
  );

  // ITEM 2: alterna 1x/2x a qualquer momento; persiste e atualiza o ref do loop.
  const toggleSpeed = useCallback(() => {
    setSpeed((s) => {
      const next: 1 | 2 = s === 1 ? 2 : 1;
      speedRef.current = next;
      saveSpeed(next);
      return next;
    });
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
        pushLine(st.minute, `<strong>Você</strong> ${base}${tag}`, "cmd", {
          icon: type === "press" ? "📣" : "🧱",
        });
        syncView();
        refreshCmdStat();
      }
    },
    [pushLine, refreshCmdStat, syncView],
  );

  // ITEM 7: aplica um AJUSTE TÁTICO ao vivo (3 eixos; formação fica travada). Valida
  // o cooldown próprio, recomputa minhas forças do MINUTO SEGUINTE em diante e dá um
  // micro-feedback no ticker. Não reseta gols/minuto/comandos.
  const applyLiveTac = useCallback(
    (patch: Partial<Pick<Tactic, "estilo" | "postura" | "marcacao">>) => {
      const st = stateRef.current;
      if (!st || st.finished) return;
      if (st.minute < liveTacCooldownRef.current) return; // em cooldown
      const next: Tactic = { ...liveTacRef.current, ...patch, form: liveTacRef.current.form };
      liveTacRef.current = next;
      setLiveTac(next);
      onMyTacChange(next); // persiste a tática (sem mexer na formação travada)
      recomputeStrengths(st, next, st.tacB);
      const until = st.minute + P.LIVETAC_COOLDOWN_MIN;
      liveTacCooldownRef.current = until;
      setLiveTacCooldownUntil(until);
      pushLine(
        st.minute,
        `<strong>Você</strong> reorganiza: ${ESTILO_NM[next.estilo]} · ${POSTURA_NM[next.postura]} · ${MARC_NM[next.marcacao]}.`,
        "cmd",
        { icon: "🔧" },
      );
      syncView();
      refreshCmdStat();
    },
    [onMyTacChange, pushLine, refreshCmdStat, syncView],
  );

  // ----- suspense em 2 etapas -----
  const teamSlugFor = useCallback(
    (side: "A" | "B") => (side === "A" ? campaign.myTeam.s : opp.s),
    [campaign.myTeam.s, opp.s],
  );

  const stageChance = useCallback(
    (ev: MatchEvent) => {
      const attackerSide = ev.ownerSide;
      const atkTac = attackerSide === "A" ? myTac : aiTac;
      const styleKey = TICKER_BUILDUP[atkTac.estilo] ? atkTac.estilo : "lados";
      const html = fillTeam(pickArr(uiRnd.current, TICKER_BUILDUP[styleKey]), ev.team);
      const lineId = pushLine(ev.m, html, "buildup", {
        icon: "🔵",
        teamSlug: teamSlugFor(attackerSide),
        teamName: ev.team,
      });
      // ITEM 4: a posse acende no lado dono da chance e pisca junto do texto.
      setPossSide(attackerSide);
      const interrupted = ev.kind !== "goal" && uiRnd.current() < 0.38;
      pendingRef.current.push({
        lineId,
        ev,
        due: nowMs() + buildupDelayMs(speedRef.current),
        interrupted,
      });
    },
    [aiTac, myTac, pushLine, teamSlugFor],
  );

  const resolveBuildup = useCallback(
    (p: Pending) => {
      const st = stateRef.current;
      if (!st) return;
      const ev = p.ev;
      // ITEM 4: ao resolver, a posse para de piscar (se ainda for deste lance).
      setPossSide((cur) => (cur === ev.ownerSide ? null : cur));
      const meta = { teamSlug: teamSlugFor(ev.ownerSide), teamName: ev.team };
      const icon = (bankKey: keyof typeof TICKER_ICON) => pickArr(uiRnd.current, TICKER_ICON[bankKey]);
      if (p.interrupted) {
        replaceLine(p.lineId, pickArr(uiRnd.current, TICKER_INTERRUPT), "miss", {
          ...meta,
          icon: icon("interrupt"),
        });
      } else if (ev.kind === "goal") {
        replaceLine(p.lineId, fillTeam(pickArr(uiRnd.current, TICKER_CONCLUSION.gol), ev.team), "goal", {
          ...meta,
          icon: "⚽",
        });
        setScore({ a: st.gA, b: st.gB });
        // ITEM 16: registra o gol na timeline (minuto + lado).
        goalsRef.current = [...goalsRef.current, { side: ev.ownerSide, m: ev.m }];
        setGoals(goalsRef.current);
        syncView();
        if (!REDUCED) {
          setPop(ev.team === st.teamA.n ? "A" : "B");
          window.setTimeout(() => setPop(null), 420);
        }
      } else {
        const bank = TICKER_CONCLUSION[ev.kind] || TICKER_CONCLUSION.fora;
        replaceLine(p.lineId, fillTeam(pickArr(uiRnd.current, bank), ev.team), "miss", {
          ...meta,
          icon: icon(ev.kind as keyof typeof TICKER_ICON),
        });
      }
    },
    [replaceLine, syncView, teamSlugFor],
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
    const st = stateRef.current;
    if (st) setHalftimeStats(deriveMatchStats(st));
    setPhase("halftime");
  }, [stopTimer]);

  const endMatch = useCallback(() => {
    stopTimer();
    const st = stateRef.current;
    if (!st) return;
    // ITEM 12: deriva as stats do estado FINAL real (inclui comandos/ajustes que o
    // jogador deu) — batem 100% com o que foi visto na transmissão.
    onFinish(st.gA, st.gB, goalsRef.current, deriveMatchStats(st));
  }, [onFinish, stopTimer]);

  const liveTick = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    // ITEM 14 reativo: antes de rodar o minuto, a IA relê o placar e pode mudar a
    // POSTURA (forma/estilo/marcação do plano inicial ficam). Se mudou, recomputa SB.
    const newPosture = reactiveAiPosture(
      aiTac,
      opp.o,
      campaign.myTeam.o,
      st.gB,
      st.gA,
      st.minute,
    );
    if (newPosture !== aiPostureRef.current) {
      aiPostureRef.current = newPosture;
      const nextB: Tactic = { ...st.tacB, postura: newPosture };
      recomputeStrengths(st, st.tacA, nextB);
    }
    const r = stepMinute(st);
    setMinute(r.minute);
    r.events.forEach((ev) => stageChance(ev));
    syncView();
    refreshCmdStat();
  }, [aiTac, campaign.myTeam.o, opp.o, refreshCmdStat, stageChance, syncView]);

  const liveFrame = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    flushPending();
    const now = nowMs();
    accRef.current += now - lastRef.current;
    lastRef.current = now;
    const mpm = msPerMin(speedRef.current);
    const steps = Math.floor(accRef.current / mpm);
    if (steps <= 0) return;
    accRef.current -= steps * mpm;
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
    pushLine(0, `Bola rolando! <strong>${campaign.myTeam.n}</strong> × <strong>${opp.n}</strong>.`, "info", {
      icon: "🟢",
    });
    syncView();
    refreshCmdStat();
    startTimer();
    return () => stopTimer();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // retoma 2º tempo após o intervalo (aplica a tática nova ao meu lado, incluindo a
  // FORMAÇÃO — que só pode mudar no intervalo). A tática corrente da IA (st.tacB) pode
  // já ter reagido ao placar do 1º tempo (item 14 reativo), então preservamos ela.
  const resumeSecondHalf = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    liveTacRef.current = myTac; // sincroniza o ajuste ao vivo com a tática do intervalo
    recomputeStrengths(st, myTac, st.tacB);
    pendingRef.current = [];
    setPossSide(null);
    pushLine(
      45,
      `Começa o 2º tempo. Seu plano: ${FORM_NM[myTac.form]} · ${POSTURA_NM[myTac.postura]}.`,
      "cmd",
      { icon: "🟢" },
    );
    setPhase("live");
    syncView();
    refreshCmdStat();
    startTimer();
  }, [myTac, pushLine, refreshCmdStat, startTimer, syncView]);

  // render lê só de `view`/`minute`/`phase` (state) — nunca de stateRef durante o render
  const canCmd = minute < 90 && !view.finished && minute >= view.cooldownUntilMin;
  const stage = campaign.stages[campaign.stageIdx];
  const hot = (minute >= 43 && minute <= 45) || minute >= 87;

  // ---- intervalo ----
  if (phase === "halftime") {
    const aiFormLabel = FORM_OPTS.find((o) => o[0] === aiTac.form)?.[1] ?? aiTac.form;
    return (
      <div className="flex flex-col">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
          Intervalo · 45&apos;
        </div>
        <h2 className="mb-2 mt-1.5 text-[22px] font-bold text-ink-950">Vestiário</h2>
        <Scoreboard
          myName={campaign.myTeam.n}
          oppName={opp.n}
          mySlug={campaign.myTeam.s}
          oppSlug={opp.s}
          a={view.gA}
          b={view.gB}
          goals={goals}
          small
        />
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
          {/* ITEM 8: vantagens CONCRETAS do meu plano agora que a tática deles apareceu */}
          <MatchupBadges my={myTac} opp={aiTac} />
        </div>

        {/* ITEM 12: leitura do 1º tempo (parcial) */}
        {halftimeStats && (
          <div className="mt-3">
            <MatchStatsPanel
              stats={halftimeStats}
              myName={campaign.myTeam.n}
              oppName={opp.n}
              title="1º tempo"
              dense
            />
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
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
      <Scoreboard
        myName={campaign.myTeam.n}
        oppName={opp.n}
        mySlug={campaign.myTeam.s}
        oppSlug={opp.s}
        a={score.a}
        b={score.b}
        pop={pop}
        possSide={possSide}
        goals={goals}
        speed={speed}
        onToggleSpeed={toggleSpeed}
      >
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
        className="mt-1 flex h-40 flex-col justify-start overflow-y-auto rounded-[14px] border border-border bg-surface px-1.5 py-1 text-[13.5px]"
      >
        {lines.map((l) => (
          <div
            key={l.id}
            className={`flex items-start gap-2 border-b border-border px-1.5 py-1.5 last:border-b-0 ${tickerToneClass(l.kind)}`}
          >
            <span className="mt-px flex shrink-0 items-center gap-1">
              {l.teamSlug || l.teamName ? (
                <ManagerCrest slug={l.teamSlug} name={l.teamName ?? ""} size={16} />
              ) : null}
              {l.icon ? (
                <span aria-hidden className="text-[15px] leading-none">
                  {l.icon}
                </span>
              ) : null}
            </span>
            <span className="min-w-0 flex-1">
              <span className="mr-1 font-mono text-[11px] font-bold tabular-nums text-ink-400">{l.min}&apos;</span>
              <span dangerouslySetInnerHTML={{ __html: l.html }} />
            </span>
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

      {/* ITEM 7: ajuste tático AO VIVO (drawer recolhível). Formação travada até o
          intervalo; estilo/postura/marcação mudam a quente, com cooldown próprio. */}
      <LiveTacPanel
        tac={liveTac}
        open={tacDrawerOpen}
        onToggle={() => setTacDrawerOpen((v) => !v)}
        cooldownLeft={Math.max(0, liveTacCooldownUntil - minute)}
        disabled={view.finished || minute >= 90}
        onChange={applyLiveTac}
      />
    </div>
  );
}

// ITEM 7: painel de ajuste tático ao vivo. Drawer recolhível pra não poluir o mobile.
// Só os 3 eixos editáveis (formação travada — mantém a leitura "às cegas"). Em
// cooldown, os controles ficam inertes e o rótulo mostra os minutos restantes.
function LiveTacPanel({
  tac,
  open,
  onToggle,
  cooldownLeft,
  disabled,
  onChange,
}: {
  tac: Tactic;
  open: boolean;
  onToggle: () => void;
  cooldownLeft: number;
  disabled: boolean;
  onChange: (patch: Partial<Pick<Tactic, "estilo" | "postura" | "marcacao">>) => void;
}) {
  const locked = disabled || cooldownLeft > 0;
  return (
    <div className="mt-3 overflow-hidden rounded-[14px] border border-border bg-surface">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-[12.5px] font-extrabold text-ink-900">
          <span aria-hidden>🔧</span> Ajuste tático ao vivo
        </span>
        <span className="flex items-center gap-2">
          {cooldownLeft > 0 && (
            <span className="rounded-md bg-surface-2 px-2 py-0.5 text-[11px] font-bold tabular-nums text-ink-500">
              {cooldownLeft}&apos; p/ reusar
            </span>
          )}
          <span aria-hidden className={`text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </span>
      </button>
      {open && (
        <div className={`border-t border-border px-3.5 pb-3.5 pt-1 ${locked ? "opacity-55" : ""}`}>
          <div className="mt-1.5 text-[11px] text-ink-500">
            A <b>formação</b> só muda no intervalo. Mexa em estilo, postura e marcação — vale do
            minuto seguinte.
          </div>
          <SegBlock
            label="Estilo"
            opts={ESTILO_OPTS}
            value={tac.estilo}
            onPick={(v) => !locked && onChange({ estilo: v })}
          />
          <SegBlock
            label="Postura"
            opts={POSTURA_OPTS}
            value={tac.postura}
            onPick={(v) => !locked && onChange({ postura: v })}
          />
          <SegBlock
            label="Marcação"
            opts={MARC_OPTS}
            value={tac.marcacao}
            onPick={(v) => !locked && onChange({ marcacao: v })}
          />
        </div>
      )}
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

// Card de time no placar: escudo (item 3) + pílula com as cores da seleção (item 5).
// Acende e pisca quando é o lado dono da chance em build-up (item 4).
function TeamCard({
  name,
  slug,
  align,
  active,
}: {
  name: string;
  slug?: string;
  align: "left" | "right";
  active?: boolean;
}) {
  const c = teamColors(slug, name);
  return (
    <div
      className={`flex min-w-0 items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      <ManagerCrest slug={slug} name={name} size={26} className="shrink-0" />
      <span
        className={`min-w-0 truncate rounded-md px-1.5 py-0.5 text-[12.5px] font-black leading-tight transition-shadow ${
          active && !REDUCED ? "animate-pulse-live" : ""
        }`}
        style={{
          background: c.bg,
          color: c.text,
          boxShadow: active ? `0 0 0 2px rgba(255,255,255,0.85)` : undefined,
        }}
      >
        {name}
      </span>
    </div>
  );
}

function Scoreboard({
  myName,
  oppName,
  mySlug,
  oppSlug,
  a,
  b,
  pop,
  small,
  possSide,
  goals,
  speed,
  onToggleSpeed,
  children,
}: {
  myName: string;
  oppName: string;
  mySlug?: string;
  oppSlug?: string;
  a: number;
  b: number;
  pop?: "A" | "B" | null;
  small?: boolean;
  possSide?: "A" | "B" | null;
  goals?: { side: "A" | "B"; m: number }[];
  speed?: 1 | 2;
  onToggleSpeed?: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="relative my-2 overflow-hidden rounded-[18px] border border-white/10 p-4 text-white"
      style={{ background: "var(--color-board, oklch(0.2 0.025 232))" }}
    >
      {onToggleSpeed && (
        <button
          type="button"
          onClick={onToggleSpeed}
          aria-pressed={speed === 2}
          aria-label={speed === 2 ? "Velocidade dobrada, toque para voltar ao normal" : "Velocidade normal, toque para dobrar"}
          className="absolute right-2.5 top-2.5 flex h-7 min-w-[34px] items-center justify-center rounded-full border border-white/20 px-2 text-[12px] font-black tabular-nums text-white/90 transition-colors hover:bg-white/10 active:scale-95"
          style={speed === 2 ? { background: "var(--color-gold-500, #e8b923)", color: "#1a1a1a", borderColor: "transparent" } : undefined}
        >
          {speed === 2 ? "2×" : "1×"}
        </button>
      )}
      <div className={`flex items-center justify-between gap-1.5 ${onToggleSpeed ? "pr-8" : ""}`}>
        <div className="min-w-0 flex-1">
          <TeamCard name={myName} slug={mySlug} align="left" active={possSide === "A"} />
        </div>
        <div
          className={`flex shrink-0 items-center justify-center gap-2 px-0.5 font-black tabular-nums text-gold-400 ${
            small ? "text-[34px]" : "text-[44px]"
          } leading-none`}
          style={{ fontWeight: 900 }}
        >
          <span className={pop === "A" && !REDUCED ? "animate-[managerPop_0.4s_ease]" : undefined}>{a}</span>
          <span className="text-[18px] font-bold text-white/35">×</span>
          <span className={pop === "B" && !REDUCED ? "animate-[managerPop_0.4s_ease]" : undefined}>{b}</span>
        </div>
        <div className="flex min-w-0 flex-1 justify-end">
          <TeamCard name={oppName} slug={oppSlug} align="right" active={possSide === "B"} />
        </div>
      </div>
      {goals && goals.length > 0 && <GoalTimeline goals={goals} />}
      <div className="mt-2">{children}</div>
    </div>
  );
}

// ITEM 16: marcadores cronológicos de gols (minuto + lado), agrupados por time —
// mais legível no mobile que uma régua 0–90'. Usado ao vivo E no pós-jogo.
function GoalTimeline({ goals }: { goals: { side: "A" | "B"; m: number }[] }) {
  const mine = goals.filter((g) => g.side === "A").sort((x, y) => x.m - y.m);
  const theirs = goals.filter((g) => g.side === "B").sort((x, y) => x.m - y.m);
  const row = (gs: { m: number }[], dot: string, align: "left" | "right") =>
    gs.length === 0 ? null : (
      <div
        className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-bold tabular-nums text-white/70 ${
          align === "right" ? "justify-end" : "justify-start"
        }`}
      >
        {gs.map((g, i) => (
          <span key={`${g.m}-${i}`} className="inline-flex items-center gap-0.5">
            <span aria-hidden>{dot}</span>
            {g.m}&apos;
          </span>
        ))}
      </div>
    );
  return (
    <div className="mt-2 grid grid-cols-2 gap-x-3 border-t border-white/10 pt-2" aria-label="Gols da partida">
      {row(mine, "🟢", "left")}
      {row(theirs, "⚪", "right")}
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
