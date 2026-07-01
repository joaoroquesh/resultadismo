// Sorteio da "Sua seleção" (TASK 3). Puxa 3 seleções de uma Copa como níveis de
// dificuldade, a partir dos tiers reais das seleções (S/A/B/C/D) do engine no ar:
//   1) Favorita  -> tier S ou A
//   2) Média     -> tier B
//   3) Zebra     -> tier C ou D
// Se algum tier estiver vazio naquela edição, cai no fallback por TERÇOS do pool
// ordenado por overall (favorita = topo, média = meio, zebra = base). Determinístico
// via rngFrom(seed) do engine, então o mesmo seed reproduz o mesmo sorteio.
import type { Team, Tier } from "../types";
import { poolForYear, shuffle, rngFrom } from "../engine";

export type DraftLevel = "favorita" | "media" | "zebra";

export interface DraftPick {
  level: DraftLevel;
  team: Team;
}

// rótulo leigo de cada nível de dificuldade (não é o TIER_LABEL do engine).
export const DRAFT_LEVEL_LABEL: Record<DraftLevel, string> = {
  favorita: "Favorita",
  media: "Média",
  zebra: "Zebra",
};
export const DRAFT_LEVEL_HINT: Record<DraftLevel, string> = {
  favorita: "Peso pra ganhar. A pressão é toda sua.",
  media: "Briga de igual. Depende do seu comando.",
  zebra: "Ninguém aposta. Ir longe vira lenda.",
};

const FAVORITA_TIERS: Tier[] = ["S", "A"];
const MEDIA_TIERS: Tier[] = ["B"];
const ZEBRA_TIERS: Tier[] = ["C", "D"];

// escolhe 1 seleção de um conjunto de tiers, evitando as já usadas. Retorna null se
// não houver nenhuma disponível (tier vazio na edição) -> aciona o fallback.
function pickFromTiers(pool: Team[], tiers: Tier[], used: Set<string>, rnd: () => number): Team | null {
  const cand = pool.filter((t) => tiers.includes(t.t) && !used.has(t.s));
  if (cand.length === 0) return null;
  return shuffle(cand, rnd)[0];
}

// fallback por TERÇOS: divide o pool ordenado por overall (desc) em 3 faixas e sorteia
// uma seleção da faixa do nível pedido, evitando repetição. Sempre devolve algo se o
// pool tiver seleções suficientes.
function pickFromThird(pool: Team[], level: DraftLevel, used: Set<string>, rnd: () => number): Team | null {
  const sorted = pool.slice().sort((a, b) => b.o - a.o); // topo = mais forte
  const n = sorted.length;
  if (n === 0) return null;
  const cut1 = Math.ceil(n / 3);
  const cut2 = Math.ceil((2 * n) / 3);
  const band =
    level === "favorita" ? sorted.slice(0, cut1) : level === "media" ? sorted.slice(cut1, cut2) : sorted.slice(cut2);
  const cand = band.filter((t) => !used.has(t.s));
  const from = cand.length > 0 ? cand : sorted.filter((t) => !used.has(t.s));
  if (from.length === 0) return null;
  return shuffle(from, rnd)[0];
}

// sorteia as 3 seleções (Favorita / Média / Zebra) da edição `year` com o `seed` dado.
// Tenta pelos tiers; onde faltar, completa pelos terços. Ordem estável de saída.
export function drawTiers(year: number, seed: number): DraftPick[] {
  const pool = poolForYear(year);
  const rnd = rngFrom(seed);
  const used = new Set<string>();
  const plan: { level: DraftLevel; tiers: Tier[] }[] = [
    { level: "favorita", tiers: FAVORITA_TIERS },
    { level: "media", tiers: MEDIA_TIERS },
    { level: "zebra", tiers: ZEBRA_TIERS },
  ];
  const picks: DraftPick[] = [];
  for (const p of plan) {
    let team = pickFromTiers(pool, p.tiers, used, rnd);
    if (!team) team = pickFromThird(pool, p.level, used, rnd);
    if (team) {
      used.add(team.s);
      picks.push({ level: p.level, team });
    }
  }
  return picks;
}

// reidrata os picks a partir dos SLUGS salvos (o save guarda slugs, não Teams inteiros).
// Ordem fixa: [favorita, media, zebra]. Slug não encontrado (edição mudou) = descartado;
// o chamador trata "menos de 3" como sorteio inválido e ressorteia.
export function picksFromSlugs(year: number, slugs: string[]): DraftPick[] {
  const pool = poolForYear(year);
  const bySlug = new Map(pool.map((t) => [t.s, t]));
  const levels: DraftLevel[] = ["favorita", "media", "zebra"];
  const out: DraftPick[] = [];
  slugs.forEach((s, i) => {
    const team = bySlug.get(s);
    if (team && levels[i]) out.push({ level: levels[i], team });
  });
  return out;
}
