import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Campaign, MatchEvent, MatchState, Tactic } from "./types";
import {
  applyCommand,
  createMatch,
  deriveStatsFromEvents,
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
import type { LiveSpeed } from "./managerLocal";
import { Button } from "@/components/ui/Button";

// MELHORIA 2.6: 1x = cada tempo dura EXATAMENTE 45s reais. 2x/4x dividem; "Pular
// tempo" é instantâneo (resolve o resto do tempo no motor e abre o intervalo/fim).
const SECONDS_PER_HALF = 45;
const TICK_MS = 50;

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// BASE = ritmo 1x (45 minutos de relógio em SECONDS_PER_HALF segundos reais). O
// acelerador divide pelo `speed`; o motor é independente do relógio.
const BASE_MS_PER_MIN = (SECONDS_PER_HALF * 1000) / 45;
function msPerMin(speed: number): number {
  return BASE_MS_PER_MIN / speed;
}
// suspense entre build-up e desfecho (encolhe junto com a velocidade)
function buildupDelayMs(speed: number): number {
  return Math.max(220, Math.min(900, msPerMin(speed) * 1.7));
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

// BUG 1.3: um lance em "suspense". Enquanto pendente, mostra só o build-up no ticker
// e a posse pisca no lado dono. Ao ser REVELADO (no `due` OU num flush antes do
// intervalo/fim), o desfecho entra na TIMELINE — e SÓ daí o gol conta no placar.
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
  // a partida é criada UMA vez (lazy), antes do 1º render. O objeto MatchState tem
  // identidade estável (é mutado in-place pelo motor), então pode ser lido na render.
  // É a fonte de verdade em STATE; `stateRef` espelha p/ os callbacks/loop lerem.
  const [engine] = useState<MatchState>(() =>
    createMatch(campaign.myTeam, opp, myTac, aiTac, matchSeed || 1),
  );
  const stateRef = useRef<MatchState>(engine);
  const timerRef = useRef<number | null>(null);
  const lastRef = useRef(0);
  const accRef = useRef(0);
  const pendingRef = useRef<Pending[]>([]);
  const lineSeq = useRef(0);
  const uiRnd = useRef(mulberryUi(20020630 ^ (matchSeed >>> 0)));
  const halftimeShownRef = useRef(false);
  // MELHORIA 2.6: velocidade do relógio (1x/2x/4x), lida via ref dentro do loop pra não
  // reiniciar o setInterval ao alternar — o próximo passo já usa o novo ritmo.
  const [speed, setSpeed] = useState<LiveSpeed>(() => loadSpeed());
  const speedRef = useRef<LiveSpeed>(speed);

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
  // MELHORIA 2.1: posse de bola — pisca CONTINUAMENTE no lado dono do ciclo ofensivo,
  // do build-up até a conclusão da chance; só cessa/troca quando o lance conclui.
  const [possSide, setPossSide] = useState<"A" | "B" | null>(null);

  // BUG 1.3 — TIMELINE ÚNICA: a fonte de verdade do que o usuário JÁ VIU. Cada lance
  // resolvido (revelado) entra aqui com seu gol/minuto/lado. O PLACAR e os GOLS da UI
  // derivam ESTRITAMENTE daqui (nunca de um estado paralelo, nunca resetam no intervalo).
  const [revealed, setRevealed] = useState<MatchEvent[]>([]);
  const revealedRef = useRef<MatchEvent[]>([]);

  // placar derivado da timeline revelada (única fonte). Atômico: um gol só aparece
  // quando seu lance é revelado, e nenhum lance é descartado no intervalo/fim.
  const score = useMemo(() => {
    let a = 0;
    let b = 0;
    for (const ev of revealed) {
      if (!ev.goal) continue;
      if (ev.ownerSide === "A") a++;
      else b++;
    }
    return { a, b };
  }, [revealed]);
  const goals = useMemo(
    () => revealed.filter((ev) => ev.goal).map((ev) => ({ side: ev.ownerSide, m: ev.m })),
    [revealed],
  );
  // ITEM 12 / MELHORIA 2.2: estatísticas AO VIVO derivadas SÓ dos lances revelados +
  // as forças correntes do motor — coerentes com o que está na tela neste instante.
  const liveStats = useMemo<MatchStats | null>(() => {
    if (!engine || revealed.length === 0) return null;
    return deriveStatsFromEvents(engine, revealed);
  }, [engine, revealed]);

  const [finished, setFinished] = useState(false);
  // espelho render-safe das forças/volume do motor (a render NÃO lê stateRef no render)
  const [view, setView] = useState({
    shareA: 0.5,
    gameVol: 1,
    cooldownUntilMin: -999,
  });
  const syncView = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    setView({
      shareA: st.shareA,
      gameVol: st.gameVol,
      cooldownUntilMin: st.cmdA.cooldownUntilMin,
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

  // MELHORIA 2.6: escolhe 1x/2x/4x; persiste e atualiza o ref do loop sem reiniciar.
  const pickSpeed = useCallback((next: LiveSpeed) => {
    setSpeed(next);
    speedRef.current = next;
    saveSpeed(next);
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
      // MELHORIA 2.1: a posse acende no lado dono e pisca CONTINUAMENTE até o desfecho.
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

  // BUG 1.3: REVELA um lance pendente — escreve o desfecho no ticker E (atomicamente)
  // entra na TIMELINE, de onde o placar deriva. O gol só conta AQUI, nunca antes.
  const resolveBuildup = useCallback(
    (p: Pending) => {
      const ev = p.ev;
      // MELHORIA 2.1: ao concluir, a posse para de piscar (se ainda for deste lance).
      setPossSide((cur) => (cur === ev.ownerSide ? null : cur));
      const meta = { teamSlug: teamSlugFor(ev.ownerSide), teamName: ev.team };
      const icon = (bankKey: keyof typeof TICKER_ICON) => pickArr(uiRnd.current, TICKER_ICON[bankKey]);
      // a TIMELINE só conta o gol se o lance NÃO foi interrompido (impedimento etc.).
      // Um lance interrompido nunca é gol no motor (interrupt só sorteia em ev.kind!=goal).
      revealedRef.current = [...revealedRef.current, ev];
      setRevealed(revealedRef.current);
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
        if (!REDUCED) {
          const side = ev.ownerSide;
          setPop(side);
          window.setTimeout(() => setPop((c) => (c === side ? null : c)), 420);
        }
      } else {
        const bank = TICKER_CONCLUSION[ev.kind] || TICKER_CONCLUSION.fora;
        replaceLine(p.lineId, fillTeam(pickArr(uiRnd.current, bank), ev.team), "miss", {
          ...meta,
          icon: icon(ev.kind as keyof typeof TICKER_ICON),
        });
      }
    },
    [replaceLine, teamSlugFor],
  );

  // revela só os que venceram o suspense (uso normal do loop)
  const flushDue = useCallback(() => {
    if (!pendingRef.current.length) return;
    const now = nowMs();
    const keep: Pending[] = [];
    for (const p of pendingRef.current) {
      if (now >= p.due) resolveBuildup(p);
      else keep.push(p);
    }
    pendingRef.current = keep;
  }, [resolveBuildup]);

  // BUG 1.3: FLUSH atômico — revela TODOS os pendentes JÁ (sem esperar o suspense).
  // Chamado ANTES de abrir o intervalo e o fim de jogo, garantindo que nenhum gol some
  // e que o placar do boundary == soma dos gols revelados até ali.
  const flushAll = useCallback(() => {
    if (!pendingRef.current.length) return;
    const all = pendingRef.current;
    pendingRef.current = [];
    for (const p of all) resolveBuildup(p);
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
    flushAll(); // BUG 1.3: nenhum gol do 1º tempo pode ficar pra trás.
    setPossSide(null);
    setPhase("halftime");
  }, [flushAll, stopTimer]);

  const endMatch = useCallback(() => {
    stopTimer();
    flushAll(); // BUG 1.3: revela tudo antes de fechar — placar final == soma dos gols.
    setPossSide(null);
    setFinished(true);
    const st = stateRef.current;
    if (!st) return;
    // o placar final é a SOMA dos gols revelados (== st.gA/gB, já que tudo foi revelado).
    const finalGoals = revealedRef.current
      .filter((ev) => ev.goal)
      .map((ev) => ({ side: ev.ownerSide, m: ev.m }));
    const gA = finalGoals.filter((g) => g.side === "A").length;
    const gB = finalGoals.filter((g) => g.side === "B").length;
    // ITEM 12: stats da partida derivadas dos MESMOS lances revelados — batem 100% com
    // o que foi visto na transmissão (e com o placar).
    onFinish(gA, gB, finalGoals, deriveStatsFromEvents(st, revealedRef.current));
  }, [onFinish, stopTimer, flushAll]);

  // roda UM minuto do motor (com a IA reativa antes) e ENFILEIRA os lances do minuto.
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
    flushDue();
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
  }, [endMatch, flushDue, liveTick, openHalftime]);

  const startTimer = useCallback(() => {
    lastRef.current = nowMs();
    accRef.current = 0;
    timerRef.current = window.setInterval(liveFrame, TICK_MS);
  }, [liveFrame]);

  // MELHORIA 2.6: "Pular tempo" — resolve INSTANTANEAMENTE todos os lances restantes do
  // tempo (motor + flush) e vai direto pro Intervalo (1ºT) ou Fim de Jogo (2ºT). Com a
  // timeline derivada de eventos, o skip é só avançar o playback até 45'/90'.
  const skipHalf = useCallback(() => {
    const st = stateRef.current;
    if (!st || st.finished) return;
    stopTimer();
    if (st.minute < 45 && !halftimeShownRef.current) {
      while (st.minute < 45 && !st.finished) liveTick();
      setMinute(st.minute);
      openHalftime();
      return;
    }
    while (st.minute < 90 && !st.finished) liveTick();
    setMinute(st.minute);
    endMatch();
  }, [endMatch, liveTick, openHalftime, stopTimer]);

  // ----- bootstrap da partida (a partida já foi criada no lazy-init de stateRef) -----
  useEffect(() => {
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

  // render lê só de state derivado — nunca de stateRef durante o render
  const canCmd = minute < 90 && !finished && minute >= view.cooldownUntilMin;
  const stage = campaign.stages[campaign.stageIdx];
  const hot = (minute >= 43 && minute <= 45) || minute >= 87;
  // ITEM 12: snapshot parcial das stats até 45' pro vestiário (deriva da timeline).
  const halftimeStats = useMemo<MatchStats | null>(() => {
    if (phase !== "halftime" || !engine) return null;
    const firstHalf = revealed.filter((ev) => ev.m <= 45);
    if (firstHalf.length === 0) return null;
    return deriveStatsFromEvents(engine, firstHalf);
  }, [phase, engine, revealed]);

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
          a={score.a}
          b={score.b}
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
      {/* MELHORIA 2.3: placar eletrônico STICKY — fica fixo no topo ao rolar a tela
          pra mexer em tática/comandos, sempre visível. */}
      <div className="sticky top-0 z-20 -mx-0.5 bg-surface/85 px-0.5 pb-1 pt-0.5 backdrop-blur-sm">
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
          clock={fmtClock(minute)}
          clockHot={hot}
          progress={Math.min(100, (minute / 90) * 100)}
        />
        {/* MELHORIA 2.6: seletor de velocidade + pular tempo */}
        <SpeedBar
          speed={speed}
          onPick={pickSpeed}
          onSkip={skipHalf}
          skipLabel={minute < 45 ? "Pular 1º tempo" : "Pular 2º tempo"}
          disabled={finished}
        />
      </div>

      <div className="mt-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
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

      {/* MELHORIA 2.2: estatísticas AO VIVO (recolhível) — insumo pra ajustar a tática. */}
      <LiveStats stats={liveStats} myName={campaign.myTeam.n} oppName={opp.n} />

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
        disabled={finished || minute >= 90}
        onChange={applyLiveTac}
      />
    </div>
  );
}

// MELHORIA 2.6: seletor de velocidade (1x/2x/4x) + "Pular tempo". Toque ≥44px, aria.
function SpeedBar({
  speed,
  onPick,
  onSkip,
  skipLabel,
  disabled,
}: {
  speed: LiveSpeed;
  onPick: (s: LiveSpeed) => void;
  onSkip: () => void;
  skipLabel: string;
  disabled: boolean;
}) {
  const opts: LiveSpeed[] = [1, 2, 4];
  return (
    <div className="mt-2 flex items-center gap-2">
      <div
        role="group"
        aria-label="Velocidade da transmissão"
        className="flex flex-1 gap-1 rounded-[12px] border border-border bg-surface-2 p-1"
      >
        {opts.map((s) => {
          const on = speed === s;
          return (
            <button
              key={s}
              type="button"
              aria-pressed={on}
              aria-label={`Velocidade ${s} vezes`}
              disabled={disabled}
              onClick={() => onPick(s)}
              className={`flex min-h-[40px] flex-1 items-center justify-center rounded-[9px] text-[13px] font-black tabular-nums transition-colors disabled:opacity-45 ${
                on ? "bg-brand-600 text-white shadow-sm" : "text-ink-600"
              }`}
            >
              {s}×
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onSkip}
        disabled={disabled}
        aria-label={skipLabel}
        className="flex min-h-[40px] items-center gap-1.5 rounded-[12px] border border-border bg-surface px-3 text-[13px] font-bold text-ink-800 transition-colors hover:bg-surface-2 active:scale-[0.98] disabled:opacity-45"
      >
        <span aria-hidden>⏭️</span>
        Pular tempo
      </button>
    </div>
  );
}

// MELHORIA 2.2: estatísticas ao vivo — recolhível, compacto, abaixo do ticker. Usa o
// MatchStatsPanel (mesmo visual do pós-jogo), em modo `dense`. Atualiza em tempo real.
function LiveStats({
  stats,
  myName,
  oppName,
}: {
  stats: MatchStats | null;
  myName: string;
  oppName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 overflow-hidden rounded-[14px] border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-[12.5px] font-extrabold text-ink-900">
          <span aria-hidden>📊</span> Estatísticas ao vivo
        </span>
        <span aria-hidden className={`text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}>
          ▾
        </span>
      </button>
      {open && (
        <div className="border-t border-border px-2 pb-2 pt-2">
          {stats ? (
            <MatchStatsPanel stats={stats} myName={myName} oppName={oppName} title="ao vivo" dense />
          ) : (
            <div className="px-2 py-3 text-center text-[12.5px] text-ink-500">
              Sem lances ainda — as estatísticas aparecem no primeiro ataque.
            </div>
          )}
        </div>
      )}
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

// MELHORIA 2.5 — PLACAR ELETRÔNICO reciclando a distribuição espacial do Retrô:
// escudo + nome de UM lado, gols GRANDES no centro, simétrico, com respiro. As cores
// vêm de teamColors; o board é o token escuro (legível em claro e escuro).
// Acende e pisca CONTINUAMENTE no lado dono do ciclo ofensivo (melhoria 2.1).
function TeamPanel({
  name,
  slug,
  active,
}: {
  name: string;
  slug?: string;
  active?: boolean;
}) {
  const c = teamColors(slug, name);
  return (
    <div
      className={`flex min-w-0 flex-1 flex-col items-center gap-1.5 ${
        active && !REDUCED ? "animate-pulse-live" : ""
      }`}
    >
      <ManagerCrest slug={slug} name={name} size={40} className="shrink-0" />
      <span
        className="w-full truncate rounded-md px-2 py-1 text-center text-[12.5px] font-black uppercase leading-tight tracking-wide"
        style={{
          background: c.bg,
          color: c.text,
          boxShadow: active ? "0 0 0 2px rgba(255,255,255,0.85)" : undefined,
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
  clock,
  clockHot,
  progress,
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
  clock?: string;
  clockHot?: boolean;
  progress?: number;
}) {
  return (
    <div
      className="relative my-2 overflow-hidden rounded-[18px] border border-white/10 p-4 text-white"
      style={{ background: "var(--color-board, oklch(0.2 0.025 232))" }}
    >
      {/* distribuição do Retrô: lado esquerdo (escudo+nome) · gols grandes no centro ·
          lado direito (escudo+nome). Simétrico e arejado. */}
      <div className="flex items-stretch gap-2">
        <TeamPanel name={myName} slug={mySlug} active={possSide === "A"} />
        <div className="flex shrink-0 flex-col items-center justify-center px-1">
          <div
            className={`flex items-center justify-center gap-3 font-black tabular-nums text-gold-400 ${
              small ? "text-[40px]" : "text-[52px]"
            } leading-none`}
            style={{ fontWeight: 900 }}
          >
            <span className={pop === "A" && !REDUCED ? "animate-[managerPop_0.4s_ease]" : undefined}>{a}</span>
            <span className="text-[20px] font-bold text-white/30">×</span>
            <span className={pop === "B" && !REDUCED ? "animate-[managerPop_0.4s_ease]" : undefined}>{b}</span>
          </div>
          {clock && (
            <div
              role="timer"
              aria-live="off"
              className={`mt-2 font-mono text-[12px] tracking-[0.12em] ${
                clockHot ? "text-flame-400" : "text-white/55"
              }`}
            >
              {clock}
            </div>
          )}
        </div>
        <TeamPanel name={oppName} slug={oppSlug} active={possSide === "B"} />
      </div>

      {goals && goals.length > 0 && <GoalTimeline goals={goals} />}

      {progress != null && (
        <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-white/15">
          <span
            className="block h-full rounded-full bg-grass-500 transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
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
    <div className="mt-3 grid grid-cols-2 gap-x-3 border-t border-white/10 pt-2" aria-label="Gols da partida">
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
