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

export interface ProgressStep {
  label: string;
  status: "todo" | "done" | "now" | "out";
  type: StageType;
}
