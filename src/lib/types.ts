import type { Database } from "@/types/database";

type Tables = Database["public"]["Tables"];
type Enums = Database["public"]["Enums"];
type Functions = Database["public"]["Functions"];

export type Profile = Tables["profiles"]["Row"];
export type Competition = Tables["competitions"]["Row"];
export type Team = Tables["teams"]["Row"];
export type Match = Tables["matches"]["Row"];
export type League = Tables["leagues"]["Row"];
export type LeagueMember = Tables["league_members"]["Row"];
export type LeagueCompetition = Tables["league_competitions"]["Row"];
export type Prediction = Tables["predictions"]["Row"];
export type CupTie = Tables["cup_ties"]["Row"];

export type ScoreType = Enums["score_type"];
export type MatchStatus = Enums["match_status"];
export type LeagueStatus = Enums["league_status"];
export type LeagueMode = Enums["league_mode"];
export type MemberRole = Enums["member_role"];
export type MemberStatus = Enums["member_status"];
export type JoinPolicy = Enums["join_policy"];
export type LeagueVisibility = Enums["league_visibility"];
export type DataProvider = Enums["data_provider"];

export type StandingRow = Functions["get_league_standings"]["Returns"][number];

/** Jogo enriquecido com escudos dos times e o palpite do usuário. */
export type MatchWithTeams = Match & {
  home_team: Team | null;
  away_team: Team | null;
  competition?: Pick<Competition, "id" | "name" | "slug" | "emblem_url"> | null;
};

export type MatchWithPrediction = MatchWithTeams & {
  prediction: Prediction | null;
};

export type LeagueWithMembership = League & {
  member_count?: number;
  my_role?: MemberRole | null;
  my_status?: MemberStatus | null;
};

export const SCORE_POINTS: Record<ScoreType, number> = {
  cravada: 3,
  saldo: 2,
  acerto: 1,
  erro: 0,
};

export const SCORE_LABEL: Record<ScoreType, string> = {
  cravada: "Cravada",
  saldo: "Saldo",
  acerto: "Acerto",
  erro: "Erro",
};
