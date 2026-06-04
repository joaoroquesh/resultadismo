// Preço de criação de grupo — APENAS para exibição na UI.
// A cobrança real é feita no servidor (Edge Function, via LEAGUE_PRICE_CENTS).
// Mantenha VITE_LEAGUE_PRICE_CENTS igual ao LEAGUE_PRICE_CENTS da function.
export const LEAGUE_PRICE_CENTS = Number(import.meta.env.VITE_LEAGUE_PRICE_CENTS ?? 990);

/** Formata centavos de BRL para exibição (ex.: 990 -> "R$ 9,90"). */
export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
