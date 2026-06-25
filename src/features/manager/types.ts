// Resultadismo Manager — tipos do mini-jogo (porte do protótipo v4).
// Slice 100% client-side: motor determinístico no cliente, sem backend nesta fase.

// ---- Dados estáticos ----
export type Tier = "S" | "A" | "B" | "C" | "D";

// uma seleção numa edição (vem de data/ratings.json)
export interface Team {
  y: number; // ano da edição
  s: string; // slug
  n: string; // nome exibido
  a: number; // ataque
  m: number; // meio
  d: number; // defesa
  o: number; // força base (overall)
  t: Tier; // tier
  h: string; // sede
}

export type StageType =
  | "groups"
  | "second_groups"
  | "final_group"
  | "knockout"
  | "second_round_knockout"
  | "third_place"
  | "final";

export type KnockoutRound = "R32" | "R16" | "QF" | "SF";

export interface Stage {
  type: StageType;
  groups?: number;
  size?: number;
  sizes?: number[];
  advance?: number;
  best_thirds?: number;
  round?: KnockoutRound;
}

export interface Edition {
  year: number;
  host: string;
  teams: number;
  champion_real: string | null;
  stages: Stage[];
  notes?: string;
}

export interface WcGroup {
  name: string;
  teams: string[];
}
export interface WcGroupsEdition {
  year: number;
  stage_drawn: string;
  groups: WcGroup[];
  seeding_rules?: string;
}

// ---- Tática (eixos manuais do jogador / da IA) ----
export type Form = "433" | "442" | "352" | "4231" | "532" | "4312" | "343" | "424";
export type Estilo = "passes" | "meio" | "lados" | "longas" | "contra";
export type Postura = "all_in" | "atk" | "eq" | "def" | "retranca";
export type Marcacao = "alta" | "media" | "baixa";

export interface Tactic {
  form: Form;
  estilo: Estilo;
  postura: Postura;
  marcacao: Marcacao;
}

// ---- Motor ----
export type CommandType = "press" | "recuo";
export type CommandQuality = "good" | "ok" | "bad";

export interface CmdState {
  type: CommandType | null;
  quality: CommandQuality;
  startedMin: number;
  untilMin: number;
  cooldownUntilMin: number;
}

export interface SideStrength {
  off: number;
  ft: number;
  defEff: number;
  convMod: number;
  ritmo: number;
  fadiga2T: number;
  rivalConvVsMe: number;
  postureIsOff: boolean;
  markIsHigh: boolean;
  netEdge: number;
  formEdge: number;
  tacticEdge: number;
  possSwing: number;
}

// um lance resolvido pelo motor num minuto
export type ChanceKind = "goal" | "quase" | "defesa" | "fora" | "bloqueio";
export interface MatchEvent {
  goal: boolean;
  team: string;
  ownerSide: "A" | "B";
  kind: ChanceKind;
  m: number;
}

export interface MatchState {
  rnd: () => number;
  seed: number;
  teamA: Team;
  teamB: Team;
  tacA: Tactic;
  tacB: Tactic;
  SA: SideStrength;
  SB: SideStrength;
  shareA: number;
  gameVol: number;
  convVol: number;
  openStruct: number;
  gA: number;
  gB: number;
  minute: number;
  half: number;
  cmdA: CmdState;
  cmdB: CmdState;
  lastOwner: "A" | "B" | null;
  finished: boolean;
  events: MatchEvent[];
  schedule: number[];
}

// ITEM 12: painel de estatísticas pós-jogo. Derivado DETERMINISTICAMENTE dos eventos
// + forças (deriveMatchStats), não é um novo sistema de simulação — é uma "leitura"
// plausível e coerente da partida (quem teve a bola finaliza mais; quem goleou não
// aparece com 30% de posse). Um lado por campo, pares {a,b}.
export interface MatchStats {
  poss: { a: number; b: number }; // posse de bola (%) — soma 100
  fin: { a: number; b: number }; // finalizações totais
  sot: { a: number; b: number }; // chutes ao gol (no alvo)
  passes: { a: number; b: number }; // passes tentados
  passAcc: { a: number; b: number }; // precisão de passe (%)
  fouls: { a: number; b: number }; // faltas cometidas
  tackles: { a: number; b: number }; // desarmes
}

export interface StepResult {
  minute: number;
  half: number;
  events: MatchEvent[];
  score: { a: number; b: number };
  halftime: boolean;
  finished: boolean;
}

export interface CommandResult {
  ok: boolean;
  quality: CommandQuality;
  poss: number;
  hint: string;
  cooldownUntilMin: number;
  untilMin: number;
}

export interface PossessionState {
  poss: number;
  withBall: boolean;
  without: boolean;
}

export type WorldMode = "real" | "alt";
export type MatchKind = "groups" | "final_group" | "knockout" | "third_place" | "final";

// ---- Campanha (estado do torneio) ----
export interface Standing {
  team: Team;
  P: number;
  J: number;
  V: number;
  E: number;
  D: number;
  GP: number;
  GC: number;
  SG: number;
}

export interface HistoryEntry {
  stage: string;
  opp: Team;
  gf: number;
  ga: number;
  pens: string | null;
  win: boolean;
  draw: boolean;
  ptsLabel: string;
  ko?: boolean;
}

export interface KnockoutOutcome {
  winner: "A" | "B";
  pens: string | null;
}

// ITEM 10: disputa de pênaltis cobrança a cobrança. Cada chute é determinístico
// (semeado por matchSeed), e o vencedor EMERGE das cobranças — a string `pens` passa
// a ser a contagem real, eliminando a incoerência placar≠vencedor do sorteio antigo.
export type PenResult = "gol" | "defesa" | "trave" | "fora";
export interface PenKick {
  side: "A" | "B";
  index: number; // ordem da cobrança do time (1..N)
  result: PenResult;
  scoreA: number; // placar acumulado da disputa após a cobrança
  scoreB: number;
}
export interface Shootout {
  kicks: PenKick[];
  winner: "A" | "B";
  scoreA: number; // total convertido
  scoreB: number;
  pens: string; // "5×4" coerente com o total real
}

// estado do estágio corrente — união discriminada por `kind`
export interface GroupsStageState {
  kind: "groups";
  isSecond: boolean;
  stage: Stage;
  groups: Team[][];
  myG: number;
  myGroupTeams: Team[];
  standings: Standing[][];
  myOpps: Team[];
  myMatchIdx: number;
  advance: number;
  bestThirds: number;
  done: boolean;
  // item 1: pares IA×IA já apurados, por "gIdx:i:j" (i<j índices no grupo). Garante
  // idempotência — a tabela avança rodada a rodada sem dupla contagem no fim.
  playedPairs?: string[];
  sortedStandings?: Standing[][];
  qualified?: Team[];
  myAdvanced?: boolean;
}
export interface FinalGroupStageState {
  kind: "final_group";
  stage: Stage;
  teams: Team[];
  standings: Standing[];
  myOpps: Team[];
  myMatchIdx: number;
  done: boolean;
  sorted?: Standing[];
  champ?: Team;
  myPlace?: number;
}
export interface KnockoutStageState {
  kind: "knockout";
  stage: Stage;
  pairs: (Team | null)[][];
  myPair: number;
  myOpp: Team | null;
  done: boolean;
  bye?: boolean;
  myResult?: { win: boolean; gf: number; ga: number; pens: string | null };
  winners?: Team[];
}
export interface ThirdPlaceStageState {
  kind: "third_place";
  stage: Stage;
  contenders: Team[];
  iAmIn: boolean;
  myOpp: Team | null;
  done: boolean;
}
export interface FinalStageState {
  kind: "final";
  stage: Stage;
  finalists: Team[];
  iAmIn: boolean;
  myOpp: Team | null;
  done: boolean;
}
export type StageState =
  | GroupsStageState
  | FinalGroupStageState
  | KnockoutStageState
  | ThirdPlaceStageState
  | FinalStageState;

// BUG 1.2 — confronto de mata-mata REALMENTE jogado na campanha (não recalculado).
// Persiste pares + placares + vencedor de cada rodada eliminatória conforme ela é
// fechada, pra projectBracket derivar a árvore ESTRITAMENTE do histórico da campanha
// (sem cálculo paralelo) e revelar rodada por rodada (fases futuras ficam ocultas).
export interface KoSlotRecord {
  slug: string | null; // null = vaga vazia (bye)
  score: number | null; // gols no confronto (null se bye/não jogado)
}
export interface KoMatchRecord {
  a: KoSlotRecord;
  b: KoSlotRecord;
  winnerSide: "A" | "B" | null; // lado que avançou (null se bye/indefinido)
  pens: string | null; // "5×4" se decidiu nos pênaltis
  bye: boolean;
  mine: boolean; // este foi o MEU confronto (placar real do meu jogo)
}
export interface KoRoundRecord {
  round: KnockoutRound | "FINAL" | "THIRD";
  matches: KoMatchRecord[];
}

export interface Campaign {
  edition: Edition;
  seed: number;
  myKey: string;
  myTeam: Team;
  stages: Stage[];
  threePts: boolean;
  stageIdx: number;
  state: StageState | null;
  alive: boolean;
  eliminated: boolean;
  champion: boolean;
  finishedAt: string | null;
  placement: string | null;
  history: HistoryEntry[];
  pool: Team[];
  rnd: () => number;
  worldMode: WorldMode;
  // campos derivados ao longo do fluxo
  carryTeams?: Team[] | null;
  sfLosers?: Team[];
  thirdPlaceTeams?: Team[];
  finalists?: Team[];
  skipThird?: boolean;
  pendingAdvance?: boolean;
  // BUG 1.2: rodadas de mata-mata FECHADAS na campanha, em ordem. A fonte única de
  // verdade do chaveamento — projectBracket lê isto, não recalcula nada.
  koRounds?: KoRoundRecord[];
}

export interface CampaignScore {
  base: number;
  mult: number;
  total: number;
  pctExtra: number;
  rank: number;
  wins: number;
  draws: number;
}

// ITEM 17: visualização do chaveamento (árvore do mata-mata). projectBracket()
// reúne os confrontos REAIS já jogados por mim + simula os IA×IA restantes (mesma
// sementagem determinística de finishKnockoutStage), preenchendo a árvore inteira
// até a final mesmo após a eliminação — e revelando o campeão. Tudo puro.
export interface BracketSlot {
  team: Team | null; // null = bye / vaga ainda não definida
  score: number | null; // gols no confronto (null se bye ou não jogado)
  pens: string | null; // string de pênaltis ("5×4") se decidiu nos pênaltis
  winner: boolean; // venceu o confronto e avança
  isMe: boolean; // é o time que eu comando
  champion: boolean; // marca o campeão na coluna final
}
export interface BracketMatch {
  a: BracketSlot;
  b: BracketSlot;
  bye: boolean; // confronto com uma vaga vazia (passou direto)
  mine: boolean; // este é o MEU confronto nesta rodada
  real: boolean; // resultado veio do meu jogo real (não de simulação)
  pens: string | null; // pênaltis do confronto, se houve
}
export interface BracketRound {
  label: string; // "Oitavas", "Quartas", "Semis", "3º lugar", "Final"…
  short: string;
  round: KnockoutRound | "FINAL" | "THIRD";
  matches: BracketMatch[];
}
export interface BracketView {
  rounds: BracketRound[];
  champion: Team | null;
  myExitRound: number | null; // índice da rodada onde eu fui eliminado (se foi)
  iAmChampion: boolean;
}

export interface ProgressStep {
  label: string;
  status: "todo" | "done" | "now" | "out";
  type: StageType;
}
