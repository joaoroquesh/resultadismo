// Orquestrador do Maneiger reformulado. Agora e uma CAMPANHA, nao um jogo unico:
// Home -> (Quiz) -> Sorteio (3 selecoes) -> Hub da campanha -> por partida minha:
// Tatica as cegas -> Ao vivo (1T) -> Vestiario -> Ao vivo (2T) -> Pos-jogo -> Hub.
// O motor de campanha (engine.ts, via redesign/campaign.ts) e a fonte da verdade do
// chaveamento; as MINHAS partidas sao jogadas pelo sim do redesign e o placar volta pro
// engine (resolve*/advance). Os jogos que nao sao meus saem do engine (worldMode).
//
// Mata-Mata 2026 = comeca no R32 (16 avos) com a minha selecao como convidada. Copas
// antigas = campanha completa (grupos + mata-mata da estrutura real), pelo MESMO sorteio
// de 3 selecoes. Determinismo preservado (seeds estaveis por campanha/partida).
import { useCallback, useMemo, useRef, useState } from "react";
import type { Team, Edition, WorldMode, Campaign, MatchKind } from "../types";
import type { Tactic, PresetKey } from "./tactics.ts";
import { DEFAULT_TACTIC, PRESETS, tacticFromPreset } from "./tactics.ts";
import type { MatchState } from "./sim.ts";
import { createMatch, recompute } from "./sim.ts";
import { archetypeBonus } from "./archetypes.ts";
import { toLite, editionsDesc } from "./data";
import {
  buildKnockout2026,
  buildFullCampaign,
  applyUserMatch,
  matchSeedFor,
} from "./campaign";
import { useManagerArchetype } from "./useManagerArchetype";
import { Home, HowItWorks, type HomeAction } from "./Home";
import { ArchetypeQuiz } from "./ArchetypeQuiz";
import { DraftSelection } from "./DraftSelection";
import { CampaignHub, CampaignEnd } from "./CampaignHub";
import { TacticPicker, type PickerMode } from "./TacticPicker";
import { LiveMatchView, type LiveResult } from "./LiveMatchView";
import { Halftime } from "./Halftime";
import { PostMatch } from "./PostMatch";
import type { ScoreboardGoal } from "./Scoreboard";
import { ManagerCrest } from "../components";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons";
import { trackProductEvent } from "@/lib/productAnalytics";

// telas do fluxo. "draftBrasil" abre no 2026; "draftCopa" abre no seletor de edicao.
type Screen =
  | "home"
  | "how"
  | "quiz"
  | "draftBrasil"
  | "draftCopa"
  | "campaignHub"
  | "campaignEnd"
  | "tactic"
  | "live1"
  | "halftime"
  | "live2"
  | "post";

// PRNG estável (mulberry32) pra a tática do adversário na partida corrente.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// tática do adversário: escolhe um preset por seed e mexe levemente na postura.
function aiTactic(seed: number): Tactic {
  const keys = Object.keys(PRESETS) as PresetKey[];
  const r = rng(seed ^ 0x85ebca6b);
  const k = keys[Math.floor(r() * keys.length)];
  const base = tacticFromPreset(k);
  const jitter = Math.round((r() - 0.5) * 20); // +-10
  return { ...base, postura: Math.max(10, Math.min(90, base.postura + jitter)) };
}

// casca de tela com voltar/título (Nielsen: status + saída clara).
function ScreenFrame({
  onBack,
  children,
}: {
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-[540px]">
      {onBack && (
        <button type="button" onClick={onBack} className="mb-3 flex items-center gap-1 text-[13px] font-semibold text-ink-600 hover:text-ink-900">
          <ArrowLeftIcon size={16} /> Voltar
        </button>
      )}
      {children}
    </div>
  );
}

export function RedesignManagerApp() {
  const [screen, setScreen] = useState<Screen>("home");
  // identidade de treinador persistida (localStorage + Supabase quando logado).
  const { archetype, setArchetype } = useManagerArchetype();

  // ---- estado da CAMPANHA ----
  // o engine MUTA o objeto da campanha em lugar (campRef); `camp` e a copia render-safe
  // publicada por commit() (nova referencia => re-render). O render le de `camp`.
  const campRef = useRef<Campaign | null>(null);
  const [camp, setCamp] = useState<Campaign | null>(null);
  const [edition, setEdition] = useState<Edition | null>(null);

  // ---- contexto da partida MINHA corrente ----
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [oppTeam, setOppTeam] = useState<Team | null>(null);
  const [matchKind, setMatchKind] = useState<MatchKind>("knockout");
  const [oppTac, setOppTac] = useState<Tactic>(DEFAULT_TACTIC);
  const [tac, setTac] = useState<Tactic>({ ...DEFAULT_TACTIC });
  const [mode, setMode] = useState<PickerMode>("rapido");
  const matchSeedRef = useRef<number>(0);

  // resultado ao vivo (placar + estado) pro pós-jogo e o vestiário
  const [liveScore, setLiveScore] = useState<[number, number]>([0, 0]);
  const [liveGoals, setLiveGoals] = useState<ScoreboardGoal[]>([]);

  // estado do motor de PARTIDA (sim do redesign) - dono do orquestrador: sobrevive ao
  // Vestiário. Guardado em ref (pra mutacao em lugar no intervalo) E espelhado em state
  // (mesmo objeto) pra o render nunca ler .current durante o render. matchState so troca
  // de referencia ao apitar uma partida nova (nunca entre os tempos).
  const matchStateRef = useRef<MatchState | null>(null);
  const [matchState, setMatchState] = useState<MatchState | null>(null);

  // publica a campanha mutada como NOVA referência (dispara re-render).
  const commitCampaign = useCallback(() => {
    setCamp(campRef.current ? { ...campRef.current } : null);
  }, []);

  // ---- monta a campanha ao escolher a seleção no sorteio ----
  const startCampaign = useCallback((ed: Edition, team: Team, world: WorldMode = "real") => {
    const seed = (Date.now() ^ (ed.year * 2654435761) ^ team.o) >>> 0;
    // 2026 = mata-mata direto no R32 (convidada). Demais edicoes = campanha completa.
    const isKnockout2026 = ed.year === 2026;
    const built = isKnockout2026
      ? buildKnockout2026(ed, team, seed, world)
      : buildFullCampaign(ed, team, seed, world);
    campRef.current = built;
    setEdition(ed);
    setCamp({ ...built });
    setScreen(built.alive ? "campaignHub" : "campaignEnd");
  }, []);

  const onHome = useCallback((a: HomeAction) => {
    if (a === "quiz") setScreen("quiz");
    else if (a === "how") setScreen("how");
    else if (a === "selectCopa") setScreen("draftCopa");
    // "Jogar Mata-Mata 2026": abre o sorteio direto na edicao 2026.
    else if (a === "playBrasil") setScreen("draftBrasil");
  }, []);

  // ---- inicia uma partida MINHA a partir do hub (monta o contexto e vai pra tatica) ----
  const startMatch = useCallback((opp: Team, kind: MatchKind) => {
    const c = campRef.current;
    if (!c) return;
    const seed = matchSeedFor(c, opp);
    matchSeedRef.current = seed;
    setMyTeam(c.myTeam);
    setOppTeam(opp);
    setMatchKind(kind);
    setOppTac(aiTactic(seed));
    setTac({ ...DEFAULT_TACTIC });
    setLiveScore([0, 0]);
    setLiveGoals([]);
    matchStateRef.current = null; // criado ao apitar (com a tatica final)
    setScreen("tactic");
  }, []);

  // ==== captura dos eventos do ao vivo ====
  const goalsFromState = useCallback((st: MatchState): ScoreboardGoal[] => {
    return st.events
      .filter((e) => e.kind === "gol" && (e.side === 0 || e.side === 1))
      .map((e) => ({ side: e.side as 0 | 1, minute: e.minute }));
  }, []);

  const onHalftime = useCallback((st: MatchState) => {
    matchStateRef.current = st;
    setLiveScore([st.score[0], st.score[1]]);
    setLiveGoals(goalsFromState(st));
    setScreen("halftime");
  }, [goalsFromState]);

  const onFinish = useCallback((res: LiveResult) => {
    setLiveScore(res.score);
    setLiveGoals(goalsFromState(res.state));
    setScreen("post");
  }, [goalsFromState]);

  const resumeSecondHalf = useCallback(() => {
    setScreen("live2");
  }, []);

  // cria o estado do motor de partida (ao apitar). Injeta a identidade do treinador no
  // MEU lado (archUnits); a IA fica 0.
  const ensureMatch = useCallback(() => {
    if (!myTeam || !oppTeam) return;
    const archA = archetypeBonus(archetype, tac);
    const st = createMatch(
      toLite(myTeam), toLite(oppTeam), { ...tac }, { ...oppTac }, matchSeedRef.current, { a: archA, b: 0 },
    );
    matchStateRef.current = st; // mesma referencia no ref (mutada no intervalo) e no state
    setMatchState(st);
  }, [myTeam, oppTeam, tac, oppTac, archetype]);

  // aplica o placar da minha partida na campanha e volta pro hub (ou fim de campanha).
  const finishCampaignMatch = useCallback(() => {
    const c = campRef.current;
    if (!c) {
      setScreen("home");
      return;
    }
    void trackProductEvent({
      product: "manager",
      route: "/manager/partida",
      eventType: "manager_match_complete",
      meta: {
        edition: edition?.year,
        kind: matchKind,
        my_team: myTeam?.s ?? myTeam?.n,
        opponent: oppTeam?.s ?? oppTeam?.n,
        goals_for: liveScore[0],
        goals_against: liveScore[1],
      },
    }).catch(() => {});
    applyUserMatch(c, liveScore[0], liveScore[1], matchSeedRef.current);
    commitCampaign();
    setScreen(c.alive ? "campaignHub" : "campaignEnd");
  }, [commitCampaign, edition?.year, liveScore, matchKind, myTeam, oppTeam]);

  // O LiveMatchView recebe o state (dono do orquestrador). matchState (mesma referencia
  // do ref) so troca ao apitar; entre os tempos e o MESMO objeto (mutado no intervalo),
  // entao a key nao muda e a partida nao e recriada.
  const liveView = useMemo(() => {
    if (!myTeam || !oppTeam || !matchState) return null;
    return (
      <LiveMatchView
        key={`live-${matchState.seed}`}
        teamA={myTeam}
        teamB={oppTeam}
        state={matchState}
        onPosturaChange={(p) => setTac((t) => ({ ...t, postura: p }))}
        onHalftime={onHalftime}
        onFinish={onFinish}
      />
    );
  }, [myTeam, oppTeam, matchState, onHalftime, onFinish]);

  // ================================================================ render
  if (screen === "home") {
    return (
      <ScreenFrame>
        <Home onAction={onHome} archetype={archetype} />
      </ScreenFrame>
    );
  }

  if (screen === "how") {
    return (
      <ScreenFrame>
        <HowItWorks onBack={() => setScreen("home")} onPlay={() => setScreen("draftBrasil")} />
      </ScreenFrame>
    );
  }

  if (screen === "quiz") {
    return (
      <ScreenFrame>
        <ArchetypeQuiz
          onDone={(k) => {
            setArchetype(k);
            setScreen("home");
          }}
          onSkip={() => setScreen("home")}
          onBack={() => setScreen("home")}
        />
      </ScreenFrame>
    );
  }

  // "Jogar Mata-Mata 2026": sorteio de 3 seleções direto na edição 2026.
  if (screen === "draftBrasil") {
    return (
      <ScreenFrame>
        <DraftSelection
          initialEdition={editionsDesc()[0] ?? null}
          onPick={(ed, t, world) => startCampaign(ed, t, world)}
          onBack={() => setScreen("home")}
        />
      </ScreenFrame>
    );
  }

  // "Selecionar Copa": MESMO sorteio de 3, mas comeca no seletor de edicao (sem lista
  // livre de selecao). Escolhida a edicao, o sorteio de 3 seleciona a sua selecao.
  if (screen === "draftCopa") {
    return (
      <ScreenFrame>
        <DraftSelection
          initialEdition={null}
          onPick={(ed, t, world) => startCampaign(ed, t, world)}
          onBack={() => setScreen("home")}
        />
      </ScreenFrame>
    );
  }

  if (screen === "campaignHub" && camp && edition) {
    return (
      <ScreenFrame>
        <CampaignHub
          campaign={camp}
          edition={edition}
          onPlay={(opp, kind) => startMatch(opp, kind)}
          onHome={() => setScreen("home")}
        />
      </ScreenFrame>
    );
  }

  if (screen === "campaignEnd" && camp && edition) {
    return (
      <ScreenFrame>
        <CampaignEnd
          campaign={camp}
          edition={edition}
          onHome={() => setScreen("home")}
          onReplay={() => setScreen("draftBrasil")}
        />
      </ScreenFrame>
    );
  }

  if (screen === "tactic" && myTeam && oppTeam) {
    return (
      <ScreenFrame onBack={() => setScreen("campaignHub")}>
        <div className="mb-4">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
            Tática às cegas
          </div>
          <div className="mt-2 flex items-center gap-2.5 rounded-[14px] border border-border bg-surface px-3.5 py-2.5">
            <ManagerCrest slug={myTeam.s} name={myTeam.n} size={30} />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-bold text-ink-900">{myTeam.n}</div>
              <div className="text-[11.5px] text-ink-500">
                Copa de {edition?.year}. Monte o plano antes de conhecer o adversário.
              </div>
            </div>
          </div>
        </div>
        <TacticPicker tac={tac} onChange={setTac} mode={mode} onModeChange={setMode} blind archetype={archetype} />
        <button
          type="button"
          onClick={() => {
            ensureMatch(); // cria o motor com a tática final desta partida
            setScreen("live1");
          }}
          className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 text-[15px] font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98]"
        >
          Apitar o jogo
          <ArrowRightIcon size={16} />
        </button>
      </ScreenFrame>
    );
  }

  if ((screen === "live1" || screen === "live2") && myTeam && oppTeam) {
    return <div className="mx-auto w-full max-w-[540px] lg:max-w-[920px]">{liveView}</div>;
  }

  if (screen === "halftime" && myTeam && oppTeam) {
    return (
      <ScreenFrame>
        <Halftime
          myTeam={myTeam}
          oppTeam={oppTeam}
          score={liveScore}
          tac={tac}
          oppTac={oppTac}
          mode={mode}
          onModeChange={setMode}
          archetype={archetype}
          onChange={(t) => {
            setTac(t);
            const st = matchStateRef.current;
            if (st) {
              st.tactics[0].form = t.form;
              st.tactics[0].comBola = t.comBola;
              st.tactics[0].semBola = t.semBola;
              st.tactics[0].bloco = t.bloco;
              st.tactics[0].postura = t.postura;
              recompute(st);
            }
          }}
          onResume={resumeSecondHalf}
        />
      </ScreenFrame>
    );
  }

  if (screen === "post" && myTeam && oppTeam) {
    // rótulos do pós-jogo conforme a fase (mata-mata mostra "avançar", grupo mostra
    // "continuar campanha"). Botao primario aplica o placar na campanha.
    const isKO = matchKind === "knockout" || matchKind === "final" || matchKind === "third_place";
    return (
      <ScreenFrame>
        <PostMatch
          myTeam={myTeam}
          oppTeam={oppTeam}
          score={liveScore}
          goals={liveGoals}
          tac={tac}
          oppTac={oppTac}
          archetype={archetype}
          continueLabel={isKO ? "Avançar na Copa" : "Continuar campanha"}
          onPlayAgain={finishCampaignMatch}
          onHome={finishCampaignMatch}
        />
      </ScreenFrame>
    );
  }

  // fallback defensivo
  return (
    <ScreenFrame>
      <Home onAction={onHome} archetype={archetype} />
    </ScreenFrame>
  );
}
