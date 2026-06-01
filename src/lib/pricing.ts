// Preço de criação de liga — APENAS para exibição na UI.
// A cobrança real é feita no servidor (Edge Function, via LEAGUE_PRICE_CENTS).
// Mantenha VITE_LEAGUE_PRICE_CENTS igual ao LEAGUE_PRICE_CENTS da function.
export const LEAGUE_PRICE_CENTS = Number(import.meta.env.VITE_LEAGUE_PRICE_CENTS ?? 990);

export const LEAGUE_PRICE_BRL = (LEAGUE_PRICE_CENTS / 100).toLocaleString("pt-BR", {
  style: "currency",
  currency: "BRL",
});
