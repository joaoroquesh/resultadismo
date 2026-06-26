import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Campaign, MatchEvent, MatchState, Tactic } from "./types";
import {
  commissionRead,
  createMatch,
  deriveStatsFromEvents,
  liveAdjustHints,
  reactiveAiPosture,
  reactiveAiTactic,
  recomputeFromMinute,
  recomputeStrengths,
  stageLong,
  stepMinute,
} from "./engine";
import type { CommissionRead, LiveHint } from "./engine";
import type { MatchStats } from "./types";
import {
  ATK_NM,
  DEF_NM,
  FORM_NM,
  sliderZone,
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
  TacticSliders,
} from "./components";
import { ATK_OPTS, DEF_OPTS, FORM_OPTS, TICKER_ICON } from "./ui";
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
// ITEM 3: exportado pra o fim de jogo (MatchResult) revisar a transmissão na aba
// Transmissão — as mesmas linhas geradas ao vivo, sem regenerar narração.
export interface TickerLine {
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
  aiPhase,
  fase,
  matchSeed,
  onMyTacChange,
  onFinish,
  onExit,
}: {
  campaign: Campaign;
  opp: import("./types").Team;
  myTac: Tactic;
  aiTac: Tactic;
  // ITEM 14 (IA por fase, §14): regime da IA neste jogo. "ao_vivo" (semi/final) libera a
  // reação tática COMPLETA (forma/estilos/sliders) no intervalo e a cada mudança SUA; nas
  // demais fases a IA só ajusta a POSTURA ao vivo (comportamento do v9).
  aiPhase: import("./engine").MatchPhase;
  // §11: fase do torneio pro TETO do edge (estreia baixa · grupos/oitavas pico · quartas/
  // semis afina · final apertada). Passada ao motor no createMatch e nos recomputes.
  fase: import("./types").MatchFase;
  matchSeed: number;
  onMyTacChange: (tac: Tactic) => void;
  onFinish: (
    gA: number,
    gB: number,
    goals: { side: "A" | "B"; m: number }[],
    stats: MatchStats,
    // ITEM 3: a transmissão completa (linhas do ticker) pra a aba Transmissão do fim de jogo.
    lines: TickerLine[],
  ) => void;
  // controle/liberdade (Nielsen #3): sair da partida em andamento (com confirmação na
  // UI). Descarta o jogo sem registrar resultado — volta pro hub.
  onExit: () => void;
}) {
  // a partida é criada UMA vez (lazy), antes do 1º render. O objeto MatchState tem
  // identidade estável (é mutado in-place pelo motor), então pode ser lido na render.
  // É a fonte de verdade em STATE; `stateRef` espelha p/ os callbacks/loop lerem.
  const [engine] = useState<MatchState>(() =>
    createMatch(campaign.myTeam, opp, myTac, aiTac, matchSeed || 1, fase),
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
  // ITEM 4 (ajuste com DEBOUNCE em TEMPO REAL): o usuário mexe os sliders à vontade; a
  // cada mexida resetamos um timer de 2s REAIS — só quando ele PARA por 2s a orientação é
  // aplicada (recomputa do minuto seguinte). Depois de aplicar, um cooldown de 1s REAL
  // antes de poder aplicar de novo. NÃO mais cooldown em minutos de jogo. O motor segue
  // determinístico (o debounce só decide QUANDO a UI dispara o recompute). Timers em
  // tempo real (setTimeout), limpos no unmount/pausa/fim.
  const RELAY_DEBOUNCE_MS = 2000; // parar por 2s reais → aplica
  const RELAY_COOLDOWN_MS = 1000; // 1s real depois de aplicar, antes de reaplicar
  const relayDebounceRef = useRef<number | null>(null);
  const relayCooldownRef = useRef(0); // nowMs() até quando um novo commit fica bloqueado
  const pendingTacRef = useRef<Tactic | null>(null); // a orientação aguardando commit
  const lastCommittedTacRef = useRef<Tactic>(myTac); // base p/ derivar a dica/diff no commit
  // guarda o commit mais recente — o reagendamento (cooldown) chama via ref, evitando
  // referência ao const antes da sua declaração (TDZ) e mantendo o closure sempre fresco.
  const commitRef = useRef<() => void>(() => {});
  // "Passando orientações para os jogadores" — acende enquanto a mudança está pendente
  // (durante o debounce) e some quando a orientação é aplicada.
  const [relaying, setRelaying] = useState(false);
  // ITEM #3: confirmação transitória "✓ aplicada" no próprio painel de ajuste ao vivo
  // (além da linha no ticker) — feedback no lugar onde o usuário agiu, importante no
  // mobile (o ticker pode estar na outra aba). Some sozinha após ~2,2s.
  const [liveTacJustApplied, setLiveTacJustApplied] = useState(false);
  const liveTacAppliedTimer = useRef<number | null>(null);
  // §14: a DICA DE IMPACTO do último ajuste — lida do estado real (sintonia/matriz) e
  // mostrada no painel onde o usuário agiu (além da linha no ticker). Some no próximo
  // ajuste / ao recolher.
  const [lastHints, setLastHints] = useState<LiveHint[]>([]);
  const [tacDrawerOpen, setTacDrawerOpen] = useState(false);
  // ITEM 14 reativo: postura corrente da IA (pode mudar conforme o placar ao vivo).
  const aiPostureRef = useRef(aiTac.postura);
  const [lines, setLines] = useState<TickerLine[]>([]);
  const linesRef = useRef<TickerLine[]>([]); // ITEM 3: espelho das linhas p/ o fim de jogo
  const [phase, setPhase] = useState<"live" | "halftime">("live");
  // ITEM 14 (§14): snapshot da tática da IA pra REVELAR no Vestiário (congelado no
  // openHalftime). Começa = tática inicial; na semi/final reflete o que a IA jogou no 1º
  // tempo (pode ter mudado ao vivo). A UI mostra formação + estilos, nunca sliders.
  const [aiTacShown, setAiTacShown] = useState<Tactic>(aiTac);
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
  // ITEM 3: no INTERVALO, as mesmas abas Transmissão | Estatísticas, mas o default é
  // Estatísticas (que então aparece ACIMA da análise da comissão). A Transmissão fica
  // disponível pra revisar os lances do 1º tempo.
  const [breakTab, setBreakTab] = useState<"feed" | "stats">("stats");

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
      setLines((cur) => {
        const nextLines = [{ id, min, kind, html, ...meta }, ...cur].slice(0, 40);
        linesRef.current = nextLines; // ITEM 3: espelho síncrono p/ o fim de jogo
        return nextLines;
      });
      return id;
    },
    [],
  );
  const replaceLine = useCallback(
    (id: number, html: string, kind: TickerKind, meta?: Partial<TickerLine>) => {
      setLines((cur) => {
        const nextLines = cur.map((l) => (l.id === id ? { ...l, html, kind, ...meta } : l));
        linesRef.current = nextLines;
        return nextLines;
      });
    },
    [],
  );

  // MELHORIA 2.6: escolhe 1x/2x/4x; persiste e atualiza o ref do loop sem reiniciar.
  const pickSpeed = useCallback((next: LiveSpeed) => {
    setSpeed(next);
    speedRef.current = next;
    saveSpeed(next);
  }, []);

  // ITEM 7 (rev 4): aplica um AJUSTE ao vivo — SÓ OS SLIDERS (postura/pressão/amplitude/
  // pegada). Formação e estilos ficam travados ao vivo (só mudam no intervalo). Valida o
  // cooldown próprio, recomputa minhas forças do MINUTO SEGUINTE em diante e dá um
  // micro-feedback no ticker. Não reseta gols/minuto.
  // COMMIT — aplica de fato a orientação pendente (pendingTacRef): recomputa o futuro do
  // minuto seguinte (BUG #3), faz a IA reagir (semi/final), narra e confirma. Gated por um
  // cooldown REAL de 1s: se ainda está no cooldown, reagenda o commit pra quando ele
  // expirar (assim a última mudança sempre vale). Determinismo do motor preservado.
  const commitLiveTac = useCallback(() => {
    const st = stateRef.current;
    if (!st || st.finished) {
      pendingTacRef.current = null;
      setRelaying(false);
      return;
    }
    const next = pendingTacRef.current;
    if (!next) {
      setRelaying(false);
      return;
    }
    // cooldown REAL de 1s: se ainda não passou, reagenda o commit pro fim do cooldown.
    const wait = relayCooldownRef.current - nowMs();
    if (wait > 0) {
      if (relayDebounceRef.current != null) window.clearTimeout(relayDebounceRef.current);
      relayDebounceRef.current = window.setTimeout(() => commitRef.current(), wait + 16);
      return;
    }
    pendingTacRef.current = null;
    const cur = lastCommittedTacRef.current;
    lastCommittedTacRef.current = next;
    // §14: a DICA DE IMPACTO — lida do ESTADO REAL (sintonia §6.5 do novo valor + a matriz
    // §4/pressão §5 contra a tática vigente da IA). Ensina o efeito sem dar o número. O
    // "eixo" da dica é o que mais mudou desde a última orientação aplicada.
    const keys: ("postura" | "pressao" | "amplitude" | "agressividade")[] = [
      "postura",
      "pressao",
      "amplitude",
      "agressividade",
    ];
    let changedKey: (typeof keys)[number] | undefined;
    let maxDelta = 0;
    for (const k of keys) {
      const d = Math.abs(next[k] - cur[k]);
      if (d > maxDelta) {
        maxDelta = d;
        changedKey = k;
      }
    }
    const hints = changedKey ? liveAdjustHints(changedKey, next, cur, campaign.myTeam, st.tacB) : [];
    setLastHints(hints);
    // ITEM 14 (§14): na semi/final, a IA REAGE à sua mudança — re-afina os sliders dela
    // (estrutura travada ao vivo) contra o seu novo plano + o ânimo do placar.
    let aiNext: Tactic = st.tacB;
    if (aiPhase === "ao_vivo") {
      aiNext = reactiveAiTactic(opp, campaign.myTeam, next, st.tacB, st.gB, st.gA, st.minute, true);
      aiPostureRef.current = aiNext.postura;
    }
    // BUG #3: o ajuste ao vivo recomputa o FUTURO (do minuto seguinte em diante) com a nova
    // tática minha vs a da IA (já reagida) — re-semeado de forma estável. O passado fica
    // intacto; o placar segue derivando só dos gols revelados.
    recomputeFromMinute(st, next, aiNext, st.minute);
    // a orientação foi passada: some o aviso e arma o cooldown real de 1s.
    setRelaying(false);
    relayCooldownRef.current = nowMs() + RELAY_COOLDOWN_MS;
    // ITEM #3 + §14: o ticker confirma que o ajuste já vale E entrega a 1ª DICA DE IMPACTO.
    const detail = changedKey ? `${sliderZone(changedKey, next[changedKey])}` : "ajuste";
    pushLine(
      st.minute,
      `Ajuste aplicado (vale do ${Math.min(90, st.minute + 1)}'): ${detail}.`,
      "cmd",
      { icon: "✅" },
    );
    if (hints[0]) {
      const ic = hints[0].tone === "good" ? "▲" : hints[0].tone === "bad" ? "⚠️" : "💡";
      pushLine(st.minute, hints[0].text, "cmd", { icon: ic });
    }
    // confirmação no painel: acende e some sozinha (não persiste).
    setLiveTacJustApplied(true);
    if (liveTacAppliedTimer.current != null) window.clearTimeout(liveTacAppliedTimer.current);
    liveTacAppliedTimer.current = window.setTimeout(() => setLiveTacJustApplied(false), 2200);
    syncView();
  }, [aiPhase, campaign.myTeam, opp, pushLine, syncView]);

  // STAGE — chamado a cada mexida de slider. Move o slider NA HORA (a UI acompanha o
  // dedo), persiste a posição e RESETA o debounce de 2s reais. Não recomputa aqui: o
  // recompute só dispara quando o usuário PARA por 2s (commitLiveTac). Acende o aviso
  // "Passando orientações…". Livre de cooldown-em-minutos: dá pra mexer à vontade.
  const stageLiveTac = useCallback(
    (patch: Partial<Pick<Tactic, "postura" | "pressao" | "amplitude" | "agressividade">>) => {
      const st = stateRef.current;
      if (!st || st.finished) return;
      const cur = liveTacRef.current;
      const next: Tactic = { ...cur, ...patch, form: cur.form, atk: cur.atk, def: cur.def };
      liveTacRef.current = next;
      setLiveTac(next); // a posição do slider acompanha o movimento imediatamente
      onMyTacChange(next); // persiste a tática (sem mexer na formação/estilos travados)
      pendingTacRef.current = next; // a orientação a ser aplicada quando ele parar
      setRelaying(true);
      // reseta o timer de 2s: cada mexida adia o commit (debounce).
      if (relayDebounceRef.current != null) window.clearTimeout(relayDebounceRef.current);
      relayDebounceRef.current = window.setTimeout(() => commitRef.current(), RELAY_DEBOUNCE_MS);
    },
    [onMyTacChange],
  );

  // mantém o commitRef sempre apontando pro commit mais recente (closure fresco).
  useEffect(() => {
    commitRef.current = commitLiveTac;
  }, [commitLiveTac]);

  // ----- suspense em 2 etapas -----
  const teamSlugFor = useCallback(
    (side: "A" | "B") => (side === "A" ? campaign.myTeam.s : opp.s),
    [campaign.myTeam.s, opp.s],
  );

  const stageChance = useCallback(
    (ev: MatchEvent) => {
      const attackerSide = ev.ownerSide;
      // narração casa com o estilo de ataque CORRENTE do motor (st.tacA/tacB) — na semi/
      // final a IA pode ter trocado o estilo no intervalo, então não usamos o aiTac
      // inicial. Fallback pros props se o estado ainda não existir.
      const st = stateRef.current;
      const atkTac = attackerSide === "A" ? (st?.tacA ?? myTac) : (st?.tacB ?? aiTac);
      const styleKey = TICKER_BUILDUP[atkTac.atk] ? atkTac.atk : "posse";
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

  // ITEM 4: cancela o debounce do ajuste ao vivo e descarta a orientação pendente. Chamado
  // ao PAUSAR, no INTERVALO e no FIM — o ajuste em tempo real não deve disparar fora do
  // jogo correndo (o intervalo tem seu próprio fluxo de tática). Some o aviso.
  const clearRelay = useCallback(() => {
    if (relayDebounceRef.current != null) {
      window.clearTimeout(relayDebounceRef.current);
      relayDebounceRef.current = null;
    }
    pendingTacRef.current = null;
    setRelaying(false);
  }, []);

  const openHalftime = useCallback(() => {
    if (halftimeShownRef.current) return;
    halftimeShownRef.current = true;
    stopTimer();
    clearRelay(); // ITEM 4: descarta debounce pendente ao entrar no intervalo.
    flushAll(); // BUG 1.3: nenhum gol do 1º tempo pode ficar pra trás.
    setActivePossSide(null);
    setDangerSide(null);
    // ITEM 14 (§14): o Vestiário revela a tática que a IA REALMENTE jogou no 1º tempo —
    // na semi/final ela pode ter mexido na postura/sliders ao vivo, então congelamos
    // st.tacB aqui (não o aiTac inicial). Revela formação + estilos (NÃO sliders, §14).
    const st = stateRef.current;
    if (st) setAiTacShown(st.tacB);
    setPhase("halftime");
  }, [flushAll, stopTimer, clearRelay]);

  const endMatch = useCallback(() => {
    stopTimer();
    clearRelay(); // ITEM 4: descarta debounce pendente ao encerrar.
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
    onFinish(gA, gB, finalGoals, deriveStatsFromEvents(st, revealedRef.current), linesRef.current);
  }, [onFinish, stopTimer, flushAll, clearRelay]);

  // roda UM minuto do motor (com a IA reativa antes) e ENFILEIRA os lances do minuto.
  const liveTick = useCallback(() => {
    const st = stateRef.current;
    if (!st) return;
    // ITEM 14 reativo (§14) — antes de rodar o minuto, a IA relê o placar (e, na semi/
    // final, o SEU plano corrente) e pode mexer na tática. AO VIVO a estrutura fica
    // travada pros dois lados (§1): a IA só re-afina os sliders.
    if (aiPhase === "ao_vivo") {
      // semi/final: re-afina sliders contra o meu plano atual + ânimo do placar.
      const nextB = reactiveAiTactic(
        opp,
        campaign.myTeam,
        st.tacA, // meu plano corrente (mantido em sync pelo motor)
        st.tacB,
        st.gB,
        st.gA,
        st.minute,
        true, // keepStructure: estrutura só muda no intervalo
      );
      if (
        nextB.postura !== st.tacB.postura ||
        nextB.pressao !== st.tacB.pressao ||
        nextB.amplitude !== st.tacB.amplitude ||
        nextB.agressividade !== st.tacB.agressividade
      ) {
        aiPostureRef.current = nextB.postura;
        recomputeStrengths(st, st.tacA, nextB);
      }
    } else {
      // grupos/oitavas/quartas: só a POSTURA reage (v9). Estrutura+estilos do plano ficam.
      const newPosture = reactiveAiPosture(aiTac, opp.o, campaign.myTeam.o, st.gB, st.gA, st.minute);
      if (newPosture !== aiPostureRef.current) {
        aiPostureRef.current = newPosture;
        const nextB: Tactic = { ...st.tacB, postura: newPosture };
        recomputeStrengths(st, st.tacA, nextB);
      }
    }
    const r = stepMinute(st);
    setMinute(r.minute);
    r.events.forEach((ev) => stageChance(ev));
    syncView();
  }, [aiPhase, aiTac, campaign.myTeam, opp, stageChance, syncView]);

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
      // ITEM 4: limpa o debounce do ajuste ao vivo no unmount.
      if (relayDebounceRef.current != null) window.clearTimeout(relayDebounceRef.current);
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
    lastCommittedTacRef.current = myTac; // ITEM 4: base do diff reinicia na tática do vestiário
    clearRelay(); // ITEM 4: garante que nenhum debounce do 1º tempo sobrou
    // ITEM 14 (§14): na semi/final, a IA também AJUSTA NO INTERVALO — aqui ela pode
    // RE-ESTRUTURAR (formação + estilos + sliders), lendo o seu novo plano do vestiário e
    // o placar do 1º tempo. Nas demais fases a tática da IA segue como entrou no jogo
    // (apenas a postura reagiu ao vivo).
    let aiNext: Tactic = st.tacB;
    if (aiPhase === "ao_vivo") {
      aiNext = reactiveAiTactic(opp, campaign.myTeam, myTac, st.tacB, st.gB, st.gA, 45, false);
      aiPostureRef.current = aiNext.postura;
    }
    // BUG #3: a tática do intervalo (formação + eixos) recomputa o 2º TEMPO inteiro a
    // partir do minuto 45, re-semeado de forma estável (seed + placar + hash da tática).
    // Mudar o plano no vestiário REALMENTE muda os lances/placar do 2º tempo. O 1º tempo
    // (passado) e os gols já revelados ficam intactos.
    recomputeFromMinute(st, myTac, aiNext, 45);
    pendingRef.current = [];
    setActivePossSide(null);
    setDangerSide(null);
    // ITEM #3: micro-feedback EXPLÍCITO de que a tática do intervalo já vale — o trecho
    // futuro (2º tempo) foi recomputado com este plano.
    pushLine(
      45,
      `Tática aplicada a partir do 2º tempo: ${FORM_NM[myTac.form]} · ${ATK_NM[myTac.atk]} · ${DEF_NM[myTac.def]}.`,
      "cmd",
      { icon: "✅" },
    );
    setPhase("live");
    syncView();
    startTimer();
  }, [aiPhase, campaign.myTeam, myTac, opp, pushLine, startTimer, syncView, clearRelay]);

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
        clearRelay(); // ITEM 4: pausar congela o jogo — descarta o debounce do ajuste.
      } else {
        const delta = nowMs() - pauseStartRef.current;
        if (delta > 0) {
          for (const pend of pendingRef.current) pend.due += delta;
        }
        startTimer();
      }
      return next;
    });
  }, [finished, phase, startTimer, stopTimer, clearRelay]);

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
    const aiFormLabel = FORM_OPTS.find((o) => o[0] === aiTacShown.form)?.[1] ?? aiTacShown.form;
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
        {/* ITEM 3: abas Transmissão | Estatísticas (default Estatísticas) ACIMA da análise
            — o usuário revê os números do 1º tempo ou os lances, antes de ler a comissão. */}
        <div className="mt-3">
          <LiveTabs value={breakTab} onChange={setBreakTab} />
          <div className="mt-2">
            {breakTab === "stats" ? (
              <div role="tabpanel" id="live-panel-stats" aria-labelledby="live-tab-stats">
                {/* ITEM #6: leitura do 1º tempo com as 6 métricas completas. */}
                {halftimeStats ? (
                  <MatchStatsPanel
                    stats={halftimeStats}
                    myName={campaign.myTeam.n}
                    oppName={opp.n}
                    title="1º tempo"
                  />
                ) : (
                  <div className="rounded-[14px] border border-border bg-surface px-3 py-4 text-center text-[13px] text-ink-600">
                    Sem lances no 1º tempo.
                  </div>
                )}
                <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px]">
                  <span className="rounded-md bg-surface-2 px-2 py-1 font-semibold text-ink-700">
                    Jogo {view.gameVol > 1.05 ? "aberto" : view.gameVol < 0.92 ? "truncado" : "equilibrado"}
                  </span>
                </div>
              </div>
            ) : (
              <div role="tabpanel" id="live-panel-feed" aria-labelledby="live-tab-feed">
                <Ticker lines={lines} />
              </div>
            )}
          </div>
        </div>

        {/* ITEM 3: a análise da comissão segue ABAIXO da área com abas. */}
        <div className="mt-3 rounded-[14px] border border-border bg-surface p-3.5">
          {/* ITEM #8: título sem citar o nome do rival; o conteúdo abaixo mostra a tática
              dele + a leitura da comissão. */}
          <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            🔍 Análise da Comissão técnica
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[aiFormLabel, ATK_NM[aiTacShown.atk], DEF_NM[aiTacShown.def]].map((chip) => (
              <span
                key={chip}
                className="rounded-md bg-surface-2 px-2 py-1 text-[12px] font-bold text-ink-800"
              >
                {chip}
              </span>
            ))}
          </div>
          <div className="mt-2 text-sm text-ink-600">{aiReadHint(aiTacShown)}</div>
          {/* ITEM 8: vantagens CONCRETAS do meu plano agora que a tática deles apareceu */}
          <MatchupBadges my={myTac} opp={aiTacShown} />
          {/* §14: a LEITURA DO QUE FAZER no 2º tempo — lê a matriz §4 (meu ataque × a
              defesa deles E o ataque deles × a minha) + a força §10. Recados práticos,
              sem número cru, que ensinam o contra-plano sem entregar a regra oculta. */}
          <CommissionAdvice my={myTac} opp={aiTacShown} myTeam={campaign.myTeam} oppTeam={opp} />
        </div>

        <div className="mb-1.5 mt-4 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
          Ajuste sua tática (2º tempo)
        </div>
        <FormGrid value={myTac.form} onPick={(v) => onMyTacChange({ ...myTac, form: v })} />
        <SegBlock
          label="Ataque"
          opts={ATK_OPTS}
          value={myTac.atk}
          onPick={(v) => onMyTacChange({ ...myTac, atk: v })}
        />
        <SegBlock
          label="Defesa"
          opts={DEF_OPTS}
          value={myTac.def}
          onPick={(v) => onMyTacChange({ ...myTac, def: v })}
        />
        <TacticSliders tac={myTac} onPatch={(k, v) => onMyTacChange({ ...myTac, [k]: v })} />
        <PlanSummary tac={myTac} className="mt-2.5" />
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
      justApplied={liveTacJustApplied}
      relaying={relaying}
      hints={lastHints}
      disabled={finished || minute >= 90}
      onChange={stageLiveTac}
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
// ITEM 3: abas Transmissão | Estatísticas — reusadas no ao vivo (mobile), no intervalo e
// no fim de jogo. Acessível (role=tab/tablist), ≥44px de alvo.
export function LiveTabs({
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
// ITEM 3: exportado pra a aba Transmissão do fim de jogo (revisar os lances).
export function Ticker({ lines }: { lines: TickerLine[] }) {
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

// ITEM 7 (rev 4) / ITEM 4: painel de ajuste ao vivo. Drawer recolhível pra não poluir o
// mobile. SÓ OS 4 SLIDERS (formação e estilos travados ao vivo — só mudam no intervalo).
// O usuário mexe à vontade; quando PARA por 2s a orientação é passada (debounce real,
// ITEM 4). Enquanto está pendente, mostra "Passando orientações para os jogadores".
function LiveTacPanel({
  tac,
  open,
  onToggle,
  justApplied,
  relaying,
  hints,
  disabled,
  onChange,
}: {
  tac: Tactic;
  open: boolean;
  onToggle: () => void;
  justApplied: boolean;
  // ITEM 4: orientação pendente (debounce de 2s reais correndo). Acende o aviso.
  relaying: boolean;
  // §14: as DICAS DE IMPACTO do último ajuste (sintonia/matriz/pressão), no painel.
  hints: LiveHint[];
  disabled: boolean;
  onChange: (patch: Partial<Pick<Tactic, "postura" | "pressao" | "amplitude" | "agressividade">>) => void;
}) {
  // ITEM 4: cooldown-em-minutos REMOVIDO. Os sliders só ficam inertes se a partida acabou
  // (disabled); fora isso, dá pra mexer livremente — o commit é debounced no container.
  const reduced = REDUCED;
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
          {/* ITEM 4: "Passando orientações…" tem prioridade (a mudança está sendo levada ao
              time). Depois vem a confirmação "✓ aplicada". reduced-motion: sem animação. */}
          {relaying ? (
            <span
              role="status"
              className={`flex items-center gap-1 rounded-md bg-gold-500/15 px-2 py-0.5 text-[11px] font-extrabold text-gold-700 ${reduced ? "" : "animate-pulse"}`}
            >
              <span aria-hidden>📣</span> Passando orientações para os jogadores
            </span>
          ) : justApplied ? (
            <span
              role="status"
              className="flex items-center gap-1 rounded-md bg-grass-500/15 px-2 py-0.5 text-[11px] font-extrabold text-grass-700"
            >
              <span aria-hidden>✓</span> aplicada
            </span>
          ) : null}
          <span aria-hidden className={`text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
        </span>
      </button>
      {open && (
        <div className="animate-rise border-t border-border px-3.5 pb-3.5 pt-1">
          <div className={`mt-1.5 text-[11px] text-ink-500 ${disabled ? "opacity-55" : ""}`}>
            Formação e estilos só mudam no intervalo. Ao vivo, mexa nos sliders à vontade:
            quando você parar, a orientação é passada (vale do minuto seguinte).
          </div>
          {/* §14: a DICA DE IMPACTO fica FORA do bloco esmaecido — é leitura, não controle.
              Mostra o que o último ajuste mudou (matriz/pressão + sintonia). */}
          {hints.length > 0 && <LiveHintList hints={hints} />}
          <div className={disabled ? "opacity-55" : ""}>
            <TacticSliders tac={tac} onPatch={(k, v) => !disabled && onChange({ [k]: v })} disabled={disabled} />
          </div>
        </div>
      )}
    </div>
  );
}

// §14: lista das DICAS DE IMPACTO de um ajuste ao vivo. Cada dica é uma leitura boleira do
// efeito (sintonia/matriz/pressão), com tom (▲ ajuda · ⚠ custa · 💡 neutro). Sem número
// cru do motor. reduced-motion respeitado (sem animação própria). aria-live pra o leitor
// de tela anunciar a leitura quando ela troca.
function LiveHintList({ hints }: { hints: LiveHint[] }) {
  const tone = (k: LiveHint["tone"]) =>
    k === "good"
      ? "border border-grass-600/30 bg-grass-500/10 text-grass-700"
      : k === "bad"
        ? "border border-flame-600/30 bg-flame-500/10 text-flame-700"
        : "border border-border bg-surface-2 text-ink-700";
  const mark = (k: LiveHint["tone"]) => (k === "good" ? "▲" : k === "bad" ? "⚠️" : "💡");
  return (
    <div aria-live="polite" className="mt-2.5 flex flex-col gap-1.5">
      {hints.map((h, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold leading-snug ${tone(h.tone)}`}
        >
          <span aria-hidden className="mt-px shrink-0 text-[11px] font-black">
            {mark(h.tone)}
          </span>
          <span className="min-w-0">{h.text}</span>
        </div>
      ))}
    </div>
  );
}

// §14: LEITURA DO QUE FAZER no 2º tempo (Vestiário). Deriva de commissionRead (matriz §4
// + pressão §5 + força §10) — recados práticos do que ajustar, sem número cru. Tom por
// dica (▲ a favor · ⚠ atenção · 💡 leitura). Separado dos MatchupBadges: aqueles dizem
// "como está o confronto"; este diz "o que fazer". Legível em claro e escuro.
function CommissionAdvice({
  my,
  opp,
  myTeam,
  oppTeam,
}: {
  my: Tactic;
  opp: Tactic;
  myTeam: import("./types").Team;
  oppTeam: import("./types").Team;
}) {
  const reads: CommissionRead[] = commissionRead(my, opp, myTeam, oppTeam);
  if (reads.length === 0) return null;
  const tone = (k: CommissionRead["tone"]) =>
    k === "good"
      ? "text-grass-700"
      : k === "bad"
        ? "text-flame-700"
        : "text-ink-700";
  const mark = (k: CommissionRead["tone"]) => (k === "good" ? "▲" : k === "bad" ? "⚠️" : "💡");
  return (
    <div className="mt-3 border-t border-border pt-2.5">
      <div className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">
        O que fazer no 2º tempo
      </div>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {reads.map((r, i) => (
          <li key={i} className={`flex items-start gap-2 text-[12.5px] font-semibold leading-snug ${tone(r.tone)}`}>
            <span aria-hidden className="mt-px shrink-0 text-[11px] font-black">
              {mark(r.tone)}
            </span>
            <span className="min-w-0">{r.text}</span>
          </li>
        ))}
      </ul>
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
  // CLAREZA/ROBUSTEZ (v10): nome longo (ex.: "União Soviética", "Coreia do Sul",
  // "Estados Unidos", "Costa do Marfim") ESTOURAVA a pílula e quebrava NO MEIO da palavra
  // ("SOVIÉTIC|A"). Em vez de partir palavra, ENCOLHE a fonte + aperta o tracking conforme
  // o nome (e a maior palavra) cresce — aí cabe em 2 linhas limpas, quebrando só entre
  // palavras (break-words só parte palavra única gigante, em último caso). Nunca trunca: o
  // nome é a identidade do placar.
  const longestWord = name.split(/\s+/).reduce((m, w) => Math.max(m, w.length), 0);
  // palavra única de 10+ letras (Inglaterra, Eslováquia) não cabe em 1 linha a 10.5px na
  // pílula estreita do placar — desce pra 9.5px com folga (margem anti-quebra).
  const veryLong = longestWord >= 10 || name.length >= 18;
  const longName = longestWord >= 8 || name.length >= 13;
  const sizeCls = veryLong ? "text-[9.5px]" : longName ? "text-[10.5px]" : "text-[12.5px]";
  const trackCls = longName ? "tracking-normal" : "tracking-wide";
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
      <ManagerCrest slug={slug} name={name} size={40} className="shrink-0" />
      <span
        className={`w-full break-words rounded-md px-2 py-1 text-center font-black uppercase leading-[1.08] transition-shadow duration-150 ease-out ${sizeCls} ${trackCls} ${
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

// resumo do plano: apenas ECOA as escolhas do jogador, neutro, sem ⚠/✓ nem "ideal".
// Mostra formação + estilos (atk/def) + o resumo dos 4 sliders (zona de cada um).
export function PlanSummary({ tac, className = "" }: { tac: Tactic; className?: string }) {
  return (
    <div className={`rounded-[10px] bg-surface-2 px-3 py-2 text-[12px] font-semibold text-ink-600 ${className}`}>
      Seu plano: <b className="text-ink-900">{FORM_NM[tac.form]}</b> · {ATK_NM[tac.atk]} ·{" "}
      {DEF_NM[tac.def]} · postura {sliderZone("postura", tac.postura).toLowerCase()} ·{" "}
      {sliderZone("pressao", tac.pressao).toLowerCase()}
    </div>
  );
}
