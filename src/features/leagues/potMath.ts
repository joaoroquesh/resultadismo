// Gestão do Bolão: matemática PURA do rateio (ADR 0008). O app não movimenta
// dinheiro — só calcula a divisão combinada pelo grupo. Regras cravadas pra não
// dar briga: cada prêmio arredonda PRA BAIXO (centavos); a sobra (arredondamento
// + % não usados + colocações sem pagante) fica no caixa do grupo.

export type PotSplit = { 1: number; 2: number; 3: number };

export type PotPrize = { rank: 1 | 2 | 3; pct: number; cents: number };

export function computePot(
  entryCents: number | null | undefined,
  payersCount: number,
  split: Partial<PotSplit> | null | undefined,
): { totalCents: number; prizes: PotPrize[]; leftoverCents: number } {
  const entry = entryCents && entryCents > 0 ? entryCents : 0;
  const totalCents = entry * Math.max(0, payersCount);
  const prizes: PotPrize[] = ([1, 2, 3] as const)
    .map((rank) => {
      const pct = Math.max(0, Math.min(100, Number(split?.[rank] ?? 0)));
      // colocação sem pagante suficiente não premia (2 pagantes → sem 3º)
      const eligible = payersCount >= rank;
      const cents = eligible ? Math.floor((totalCents * pct) / 100) : 0;
      return { rank, pct, cents };
    })
    .filter((p) => p.pct > 0);
  const paid = prizes.reduce((s, p) => s + p.cents, 0);
  return { totalCents, prizes, leftoverCents: totalCents - paid };
}

/** Soma dos percentuais informados (pra validar <= 100 na UI). */
export function splitTotal(split: Partial<PotSplit> | null | undefined): number {
  return ([1, 2, 3] as const).reduce(
    (s, r) => s + Math.max(0, Number(split?.[r] ?? 0)),
    0,
  );
}

/** Quem leva o quê: cruza a classificação (rank oficial, com desempate do app)
 * com o conjunto de pagantes — o prêmio é disputado SÓ entre pagantes. */
export function prizeByUser(
  standings: { user_id: string; rank: number }[],
  payers: Set<string>,
  prizes: PotPrize[],
): Map<string, number> {
  const out = new Map<string, number>();
  const payersRanked = standings
    .filter((r) => payers.has(r.user_id))
    .sort((a, b) => a.rank - b.rank);
  prizes.forEach((p) => {
    const winner = payersRanked[p.rank - 1];
    if (winner && p.cents > 0) out.set(winner.user_id, p.cents);
  });
  return out;
}
