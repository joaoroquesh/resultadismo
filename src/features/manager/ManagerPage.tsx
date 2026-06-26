import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFirstSeen } from "@/lib/useFirstSeen";
import { Button } from "@/components/ui/Button";
import type { Campaign, Edition, MatchKind, MatchStats, Tactic, Team, WorldMode } from "./types";
import type { MatchPhase } from "./engine";
import {
  FORMATS,
  advanceCampaign,
  aiTacticForPhase,
  matchPhaseForCampaign,
  faseForCampaignMatch,
  applyPreset,
  nearestPreset,
  buildCampaign,
  campaignProgress,
  campaignScore,
  finishFinalGroup,
  finishGroupsStage,
  finishKnockoutStage,
  finalGroupRoundResults,
  fraseFor,
  groupRoundResults,
  knockoutResult,
  koRoundView,
  lastGroupRoundPlayed,
  lastKoRoundId,
  myNextMatch,
  poolForYear,
  postMatchCoachRead,
  previewGroupRoundResults,
  projectBracket,
  recordFinalRound,
  recordThirdRound,
  resolveFinalGroupMatch,
  resolveGroupMatch,
  resolveKnockoutMatch,
  rngFrom,
  shuffle,
  stageLong,
  stageShort,
  wcGroupName,
} from "./engine";
import type {
  FinalGroupStageState,
  GroupsStageState,
  KnockoutStageState,
} from "./types";
import {
  type SliderKey,
  TACTICAL_HINTS_SUBTLE,
  TIER_LABEL,
  barPct,
  flagEmoji,
  postMatchBank,
  POSTMATCH,
  mulberryUi,
} from "./ui";
import { AttackDefenseColumns, ConfirmInline, ManagerCrest, FormGrid, GroupRoundResultsPanel, HistoryRow, MatchPreview, MatchStatsPanel, PresetPicker, ScreenTransition, StandingsTable, Stars, StrengthVS, StyleRing, TacticSliders } from "./components";
import { BracketBody, BracketModal, KoRoundBody, NextMatchPair } from "./Bracket";
import { LiveMatch, LiveTabs, PlanSummary, Ticker } from "./LiveMatch";
import type { TickerLine } from "./LiveMatch";
import { PenaltyShootout } from "./PenaltyShootout";
import { teamColors } from "./teamColors";
import {
  clearCampaign,
  defaultTactic,
  grantTrophy,
  loadCampaign,
  loadTactic,
  saveCampaign,
  saveTactic,
} from "./managerLocal";

// telas da máquina de estados
type Screen =
  | "intro"
  | "editions"
  | "draft"
  | "hub"
  | "groupClassif"
  | "koResults"
  | "tactics"
  | "live"
  | "penalties"
  | "result"
  | "end";

// =====================================================================
// ORQUESTRADOR — máquina de estados do Manager (porte do protótipo v4)
// Mantém a campanha num ref (o motor MUTA o objeto em lugar) e força re-render
// via bump. Persiste a campanha/tática no localStorage a cada commit.
// =====================================================================
export function ManagerPage() {
  const [introPending, markIntroSeen] = useFirstSeen("manager-intro-v1");
  const [screen, setScreen] = useState<Screen>("intro");

  // estado "global" do jogo (espelha o G do protótipo). O motor MUTA o objeto da
  // campanha em lugar (campRef); `camp` é a cópia render-safe em state — re-render
  // = nova referência via commit(). Render lê SEMPRE de `camp` (nunca do ref).
  const campRef = useRef<Campaign | null>(null);
  const [camp, setCamp] = useState<Campaign | null>(null);
  const [edition, setEdition] = useState<Edition | null>(null);
  const [draft, setDraft] = useState<Team[]>([]);
  const [worldMode, setWorldMode] = useState<WorldMode>("real");
  const [campaignSeed, setCampaignSeed] = useState(0);
  const [rerollsUsed, setRerollsUsed] = useState(0);
  const [myTac, setMyTac] = useState<Tactic>(() => loadTactic());

  // ITEM D: rodada de mata-mata recém-fechada a exibir na tela de resultados da fase
  // (id da rodada em camp.koRounds: "R16"/"QF"/"SF"/"FINAL"/"THIRD"). Setado antes do
  // advance, lido pela tela koResults.
  const [koRoundView, setKoRoundView] = useState<string | null>(null);

  // contexto da partida corrente
  const [matchOpp, setMatchOpp] = useState<Team | null>(null);
  const [matchKind, setMatchKind] = useState<MatchKind>("groups");
  const [aiTac, setAiTac] = useState<Tactic | null>(null);
  // ITEM 14 (IA por fase, §14): regime da IA NESTE jogo — "grupos" (preset puro),
  // "ajusta" (oitavas/quartas: adapta no pré-jogo) ou "ao_vivo" (semi/final: adapta +
  // reage ao vivo). Setado no startMatch a partir da rodada da campanha; passado ao
  // LiveMatch pra ele liberar (ou não) a reação tática completa da IA.
  const [aiPhase, setAiPhase] = useState<MatchPhase>("grupos");
  const [matchSeed, setMatchSeed] = useState(0);
  const [matchResult, setMatchResult] = useState<{
    gf: number;
    ga: number;
    opp: Team;
    goals?: { side: "A" | "B"; m: number }[];
    stats?: MatchStats;
    // ITEM 3: a transmissão completa pra a aba Transmissão no fim de jogo.
    lines?: TickerLine[];
  } | null>(null);

  // commit: persiste e publica a campanha mutada como NOVA referência em state
  // (dispara o re-render sem ler o ref durante o render).
  const commit = useCallback(() => {
    saveCampaign(campRef.current);
    setCamp(campRef.current ? { ...campRef.current } : null);
  }, []);

  // -------- retomar campanha em andamento (1x na intro) --------
  const resumable = useMemo(() => loadCampaign(), []);

  const go = useCallback((s: Screen) => {
    setScreen(s);
    window.scrollTo(0, 0);
  }, []);

  // -------- seleção de edição + draft 3+1 --------
  const buildDraftFor = useCallback((ed: Edition, seed: number, rerolls: number): Team[] => {
    const pool = poolForYear(ed.year);
    const s = (seed + rerolls * 1013904223) >>> 0;
    const rnd = rngFrom(s);
    const n = pool.length;
    const third = Math.max(1, Math.floor(n / 3));
    const bandStrong = pool.slice(0, third);
    let bandMid = pool.slice(third, n - third);
    const bandWeak = pool.slice(n - third);
    if (!bandMid.length) bandMid = pool.slice(Math.floor(n / 3), Math.ceil((n * 2) / 3));
    const used: string[] = [];
    const pick = (p: Team[]) => shuffle(p.filter((t) => used.indexOf(t.s) < 0), rnd)[0];
    const cards: Team[] = [];
    [pick(bandStrong), pick(bandMid), pick(bandWeak)].forEach((c) => {
      if (c) {
        used.push(c.s);
        cards.push(c);
      }
    });
    while (cards.length < 3) {
      const extra = pick(pool);
      if (!extra) break;
      used.push(extra.s);
      cards.push(extra);
    }
    cards.sort((a, b) => b.o - a.o);
    return cards;
  }, []);

  const selectEdition = useCallback(
    (ed: Edition) => {
      const seed = (Date.now() ^ (ed.year * 2654435761)) >>> 0;
      setEdition(ed);
      setCampaignSeed(seed);
      setRerollsUsed(0);
      setDraft(buildDraftFor(ed, seed, 0));
      go("draft");
    },
    [buildDraftFor, go],
  );

  const reroll = useCallback(() => {
    if (rerollsUsed > 0 || !edition) return;
    const next = rerollsUsed + 1;
    setRerollsUsed(next);
    setDraft(buildDraftFor(edition, campaignSeed, next));
  }, [buildDraftFor, campaignSeed, edition, rerollsUsed]);

  const chooseTeam = useCallback(
    (t: Team) => {
      if (!edition) return;
      const built = buildCampaign(edition, t, campaignSeed, worldMode);
      campRef.current = built;
      // nova campanha começa do default; depois a tática PERSISTE entre partidas
      const startTac = defaultTactic();
      setMyTac(startTac);
      saveTactic(startTac);
      commit();
      go("hub");
    },
    [campaignSeed, commit, edition, go, worldMode],
  );

  // -------- iniciar partida (tática às cegas) --------
  // O regime da IA (§14) é definido AQUI pela rodada da campanha; a tática DA IA, porém,
  // só é decidida no apito (kickoff) — assim, nas fases que adaptam (oitavas+), a IA lê o
  // plano que você REALMENTE leva pro jogo (escolhido na tela de tática), não um plano
  // velho. Nos grupos isso não muda nada (preset puro, não lê o jogador).
  const startMatch = useCallback(
    (opp: Team, kind: MatchKind) => {
      const camp = campRef.current;
      if (!camp) return;
      const seed =
        (camp.seed ^ (opp.o * 40503 + camp.stageIdx * 7349 + camp.history.length * 131)) >>> 0;
      setMatchOpp(opp);
      setMatchKind(kind);
      setAiPhase(matchPhaseForCampaign(camp));
      setAiTac(null); // decidida no kickoff (lê o seu plano final nas fases que adaptam)
      setMatchSeed(seed);
      go("tactics");
    },
    [go],
  );

  const onMyTacChange = useCallback((tac: Tactic) => {
    setMyTac(tac);
    saveTactic(tac); // persiste pro próximo jogo
  }, []);

  // -------- apito inicial: decide a tática da IA por fase e entra ao vivo --------
  // grupos → preset puro (não lê o jogador). oitavas/quartas → a IA adapta lendo o SEU
  // plano final (myTac). semi/final → adapta no pré-jogo e ainda reage ao vivo (a reação
  // ao vivo é entregue dentro do LiveMatch, via aiPhase). Determinístico (seed do jogo).
  const kickoff = useCallback(() => {
    const camp = campRef.current;
    if (!camp || !matchOpp) return;
    const round =
      camp.state?.kind === "knockout" ? camp.state.stage.round : undefined;
    const r = rngFrom(matchSeed);
    setAiTac(
      aiTacticForPhase(r, matchOpp, camp.myTeam, myTac, aiPhase, round),
    );
    go("live");
  }, [aiPhase, go, matchOpp, matchSeed, myTac]);

  // -------- fim da partida ao vivo --------
  const onLiveFinish = useCallback(
    (
      gA: number,
      gB: number,
      goals: { side: "A" | "B"; m: number }[],
      stats: MatchStats,
      lines: TickerLine[],
    ) => {
      if (!matchOpp) return;
      setMatchResult({ gf: gA, ga: gB, opp: matchOpp, goals, stats, lines });
      // ITEM 10: mata-mata empatado entra na disputa de pênaltis cobrança a cobrança
      // (só no MEU jogo); senão segue direto pro resultado.
      const isKO = matchKind === "knockout" || matchKind === "third_place" || matchKind === "final";
      if (isKO && gA === gB) go("penalties");
      else go("result");
    },
    [go, matchKind, matchOpp],
  );

  // -------- sair da partida em andamento (controle/liberdade, Nielsen #3) --------
  // Descarta a partida sem registrar resultado: a campanha NÃO é mutada (nada de
  // resolve/advance), volta pro hub. Ao reabrir o mesmo jogo, a seed é a mesma —
  // determinismo preservado.
  const exitMatch = useCallback(() => {
    setMatchResult(null);
    setMatchOpp(null);
    setAiTac(null);
    go("hub");
  }, [go]);

  // -------- fechar estágio sem meu jogo (simular IA) --------
  const closeStageAndAdvance = useCallback(() => {
    const c = campRef.current;
    if (!c || !c.state) return;
    const st = c.state;
    if (st.kind === "groups") {
      c.pendingAdvance = finishGroupsStage(c);
      commit();
      go("groupClassif");
      return;
    }
    if (st.kind === "final_group") {
      advanceCampaign(c, finishFinalGroup(c));
    } else if (st.kind === "knockout") {
      finishKnockoutStage(c, st.bye ? true : false);
      // ITEM D: apurei a fase sem jogo meu (ou passei direto). Mostra os resultados
      // paralelos desta rodada antes do hub.
      const closedRound = lastKoRoundId(c);
      advanceCampaign(c, true);
      commit();
      if (closedRound) {
        setKoRoundView(closedRound);
        go("koResults");
        return;
      }
      go("hub");
      return;
    } else if (st.kind === "third_place") {
      advanceCampaign(c, false);
    } else if (st.kind === "final") {
      c.alive = false;
      c.placement = "Eliminado";
    }
    commit();
    go("hub");
  }, [commit, go]);

  // -------- commit do resultado na campanha --------
  const commitMatchResult = useCallback(() => {
    const c = campRef.current;
    if (!c || !matchResult || !c.state) return;
    const { gf, ga, opp } = matchResult;
    const kind = matchKind;
    if (kind === "groups") {
      resolveGroupMatch(c, gf, ga);
      const gs = c.state as GroupsStageState;
      if (gs.myMatchIdx >= gs.myOpps.length) {
        c.pendingAdvance = finishGroupsStage(c);
        commit();
        go("groupClassif");
        return;
      }
    } else if (kind === "final_group") {
      resolveFinalGroupMatch(c, gf, ga);
      const fg = c.state as FinalGroupStageState;
      if (fg.myMatchIdx >= fg.myOpps.length) {
        advanceCampaign(c, finishFinalGroup(c));
      }
    } else if (kind === "knockout") {
      const iWin = resolveKnockoutMatch(c, gf, ga, matchSeed);
      finishKnockoutStage(c, iWin);
      // ITEM D: guarda a rodada recém-fechada e advança a campanha; a tela koResults
      // mostra TODOS os confrontos paralelos desta fase (de camp.koRounds) antes do hub.
      const closedRound = lastKoRoundId(c);
      advanceCampaign(c, iWin);
      maybeAwardTrophies(c);
      commit();
      if (closedRound) {
        setKoRoundView(closedRound);
        go("koResults");
        return;
      }
      go("hub");
      return;
    } else if (kind === "third_place") {
      const kr = knockoutResult(c.myTeam, opp, gf, ga, matchSeed);
      const iWin = kr.winner === "A";
      c.history.push({
        stage: "3º lugar",
        opp,
        gf,
        ga,
        pens: kr.pens,
        win: iWin,
        draw: false,
        ptsLabel: iWin ? "3º lugar" : "4º lugar",
        ko: true,
      });
      // BUG 1.2: grava o 3º lugar no chaveamento da campanha.
      recordThirdRound(c, opp, gf, ga, iWin, kr.pens);
      advanceCampaign(c, iWin);
    } else if (kind === "final") {
      const kr = knockoutResult(c.myTeam, opp, gf, ga, matchSeed);
      const iWin = kr.winner === "A";
      c.history.push({
        stage: "Final",
        opp,
        gf,
        ga,
        pens: kr.pens,
        win: iWin,
        draw: false,
        ptsLabel: iWin ? "CAMPEÃO" : "Vice",
        ko: true,
      });
      // BUG 1.2: grava a final no chaveamento da campanha (revela o campeão).
      recordFinalRound(c, opp, gf, ga, iWin, kr.pens);
      advanceCampaign(c, iWin);
    }
    maybeAwardTrophies(c);
    commit();
    go("hub");
  }, [commit, go, matchKind, matchResult, matchSeed]);

  const continueFromGroupClassif = useCallback(() => {
    const c = campRef.current;
    if (!c) return;
    const flag = c.pendingAdvance ?? false;
    c.pendingAdvance = undefined;
    advanceCampaign(c, flag);
    maybeAwardTrophies(c);
    commit();
    go("hub");
  }, [commit, go]);

  const resetToEditions = useCallback(() => {
    campRef.current = null;
    setCamp(null);
    clearCampaign();
    setEdition(null);
    setDraft([]);
    setMatchResult(null);
    go("editions");
  }, [go]);

  const replaySameEdition = useCallback(() => {
    if (edition) selectEdition(edition);
  }, [edition, selectEdition]);

  const resumeCampaign = useCallback(() => {
    if (!resumable) return;
    campRef.current = resumable;
    setCamp({ ...resumable });
    setEdition(resumable.edition);
    setCampaignSeed(resumable.seed);
    setMyTac(loadTactic());
    markIntroSeen();
    go("hub");
  }, [go, markIntroSeen, resumable]);

  // ===================================================================
  // RENDER por tela
  // ===================================================================
  // As telas com PLACAR sticky (live/penalties) ficam FORA do ScreenTransition: o
  // translateY da entrada criaria um ancestral transformado e quebraria o position:
  // sticky do placar durante a animação. Elas têm motion próprio (placar/posse/
  // ticker). As demais ganham a entrada suave (fade + slide-up) keyed por screen.
  if (screen === "live" && camp && matchOpp && aiTac)
    return (
      <LiveMatch
        campaign={camp}
        opp={matchOpp}
        myTac={myTac}
        aiTac={aiTac}
        aiPhase={aiPhase}
        fase={faseForCampaignMatch(camp)}
        matchSeed={matchSeed}
        onMyTacChange={onMyTacChange}
        onFinish={onLiveFinish}
        onExit={exitMatch}
      />
    );

  if (screen === "penalties" && camp && matchOpp)
    return (
      <PenaltyShootout
        myTeam={camp.myTeam}
        opp={matchOpp}
        seed={matchSeed}
        onDone={() => go("result")}
      />
    );

  let content: ReactNode;
  if (screen === "intro")
    content = (
      <IntroScreen
        firstTime={introPending}
        resumable={resumable}
        onResume={resumeCampaign}
        onPlay={() => {
          markIntroSeen();
          resetToEditions();
        }}
      />
    );
  else if (screen === "editions")
    content = <EditionSelect onPick={selectEdition} onBack={() => go("intro")} />;
  else if (screen === "draft" && edition)
    content = (
      <DraftView
        edition={edition}
        cards={draft}
        worldMode={worldMode}
        rerollsUsed={rerollsUsed}
        onWorldMode={setWorldMode}
        onChoose={chooseTeam}
        onReroll={reroll}
        onBack={() => go("editions")}
      />
    );
  else if (screen === "tactics" && camp && matchOpp)
    content = (
      <TacticPicker
        campaign={camp}
        opp={matchOpp}
        myTac={myTac}
        onMyTac={onMyTacChange}
        onWhistle={kickoff}
      />
    );
  else if (screen === "result" && camp && matchResult)
    content = (
      <MatchResult
        campaign={camp}
        result={matchResult}
        kind={matchKind}
        matchSeed={matchSeed}
        myTac={myTac}
        aiTac={aiTac}
        onContinue={commitMatchResult}
      />
    );
  else if (screen === "groupClassif" && camp && edition)
    content = <GroupClassif campaign={camp} edition={edition} onContinue={continueFromGroupClassif} />;
  else if (screen === "koResults" && camp && edition && koRoundView)
    content = (
      <KnockoutResults
        campaign={camp}
        edition={edition}
        roundId={koRoundView}
        onContinue={() => {
          setKoRoundView(null);
          go("hub");
        }}
      />
    );
  else if (screen === "hub" && camp && edition)
    content = (
      <TournamentHub
        campaign={camp}
        edition={edition}
        myTac={myTac}
        onStartMatch={startMatch}
        onCloseStage={closeStageAndAdvance}
        onNewCampaign={resetToEditions}
        onReplay={replaySameEdition}
      />
    );
  // fallback defensivo
  else
    content = (
      <IntroScreen firstTime={false} resumable={null} onResume={() => {}} onPlay={resetToEditions} />
    );

  // ITEM C: o canvas do shell é largo no desktop (lg+). As telas que se beneficiam da
  // largura (hub e resultado têm grade 2-col interna no lg) ocupam o canvas inteiro; as
  // naturalmente estreitas (intro, editions, draft, tática, classificação) se centralizam
  // num bloco confortável (~560px) pra não esticar feio. No mobile todas são full-width.
  const wideScreen = screen === "hub" || screen === "result";
  return (
    <ScreenTransition screenKey={screen}>
      {wideScreen ? (
        content
      ) : (
        <div className="lg:mx-auto lg:max-w-[560px]">{content}</div>
      )}
    </ScreenTransition>
  );
}

// concede troféus locais conforme o desfecho (gamificação client-side)
function maybeAwardTrophies(camp: Campaign) {
  if (!camp.alive) {
    if (camp.champion) {
      grantTrophy({
        id: `champion-${camp.edition.year}`,
        label: `Campeão da Copa ${camp.edition.year} com ${camp.myTeam.n}`,
        emoji: "🏆",
      });
      if (camp.myTeam.o <= 70)
        grantTrophy({ id: "champion-underdog", label: "Campeão com uma zebra", emoji: "🐴" });
    }
  }
}

// ---------------- 1. INTRO ----------------
function IntroScreen({
  firstTime,
  resumable,
  onResume,
  onPlay,
}: {
  firstTime: boolean;
  resumable: Campaign | null;
  onResume: () => void;
  onPlay: () => void;
}) {
  // Prevenção de erro (Nielsen #5): se há campanha salva, "Nova campanha" pede
  // confirmação antes de descartá-la (clearCampaign é irreversível).
  const [confirmNew, setConfirmNew] = useState(false);
  const hasSaved = !!resumable && !firstTime;
  return (
    <div className="flex flex-col">
      <div className="h-[4vh]" />
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        Mini-jogo · você no comando
      </div>
      <h1 className="mt-2.5 text-[clamp(30px,9vw,40px)] font-black leading-[1.02] text-ink-950">
        Você não palpita.
        <br />
        <span className="text-brand-600">Você comanda.</span>
      </h1>
      <p className="mt-3.5 text-[15px] text-ink-600">
        Pegue uma seleção de qualquer Copa (1930–2026), leia o adversário no intervalo e leve seu
        time ao título em partidas curtas de tirar o fôlego.
      </p>
      <div className="mt-5 rounded-[18px] border border-border bg-surface p-4.5 p-[18px]">
        <div className="mb-2 text-sm font-extrabold text-ink-950">Como funciona</div>
        <ul className="space-y-1.5 text-sm text-ink-700">
          <li>
            <b>Sorteie</b> uma seleção (favorita, média ou zebra).
          </li>
          <li>
            <b>Monte a tática</b> às cegas: formação, ataque, defesa e 4 sliders, tudo na sua mão.
          </li>
          <li>
            <b>No jogo</b>, leia posse e placar e ajuste os sliders ao vivo (cada mexida dá uma
            dica de impacto).
          </li>
          <li>
            <b>No intervalo</b>, a tática do rival é revelada. Vire a chave.
          </li>
          <li>
            Avance pela <b>estrutura e os grupos reais</b> da Copa até o título.
          </li>
        </ul>
      </div>
      <div className="mt-5 space-y-2">
        {hasSaved && (
          <Button size="lg" fullWidth className="font-bold" onClick={onResume}>
            ▶︎ Retomar a campanha ({resumable!.edition.year} · {resumable!.myTeam.n})
          </Button>
        )}
        <Button
          size="lg"
          fullWidth
          className="bg-gold-600 font-bold text-ink-950 hover:bg-gold-700"
          onClick={() => (hasSaved ? setConfirmNew(true) : onPlay())}
        >
          ⚽ {hasSaved ? "Nova campanha" : "Jogar"}
        </Button>
        {confirmNew && (
          <ConfirmInline
            message={`Começar uma nova campanha vai descartar a atual (${resumable!.edition.year} · ${resumable!.myTeam.n}). Tem certeza?`}
            confirmLabel="Descartar e começar"
            onConfirm={onPlay}
            onCancel={() => setConfirmNew(false)}
          />
        )}
      </div>
      <p className="mt-5 text-center text-[11px] text-ink-500">
        Mini-jogo do Resultadismo · motor no cliente, sem backend.
        <br />9 formações · 5 ataques · 5 defesas · 4 sliders · grupos reais · 23 edições.
      </p>
    </div>
  );
}

// ---------------- 2. SELEÇÃO DE EDIÇÃO ----------------
function structSummary(ed: Edition): string {
  const hasGroups = ed.stages.some((x) => x.type === "groups");
  const hasSecond = ed.stages.some((x) => x.type === "second_groups");
  const hasFinalG = ed.stages.some((x) => x.type === "final_group");
  if (hasFinalG) return "grupos + quadrangular final";
  if (hasSecond) {
    const hasKO = ed.stages.some((x) => x.type === "knockout");
    return hasKO ? "grupos + 2ª fase + mata-mata" : "grupos + 2ª fase de grupos";
  }
  if (!hasGroups) return "mata-mata direto";
  const ko = ed.stages.filter((x) => x.type === "knockout").map((x) => stageShort(x));
  return "grupos + " + (ko.length ? ko.join(" › ") : "mata-mata");
}

function EditionSelect({ onPick, onBack }: { onPick: (ed: Edition) => void; onBack: () => void }) {
  const editions = useMemo(() => FORMATS.slice().sort((a, b) => b.year - a.year), []);
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm font-semibold text-ink-500 hover:underline"
      >
        ‹ Início
      </button>
      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        Passo 1 de 3
      </div>
      <h2 className="mb-0.5 mt-1.5 text-2xl font-bold text-ink-950">Escolha a Copa</h2>
      <p className="mb-3 text-sm text-ink-600">Cada edição vale com a estrutura real daquele ano.</p>
      <div className="flex flex-col gap-2.5">
        {editions.map((ed) => {
          const pool = poolForYear(ed.year);
          const champ = ed.champion_real ? `🏆 ${ed.champion_real}` : "Copa ainda sem campeão";
          return (
            <button
              key={ed.year}
              type="button"
              onClick={() => onPick(ed)}
              className="group flex items-center gap-3 rounded-[15px] border border-border bg-surface px-3.5 py-3 text-left transition-[transform,border-color] duration-150 ease-out hover:border-brand-400 active:scale-[0.985]"
            >
              <div className="w-[54px] shrink-0 text-[21px] font-black tabular-nums text-brand-700">
                {ed.year}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-ink-950">{ed.host}</div>
                <div className="mt-px text-[11.5px] text-ink-600">
                  {pool.length} seleções · {structSummary(ed)}
                </div>
                <div className="text-[10.5px] font-extrabold text-gold-700">{champ}</div>
              </div>
              <div className="shrink-0 text-lg text-ink-400 transition-transform duration-150 ease-out group-hover:translate-x-0.5 group-hover:text-brand-500">
                ›
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------- 3. DRAFT 3+1 ----------------
function DraftView({
  edition,
  cards,
  worldMode,
  rerollsUsed,
  onWorldMode,
  onChoose,
  onReroll,
  onBack,
}: {
  edition: Edition;
  cards: Team[];
  worldMode: WorldMode;
  rerollsUsed: number;
  onWorldMode: (m: WorldMode) => void;
  onChoose: (t: Team) => void;
  onReroll: () => void;
  onBack: () => void;
}) {
  const BAND = ["Favorita", "Média", "Zebra"];
  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onBack}
        className="self-start text-sm font-semibold text-ink-500 hover:underline"
      >
        ‹ Trocar Copa
      </button>
      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        Passo 2 de 3 · {edition.year} · {edition.host}
      </div>
      <h2 className="mb-0.5 mt-1.5 text-2xl font-bold text-ink-950">Sua seleção</h2>
      <p className="mb-3 text-sm text-ink-600">
        Três cartas, três pesos. Quanto mais fraca, maior o bônus no fim.
      </p>

      {/* toggle de mundo (fixado no início da campanha) */}
      <div className="mb-3.5">
        <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
          Mundo da campanha
        </div>
        <div className="flex gap-1.5 rounded-[13px] border border-border bg-surface-2 p-1">
          {(
            [
              ["real", "📖 Seguir a História Real"],
              ["alt", "🎲 Criar Mundo Alternativo"],
            ] as [WorldMode, string][]
          ).map(([v, lbl]) => (
            <button
              key={v}
              type="button"
              aria-pressed={worldMode === v}
              onClick={() => onWorldMode(v)}
              className={`min-h-[42px] flex-1 rounded-[10px] px-2 text-[13px] font-bold transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
                worldMode === v ? "scale-[1.02] bg-brand-600 text-white shadow-sm" : "text-ink-600 hover:text-ink-800"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11.5px] text-ink-600">
          {worldMode === "real"
            ? "Os jogos paralelos tendem a repetir a hierarquia real: os favoritos avançam como avançaram."
            : "O motor simula tudo do zero: zebras e viradas podem reescrever a história."}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {cards.map((t, i) => (
          <button
            key={t.s}
            type="button"
            onClick={() => onChoose(t)}
            className="relative rounded-[18px] border-2 border-border bg-surface p-3.5 text-left transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-[var(--shadow-soft)] active:translate-y-0 active:scale-[0.99]"
          >
            <span className="absolute right-3 top-3">
              <TierBadge tier={t.t} label={BAND[i] ?? TIER_LABEL[t.t]} />
            </span>
            <div className="flex items-center gap-2 text-xl font-black text-ink-950">
              <ManagerCrest slug={t.s} name={t.n} size={22} />
              {t.n} <span className="text-[13px] font-bold text-ink-500">{t.y}</span>
            </div>
            <div className="my-1.5 text-[13px] italic text-ink-600">
              &ldquo;{fraseFor(t.t, i + rerollsUsed)}&rdquo;
            </div>
            <Rate lab="ATA" v={t.a} color="var(--color-brand-500)" />
            <Rate lab="MEI" v={t.m} color="var(--color-aqua-500)" />
            <Rate lab="DEF" v={t.d} color="var(--color-grass-500)" />
            <div className="mt-2 flex items-center gap-2 text-[12px] font-bold text-brand-700">
              <Stars o={t.o} /> {TIER_LABEL[t.t]} • Escolher ›
            </div>
          </button>
        ))}
      </div>

      <Button
        variant="outline"
        size="lg"
        fullWidth
        className="mt-3.5"
        disabled={rerollsUsed > 0}
        onClick={onReroll}
      >
        {rerollsUsed > 0 ? "🔄 Sorteio já usado" : "🔄 Sortear de novo (1×)"}
      </Button>
    </div>
  );
}

function TierBadge({ tier, label }: { tier: Team["t"]; label: string }) {
  const tone: Record<Team["t"], string> = {
    S: "bg-gold-500 text-ink-950",
    A: "bg-flame-600 text-white",
    B: "bg-brand-600 text-white",
    C: "bg-aqua-600 text-white",
    D: "bg-ink-300 text-ink-800",
  };
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-black ${tone[tier]}`}>
      {label}
    </span>
  );
}
// ITEM 13: no JOGO, ATK/MID/DEF viram só BARRA (sem número cru). A barra já
// codifica a força via barPct; o motor segue lendo o valor exato internamente.
function Rate({ lab, v, color }: { lab: string; v: number; color: string }) {
  return (
    <div className="my-1 grid grid-cols-[30px_1fr] items-center gap-2">
      <span className="text-[10.5px] font-extrabold tracking-wide text-ink-500">{lab}</span>
      <span className="h-2 overflow-hidden rounded-full bg-ink-200">
        <span className="block h-full rounded-full" style={{ width: `${barPct(v)}%`, background: color }} />
      </span>
    </div>
  );
}

// ---------------- 4. HUB DO TORNEIO ----------------
function TournamentHub({
  campaign,
  edition,
  myTac,
  onStartMatch,
  onCloseStage,
  onNewCampaign,
  onReplay,
}: {
  campaign: Campaign;
  edition: Edition;
  myTac: Tactic;
  onStartMatch: (opp: Team, kind: MatchKind) => void;
  onCloseStage: () => void;
  onNewCampaign: () => void;
  onReplay: () => void;
}) {
  const camp = campaign;
  const mt = camp.myTeam;
  const steps = campaignProgress(camp);
  const [bracketOpen, setBracketOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // o botão "Ver chaveamento" só aparece quando a edição tem mata-mata (projeção
  // não-nula). É puro e barato; memoiza por referência da campanha.
  const hasBracket = useMemo(() => projectBracket(camp) != null, [camp]);

  if (!camp.alive) {
    return <CampaignEnd campaign={camp} edition={edition} onNewCampaign={onNewCampaign} onReplay={onReplay} />;
  }

  const stage = camp.stages[camp.stageIdx];
  const st = camp.state;
  const nm = myNextMatch(camp);
  // ITEM C: os IA×IA do meu grupo apurados na ÚLTIMA rodada que joguei (log gravado
  // no commit). Some quando ainda não joguei nenhuma (lastRoundIdx < 0).
  const lastRoundIdx = lastGroupRoundPlayed(camp);
  const lastRoundResults = lastRoundIdx >= 0 ? groupRoundResults(camp, lastRoundIdx) : [];

  return (
    <div className="flex flex-col">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        {edition.year} · {edition.host}
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-[22px] font-black text-ink-950">
          <ManagerCrest slug={mt.s} name={mt.n} size={24} />
          {mt.n}
        </div>
        <span className="ml-auto">
          <TierBadge tier={mt.t} label={TIER_LABEL[mt.t]} />
        </span>
      </div>

      {/* progresso pela estrutura real */}
      <div className="mt-2.5 flex items-center gap-1 overflow-x-auto pb-0.5">
        {steps.map((p, i) => (
          <span key={`${p.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-ink-300">›</span>}
            <span className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[10.5px] font-extrabold transition-[background-color,color,box-shadow] duration-200 ease-out ${progressTone(p.status)}`}>
              {p.label}
            </span>
          </span>
        ))}
      </div>

      {/* visibilidade #1: saldo parcial da campanha (vitórias/empates/saldo de gols) +
          bônus de tier projetado, atualizado a cada jogo — feedback de progressão. */}
      {camp.history.length > 0 && <HubScoreStrip camp={camp} />}

      {/* ITEM C (desktop lg+): abaixo do cabeçalho de campanha, DUAS COLUNAS aproveitam a
          largura — à esquerda o que fazer agora (regras, chaveamento, próximo jogo + CTA);
          à direita o estado da campanha (resultados paralelos, tabela do grupo, histórico).
          No mobile tudo empilha numa coluna só (mobile-first intacto). */}
      <div className="mt-4 grid grid-cols-1 gap-x-6 lg:mt-5 lg:grid-cols-2 lg:items-start">
        {/* COLUNA 1 — ações */}
        <div className="flex flex-col">
      {/* ITEM #11: o "Como funciona / Regras" saiu daqui (topo) pro FIM da tela, pra não
          competir com a ação principal (o card do próximo jogo + CTA). "Ver chaveamento"
          fica, pois é uma ação ligada ao estado atual da campanha (não é ajuda). */}
      {hasBracket && (
        <button
          type="button"
          onClick={() => setBracketOpen(true)}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 text-[13px] font-bold text-ink-700 transition-[transform,background-color] duration-150 ease-out hover:bg-surface active:scale-[0.99]"
        >
          <span aria-hidden>🏆</span> Ver chaveamento
        </button>
      )}

      {nm ? (
        <>
          <div className="relative mt-3.5 overflow-hidden rounded-[18px] bg-gradient-to-br from-brand-700 to-brand-900 p-4 text-white">
            <div className="text-[10.5px] font-extrabold uppercase tracking-widest opacity-85">
              {stageLong(stage)}
              {(st?.kind === "groups" || st?.kind === "final_group") &&
                ` · seu jogo ${(st as GroupsStageState).myMatchIdx + 1}`}
            </div>
            <div className="my-2.5 flex items-center justify-center gap-3">
              {/* ROBUSTEZ (v9): min-w-0 + overflow-wrap garante que nome longo quebre entre
                  palavras e NUNCA empurre o "VS" do centro nem estoure o card. */}
              <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-[17px] font-black leading-tight [overflow-wrap:anywhere]">
                <ManagerCrest slug={mt.s} name={mt.n} size={34} />
                {mt.n}
              </span>
              <span className="shrink-0 text-[12px] font-extrabold opacity-70">VS</span>
              <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-[17px] font-black leading-tight [overflow-wrap:anywhere]">
                <ManagerCrest slug={nm.opp.s} name={nm.opp.n} size={34} />
                {nm.opp.n}
              </span>
            </div>
            {/* ITEM F: força das DUAS seleções, lado a lado e comparável (estrelas +
                tier de cada uma), em vez de só a do adversário com "Média" solto. */}
            <div className="mt-1 border-t border-white/10 pt-2.5">
              <StrengthVS mine={mt} opp={nm.opp} light />
            </div>
          </div>
          <Button
            size="lg"
            fullWidth
            className="mt-3 bg-gold-600 font-bold text-ink-950 hover:bg-gold-700"
            onClick={() => onStartMatch(nm.opp, nm.kind as MatchKind)}
          >
            Montar tática ›
          </Button>
        </>
      ) : (
        <CloseStageControl camp={camp} onCloseStage={onCloseStage} />
      )}
        </div>

        {/* COLUNA 2 — estado da campanha (tabela, paralelos, histórico). No lg+ o 1º bloco
            renderizado alinha ao topo da coluna (zera o mt herdado do fluxo mobile). */}
        <div className="mt-5 flex flex-col lg:mt-0 lg:[&>*:first-child]:mt-0">
      {/* ITEM C: no hub, "outros jogos da rodada N do seu grupo" — os IA×IA recém
          apurados (a tabela não muda mais em silêncio). lastGroupRoundPlayed é a
          rodada que acabei de jogar; groupRoundResults lê o log gravado no commit. */}
      {st?.kind === "groups" && lastRoundResults.length > 0 && (
        <GroupRoundResultsPanel
          results={lastRoundResults}
          title={`Outros jogos · rodada ${lastRoundIdx + 1} do seu grupo`}
          note="Esses resultados acabaram de entrar na tabela abaixo."
        />
      )}

      {/* tabela do meu grupo / quadrangular */}
      {(st?.kind === "groups" || st?.kind === "final_group") && (
        <>
          <div className="mt-5 flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
              {st.kind === "final_group"
                ? "Quadrangular final"
                : `Seu grupo${(st as GroupsStageState).isSecond ? " (2ª fase)" : ""}`}
            </span>
            {st.kind === "groups" && (st as GroupsStageState).myMatchIdx > 0 && (
              <span className="text-[10.5px] font-bold text-ink-500">
                após a rodada {(st as GroupsStageState).myMatchIdx}
              </span>
            )}
          </div>
          {st.kind === "groups" ? (
            <StandingsTable
              standings={(st as GroupsStageState).standings[(st as GroupsStageState).myG]}
              advance={(st as GroupsStageState).advance}
              myKey={camp.myKey}
              showLegend
            />
          ) : (
            <StandingsTable
              standings={(st as FinalGroupStageState).standings}
              advance={1}
              myKey={camp.myKey}
              showLegend
            />
          )}
          {/* ITEM C / off-by-one: a coluna J explicita que todos jogaram o mesmo nº de
              partidas — a tabela está balanceada, sem rival "na frente". */}
          {st.kind === "groups" && (st as GroupsStageState).myMatchIdx > 0 && (
            <p className="mt-1.5 text-[11px] leading-snug text-ink-500">
              Todos do grupo já jogaram {(st as GroupsStageState).myMatchIdx}{" "}
              {(st as GroupsStageState).myMatchIdx === 1 ? "partida" : "partidas"} (coluna J), a
              tabela está balanceada.
            </p>
          )}
        </>
      )}
      {st?.kind === "knockout" && (st as KnockoutStageState).bye && (
        <div className="mt-4 rounded-[14px] border border-border bg-surface p-3.5">
          <b>Você avança sem jogar</b>
          <div className="text-sm text-ink-600">
            Sua chave não teve sorteio de adversário nesta rodada, então você passa direto para a
            próxima fase (no futebol, isso é o &ldquo;bye&rdquo;).
          </div>
        </div>
      )}

      {/* meus resultados */}
      {camp.history.length > 0 && (
        <>
          <div className="mt-4 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            Sua campanha
          </div>
          <div>
            {camp.history.map((h, i) => (
              <HistoryRow key={i} {...h} />
            ))}
          </div>
        </>
      )}
        </div>
      </div>

      {/* ITEM #11: "Como funciona / Regras" no FIM da tela (full-width nas duas colunas),
          depois da campanha/tabela/chaveamento — acessível a quem retomou a campanha e
          pulou a intro, mas sem roubar o topo da ação principal. Separador discreto pra
          marcar que é um apoio, não um passo do fluxo. */}
      <button
        type="button"
        onClick={() => setHelpOpen(true)}
        className="mt-6 inline-flex min-h-[44px] w-full items-center justify-center gap-2 border-t border-border bg-transparent px-3 pt-4 text-[13px] font-bold text-ink-600 transition-colors duration-150 ease-out hover:text-ink-800"
      >
        <span aria-hidden>❔</span> Como funciona / Regras
      </button>

      {bracketOpen && (
        <BracketModal campaign={camp} edition={edition} onClose={() => setBracketOpen(false)} />
      )}
      {helpOpen && <HelpSheet myTac={myTac} onClose={() => setHelpOpen(false)} />}
    </div>
  );
}

// prevenção de erro (Nielsen #5) + visibilidade (#1) — botão de apurar a fase: pede
// confirmação quando a ação é irreversível (closeNeedsConfirm) e mostra "Apurando…"
// enquanto o motor simula em bloco. O bye (avançar sem jogo) dispensa confirmação.
function CloseStageControl({ camp, onCloseStage }: { camp: Campaign; onCloseStage: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const [apurando, setApurando] = useState(false);
  if (confirm) {
    return (
      <ConfirmInline
        message={closeConfirmMsg(camp)}
        confirmLabel="Apurar e avançar"
        tone="brand"
        onConfirm={() => {
          setApurando(true);
          // deixa o "Apurando…" pintar antes da simulação síncrona (que é instantânea).
          requestAnimationFrame(() => onCloseStage());
        }}
        onCancel={() => setConfirm(false)}
      />
    );
  }
  return (
    <Button
      size="lg"
      fullWidth
      className="mt-3.5"
      loading={apurando}
      onClick={() => (closeNeedsConfirm(camp) ? setConfirm(true) : onCloseStage())}
    >
      {apurando ? "Apurando…" : closeLabel(camp)}
    </Button>
  );
}

// visibilidade #1 — saldo parcial da campanha em andamento: vitórias, empates, saldo
// de gols e o multiplicador de dificuldade projetado pelo tier. Reusa campaignScore
// (mesma conta do fim) só pra o multiplicador; as tallies vêm do histórico.
function HubScoreStrip({ camp }: { camp: Campaign }) {
  const sc = campaignScore(camp);
  let wins = 0;
  let draws = 0;
  let gd = 0;
  camp.history.forEach((h) => {
    if (h.win) wins++;
    else if (h.draw) draws++;
    gd += h.gf - h.ga;
  });
  const cell = (label: string, value: string, tone?: string) => (
    <div className="flex min-w-0 flex-1 flex-col items-center">
      <span className={`text-[15px] font-black tabular-nums ${tone ?? "text-ink-900"}`}>{value}</span>
      <span className="text-[9.5px] font-extrabold uppercase tracking-wide text-ink-500">{label}</span>
    </div>
  );
  return (
    <div className="mt-2.5 flex items-stretch gap-1 rounded-[12px] border border-border bg-surface-2 px-2 py-2">
      {cell("Vitórias", String(wins), "text-grass-700")}
      <span className="w-px self-stretch bg-border" />
      {cell("Empates", String(draws))}
      <span className="w-px self-stretch bg-border" />
      {cell("Saldo", `${gd > 0 ? "+" : ""}${gd}`, gd >= 0 ? "text-ink-900" : "text-flame-700")}
      {sc.pctExtra > 0 && (
        <>
          <span className="w-px self-stretch bg-border" />
          {cell("Bônus", `×${sc.mult.toFixed(2)}`, "text-gold-700")}
        </>
      )}
    </div>
  );
}

// ajuda #10 — folha "Como funciona / Regras" acessível do hub e da tática. Reúne o
// conteúdo da intro + pontuação 3/2/1 (e o desempate) + o bônus de tier + o anel de
// estilos. Sheet acessível (role=dialog, ESC fecha, foco no botão). Sem hex.
function HelpSheet({ myTac, onClose }: { myTac: Tactic; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Como funciona o Resultadismo Manager"
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
    >
      <button type="button" aria-label="Fechar" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink-950/60" />
      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-[20px] border border-border bg-surface shadow-xl sm:rounded-[20px]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-[18px] font-black text-ink-950">Como funciona</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-600 transition-colors hover:bg-surface-2"
          >
            <span aria-hidden className="text-[20px] leading-none">✕</span>
            <span className="sr-only">Fechar</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <ul className="space-y-1.5 text-sm text-ink-700">
            <li><b>Monte a tática</b> às cegas: formação, ataque, defesa e os 4 sliders são seus. Comece por um preset e ajuste na mão.</li>
            <li><b>No jogo</b>, leia posse e placar e ajuste os sliders ao vivo (a formação e os estilos só mudam no intervalo).</li>
            <li><b>No intervalo</b>, a tática do rival é revelada. Vire a chave.</li>
          </ul>
          <div className="mt-4 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Pontuação na fase de grupos</div>
            <div className="mt-1 text-sm text-ink-700">
              Vitória vale <b>3 pontos</b>, empate <b>1</b>, derrota <b>0</b>. Em caso de igualdade, decide o saldo de gols e depois os gols marcados.
            </div>
          </div>
          <div className="mt-2.5 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Bônus por dificuldade</div>
            <div className="mt-1 text-sm text-ink-700">
              Quanto mais fraca a seleção que você comanda, maior o bônus na pontuação final. Comandar uma zebra ao título vale muito mais.
            </div>
          </div>
          <div className="mt-2.5">
            <StyleRing atk={myTac.atk} />
          </div>
        </div>
      </div>
    </div>
  );
}

function progressTone(status: string): string {
  if (status === "done") return "bg-grass-100 text-grass-700";
  // "now": halo discreto (ring brand) que diz "você está aqui", além da cor.
  if (status === "now") return "bg-brand-600 text-white ring-2 ring-brand-500/30";
  if (status === "out") return "bg-flame-100 text-flame-700";
  return "border border-border bg-surface-2 text-ink-500";
}
function closeLabel(camp: Campaign): string {
  const st = camp.state;
  if (st?.kind === "groups") return "Encerrar a fase de grupos ›";
  if (st?.kind === "final_group") return "Encerrar o quadrangular ›";
  if (st?.kind === "knockout" && (st as KnockoutStageState).bye) return "Avançar sem jogar ›";
  if (st?.kind === "knockout") return "Apurar a rodada ›";
  if (st?.kind === "third_place") return "Apurar (você não está no 3º lugar) ›";
  if (st?.kind === "final") return "Apurar a final ›";
  return "Avançar ›";
}
// prevenção de erro (Nielsen #5): a apuração em bloco simula o resto da fase e é
// irreversível — confirma. O bye (avançar sem jogo) NÃO destrói nada, então dispensa.
function closeNeedsConfirm(camp: Campaign): boolean {
  const st = camp.state;
  if (st?.kind === "knockout" && (st as KnockoutStageState).bye) return false;
  return (
    st?.kind === "groups" ||
    st?.kind === "final_group" ||
    st?.kind === "knockout" ||
    st?.kind === "third_place" ||
    st?.kind === "final"
  );
}
function closeConfirmMsg(camp: Campaign): string {
  const st = camp.state;
  if (st?.kind === "groups")
    return "Isto simula os jogos restantes da fase de grupos e fecha a classificação. Não dá pra voltar atrás.";
  if (st?.kind === "final_group")
    return "Isto simula os jogos restantes do quadrangular e fecha a classificação. Não dá pra voltar atrás.";
  if (st?.kind === "third_place")
    return "Você não está na disputa de 3º lugar. Isto apura o confronto e segue. Não dá pra voltar atrás.";
  if (st?.kind === "final")
    return "Isto apura a final e encerra a Copa. Não dá pra voltar atrás.";
  return "Isto simula os jogos restantes desta fase e avança no chaveamento. Não dá pra voltar atrás.";
}

// ---------------- TELA DE CLASSIFICAÇÃO DOS GRUPOS ----------------
function GroupClassif({
  campaign,
  edition,
  onContinue,
}: {
  campaign: Campaign;
  edition: Edition;
  onContinue: () => void;
}) {
  const camp = campaign;
  const st = camp.state as GroupsStageState;
  const advanced = camp.pendingAdvance ?? false;
  const qualifiedKeys = new Set((st.qualified ?? []).map((t) => t.s));
  // ITEM C: jogos decisivos da última rodada do meu grupo (definiram quem passou).
  const decisive = finalGroupRoundResults(camp);
  return (
    <div className="flex flex-col">
      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        {edition.year} · {edition.host}
      </div>
      <h2 className="mb-0.5 mt-1.5 text-[23px] font-bold text-ink-950">Classificação dos grupos</h2>
      <p className={`mb-1.5 text-sm font-bold ${advanced ? "text-grass-700" : "text-flame-700"}`}>
        {advanced
          ? "✓ Você se classificou para o mata-mata!"
          : "✕ Você caiu na fase de grupos. Cabeça erguida."}
      </p>
      <p className="mb-2.5 text-[11.5px] text-ink-600">
        Quem passou (▲) e quem caiu, na composição real da Copa. Jogos paralelos pelo modo{" "}
        {camp.worldMode === "real" ? "História Real" : "Mundo Alternativo"}.
      </p>
      {/* ITEM C: os jogos decisivos da última rodada do meu grupo, que fecharam a
          classificação — o usuário vê o que definiu quem passou. */}
      {decisive.length > 0 && (
        <GroupRoundResultsPanel
          results={decisive}
          title="Jogos decisivos do seu grupo"
          note="A última rodada do seu grupo, que fechou a classificação acima."
          highlight
        />
      )}
      {(st.sortedStandings ?? []).map((sorted, gIdx) => (
        <div key={gIdx}>
          <div className="mt-3.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            {wcGroupName(edition.year, gIdx)}
            {gIdx === st.myG ? " · o seu" : ""}
          </div>
          <StandingsTable
            standings={sorted}
            advance={st.advance}
            myKey={camp.myKey}
            qualifiedKeys={qualifiedKeys}
            showLegend={gIdx === 0}
          />
        </div>
      ))}
      {st.bestThirds > 0 && (
        <p className="mt-2.5 text-[11.5px] text-ink-600">
          Avançam os {st.advance} primeiros de cada grupo + os {st.bestThirds} melhores terceiros (▲).
        </p>
      )}
      <Button
        size="lg"
        fullWidth
        className="mt-4.5 mt-[18px] bg-gold-600 font-bold text-ink-950 hover:bg-gold-700"
        onClick={onContinue}
      >
        {advanced ? "Seguir pro mata-mata ›" : "Ver fim de campanha ›"}
      </Button>
    </div>
  );
}

// ITEM #9: rótulo da fase do PRÓXIMO confronto (a campanha já avançou, então é o estágio
// corrente). Ex.: "Semifinais", "A Final". "" se não houver um estágio claro.
function nextRoundLabel(camp: Campaign): string {
  const st = camp.stages[camp.stageIdx];
  return st ? stageLong(st) : "";
}

// ---------------- TELA DE RESULTADOS DO MATA-MATA (ITEM D) ----------------
// Após uma rodada eliminatória fechar, mostra TODOS os confrontos paralelos dessa fase
// (placar + pênaltis), destacando quem avançou — reusando o MatchCard do bracket. Os
// dados vêm de camp.koRounds (o que a campanha de fato apurou; nada recalculado aqui).
function KnockoutResults({
  campaign,
  edition,
  roundId,
  onContinue,
}: {
  campaign: Campaign;
  edition: Edition;
  roundId: string;
  onContinue: () => void;
}) {
  const camp = campaign;
  const round = useMemo(() => koRoundView(camp, roundId), [camp, roundId]);
  // meu confronto nesta rodada: avancei? (slot meu venceu). Bye conta como avanço.
  const mineMatch = round?.matches.find((m) => m.mine);
  const iAdvanced =
    !!mineMatch &&
    ((mineMatch.a.isMe && mineMatch.a.winner) ||
      (mineMatch.b.isMe && mineMatch.b.winner) ||
      mineMatch.bye);
  // próximo adversário (a campanha já avançou): só se eu sigo vivo e há jogo meu.
  const nextOpp = camp.alive ? myNextMatch(camp)?.opp ?? null : null;

  if (!round) {
    // salvaguarda: sem rodada projetável, segue direto (não trava o fluxo).
    return (
      <div className="flex flex-col">
        <div className="h-[6vh]" />
        <Button size="lg" fullWidth onClick={onContinue}>
          Continuar ›
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mt-1 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        {edition.year} · {edition.host}
      </div>
      <h2 className="mb-0.5 mt-1.5 text-[23px] font-bold text-ink-950">Resultados · {round.label}</h2>
      {mineMatch && (
        <p className={`mb-1.5 text-sm font-bold ${iAdvanced ? "text-grass-700" : "text-flame-700"}`}>
          {iAdvanced
            ? mineMatch.bye
              ? "✓ Você passou direto e avançou."
              : "✓ Você avançou de fase!"
            : "✕ Você caiu nesta fase. Cabeça erguida."}
        </p>
      )}
      <p className="mb-2.5 text-[11.5px] text-ink-600">
        Como ficaram todos os confrontos desta fase. Quem venceu (fundo verde) avança no chaveamento.
      </p>

      <KoRoundBody round={round} />

      {/* ITEM #9: o encaminhamento pra próxima fase fala a MESMA língua dos confrontos
          acima — o "próximo confronto" vem montado como PAR (escudo × escudo, sem placar),
          não mais um card solto de layout diferente. A força das duas fica logo abaixo. */}
      {iAdvanced && nextOpp && (
        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="text-[11px] font-extrabold uppercase tracking-wide text-brand-700">
              Próximo confronto
            </span>
            <span className="text-[11px] font-bold text-ink-500">{nextRoundLabel(camp)}</span>
          </div>
          <NextMatchPair mine={camp.myTeam} opp={nextOpp} />
          <div className="mt-2 rounded-[12px] border border-border bg-surface-2 px-3 py-2">
            <StrengthVS mine={camp.myTeam} opp={nextOpp} />
          </div>
        </div>
      )}

      <Button
        size="lg"
        fullWidth
        className="mt-4.5 mt-[18px] bg-gold-600 font-bold text-ink-950 hover:bg-gold-700"
        onClick={onContinue}
      >
        {camp.alive ? "Seguir ›" : "Ver fim de campanha ›"}
      </Button>
    </div>
  );
}

// ---------------- 5. TÁTICA PRÉ-JOGO (às cegas) ----------------
function TacticPicker({
  campaign,
  opp,
  myTac,
  onMyTac,
  onWhistle,
}: {
  campaign: Campaign;
  opp: Team;
  myTac: Tactic;
  onMyTac: (t: Tactic) => void;
  onWhistle: () => void;
}) {
  const stage = campaign.stages[campaign.stageIdx];
  return (
    <div className="flex flex-col gap-4">
      {/* CABEÇALHO — fase + título + as 2 forças (você vs adversário) sempre à vista no
          topo (ITEM F: sou favorito ou zebra neste jogo?). */}
      <div className="flex flex-col">
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
          {stageLong(stage)}
        </div>
        <h2 className="mb-0 mt-1.5 text-[22px] font-bold text-ink-950">Tática às cegas</h2>
        <div className="mt-2 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
          <StrengthVS mine={campaign.myTeam} opp={opp} withName />
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-ink-600">
          A tática do {opp.n} só aparece no intervalo. Monte seu plano: as escolhas são todas suas.
        </p>
      </div>

      {/* ITEM 6 · SEU ELENCO — as 3 forças da MINHA seleção (ATA·MEI·DEF) em barras (sem
          número cru, item 13). Ajuda a escolher formação/estilo que casa com o elenco
          (afinidade §8). Só a minha — a do adversário fica oculta (tática às cegas). */}
      <section aria-labelledby="mgr-squad-h" className="rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
        <h3 id="mgr-squad-h" className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
          Seu elenco
        </h3>
        <Rate lab="ATA" v={campaign.myTeam.a} color="var(--color-brand-500)" />
        <Rate lab="MEI" v={campaign.myTeam.m} color="var(--color-aqua-500)" />
        <Rate lab="DEF" v={campaign.myTeam.d} color="var(--color-grass-500)" />
      </section>

      {/* 1 · PRESETS — atalho rápido (5). Um toque carrega o conjunto; ajuste na mão. */}
      <PresetPicker active={nearestPreset(myTac)} onPick={(k) => onMyTac(applyPreset(k))} />

      {/* 2 · FORMAÇÃO — grid 3×3 (linha = afinidade ATA/MEI/DEF). Só muda antes/no
          intervalo. */}
      <section aria-labelledby="mgr-form-h">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h3 id="mgr-form-h" className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            Formação
          </h3>
          <span className="shrink-0 text-[10.5px] font-semibold text-ink-400">muda só no intervalo</span>
        </div>
        <FormGrid value={myTac.form} onPick={(v) => onMyTac({ ...myTac, form: v })} />
      </section>

      {/* 3 · ESTILOS — ataque (5) + defesa (5) LADO A LADO (ITEM 5), descrição curtíssima. */}
      <AttackDefenseColumns
        atk={myTac.atk}
        def={myTac.def}
        onAtk={(v) => onMyTac({ ...myTac, atk: v })}
        onDef={(v) => onMyTac({ ...myTac, def: v })}
      />

      {/* 4 · SLIDERS — ajustes finos 0–100. Ao vivo, só estes mudam. */}
      <section aria-labelledby="mgr-sliders-h">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 id="mgr-sliders-h" className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            Ajustes finos
          </h3>
          <span className="shrink-0 text-[10.5px] font-semibold text-ink-400">muda ao vivo</span>
        </div>
        <TacticSliders tac={myTac} onPatch={(k: SliderKey, v) => onMyTac({ ...myTac, [k]: v })} />
      </section>

      {/* 5 · TRANSPARÊNCIA — o que vence o que + a sintonia atual (honesto, §14). */}
      <MatchPreview my={myTac} team={campaign.myTeam} />

      {/* recap em 1 linha + CTA */}
      <PlanSummary tac={myTac} />
      <Button
        size="lg"
        fullWidth
        className="bg-gold-600 font-bold text-ink-950 hover:bg-gold-700"
        onClick={onWhistle}
      >
        Apitar o jogo ›
      </Button>
    </div>
  );
}

// ---------------- 8. RESULTADO DA PARTIDA ----------------
function MatchResult({
  campaign,
  result,
  kind,
  matchSeed,
  myTac,
  aiTac,
  onContinue,
}: {
  campaign: Campaign;
  result: {
    gf: number;
    ga: number;
    opp: Team;
    goals?: { side: "A" | "B"; m: number }[];
    stats?: MatchStats;
    // ITEM 3: a transmissão da partida pra a aba Transmissão (revisar os lances).
    lines?: TickerLine[];
  };
  kind: MatchKind;
  matchSeed: number;
  // §14: o plano FINAL meu + o da IA (no apito) — pra o "Recado do técnico" ler o
  // confronto real (matriz §4 + sintonia §6.5 + força §10) em vez de uma frase genérica.
  myTac: Tactic;
  aiTac: Tactic | null;
  onContinue: () => void;
}) {
  const camp = campaign;
  const { gf, ga, opp } = result;
  const stage = camp.stages[camp.stageIdx];
  // ITEM 3: no fim de jogo, abas Transmissão | Estatísticas (default Estatísticas) — o
  // usuário revê os números ou os lances da partida, ao lado do balanço.
  const [resultTab, setResultTab] = useState<"feed" | "stats">("stats");
  const hasLines = !!result.lines && result.lines.length > 0;
  // ITEM C: no resultado de um jogo de grupo, a rodada que estou jogando é o
  // myMatchIdx ATUAL (ainda não incrementado — só sobe no commit). previewGroupRound
  // calcula os IA×IA paralelos sem mutar a campanha (determinístico, bate com o log).
  const myGroupRound =
    kind === "groups" && camp.state?.kind === "groups"
      ? (camp.state as GroupsStageState).myMatchIdx
      : -1;
  const otherGroupResults = useMemo(
    () => (myGroupRound >= 0 ? previewGroupRoundResults(camp, myGroupRound) : []),
    [camp, myGroupRound],
  );
  const isKO = kind === "knockout" || kind === "third_place" || kind === "final";
  const koInfo: { winner: "A" | "B"; pens: string | null } | null = isKO
    ? knockoutResult(camp.myTeam, opp, gf, ga, matchSeed)
    : null;
  const outcome: "win" | "draw" | "lose" = koInfo
    ? koInfo.winner === "A"
      ? "win"
      : "lose"
    : gf > ga
      ? "win"
      : gf === ga
        ? "draw"
        : "lose";

  const blurb = useMemo(() => {
    // No mata-mata, empate (resolvido nos pênaltis) NÃO usa vocabulário de tabela.
    let key = postMatchBank(gf, ga, camp.myTeam.o, opp.o);
    if (isKO && gf === ga) key = outcome === "win" ? "ko_passou_penaltis" : "ko_caiu_penaltis";
    const bank = POSTMATCH[key] ?? POSTMATCH.vitoria_normal;
    const r = mulberryUi(matchSeed >>> 0);
    return bank[Math.floor(r() * bank.length)];
  }, [camp.myTeam.o, gf, ga, isKO, matchSeed, opp.o, outcome]);

  // §14: o "Recado do técnico" agora LÊ o confronto real (meu plano final × o da IA, a
  // matriz §4 + sintonia §6.5 + força §10 + placar) — a lição que ensina "o que venceu o
  // que" desta partida. Sem o aiTac (caso defensivo) cai no banco boleiro genérico.
  const hint = useMemo(
    () =>
      aiTac
        ? postMatchCoachRead(myTac, aiTac, camp.myTeam, opp, gf, ga, matchSeed)
        : TACTICAL_HINTS_SUBTLE[(matchSeed >>> 0) % TACTICAL_HINTS_SUBTLE.length],
    [aiTac, myTac, camp.myTeam, opp, gf, ga, matchSeed],
  );
  const badge = resultBadge(kind, outcome, camp.threePts);

  return (
    <div className="flex flex-col">
      <div className="mt-[6vh] text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        {stageLong(stage)}
      </div>
      <div
        className="relative my-2.5 overflow-hidden rounded-[18px] border border-white/10 p-4 text-white"
        style={{ background: "var(--color-board)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <ResultTeamCard name={camp.myTeam.n} slug={camp.myTeam.s} align="left" />
          {/* ROBUSTEZ (v9): score com clamp — herói (54px) no desktop/telas largas, encolhe
              no mobile estreito pra sobrar largura aos nomes das seleções (que passam a
              quebrar em 2 linhas em vez de cortar). gap menor no mesmo espírito. */}
          <div
            className="flex shrink-0 items-center justify-center gap-2 px-1 text-[clamp(40px,12vw,54px)] font-black tabular-nums leading-none text-gold-400"
            style={{ fontWeight: 900 }}
          >
            <span>{gf}</span>
            <span className="text-[22px] font-bold text-white/35">×</span>
            <span>{ga}</span>
          </div>
          <ResultTeamCard name={opp.n} slug={opp.s} align="right" />
        </div>
        {koInfo?.pens && (
          <div className="mt-1 text-center text-[13px] font-bold text-gold-400">Pênaltis {koInfo.pens}</div>
        )}
        {result.goals && result.goals.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-x-3 border-t border-white/10 pt-2" aria-label="Gols da partida">
            <GoalsCol goals={result.goals} side="A" dot="🟢" align="left" />
            <GoalsCol goals={result.goals} side="B" dot="⚪" align="right" />
          </div>
        )}
      </div>
      {/* ITEM C (desktop lg+): abaixo do placar (full-width), DUAS COLUNAS — à esquerda a
          leitura do MEU jogo (manchete, veredito, recado do técnico); à direita os DADOS
          (estatísticas + os jogos paralelos do grupo). No mobile empilha (mobile-first). */}
      <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2 lg:items-start">
        {/* COLUNA 1 — meu jogo */}
        <div className="flex flex-col">
      <div className="flex items-start gap-2.5">
        <h2 className="text-[22px] font-black leading-tight text-ink-950">
          {headlineFor(outcome, gf, ga, koInfo, kind)}
        </h2>
        <span className={`mt-0.5 shrink-0 rounded-md px-2.5 py-1 text-[12px] font-extrabold ${badge.tone}`}>
          {badge.txt}
        </span>
      </div>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{blurb}</p>
      <div className="mt-3 rounded-[14px] border border-border bg-surface p-3.5">
        {/* Coerência: rótulo "Recado do técnico" (era "No banco") — depois que o banco de
            comandos Pressionar/Recuar saiu, "No banco" podia confundir. É a leitura humana
            do técnico sobre o jogo. */}
        <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
          Recado do técnico
        </div>
        <div className="text-sm leading-snug text-ink-700">{hint}</div>
      </div>
        </div>

        {/* COLUNA 2 — dados. ITEM 3: abas Transmissão | Estatísticas (default Estatísticas)
            pra rever os números OU os lances da partida. No lg+ o 1º bloco alinha ao topo. */}
        <div className="mt-3 flex flex-col lg:mt-0 lg:[&>*:first-child]:mt-0">
      {(result.stats || hasLines) && (
        <div>
          {hasLines ? (
            <>
              <LiveTabs value={resultTab} onChange={setResultTab} />
              <div className="mt-2">
                {resultTab === "stats" ? (
                  <div role="tabpanel" id="live-panel-stats" aria-labelledby="live-tab-stats">
                    {result.stats ? (
                      <MatchStatsPanel stats={result.stats} myName={camp.myTeam.n} oppName={opp.n} />
                    ) : (
                      <div className="rounded-[14px] border border-border bg-surface px-3 py-4 text-center text-[13px] text-ink-600">
                        Sem estatísticas desta partida.
                      </div>
                    )}
                  </div>
                ) : (
                  <div role="tabpanel" id="live-panel-feed" aria-labelledby="live-tab-feed">
                    <Ticker lines={result.lines!} />
                  </div>
                )}
              </div>
            </>
          ) : (
            result.stats && <MatchStatsPanel stats={result.stats} myName={camp.myTeam.n} oppName={opp.n} />
          )}
        </div>
      )}
      {/* ITEM C: na fase de grupos, "enquanto você jogava" — os outros jogos da MESMA
          rodada do meu grupo (IA×IA), pré-computados deterministicamente (idênticos ao
          que será gravado no commit). Explica a tabela que muda ao voltar pro hub. */}
      {kind === "groups" && otherGroupResults.length > 0 && (
        <GroupRoundResultsPanel
          results={otherGroupResults}
          title={`Enquanto você jogava · rodada ${myGroupRound + 1}`}
          note="Esses jogos do seu grupo correram em paralelo. É por isso que a tabela vai mexer quando você voltar."
        />
      )}
        </div>
      </div>
      <Button size="lg" fullWidth className="mt-3.5" onClick={onContinue}>
        Continuar ›
      </Button>
    </div>
  );
}

// Card de time no placar do resultado: escudo + pílula com cores da seleção (itens 3/5).
function ResultTeamCard({ name, slug, align }: { name: string; slug?: string; align: "left" | "right" }) {
  const c = teamColors(slug, name);
  return (
    <div className={`flex min-w-0 flex-1 items-center gap-1.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <ManagerCrest slug={slug} name={name} size={28} />
      {/* CLAREZA/ROBUSTEZ (v9): no placar-herói do resultado o nome QUEBRA em até 2 linhas
          em vez de truncar — antes até "Alemanha" virava "ALEM…" (o score grande comia a
          largura). overflow-wrap:anywhere parte a palavra só em último caso; leading
          apertado mantém o board compacto. Par com o TeamPanel do ao vivo. */}
      <span
        className="max-w-full rounded-md px-2 py-0.5 text-center text-[12px] font-black uppercase leading-[1.08] tracking-wide [overflow-wrap:anywhere]"
        style={{ background: c.bg, color: c.text }}
      >
        {name}
      </span>
    </div>
  );
}

// ITEM 16: coluna de gols (minuto) de um lado, no placar do resultado.
function GoalsCol({
  goals,
  side,
  dot,
  align,
}: {
  goals: { side: "A" | "B"; m: number }[];
  side: "A" | "B";
  dot: string;
  align: "left" | "right";
}) {
  const gs = goals.filter((g) => g.side === side).sort((x, y) => x.m - y.m);
  if (gs.length === 0) return <div />;
  return (
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
}

// badge de pontos (grupos) / classificação (mata-mata) do resultado.
function resultBadge(
  kind: MatchKind,
  outcome: "win" | "draw" | "lose",
  threePts: boolean,
): { txt: string; tone: string } {
  if (kind === "groups" || kind === "final_group") {
    const pts = outcome === "win" ? (threePts ? 3 : 2) : outcome === "draw" ? 1 : 0;
    const tone =
      outcome === "win"
        ? "bg-grass-100 text-grass-700"
        : outcome === "draw"
          ? "bg-surface-2 text-ink-700"
          : "bg-flame-100 text-flame-700";
    return { txt: `${pts > 0 ? "+" : ""}${pts} ponto${pts === 1 ? "" : "s"}`, tone };
  }
  return outcome === "win"
    ? { txt: "✓ Classificado", tone: "bg-grass-100 text-grass-700" }
    : { txt: "✕ Eliminado", tone: "bg-flame-100 text-flame-700" };
}

function headlineFor(
  outcome: "win" | "draw" | "lose",
  gf: number,
  ga: number,
  koInfo: { pens: string | null } | null,
  kind: MatchKind,
): string {
  if (kind === "final") return outcome === "win" ? "🏆 CAMPEÃO DO MUNDO!" : "Vice. Doeu, mas chegou à Final.";
  const isKnockout = kind === "knockout" || kind === "third_place";
  if (outcome === "win") {
    if (koInfo?.pens) return "Nos pênaltis! Coração na boca, mas passou.";
    if (isKnockout) {
      if (gf - ga >= 3) return "Goleou e passou!";
      return ["Classificou!", "Passou de fase!", "Avançou no sufoco!"][gf % 3];
    }
    if (gf - ga >= 3) return "Atropelo!";
    return ["Vitória!", "Ganhou e levou.", "Três pontos no bolso."][gf % 3];
  }
  if (outcome === "draw") return "Empate.";
  if (koInfo?.pens) return "Caiu nos pênaltis.";
  return ["Derrota.", "Não foi dessa vez.", "Cabeça erguida."][ga % 3];
}

// ---------------- 10. FIM DE CAMPANHA ----------------
// Conta a pontuação subindo de 0→total (~900ms, ease-out) ao montar o fim de
// campanha — transmite a CONQUISTA. Respeita prefers-reduced-motion mostrando o
// número final direto. requestAnimationFrame (sem timers de layout).
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

function useCountUp(target: number, durationMs = 900): number {
  // Inicializa já no valor final quando reduced-motion (ou SSR): a animação nem
  // começa, sem setState síncrono no efeito.
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      // ease-out-quart, mesmo sabor do motion do app
      const eased = 1 - Math.pow(1 - t, 4);
      setValue(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

function CampaignEnd({
  campaign,
  edition,
  onNewCampaign,
  onReplay,
}: {
  campaign: Campaign;
  edition: Edition;
  onNewCampaign: () => void;
  onReplay: () => void;
}) {
  const camp = campaign;
  const sc = campaignScore(camp);
  const champ = camp.champion;
  const shareText = buildShareText(camp, sc);
  const shownScore = useCountUp(sc.total);
  // recuperação de erro (Nielsen #9): "idle"|"ok"|"fail" — em falha, dá feedback
  // explícito e seleciona o texto pra o usuário copiar à mão.
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const preRef = useRef<HTMLPreElement>(null);
  // ITEM 17: no fim de campanha, mostra OBRIGATORIAMENTE a árvore inteira do
  // mata-mata preenchida — inclusive os cruzamentos/resultados das IAs simulados
  // até a final depois da minha eliminação, revelando o campeão. Só nas edições
  // com mata-mata (projeção não-nula).
  // fim de campanha: revela a árvore inteira (inclusive a história real além de onde
  // eu parei) — aqui já acabou, então não é spoiler.
  const bracketView = useMemo(() => projectBracket(camp, true), [camp]);

  // seleciona o texto do <pre> como alternativa quando a clipboard API falha/inexiste.
  function selectShareText() {
    const el = preRef.current;
    if (!el || typeof window === "undefined") return;
    const sel = window.getSelection();
    if (!sel) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  function copy() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareText).then(
        () => setCopyState("ok"),
        () => {
          setCopyState("fail");
          selectShareText();
        },
      );
    } else {
      // sem clipboard API (alguns navegadores mobile/embed): seleciona pra copiar à mão.
      setCopyState("fail");
      selectShareText();
    }
  }

  return (
    <div className="flex flex-col">
      <div className="h-[2vh]" />
      {champ ? (
        <>
          <div className="animate-pop-in text-center text-[52px]">🏆</div>
          <h2 className="mt-1.5 text-center text-[26px] font-black text-ink-950">CAMPEÃO DO MUNDO!</h2>
        </>
      ) : (
        <>
          <div className="animate-pop-in text-center text-[52px]">{camp.eliminated ? "😤" : "🥈"}</div>
          <h2 className="mt-1.5 text-center text-[23px] font-bold text-ink-950">
            {camp.placement ?? "Fim de campanha"}
          </h2>
        </>
      )}
      <p className="mt-0.5 inline-flex w-full items-center justify-center gap-1.5 text-center text-sm text-ink-600">
        <ManagerCrest slug={camp.myTeam.s} name={camp.myTeam.n} /> {camp.myTeam.n} {camp.myTeam.y} · Copa{" "}
        {edition.year}
      </p>

      {camp.eliminated && (
        <div className="mt-3.5 rounded-[14px] border border-border bg-surface p-3.5 text-center">
          <b>Quase!</b> {nearMissMsg(camp)}
          <div className="text-sm text-ink-600">Toda campanha conta. Bora de novo?</div>
        </div>
      )}

      {/* score box */}
      <div
        className="mt-4 rounded-[18px] p-4 text-white"
        style={{ background: "linear-gradient(135deg,var(--color-brand-700),var(--color-brand-900))" }}
      >
        <div className="text-[11px] font-extrabold uppercase tracking-widest opacity-85">Pontuação</div>
        <div className="text-[40px] font-black tabular-nums leading-none">
          {shownScore.toLocaleString("pt-BR")}
        </div>
        <div className="text-[12px]">
          {difficultyLabel(camp.myTeam.t, sc)}
        </div>
      </div>

      {bracketView && (
        <>
          <div className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            Chaveamento da Copa {edition.year}
          </div>
          <p className="mb-2.5 mt-0.5 text-[11.5px] text-ink-600">
            {camp.champion
              ? "Você levantou a taça. A árvore inteira do mata-mata."
              : camp.eliminated
                ? "Como o mata-mata terminou depois que você caiu, até a final."
                : "A árvore completa do mata-mata desta Copa."}
          </p>
          <BracketBody view={bracketView} />
        </>
      )}

      {camp.history.length > 0 && (
        <>
          <div className="mt-4 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            Sua campanha
          </div>
          <div>
            {camp.history.map((h, i) => (
              <HistoryRow key={i} {...h} />
            ))}
          </div>
        </>
      )}

      <div className="mt-4 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        Compartilhar
      </div>
      <pre
        ref={preRef}
        className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-[14px] border border-border bg-surface-2 p-3 text-[12px] text-ink-700"
      >
        {shareText}
      </pre>
      <Button variant="outline" fullWidth className="mt-2.5" onClick={copy}>
        {copyState === "ok" ? "✓ Copiado!" : "📋 Copiar resultado"}
      </Button>
      {copyState === "fail" && (
        <p className="mt-1.5 text-center text-[11.5px] text-flame-700">
          Não consegui copiar automaticamente. Selecionei o texto acima, é só copiar (toque e
          segure, depois Copiar).
        </p>
      )}
      <Button size="lg" fullWidth className="mt-3 bg-gold-600 font-bold text-ink-950 hover:bg-gold-700" onClick={onNewCampaign}>
        🔄 Nova campanha
      </Button>
      <Button variant="outline" fullWidth className="mt-2" onClick={onReplay}>
        Jogar a Copa {edition.year} de novo
      </Button>
    </div>
  );
}
// rótulo do bônus de dificuldade — deriva do TIER (item 18), nunca chama elite de "fraco".
function difficultyLabel(tier: Team["t"], sc: ReturnType<typeof campaignScore>): string {
  if (sc.pctExtra <= 0) return "Seleção de elite, sem bônus de dificuldade";
  const noun = tier === "D" ? "uma zebra" : tier === "C" ? "um azarão" : "uma seleção sem favoritismo";
  return `+${sc.pctExtra}% por comandar ${noun} (×${sc.mult.toFixed(2)})`;
}
function nearMissMsg(camp: Campaign): string {
  const last = camp.history[camp.history.length - 1];
  if (!last) return "Você caiu cedo, mas o jogo é rejogável.";
  if (last.pens) return "Eliminado nos pênaltis. Não dá pra pedir mais coração.";
  if (last.draw) return "Faltou um gol pra virar a chave.";
  return `Perdeu por ${last.ga - last.gf}. Dá pra reverter na próxima.`;
}
function buildShareText(camp: Campaign, sc: ReturnType<typeof campaignScore>): string {
  const res = camp.champion ? "🏆 CAMPEÃO" : (camp.placement ?? "Eliminado");
  const path = camp.history
    .map((h) => {
      const icon = h.win ? "✅" : h.draw ? "➖" : "❌";
      return `${icon} ${h.opp.n} ${h.gf}×${h.ga}`;
    })
    .join("\n");
  return (
    "RESULTADISMO MANAGER\n" +
    `Copa ${camp.edition.year} (${camp.edition.host})\n` +
    `${flagEmoji(camp.myTeam.n)} ${camp.myTeam.n} ${camp.myTeam.y}: ${res}\n` +
    `Pontuação: ${sc.total.toLocaleString("pt-BR")}${sc.pctExtra > 0 ? ` (+${sc.pctExtra}% dificuldade)` : ""}\n\n` +
    path +
    "\n\nVocê não palpita, você comanda. /manager"
  );
}
