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
