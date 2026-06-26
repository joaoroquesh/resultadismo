import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Campaign, MatchEvent, MatchState, Tactic } from "./types";
import {
  createMatch,
  deriveStatsFromEvents,
  reactiveAiPosture,
  recomputeFromMinute,
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
import {
  ConfirmInline,
  FormGrid,
  ManagerCrest,
  MatchStatsPanel,
  MatchupBadges,
  SegBlock,
  StatsLegend,
} from "./components";
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
// e a posse acende no lado dono. Ao ser REVELADO (no `due` OU num flush antes do
// intervalo/fim), o desfecho entra na TIMELINE — e SÓ daí o gol conta no placar.
// ITEM F: `danger` marca o build-up cuja CONCLUSÃO é um lance perigoso (gol, trave ou
// grande chance defendida) e que NÃO foi interrompido — só esses fazem o card piscar.
interface Pending {
  lineId: number;
  ev: MatchEvent;
  due: number;
  interrupted: boolean;
  danger: boolean;
}

// ITEM F: um lance é "de PERIGO" quando a conclusão pode virar (ou quase virou) gol —
// gol, bola na trave (quase) ou grande defesa do goleiro (defesa) — e o lance NÃO foi
// interrompido por impedimento/falta. Fora disso, o ataque é só posse, sem piscar.
function isDangerKind(kind: MatchEvent["kind"]): boolean {
  return kind === "goal" || kind === "quase" || kind === "defesa";
}

// ITEM #5: lado que DOMINA o jogo agora (posse "em repouso", quando não há um build-up
// ativo). Usa a posse ao vivo já derivada; antes do 1º lance, cai na força-base do motor
// (shareA). Pura e determinística — extraída pra fora do componente pra manter o corpo do
// LiveMatch simples.
function restingPossSide(stats: MatchStats | null, shareA: number): "A" | "B" {
  if (stats) return stats.poss.a >= stats.poss.b ? "A" : "B";
  return shareA >= 0.5 ? "A" : "B";
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
  onExit,
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
  // controle/liberdade (Nielsen #3): sair da partida em andamento (com confirmação na
  // UI). Descarta o jogo sem registrar resultado — volta pro hub.
  onExit: () => void;
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
  // BUG #4: o pontapé inicial ("Bola rolando! A × B") só pode entrar UMA vez no ticker.
  // O efeito de bootstrap roda DUAS vezes em dev por causa do <StrictMode> (mount →
  // unmount → mount), e a limpeza para o relógio mas NÃO remove a linha já empilhada —
  // por isso o kickoff aparecia duplicado. Este guard garante um único evento de
  // kickoff, independente do StrictMode (determinístico, não depende do ambiente).
  const kickoffPushedRef = useRef(false);
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
  // ITEM #3: confirmação transitória "✓ aplicada" no próprio painel de ajuste ao vivo
  // (além da linha no ticker) — feedback no lugar onde o usuário agiu, importante no
  // mobile (o ticker pode estar na outra aba). Some sozinha após ~2,2s.
  const [liveTacJustApplied, setLiveTacJustApplied] = useState(false);
  const liveTacAppliedTimer = useRef<number | null>(null);
  const [tacDrawerOpen, setTacDrawerOpen] = useState(false);
  // ITEM 14 reativo: postura corrente da IA (pode mudar conforme o placar ao vivo).
  const aiPostureRef = useRef(aiTac.postura);
  const [lines, setLines] = useState<TickerLine[]>([]);
  const [phase, setPhase] = useState<"live" | "halftime">("live");
  // controle/liberdade (Nielsen #3): pausar congela o relógio (para o setInterval) pra
  // pensar a tática sem usar 1x; sair abre uma confirmação inline antes de descartar.
  const [paused, setPaused] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  // ITEM #5: posse de bola em DOIS níveis, SEMPRE visíveis enquanto o jogo corre.
  // `activePossSide` = quem detém a bola no ciclo ofensivo CORRENTE (acende no build-up,
  // apaga na conclusão). Fora de um build-up, a posse não some: cai pro lado que DOMINA
  // o jogo agora (restPossSide, derivado da posse ao vivo / força do motor). Assim, a
  // TODO momento dá pra ver quem está com a bola (nível constante). `dangerSide` = só
  // quando o build-up corrente vai concluir num lance de PERIGO (gol/trave/grande
  // chance): aí o card AMPLIFICA (pisca em chama). reduced-motion: dois níveis estáticos
  // distintos (posse = ring calmo; perigo = ring de chama fixo), sem piscar.
  const [activePossSide, setActivePossSide] = useState<"A" | "B" | null>(null);
  const [dangerSide, setDangerSide] = useState<"A" | "B" | null>(null);
  // ITEM E: no MOBILE, abas alternam ticker (Transmissão) × painel de Estatísticas ao
  // vivo (uma de cada vez). No desktop as duas convivem lado a lado (item C), então a
  // aba é ignorada lá. Estado efêmero (não persiste).
  const [liveTab, setLiveTab] = useState<"feed" | "stats">("feed");

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
  // espelho render-safe do volume do motor (a render NÃO lê stateRef no render).
  const [view, setView] = useState({ gameVol: 1 });
  const syncView = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    setView({ gameVol: st.gameVol });
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

  // ITEM 7: aplica um AJUSTE TÁTICO ao vivo (3 eixos; formação fica travada). Valida
  // o cooldown próprio, recomputa minhas forças do MINUTO SEGUINTE em diante e dá um
  // micro-feedback no ticker. Não reseta gols/minuto. (ITEM H: o banco de comandos
  // Pressionar/Recuar foi removido — este ajuste é o único controle ao vivo.)
  const applyLiveTac = useCallback(
    (patch: Partial<Pick<Tactic, "estilo" | "postura" | "marcacao">>) => {
      const st = stateRef.current;
      if (!st || st.finished) return;
      if (st.minute < liveTacCooldownRef.current) return; // em cooldown
      const next: Tactic = { ...liveTacRef.current, ...patch, form: liveTacRef.current.form };
      liveTacRef.current = next;
      setLiveTac(next);
      onMyTacChange(next); // persiste a tática (sem mexer na formação travada)
      // BUG #3: o ajuste ao vivo recomputa o FUTURO (do minuto seguinte em diante) com a
      // nova tática minha vs a do rival — re-semeado de forma estável. O passado fica
      // intacto; o placar segue derivando só dos gols revelados.
      recomputeFromMinute(st, next, st.tacB, st.minute);
      const until = st.minute + P.LIVETAC_COOLDOWN_MIN;
      liveTacCooldownRef.current = until;
      setLiveTacCooldownUntil(until);
      // ITEM #3: deixa CLARO que o ajuste já vale (a partir do minuto seguinte) — o
      // trecho futuro foi recomputado com a nova tática.
      pushLine(
        st.minute,
        `Tática aplicada (vale do ${Math.min(90, st.minute + 1)}'): ${ESTILO_NM[next.estilo]} · ${POSTURA_NM[next.postura]} · ${MARC_NM[next.marcacao]}.`,
        "cmd",
        { icon: "✅" },
      );
      // confirmação no painel: acende e some sozinha (não persiste).
      setLiveTacJustApplied(true);
      if (liveTacAppliedTimer.current != null) window.clearTimeout(liveTacAppliedTimer.current);
      liveTacAppliedTimer.current = window.setTimeout(() => setLiveTacJustApplied(false), 2200);
      syncView();
    },
    [onMyTacChange, pushLine, syncView],
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
      // ITEM #5: o ciclo ofensivo assume a posse ativa (realce no lado que ataca agora).
      setActivePossSide(attackerSide);
      const interrupted = ev.kind !== "goal" && uiRnd.current() < 0.38;
      // ITEM F: pisca SÓ se o lance for de perigo E não for interrompido — aí o card do
      // atacante acende em alerta de chama até a conclusão.
      const danger = !interrupted && isDangerKind(ev.kind);
      if (danger) setDangerSide(attackerSide);
      pendingRef.current.push({
        lineId,
        ev,
        due: nowMs() + buildupDelayMs(speedRef.current),
        interrupted,
        danger,
      });
    },
    [aiTac, myTac, pushLine, teamSlugFor],
  );

  // BUG 1.3: REVELA um lance pendente — escreve o desfecho no ticker E (atomicamente)
  // entra na TIMELINE, de onde o placar deriva. O gol só conta AQUI, nunca antes.
  const resolveBuildup = useCallback(
    (p: Pending) => {
      const ev = p.ev;
      // ITEM #5: ao concluir, a POSSE ATIVA do ciclo apaga (a posse exibida volta pro
      // dono dominante do momento — restPossSide — então nunca fica "sem bola") e o
      // alerta de perigo cessa, se ainda forem deste lance.
      setActivePossSide((cur) => (cur === ev.ownerSide ? null : cur));
      if (p.danger) setDangerSide((cur) => (cur === ev.ownerSide ? null : cur));
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
    setActivePossSide(null);
    setDangerSide(null);
    setPhase("halftime");
  }, [flushAll, stopTimer]);

  const endMatch = useCallback(() => {
    stopTimer();
    flushAll(); // BUG 1.3: revela tudo antes de fechar — placar final == soma dos gols.
    setActivePossSide(null);
    setDangerSide(null);
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
  }, [aiTac, campaign.myTeam.o, opp.o, stageChance, syncView]);

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
    // BUG #4: empilha o kickoff só na primeira vez (o StrictMode remonta o efeito).
    if (!kickoffPushedRef.current) {
      kickoffPushedRef.current = true;
      pushLine(
        0,
        `Bola rolando! <strong>${campaign.myTeam.n}</strong> × <strong>${opp.n}</strong>.`,
        "info",
        { icon: "🟢" },
      );
    }
    syncView();
    startTimer();
    return () => {
      stopTimer();
      if (liveTacAppliedTimer.current != null) window.clearTimeout(liveTacAppliedTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // retoma 2º tempo após o intervalo (aplica a tática nova ao meu lado, incluindo a
  // FORMAÇÃO — que só pode mudar no intervalo). A tática corrente da IA (st.tacB) pode
  // já ter reagido ao placar do 1º tempo (item 14 reativo), então preservamos ela.
  const resumeSecondHalf = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    liveTacRef.current = myTac; // sincroniza o ajuste ao vivo com a tática do intervalo
    // BUG #3: a tática do intervalo (formação + eixos) recomputa o 2º TEMPO inteiro a
    // partir do minuto 45, re-semeado de forma estável (seed + placar + hash da tática).
    // Mudar o plano no vestiário REALMENTE muda os lances/placar do 2º tempo. O 1º tempo
    // (passado) e os gols já revelados ficam intactos.
    recomputeFromMinute(st, myTac, st.tacB, 45);
    pendingRef.current = [];
    setActivePossSide(null);
    setDangerSide(null);
    // ITEM #3: micro-feedback EXPLÍCITO de que a tática do intervalo já vale — o trecho
    // futuro (2º tempo) foi recomputado com este plano.
    pushLine(
      45,
      `Tática aplicada a partir do 2º tempo: ${FORM_NM[myTac.form]} · ${ESTILO_NM[myTac.estilo]} · ${POSTURA_NM[myTac.postura]} · ${MARC_NM[myTac.marcacao]}.`,
      "cmd",
      { icon: "✅" },
    );
    setPhase("live");
    syncView();
    startTimer();
  }, [myTac, pushLine, startTimer, syncView]);

  // ITEM G: pausa/retoma a partida — congela o RELÓGIO, o PLAYBACK e as STATS. Pausar
  // para o setInterval (o motor não avança, nada é revelado, as stats — derivadas dos
  // lances revelados — ficam paradas). Ao retomar, deslocamos o `due` de cada lance em
  // suspense pelo tempo pausado, pra a transmissão continuar EXATAMENTE de onde parou
  // (sem revelar em rajada o que "venceu" o suspense durante a pausa). Não vale no
  // intervalo nem com a partida encerrada. Pausa é efêmera (não persiste).
  const pauseStartRef = useRef(0);
  const togglePause = useCallback(() => {
    if (finished || phase === "halftime") return;
    setPaused((p) => {
      const next = !p;
      if (next) {
        pauseStartRef.current = nowMs();
        stopTimer();
      } else {
        const delta = nowMs() - pauseStartRef.current;
        if (delta > 0) {
          for (const pend of pendingRef.current) pend.due += delta;
        }
        startTimer();
      }
      return next;
    });
  }, [finished, phase, startTimer, stopTimer]);

  // sair da partida: para o relógio e devolve o controle ao orquestrador (volta pro
  // hub sem registrar o resultado). A confirmação acontece na UI antes de chamar isto.
  const doExit = useCallback(() => {
    stopTimer();
    onExit();
  }, [onExit, stopTimer]);

  // render lê só de state derivado — nunca de stateRef durante o render
  const stage = campaign.stages[campaign.stageIdx];
  const hot = (minute >= 43 && minute <= 45) || minute >= 87;
  // ITEM #5: POSSE CONSTANTE. A bola é sempre de ALGUÉM enquanto o jogo corre. Quando há
  // um ciclo ofensivo (build-up), a posse ativa é do atacante; fora dele, cai pro lado
  // que DOMINA o jogo agora — derivado da posse ao vivo (liveStats), e antes do 1º lance
  // pela força-base do motor (shareA). Assim o realce de posse nunca some entre os lances
  // (nível constante). A posse só se esconde quando o jogo NÃO está rolando (intervalo,
  // pausa, fim). reduced-motion não muda esta lógica — só o realce vira estático.
  const live = phase === "live" && !finished;
  const possSide: "A" | "B" | null =
    !live || paused ? null : (activePossSide ?? restingPossSide(liveStats, engine.shareA));
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
          {/* ITEM #8: título sem citar o nome do rival; o conteúdo abaixo mostra a tática
              dele + a leitura da comissão. */}
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            🔍 Análise da Comissão técnica
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

        {/* ITEM #6: leitura do 1º tempo com as 6 métricas completas (iguais ao ao vivo e
            ao pós-jogo) — não mais um resumo de 3. */}
        {halftimeStats && (
          <div className="mt-3">
            <MatchStatsPanel
              stats={halftimeStats}
              myName={campaign.myTeam.n}
              oppName={opp.n}
              title="1º tempo"
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
  // blocos reutilizados nos dois layouts (mobile empilhado com abas · desktop 2 colunas).
  const feedPanel = (
    <Ticker lines={lines} />
  );
  const statsPanel = (
    <LiveStatsPanel stats={liveStats} myName={campaign.myTeam.n} oppName={opp.n} />
  );
  const tacPanel = (
    // ITEM 7 / ITEM H: o único controle ao vivo é o AJUSTE TÁTICO (drawer recolhível).
    // Formação travada até o intervalo; estilo/postura/marcação mudam a quente, com
    // cooldown próprio. (O banco de comandos Pressionar/Recuar foi removido — ITEM H.)
    <LiveTacPanel
      tac={liveTac}
      open={tacDrawerOpen}
      onToggle={() => setTacDrawerOpen((v) => !v)}
      cooldownLeft={Math.max(0, liveTacCooldownUntil - minute)}
      justApplied={liveTacJustApplied}
      disabled={finished || minute >= 90}
      onChange={applyLiveTac}
    />
  );

  return (
    <div className="flex flex-col">
      {/* MELHORIA 2.3 / ITEM G: SÓ o placar eletrônico fica STICKY no topo ao rolar —
          sempre visível. A fileira de controles (velocidade/pausar/pular) NÃO é sticky
          (rola junto), pra não roubar altura útil no mobile. */}
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
          dangerSide={dangerSide}
          goals={goals}
          clock={fmtClock(minute)}
          clockHot={hot}
          progress={Math.min(100, (minute / 90) * 100)}
        />
      </div>

      {/* ITEM G: controles NÃO-fixos (fora do sticky) — velocidade + pausar + pular. */}
      <SpeedBar
        speed={speed}
        onPick={pickSpeed}
        onSkip={skipHalf}
        skipLabel={minute < 45 ? "Pular 1º tempo" : "Pular 2º tempo"}
        disabled={finished}
        paused={paused}
        onTogglePause={togglePause}
      />
      {paused && (
        <div
          role="status"
          className="mt-1.5 rounded-[10px] bg-brand-500/12 px-3 py-1.5 text-center text-[12px] font-bold text-brand-700"
        >
          Partida pausada. Toque em Retomar para continuar.
        </div>
      )}

      {/* ITEM E (mobile): abas Transmissão | Estatísticas — uma de cada vez. No lg+ as
          abas somem (item C as duas convivem lado a lado). */}
      <div className="mt-3 lg:hidden">
        <LiveTabs value={liveTab} onChange={setLiveTab} />
        <div className="mt-2">
          {liveTab === "feed" ? (
            <div role="tabpanel" id="live-panel-feed" aria-labelledby="live-tab-feed">
              {feedPanel}
            </div>
          ) : (
            <div role="tabpanel" id="live-panel-stats" aria-labelledby="live-tab-stats">
              {statsPanel}
            </div>
          )}
        </div>
        {/* o ajuste tático fica sempre acessível abaixo das abas (não disputa a aba). */}
        <div className="mt-3">{tacPanel}</div>
      </div>

      {/* ITEM C (desktop lg+): DUAS COLUNAS aproveitando a largura — Transmissão à
          esquerda, Estatísticas ao vivo + Ajuste tático à direita. O placar acima já
          ocupa a largura inteira. */}
      <div className="mt-3 hidden gap-4 lg:grid lg:grid-cols-[1.1fr_1fr]">
        <div className="min-w-0">
          <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            Transmissão ao vivo
          </div>
          {feedPanel}
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <div>
            <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
              Estatísticas ao vivo
            </div>
            {statsPanel}
          </div>
          {tacPanel}
        </div>
      </div>

      {/* controle/liberdade (Nielsen #3): sair da partida com confirmação. Ao abrir a
          confirmação, pausa o relógio pra o usuário decidir sem o jogo correndo. */}
      {!finished &&
        (confirmExit ? (
          <ConfirmInline
            message="Sair agora encerra esta partida sem registrar o resultado. Você volta pro hub e pode jogá-la de novo."
            confirmLabel="Sair sem salvar"
            cancelLabel="Continuar jogando"
            onConfirm={doExit}
            onCancel={() => setConfirmExit(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              if (!paused) togglePause();
              setConfirmExit(true);
            }}
            className="mt-3 min-h-[44px] self-center px-3 text-[13px] font-semibold text-ink-500 underline-offset-2 hover:text-flame-700 hover:underline"
          >
            Sair da partida
          </button>
        ))}
    </div>
  );
}

// MELHORIA 2.6: seletor de velocidade (1x/2x/4x) + Pausar + "Pular tempo". ≥44px, aria.
function SpeedBar({
  speed,
  onPick,
  onSkip,
  skipLabel,
  disabled,
  paused,
  onTogglePause,
}: {
  speed: LiveSpeed;
  onPick: (s: LiveSpeed) => void;
  paused: boolean;
  onTogglePause: () => void;
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
              disabled={disabled || paused}
              onClick={() => onPick(s)}
              className={`flex min-h-[40px] flex-1 items-center justify-center rounded-[9px] text-[13px] font-black tabular-nums transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.95] disabled:opacity-45 ${
                on ? "scale-[1.04] bg-brand-600 text-white shadow-sm" : "text-ink-600 hover:text-ink-800"
              }`}
            >
              {s}×
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
          paused
            ? "border-brand-500 bg-brand-600 text-white"
            : "border-border bg-surface text-ink-800 hover:bg-surface-2"
        }`}
      >
        <span aria-hidden>{paused ? "▶︎" : "⏸"}</span>
        {paused ? "Retomar" : "Pausar"}
      </button>
      <button
        type="button"
        onClick={onSkip}
        disabled={disabled || paused}
        aria-label={skipLabel}
        className="flex min-h-[40px] items-center gap-1.5 rounded-[12px] border border-border bg-surface px-3 text-[13px] font-bold text-ink-800 transition-colors hover:bg-surface-2 active:scale-[0.98] disabled:opacity-45"
      >
        <span aria-hidden>⏭️</span>
        Pular tempo
      </button>
    </div>
  );
}

// ITEM E — abas Transmissão | Estatísticas ao vivo (mobile). Acessível (role=tablist/
// tab), pílula com a aba ativa nítida, alvos ≥44px. Anima só transform/cor.
function LiveTabs({
  value,
  onChange,
}: {
  value: "feed" | "stats";
  onChange: (v: "feed" | "stats") => void;
}) {
  const tabs: { id: "feed" | "stats"; label: string; icon: string }[] = [
    { id: "feed", label: "Transmissão", icon: "📺" },
    { id: "stats", label: "Estatísticas", icon: "📊" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Visão da partida"
      className="flex gap-1 rounded-[13px] border border-border bg-surface-2 p-1"
    >
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`live-tab-${t.id}`}
            aria-selected={on}
            aria-controls={`live-panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] text-[13px] font-bold transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
              on ? "scale-[1.02] bg-brand-600 text-white shadow-sm" : "text-ink-600 hover:text-ink-800"
            }`}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

// ITEM 6 — ticker da transmissão (extraído pra ser reutilizado nos dois layouts).
function Ticker({ lines }: { lines: TickerLine[] }) {
  return (
    <div
      aria-live="polite"
      aria-label="Narração da partida"
      className="flex h-40 flex-col justify-start overflow-y-auto rounded-[14px] border border-border bg-surface px-1.5 py-1 text-[13.5px] lg:h-[22rem]"
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
  );
}

// ITEM D — número da estatística que TWEENA quando muda: pequeno "bump" (escala+cor)
// pra o olho perceber a mudança sem o número pular seco. reduced-motion: troca direta.
function TweenNumber({
  value,
  suffix,
  className,
}: {
  value: number;
  suffix?: string;
  className?: string;
}) {
  const [bump, setBump] = useState(false);
  const prev = useRef(value);
  const rafRef = useRef(0);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    if (REDUCED) return; // troca direta, sem animação
    // O "bump" é um GATILHO de animação disparado pela mudança de valor (não um estado
    // derivado). Em vez de chamar setState SÍNCRONO dentro do effect (que provoca renders
    // em cascata), agendamos o ligar via requestAnimationFrame — ele roda fora do commit
    // do effect, então o React não re-renderiza em cascata. O desligar acontece pelo
    // onAnimationEnd da própria animação (e o reduced-motion já saiu acima sem ligar nada).
    rafRef.current = window.requestAnimationFrame(() => setBump(true));
    return () => window.cancelAnimationFrame(rafRef.current);
  }, [value]);
  return (
    <span
      onAnimationEnd={() => setBump(false)}
      className={`inline-block tabular-nums ${bump ? "animate-manager-stat-bump text-brand-700" : ""} ${className ?? ""}`}
    >
      {value}
      {suffix ?? ""}
    </span>
  );
}

// ITEM D — painel de estatísticas AO VIVO com o CONJUNTO COMPLETO (as mesmas 6 do
// pós-jogo) atualizando à medida do jogo. Cada barra anima a LARGURA (~300ms ease-out)
// e o número faz um tween curto. O objetivo é o usuário LER o jogo e se adaptar.
// reduced-motion: sem tween/transição (o kill-switch global zera a animação; a
// transição de width abaixo respeita o mesmo media query). Sempre visível (sem
// recolher) — é insumo de leitura, não um detalhe escondido.
function LiveStatsPanel({
  stats,
  myName,
  oppName,
}: {
  stats: MatchStats | null;
  myName: string;
  oppName: string;
}) {
  if (!stats) {
    return (
      <div className="rounded-[14px] border border-border bg-surface px-3.5 py-6 text-center text-[12.5px] text-ink-500">
        Sem lances ainda. As estatísticas aparecem no primeiro ataque.
      </div>
    );
  }
  const rows: { label: string; a: number; b: number; suffix?: string }[] = [
    { label: "Posse de bola", a: stats.poss.a, b: stats.poss.b, suffix: "%" },
    { label: "Finalizações", a: stats.fin.a, b: stats.fin.b },
    { label: "Chutes ao gol", a: stats.sot.a, b: stats.sot.b },
    { label: "Passes certos", a: stats.passAcc.a, b: stats.passAcc.b, suffix: "%" },
    { label: "Faltas", a: stats.fouls.a, b: stats.fouls.b },
    { label: "Desarmes", a: stats.tackles.a, b: stats.tackles.b },
  ];
  return (
    <div className="rounded-[14px] border border-border bg-surface p-3.5">
      <div className="mb-1 flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">
        <span className="truncate text-brand-700">{myName}</span>
        <span className="shrink-0 px-2">ao vivo</span>
        <span className="truncate text-right text-ink-700">{oppName}</span>
      </div>
      <div className="mt-2 flex flex-col gap-2.5">
        {rows.map((r) => {
          const total = r.a + r.b || 1;
          const pa = Math.round((r.a / total) * 100);
          const aWins = r.a >= r.b;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-[12.5px] font-bold tabular-nums text-ink-800">
                <TweenNumber value={r.a} suffix={r.suffix} className={aWins ? "text-brand-700" : undefined} />
                <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">
                  {r.label}
                </span>
                <TweenNumber value={r.b} suffix={r.suffix} className={!aWins ? "text-ink-900" : undefined} />
              </div>
              <div
                className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`${r.label}: ${myName} ${r.a}${r.suffix ?? ""}, ${oppName} ${r.b}${r.suffix ?? ""}`}
              >
                {/* ITEM D: a barra ANIMA a largura ~300ms ease-out quando a stat muda. */}
                <span
                  className="block h-full rounded-l-full bg-brand-500 transition-[width] duration-300 ease-out"
                  style={{ width: `${pa}%` }}
                />
                <span
                  className="block h-full rounded-r-full bg-ink-400 transition-[width] duration-300 ease-out"
                  style={{ width: `${100 - pa}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {/* ITEM #7: mesma legenda dos demais painéis — finalização × chute ao gol. */}
      <StatsLegend />
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
  justApplied,
  disabled,
  onChange,
}: {
  tac: Tactic;
  open: boolean;
  onToggle: () => void;
  cooldownLeft: number;
  justApplied: boolean;
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
          {/* ITEM #3: confirmação transitória de que o ajuste foi aplicado, no lugar onde
              o usuário agiu. Tem prioridade visual sobre o cooldown nos ~2s iniciais. */}
          {justApplied && (
            <span
              role="status"
              className="flex items-center gap-1 rounded-md bg-grass-500/15 px-2 py-0.5 text-[11px] font-extrabold text-grass-700"
            >
              <span aria-hidden>✓</span> aplicada
            </span>
          )}
          {!justApplied && cooldownLeft > 0 && (
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
        <div className={`animate-rise border-t border-border px-3.5 pb-3.5 pt-1 ${locked ? "opacity-55" : ""}`}>
          <div className="mt-1.5 text-[11px] text-ink-500">
            A <b>formação</b> só muda no intervalo. Mexa em estilo, postura e marcação: vale do
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
// ITEM #5 — posse em DOIS níveis, SEMPRE distinguíveis:
//  • `active` (posse normal) = este lado está com a bola → realce ESTÁVEL e claro:
//    ring branco fixo + indicador "● com a bola" sob o nome (sem piscar). Mostrado
//    constantemente enquanto o jogo corre, mesmo entre os lances.
//  • `danger` (perigo) = o lance corrente vai concluir num lance de perigo → realce
//    AMPLIFICADO: ring de chama mais grosso/brilhante. Com motion, ele PULSA; em
//    reduced-motion, fica um ring de chama ESTÁTICO (distinto do branco da posse normal)
//    e o indicador vira "▲ ataque perigoso". Os dois níveis nunca se confundem.
const POSS_RING = "0 0 0 2px rgba(255,255,255,0.92)";
const DANGER_RING_STATIC =
  "0 0 0 3px oklch(0.69 0.2 27 / 1), 0 0 16px 2px oklch(0.64 0.22 27 / 0.7)";
function TeamPanel({
  name,
  slug,
  active,
  danger,
}: {
  name: string;
  slug?: string;
  active?: boolean;
  danger?: boolean;
}) {
  const c = teamColors(slug, name);
  const dangerBlink = danger && !REDUCED;
  // box-shadow base por nível. A animação managerDanger define o box-shadow inteiro nos
  // keyframes, então só aplicamos um boxShadow inline quando NÃO estamos animando.
  const baseShadow = danger ? DANGER_RING_STATIC : active ? POSS_RING : undefined;
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <ManagerCrest slug={slug} name={name} size={40} className="shrink-0" />
      {/* CLAREZA/ROBUSTEZ (v9): nome longo (ex.: "Coreia do Sul", "Estados Unidos")
          QUEBRA em até 2 linhas em vez de truncar com "…" — o nome da seleção é a
          identidade do placar, não pode sumir. overflow-wrap:anywhere só parte a palavra
          em último caso (nome de uma palavra gigante); o normal quebra entre palavras.
          leading apertado mantém o respiro do board. */}
      <span
        className={`w-full rounded-md px-2 py-1 text-center text-[12.5px] font-black uppercase leading-[1.08] tracking-wide [overflow-wrap:anywhere] transition-shadow duration-150 ease-out ${
          dangerBlink ? "animate-manager-danger" : ""
        }`}
        style={{
          background: c.bg,
          color: c.text,
          boxShadow: dangerBlink ? undefined : baseShadow,
        }}
      >
        {name}
      </span>
      {/* indicador textual do nível de posse — reforça os DOIS níveis sem depender só de
          cor/anim (acessível): "com a bola" (constante) × "ataque perigoso" (amplificado).
          Altura reservada sempre, pra não empurrar o layout ao acender/apagar. */}
      <span
        className="flex h-3 items-center gap-1 text-[9px] font-extrabold uppercase tracking-wide leading-none"
        aria-hidden
      >
        {danger ? (
          <span className="flex items-center gap-1 text-flame-300">
            <span>▲</span> ataque perigoso
          </span>
        ) : active ? (
          <span className="flex items-center gap-1 text-white/70">
            <span>●</span> com a bola
          </span>
        ) : null}
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
  dangerSide,
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
  dangerSide?: "A" | "B" | null;
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
        <TeamPanel name={myName} slug={mySlug} active={possSide === "A"} danger={dangerSide === "A"} />
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
        <TeamPanel name={oppName} slug={oppSlug} active={possSide === "B"} danger={dangerSide === "B"} />
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

// resumo do plano: apenas ECOA as escolhas do jogador, neutro, sem ⚠/✓ nem "ideal"
export function PlanSummary({ tac }: { tac: Tactic }) {
  return (
    <div className="mt-2.5 rounded-[10px] bg-surface-2 px-3 py-2 text-[12px] font-semibold text-ink-600">
      Seu plano: <b className="text-ink-900">{FORM_NM[tac.form]}</b> · {ESTILO_NM[tac.estilo]} ·{" "}
      {POSTURA_NM[tac.postura]} · {MARC_NM[tac.marcacao]}
    </div>
  );
}
