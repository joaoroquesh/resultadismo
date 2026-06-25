import { useCallback, useMemo, useRef, useState } from "react";
import { useFirstSeen } from "@/lib/useFirstSeen";
import { Button } from "@/components/ui/Button";
import type { Campaign, Edition, MatchKind, MatchStats, Tactic, Team, WorldMode } from "./types";
import {
  FORMATS,
  advanceCampaign,
  aiTactic,
  buildCampaign,
  campaignProgress,
  campaignScore,
  finishFinalGroup,
  finishGroupsStage,
  finishKnockoutStage,
  fraseFor,
  knockoutResult,
  myNextMatch,
  poolForYear,
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
  ESTILO_OPTS,
  FORM_OPTS,
  MARC_OPTS,
  POSTURA_OPTS,
  TACTICAL_HINTS_SUBTLE,
  TIER_LABEL,
  barPct,
  flagEmoji,
  postMatchBank,
  POSTMATCH,
  mulberryUi,
} from "./ui";
import { ManagerCrest, FormGrid, HistoryRow, MatchStatsPanel, SegBlock, StandingsTable, Stars, StyleRing, TeamName } from "./components";
import { BracketBody, BracketModal } from "./Bracket";
import { LiveMatch, PlanSummary } from "./LiveMatch";
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

  // contexto da partida corrente
  const [matchOpp, setMatchOpp] = useState<Team | null>(null);
  const [matchKind, setMatchKind] = useState<MatchKind>("groups");
  const [aiTac, setAiTac] = useState<Tactic | null>(null);
  const [matchSeed, setMatchSeed] = useState(0);
  const [matchResult, setMatchResult] = useState<{
    gf: number;
    ga: number;
    opp: Team;
    goals?: { side: "A" | "B"; m: number }[];
    stats?: MatchStats;
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
  const startMatch = useCallback(
    (opp: Team, kind: MatchKind) => {
      const camp = campRef.current;
      if (!camp) return;
      const seed =
        (camp.seed ^ (opp.o * 40503 + camp.stageIdx * 7349 + camp.history.length * 131)) >>> 0;
      const r = rngFrom(seed);
      setMatchOpp(opp);
      setMatchKind(kind);
      // a IA é o adversário: gap = força DELE − minha força (item 14)
      setAiTac(aiTactic(r, opp.o, camp.myTeam.o));
      setMatchSeed(seed);
      go("tactics");
    },
    [go],
  );

  const onMyTacChange = useCallback((tac: Tactic) => {
    setMyTac(tac);
    saveTactic(tac); // persiste pro próximo jogo
  }, []);

  // -------- fim da partida ao vivo --------
  const onLiveFinish = useCallback(
    (gA: number, gB: number, goals: { side: "A" | "B"; m: number }[], stats: MatchStats) => {
      if (!matchOpp) return;
      setMatchResult({ gf: gA, ga: gB, opp: matchOpp, goals, stats });
      // ITEM 10: mata-mata empatado entra na disputa de pênaltis cobrança a cobrança
      // (só no MEU jogo); senão segue direto pro resultado.
      const isKO = matchKind === "knockout" || matchKind === "third_place" || matchKind === "final";
      if (isKO && gA === gB) go("penalties");
      else go("result");
    },
    [go, matchKind, matchOpp],
  );

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
      advanceCampaign(c, true);
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
      advanceCampaign(c, iWin);
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
  if (screen === "intro")
    return (
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

  if (screen === "editions") return <EditionSelect onPick={selectEdition} onBack={() => go("intro")} />;

  if (screen === "draft" && edition)
    return (
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

  if (screen === "tactics" && camp && matchOpp)
    return (
      <TacticPicker
        campaign={camp}
        opp={matchOpp}
        myTac={myTac}
        onMyTac={onMyTacChange}
        onWhistle={() => go("live")}
      />
    );

  if (screen === "live" && camp && matchOpp && aiTac)
    return (
      <LiveMatch
        campaign={camp}
        opp={matchOpp}
        myTac={myTac}
        aiTac={aiTac}
        matchSeed={matchSeed}
        onMyTacChange={onMyTacChange}
        onFinish={onLiveFinish}
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

  if (screen === "result" && camp && matchResult)
    return (
      <MatchResult
        campaign={camp}
        result={matchResult}
        kind={matchKind}
        matchSeed={matchSeed}
        onContinue={commitMatchResult}
      />
    );

  if (screen === "groupClassif" && camp && edition)
    return <GroupClassif campaign={camp} edition={edition} onContinue={continueFromGroupClassif} />;

  if (screen === "hub" && camp && edition)
    return (
      <TournamentHub
        campaign={camp}
        edition={edition}
        onStartMatch={startMatch}
        onCloseStage={closeStageAndAdvance}
        onNewCampaign={resetToEditions}
        onReplay={replaySameEdition}
      />
    );

  // fallback defensivo
  return <IntroScreen firstTime={false} resumable={null} onResume={() => {}} onPlay={resetToEditions} />;
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
            <b>Monte a tática</b> às cegas — formação, estilo, postura e marcação, tudo na sua mão.
          </li>
          <li>
            <b>No jogo</b>, leia posse e placar: pressione com a bola, recue sem ela.
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
        {resumable && !firstTime && (
          <Button size="lg" fullWidth className="font-bold" onClick={onResume}>
            ▶︎ Retomar a campanha ({resumable.edition.year} · {resumable.myTeam.n})
          </Button>
        )}
        <Button
          size="lg"
          fullWidth
          className="bg-gold-600 font-bold text-ink-950 hover:bg-gold-700"
          onClick={onPlay}
        >
          ⚽ {resumable && !firstTime ? "Nova campanha" : "Jogar"}
        </Button>
      </div>
      <p className="mt-5 text-center text-[11px] text-ink-500">
        Mini-jogo do Resultadismo · motor no cliente, sem backend.
        <br />8 formações · 5 estilos · 5 posturas · 3 marcações · grupos reais · 23 edições.
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
          const champ = ed.champion_real ? `🏆 ${ed.champion_real}` : "— futura —";
          return (
            <button
              key={ed.year}
              type="button"
              onClick={() => onPick(ed)}
              className="flex items-center gap-3 rounded-[15px] border border-border bg-surface px-3.5 py-3 text-left transition-colors hover:border-brand-400 active:scale-[0.985]"
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
              <div className="shrink-0 text-lg text-ink-400">›</div>
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
              className={`min-h-[42px] flex-1 rounded-[10px] px-2 text-[13px] font-bold transition-colors ${
                worldMode === v ? "bg-brand-600 text-white shadow-sm" : "text-ink-600"
              }`}
            >
              {lbl}
            </button>
          ))}
        </div>
        <div className="mt-1.5 text-[11.5px] text-ink-600">
          {worldMode === "real"
            ? "Os jogos paralelos tendem a repetir a hierarquia real — os favoritos avançam como avançaram."
            : "O motor simula tudo do zero: zebras e viradas podem reescrever a história."}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {cards.map((t, i) => (
          <button
            key={t.s}
            type="button"
            onClick={() => onChoose(t)}
            className="relative rounded-[18px] border-2 border-border bg-surface p-3.5 text-left transition-all hover:border-brand-400 active:scale-[0.99]"
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
  onStartMatch,
  onCloseStage,
  onNewCampaign,
  onReplay,
}: {
  campaign: Campaign;
  edition: Edition;
  onStartMatch: (opp: Team, kind: MatchKind) => void;
  onCloseStage: () => void;
  onNewCampaign: () => void;
  onReplay: () => void;
}) {
  const camp = campaign;
  const mt = camp.myTeam;
  const steps = campaignProgress(camp);
  const [bracketOpen, setBracketOpen] = useState(false);
  // o botão "Ver chaveamento" só aparece quando a edição tem mata-mata (projeção
  // não-nula). É puro e barato; memoiza por referência da campanha.
  const hasBracket = useMemo(() => projectBracket(camp) != null, [camp]);

  if (!camp.alive) {
    return <CampaignEnd campaign={camp} edition={edition} onNewCampaign={onNewCampaign} onReplay={onReplay} />;
  }

  const stage = camp.stages[camp.stageIdx];
  const st = camp.state;
  const nm = myNextMatch(camp);

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
            <span className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[10.5px] font-extrabold ${progressTone(p.status)}`}>
              {p.label}
            </span>
          </span>
        ))}
      </div>

      {/* ITEM 17: abre a árvore inteira do mata-mata a qualquer momento. */}
      {hasBracket && (
        <button
          type="button"
          onClick={() => setBracketOpen(true)}
          className="mt-2.5 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 text-[13px] font-bold text-ink-700 transition-colors hover:bg-surface"
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
              <span className="flex flex-1 flex-col items-center gap-1 text-center text-[17px] font-black">
                <ManagerCrest slug={mt.s} name={mt.n} size={34} />
                {mt.n}
              </span>
              <span className="text-[12px] font-extrabold opacity-70">VS</span>
              <span className="flex flex-1 flex-col items-center gap-1 text-center text-[17px] font-black">
                <ManagerCrest slug={nm.opp.s} name={nm.opp.n} size={34} />
                {nm.opp.n}
              </span>
            </div>
            <div className="flex items-center justify-center gap-1.5 text-center text-[12px] opacity-90">
              {TIER_LABEL[nm.opp.t]} · <Stars o={nm.opp.o} light />
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
        <Button size="lg" fullWidth className="mt-3.5" onClick={onCloseStage}>
          {closeLabel(camp)}
        </Button>
      )}

      {/* tabela do meu grupo / quadrangular */}
      {(st?.kind === "groups" || st?.kind === "final_group") && (
        <>
          <div className="mt-5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            {st.kind === "final_group"
              ? "Quadrangular final"
              : `Seu grupo${(st as GroupsStageState).isSecond ? " (2ª fase)" : ""}`}
          </div>
          {st.kind === "groups" ? (
            <StandingsTable
              standings={(st as GroupsStageState).standings[(st as GroupsStageState).myG]}
              advance={(st as GroupsStageState).advance}
              myKey={camp.myKey}
            />
          ) : (
            <StandingsTable
              standings={(st as FinalGroupStageState).standings}
              advance={1}
              myKey={camp.myKey}
            />
          )}
        </>
      )}
      {st?.kind === "knockout" && (st as KnockoutStageState).bye && (
        <div className="mt-4 rounded-[14px] border border-border bg-surface p-3.5">
          <b>Você passou direto (bye)</b>
          <div className="text-sm text-ink-600">Sem adversário nesta rodada — avance.</div>
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

      {bracketOpen && (
        <BracketModal campaign={camp} edition={edition} onClose={() => setBracketOpen(false)} />
      )}
    </div>
  );
}

function progressTone(status: string): string {
  if (status === "done") return "bg-grass-100 text-grass-700";
  if (status === "now") return "bg-brand-600 text-white";
  if (status === "out") return "bg-flame-100 text-flame-700";
  return "border border-border bg-surface-2 text-ink-500";
}
function closeLabel(camp: Campaign): string {
  const st = camp.state;
  if (st?.kind === "groups") return "Encerrar a fase de grupos ›";
  if (st?.kind === "final_group") return "Encerrar o quadrangular ›";
  if (st?.kind === "knockout" && (st as KnockoutStageState).bye) return "Avançar (você passou direto) ›";
  if (st?.kind === "knockout") return "Apurar a rodada ›";
  if (st?.kind === "third_place") return "Apurar (você não está no 3º lugar) ›";
  if (st?.kind === "final") return "Apurar a final ›";
  return "Avançar ›";
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
        Quem passou (▲) e quem caiu — composição real da Copa, jogos paralelos pelo modo{" "}
        {camp.worldMode === "real" ? "História Real" : "Mundo Alternativo"}.
      </p>
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
    <div className="flex flex-col">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
        {stageLong(stage)}
      </div>
      <h2 className="mb-0 mt-1.5 text-[22px] font-bold text-ink-950">Tática às cegas</h2>
      <div className="my-1 flex items-center gap-2 font-extrabold text-ink-800">
        <TeamName team={campaign.myTeam} />
        <span className="font-bold text-ink-500">vs</span>
        <TeamName team={opp} />
      </div>
      <p className="mb-2 text-[11.5px] text-ink-600">
        A tática do {opp.n} só será revelada no intervalo. Monte seu plano — as escolhas são todas
        suas.
      </p>

      <div className="mb-1.5 mt-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        Formação
      </div>
      <FormGrid opts={FORM_OPTS} value={myTac.form} onPick={(v) => onMyTac({ ...myTac, form: v })} />
      <SegBlock label="Estilo" opts={ESTILO_OPTS} value={myTac.estilo} onPick={(v) => onMyTac({ ...myTac, estilo: v })} />
      <SegBlock label="Postura" opts={POSTURA_OPTS} value={myTac.postura} onPick={(v) => onMyTac({ ...myTac, postura: v })} />
      <SegBlock label="Marcação" opts={MARC_OPTS} value={myTac.marcacao} onPick={(v) => onMyTac({ ...myTac, marcacao: v })} />
      <PlanSummary tac={myTac} />
      <StyleRing estilo={myTac.estilo} />

      <Button
        size="lg"
        fullWidth
        className="mt-3.5 bg-gold-600 font-bold text-ink-950 hover:bg-gold-700"
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
  onContinue,
}: {
  campaign: Campaign;
  result: {
    gf: number;
    ga: number;
    opp: Team;
    goals?: { side: "A" | "B"; m: number }[];
    stats?: MatchStats;
  };
  kind: MatchKind;
  matchSeed: number;
  onContinue: () => void;
}) {
  const camp = campaign;
  const { gf, ga, opp } = result;
  const stage = camp.stages[camp.stageIdx];
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

  const hint = TACTICAL_HINTS_SUBTLE[(matchSeed >>> 0) % TACTICAL_HINTS_SUBTLE.length];
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
          <div
            className="flex shrink-0 items-center justify-center gap-3 px-1 text-[54px] font-black tabular-nums leading-none text-gold-400"
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
      <div className="text-[20px] font-black text-ink-950">
        {headlineFor(outcome, gf, ga, koInfo, kind)}
      </div>
      <p className="mb-0.5 mt-1 text-sm leading-relaxed text-ink-600">{blurb}</p>
      <div className="my-2.5">
        <span className={`inline-block rounded-md px-2.5 py-1 text-[13px] font-extrabold ${badge.tone}`}>
          {badge.txt}
        </span>
      </div>
      {result.stats && (
        <div className="mt-3">
          <MatchStatsPanel stats={result.stats} myName={camp.myTeam.n} oppName={opp.n} />
        </div>
      )}
      <div className="mt-3 rounded-[14px] border border-border bg-surface p-3.5">
        <div className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
          No banco
        </div>
        <div className="text-sm leading-snug text-ink-700">{hint}</div>
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
      <span
        className="max-w-full truncate rounded-md px-2 py-0.5 text-[12px] font-black uppercase tracking-wide"
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
  const [copied, setCopied] = useState(false);
  // ITEM 17: no fim de campanha, mostra OBRIGATORIAMENTE a árvore inteira do
  // mata-mata preenchida — inclusive os cruzamentos/resultados das IAs simulados
  // até a final depois da minha eliminação, revelando o campeão. Só nas edições
  // com mata-mata (projeção não-nula).
  // fim de campanha: revela a árvore inteira (inclusive a história real além de onde
  // eu parei) — aqui já acabou, então não é spoiler.
  const bracketView = useMemo(() => projectBracket(camp, true), [camp]);

  function copy() {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(shareText).then(
        () => setCopied(true),
        () => setCopied(false),
      );
    }
  }

  return (
    <div className="flex flex-col">
      <div className="h-[2vh]" />
      {champ ? (
        <>
          <div className="text-center text-[52px]">🏆</div>
          <h2 className="mt-1.5 text-center text-[26px] font-bold text-ink-950">CAMPEÃO DO MUNDO!</h2>
        </>
      ) : (
        <>
          <div className="text-center text-[52px]">{camp.eliminated ? "😤" : "🥈"}</div>
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
          {sc.total.toLocaleString("pt-BR")}
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
              ? "Você levantou a taça — a árvore inteira do mata-mata."
              : camp.eliminated
                ? "Como terminou o mata-mata depois que você caiu — até a final."
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
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap rounded-[14px] border border-border bg-surface-2 p-3 text-[12px] text-ink-700">
        {shareText}
      </pre>
      <Button variant="outline" fullWidth className="mt-2.5" onClick={copy}>
        {copied ? "✓ Copiado!" : "📋 Copiar resultado"}
      </Button>
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
  if (sc.pctExtra <= 0) return "Seleção de elite — sem bônus de dificuldade";
  const noun = tier === "D" ? "uma zebra" : tier === "C" ? "um azarão" : "uma seleção sem favoritismo";
  return `+${sc.pctExtra}% por comandar ${noun} (×${sc.mult.toFixed(2)})`;
}
function nearMissMsg(camp: Campaign): string {
  const last = camp.history[camp.history.length - 1];
  if (!last) return "Você caiu cedo, mas o jogo é rejogável.";
  if (last.pens) return "Eliminado nos pênaltis — não dá pra pedir mais coração.";
  if (last.draw) return "Faltou um gol pra virar a chave.";
  return `Perdeu por ${last.ga - last.gf} — dá pra reverter na próxima.`;
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
    `${flagEmoji(camp.myTeam.n)} ${camp.myTeam.n} ${camp.myTeam.y} — ${res}\n` +
    `Pontuação: ${sc.total.toLocaleString("pt-BR")}${sc.pctExtra > 0 ? ` (+${sc.pctExtra}% dificuldade)` : ""}\n\n` +
    path +
    "\n\nVocê não palpita — você comanda. /manager"
  );
}
