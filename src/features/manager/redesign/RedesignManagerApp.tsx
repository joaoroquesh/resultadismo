// Orquestrador do Maneiger reformulado. Mantém o estado de tela e o fluxo:
// Home -> (Quiz) -> (Selecionar Copa) -> Tática às cegas -> Ao vivo (1T) ->
// Vestiário -> Ao vivo (2T) -> Pós-jogo. Determinístico: o adversário e a tática
// dele saem de um seed estável. Reaproveita os dados/escudos/cores do manager no ar.
import { useCallback, useMemo, useRef, useState } from "react";
import type { Team, Edition, WorldMode } from "../types";
import type { Tactic, PresetKey } from "./tactics.ts";
import { DEFAULT_TACTIC, PRESETS, tacticFromPreset } from "./tactics.ts";
import type { MatchState } from "./sim.ts";
import { createMatch, recompute } from "./sim.ts";
import { archetypeBonus } from "./archetypes.ts";
import { teamsForYear, toLite, editionsDesc } from "./data";
import { useManagerArchetype } from "./useManagerArchetype";
import { Home, HowItWorks, type HomeAction } from "./Home";
import { ArchetypeQuiz } from "./ArchetypeQuiz";
import { SelectCopaTeam } from "./SelectCopaTeam";
import { DraftSelection } from "./DraftSelection";
import { TacticPicker, type PickerMode } from "./TacticPicker";
import { LiveMatchView, type LiveResult } from "./LiveMatchView";
import { Halftime } from "./Halftime";
import { PostMatch } from "./PostMatch";
import type { ScoreboardGoal } from "./Scoreboard";
import { ManagerCrest } from "../components";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons";

type Screen = "home" | "quiz" | "draft" | "selectCopa" | "tactic" | "live1" | "halftime" | "live2" | "post";

// PRNG estável (mulberry32) pro adversário/tática dele.
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

// escolhe um adversário plausível: a seleção mais próxima da minha força (excluindo eu).
function pickOpponent(myTeam: Team, year: number, seed: number): Team {
  const pool = teamsForYear(year).filter((t) => t.s !== myTeam.s);
  if (pool.length === 0) return myTeam;
  const sorted = pool
    .map((t) => ({ t, d: Math.abs(t.o - myTeam.o) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, Math.min(6, pool.length));
  const r = rng(seed ^ 0x9e3779b9)();
  return sorted[Math.floor(r * sorted.length)].t;
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

  // contexto da partida
  const [edition, setEdition] = useState<Edition | null>(null);
  const [myTeam, setMyTeam] = useState<Team | null>(null);
  const [oppTeam, setOppTeam] = useState<Team | null>(null);
  const [oppTac, setOppTac] = useState<Tactic>(DEFAULT_TACTIC);
  const [tac, setTac] = useState<Tactic>({ ...DEFAULT_TACTIC });
  const [mode, setMode] = useState<PickerMode>("rapido");
  // mundo da campanha escolhido no sorteio (real / alternativo). Guardado pra futuras
  // fases (pré-jogo/campanha); no jogo único não altera a mecânica da minha partida.
  const [, setWorldMode] = useState<WorldMode>("real");
  const seedRef = useRef<number>((Date.now() ^ 0x1234) >>> 0);

  // resultado ao vivo (placar + estado) pra o pós-jogo e o vestiário
  const [liveScore, setLiveScore] = useState<[number, number]>([0, 0]);
  const [liveGoals, setLiveGoals] = useState<ScoreboardGoal[]>([]);

  // estado do motor é DONO daqui: sobrevive ao Vestiário (tela sobreposta) pra o
  // 1º e o 2º tempo serem a MESMA partida. matchTick força a recriação do <LiveMatchView>
  // só quando começa uma partida nova (apito), nunca entre os tempos.
  const matchStateRef = useRef<MatchState | null>(null);
  const [matchTick, setMatchTick] = useState(0);

  // monta a partida ao escolher a seleção. `world` guarda o mundo da campanha (do sorteio).
  const startMatchWith = useCallback((ed: Edition, team: Team, world: WorldMode = "real") => {
    const seed = (Date.now() ^ (ed.year * 2654435761) ^ team.o) >>> 0;
    seedRef.current = seed;
    setEdition(ed);
    setMyTeam(team);
    setWorldMode(world);
    const opp = pickOpponent(team, ed.year, seed);
    setOppTeam(opp);
    setOppTac(aiTactic(seed));
    setTac({ ...DEFAULT_TACTIC });
    setLiveScore([0, 0]);
    setLiveGoals([]);
    matchStateRef.current = null; // o motor é criado ao apitar (com a tática final)
    setScreen("tactic");
  }, []);

  const onHome = useCallback((a: HomeAction) => {
    if (a === "quiz") setScreen("quiz");
    else if (a === "how") setScreen("how" as Screen);
    else if (a === "selectCopa") setScreen("selectCopa");
    // "Jogar Mata-Mata 2026": abre o sorteio por dificuldade (Sua seleção). Lá dá pra
    // pegar a favorita (o topo da edição, o Brasil quando ele sai) ou a zebra.
    else if (a === "playBrasil") setScreen("draft");
  }, []);

  // ==== captura dos eventos do ao vivo ====
  const goalsFromState = useCallback((st: MatchState): ScoreboardGoal[] => {
    return st.events
      .filter((e) => e.kind === "gol" && (e.side === 0 || e.side === 1))
      .map((e) => ({ side: e.side as 0 | 1, minute: e.minute }));
  }, []);

  const onHalftime = useCallback((st: MatchState) => {
    matchStateRef.current = st; // mesmo objeto que o LiveMatchView dirige
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
    // o estado do motor (matchStateRef) já avançou até o 45 e recebeu o replanejamento
    // do Vestiário. O 2º tempo remonta o LiveMatchView com o MESMO state: ele detecta
    // minute >= 45 e segue de onde parou (sem recriar a partida).
    setScreen("live2");
  }, []);

  // garante o estado do motor criado pra esta partida (chamado ao apitar). Injeta a
  // identidade do treinador no MEU lado (archUnits) via archetypeBonus. A IA fica 0.
  const ensureMatch = useCallback(() => {
    if (!myTeam || !oppTeam) return;
    const archA = archetypeBonus(archetype, tac);
    matchStateRef.current = createMatch(
      toLite(myTeam), toLite(oppTeam), { ...tac }, { ...oppTac }, seedRef.current, { a: archA, b: 0 },
    );
    setMatchTick((n) => n + 1);
  }, [myTeam, oppTeam, tac, oppTac, archetype]);

  // O LiveMatchView recebe o state (dono do orquestrador). matchTick muda só ao apitar.
  const liveView = useMemo(() => {
    if (!myTeam || !oppTeam || !matchStateRef.current) return null;
    return (
      <LiveMatchView
        key={`live-${seedRef.current}-${matchTick}`}
        teamA={myTeam}
        teamB={oppTeam}
        state={matchStateRef.current}
        onPosturaChange={(p) => setTac((t) => ({ ...t, postura: p }))}
        onHalftime={onHalftime}
        onFinish={onFinish}
      />
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTeam, oppTeam, matchTick]);

  // ================================================================ render
  if (screen === "home") {
    return (
      <ScreenFrame>
        <Home onAction={onHome} archetype={archetype} />
      </ScreenFrame>
    );
  }

  if (screen === ("how" as Screen)) {
    return (
      <ScreenFrame>
        <HowItWorks onBack={() => setScreen("home")} onPlay={() => setScreen("draft")} />
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

  // "Sua seleção": sorteio por dificuldade (3 seleções + mundo da campanha).
  if (screen === "draft") {
    return (
      <ScreenFrame>
        {/* "Jogar Mata-Mata 2026": abre direto na edição mais recente (2026); dá pra
            trocar a Copa lá dentro. */}
        <DraftSelection
          initialEdition={editionsDesc()[0] ?? null}
          onPick={(ed, t, world) => startMatchWith(ed, t, world)}
          onBack={() => setScreen("home")}
        />
      </ScreenFrame>
    );
  }

  // "Selecionar Copa": picker manual de edição + seleção (lista completa).
  if (screen === "selectCopa") {
    return (
      <ScreenFrame>
        <SelectCopaTeam onPick={(ed, t) => startMatchWith(ed, t)} onBack={() => setScreen("home")} />
      </ScreenFrame>
    );
  }

  if (screen === "tactic" && myTeam && oppTeam) {
    return (
      <ScreenFrame onBack={() => setScreen("home")}>
        <div className="mb-4">
          <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
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
            // aplica o replanejamento ao estado vivo do motor (formação/estilos/bloco/postura)
            const st = matchStateRef.current;
            if (st) {
              st.tactics[0].form = t.form;
              st.tactics[0].comBola = t.comBola;
              st.tactics[0].semBola = t.semBola;
              st.tactics[0].bloco = t.bloco;
              st.tactics[0].postura = t.postura;
              recompute(st); // a posse-alvo depende do estilo/bloco/postura
            }
          }}
          onResume={resumeSecondHalf}
        />
      </ScreenFrame>
    );
  }

  if (screen === "post" && myTeam && oppTeam) {
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
          onPlayAgain={() => {
            if (edition && myTeam) startMatchWith(edition, myTeam);
          }}
          onHome={() => setScreen("home")}
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
