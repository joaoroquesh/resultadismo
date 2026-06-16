/** Helpers de data pra "início da pontuação do bolão" (league_competitions.starts_on).
 * Vive separado do componente pra não quebrar o fast-refresh (um arquivo de
 * componente só exporta componentes). */

/** Hoje (YYYY-MM-DD) no fuso local do navegador (BRT pro público BR). */
export function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

/** Prende uma data YYYY-MM-DD ao intervalo [min, max] (ISO compara
 * lexicograficamente). min/max nulos = sem limite naquele lado. */
export function clampDate(d: string, min?: string | null, max?: string | null): string {
  if (min && d < min) return min;
  if (max && d > max) return max;
  return d;
}

/** DD/MM a partir de YYYY-MM-DD (sem deslocar fuso). */
export function fmtDM(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** DD/MM/AAAA a partir de YYYY-MM-DD. */
export function fmtDMY(d: string): string {
  return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
