import type { ScoreType } from "@/lib/types";

/**
 * Tipo de pontuação de um palpite contra um placar (regra 3/2/1 do banco,
 * espelhada no cliente p/ a PRÉVIA ao vivo — a oficial continua no banco).
 */
export function provisionalScoreType(
  homePred: number,
  awayPred: number,
  homeScore: number,
  awayScore: number,
): ScoreType {
  if (homePred === homeScore && awayPred === awayScore) return "cravada";
  if (homePred - awayPred === homeScore - awayScore) return "saldo";
  if (Math.sign(homePred - awayPred) === Math.sign(homeScore - awayScore)) return "acerto";
  return "erro";
}

/** Pontos-base de um tipo (3/2/1/0, sem joker) — espelha score_points do banco.
 * Usado na prévia ao vivo (ex.: "Neste dia" somando jogos em andamento). */
const PROVISIONAL_POINTS: Record<ScoreType, number> = { cravada: 3, saldo: 2, acerto: 1, erro: 0 };
export function provisionalPoints(t: ScoreType): number {
  return PROVISIONAL_POINTS[t];
}
