// Motor do simulador de confrontos (Liga e Copa). Puro: sem DB, sem React.
// Reutilizável pelo preview (admin avalia antes de iniciar) e, no futuro, pela
// geração real de fixtures. Liga e Copa são competições separadas.

export type ConfrontoMode = "liga" | "copa";
export type Granularidade = "diario" | "semanal" | "bloco";

export const MIN_JOGADORES = 4;
export const MAX_JOGADORES = 30;

// Rodadas que a Copa do Mundo 2026 oferece por granularidade (estimativa; o app
// usará o calendário real sincronizado). ~6 semanas · ~8 blocos (3 de grupos + 5 de mata-mata).
export const RODADAS_COPA: Record<Granularidade, number> = {
  diario: 24,
  bloco: 8,
  semanal: 6,
};

export const GRANULARIDADE_LABEL: Record<Granularidade, string> = {
  diario: "Diário",
  bloco: "Por rodada/fase",
  semanal: "Semanal",
};

export const JOGOS_POR_RODADA: Record<Granularidade, string> = {
  diario: "~3 a 4 jogos",
  bloco: "~12 a 16 jogos",
  semanal: "~15 a 18 jogos",
};

export interface Pairing {
  a: number;
  b: number | null; // null = folga (bye)
}

export interface SimRound {
  label: string;
  tipo: "liga" | "mata-mata";
  pairings: Pairing[]; // vazio quando estrutural (suíço/mata-mata)
}

export interface SimResult {
  mode: ConfrontoMode;
  jogadores: number;
  formato: "Pontos corridos" | "Sistema suíço" | "Mata-mata";
  rodadasNecessarias: number;
  rodadasDisponiveis: number;
  viavel: boolean;
  aviso: string | null;
  bracket?: number; // tamanho do chaveamento (copa)
  byes?: number;
  rounds: SimRound[];
}

function clampPlayers(n: number): number {
  return Math.max(MIN_JOGADORES, Math.min(MAX_JOGADORES, Math.floor(n || 0)));
}

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/** Round-robin completo pelo método do círculo (folga p/ nº ímpar). */
export function roundRobin(n: number): Pairing[][] {
  const order = Array.from({ length: n }, (_, i) => i);
  if (order.length % 2 === 1) order.push(-1); // -1 = folga
  const m = order.length;
  const rounds: Pairing[][] = [];
  for (let r = 0; r < m - 1; r++) {
    const pairings: Pairing[] = [];
    for (let i = 0; i < m / 2; i++) {
      const a = order[i]!;
      const b = order[m - 1 - i]!;
      if (a === -1 || b === -1) pairings.push({ a: a === -1 ? b : a, b: null });
      else pairings.push({ a, b });
    }
    rounds.push(pairings);
    // rotaciona mantendo o primeiro fixo
    const fixed = order[0]!;
    const rest = order.slice(1);
    rest.unshift(rest.pop()!);
    order.splice(0, order.length, fixed, ...rest);
  }
  return rounds;
}

/** Rodadas suíças suficientes para ranquear, limitadas pela janela. */
function suicoRounds(n: number, max: number): number {
  return Math.min(max, Math.max(3, Math.ceil(Math.log2(n)) + 1));
}

function bracketLabels(bracket: number): string[] {
  const nomeFase: Record<number, string> = {
    2: "Final",
    4: "Semifinais",
    8: "Quartas de final",
    16: "Oitavas de final",
    32: "Fase de 32",
  };
  const labels: string[] = [];
  for (let size = bracket; size >= 2; size /= 2) {
    labels.push(nomeFase[size] ?? `Rodada de ${size}`);
  }
  return labels;
}

/** Simula a estrutura de uma disputa de confronto (Liga ou Copa). */
export function simulate(
  mode: ConfrontoMode,
  jogadores: number,
  granularidade: Granularidade,
): SimResult {
  const n = clampPlayers(jogadores);
  const rodadasDisponiveis = RODADAS_COPA[granularidade];

  if (mode === "copa") {
    const bracket = nextPow2(n);
    const rodadasNecessarias = Math.round(Math.log2(bracket));
    const byes = bracket - n;
    const viavel = rodadasNecessarias <= rodadasDisponiveis;
    return {
      mode,
      jogadores: n,
      formato: "Mata-mata",
      rodadasNecessarias,
      rodadasDisponiveis,
      viavel,
      aviso: viavel
        ? null
        : `Precisa de ${rodadasNecessarias} rodadas e a janela só tem ${rodadasDisponiveis}. Escolha uma granularidade mais fina.`,
      bracket,
      byes,
      rounds: bracketLabels(bracket).map((label) => ({ label, tipo: "mata-mata", pairings: [] })),
    };
  }

  // Liga: round-robin completo se couber; senão, suíço.
  const rodadasCheio = n - 1;
  if (rodadasCheio <= rodadasDisponiveis) {
    return {
      mode,
      jogadores: n,
      formato: "Pontos corridos",
      rodadasNecessarias: rodadasCheio,
      rodadasDisponiveis,
      viavel: true,
      aviso: null,
      rounds: roundRobin(n).map((pairings, i) => ({
        label: `Rodada ${i + 1}`,
        tipo: "liga",
        pairings,
      })),
    };
  }

  const r = suicoRounds(n, rodadasDisponiveis);
  return {
    mode,
    jogadores: n,
    formato: "Sistema suíço",
    rodadasNecessarias: r,
    rodadasDisponiveis,
    viavel: true,
    aviso: `Todos contra todos exigiria ${rodadasCheio} rodadas e não cabe na Copa; o sistema suíço (${r} rodadas) ranqueia todos os jogadores.`,
    rounds: Array.from({ length: r }, (_, i) => ({
      label: `Rodada ${i + 1}`,
      tipo: "liga" as const,
      pairings: [],
    })),
  };
}
