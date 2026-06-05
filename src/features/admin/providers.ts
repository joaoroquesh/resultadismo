import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type ProviderName = "football_data" | "thesportsdb" | "espn";

export type ProviderCompetition = {
  provider: ProviderName;
  code: string;
  name: string;
  area: string | null;
  country: string | null;
  emblem: string | null;
  type: string | null;
  /** Temporada sugerida pela API (football-data devolve o ano de início). */
  season: string | null;
};

// Catálogo ESPN é CURADO e estático (a ESPN não tem endpoint de listagem que
// preste, e não precisa de token). Servimos no cliente — sem depender da edge
// function (era a fonte do "Erro ao buscar catálogo" na aba ESPN).
const ESPN_CATALOG: ProviderCompetition[] = (
  [
    ["fifa.friendly", "Amistosos Internacionais", "Mundo"],
    ["fifa.world", "Copa do Mundo FIFA", "Mundo"],
    ["fifa.worldq.conmebol", "Eliminatórias (América do Sul)", "Mundo"],
    ["bra.1", "Brasileirão Série A", "Brasil"],
    ["bra.2", "Brasileirão Série B", "Brasil"],
    ["bra.copa_do_brazil", "Copa do Brasil", "Brasil"],
    ["conmebol.libertadores", "Libertadores", "América do Sul"],
    ["conmebol.sudamericana", "Sul-Americana", "América do Sul"],
    ["uefa.champions", "Champions League", "Europa"],
    ["eng.1", "Premier League", "Inglaterra"],
    ["esp.1", "La Liga", "Espanha"],
    ["ita.1", "Serie A (Itália)", "Itália"],
    ["ger.1", "Bundesliga", "Alemanha"],
    ["fra.1", "Ligue 1", "França"],
  ] as const
).map(([code, name, area]) => ({
  provider: "espn" as const,
  code,
  name,
  area,
  country: area,
  emblem: null,
  type: null,
  season: null,
}));

/**
 * Catálogo de competições do provedor. ESPN vem da lista curada local;
 * football-data e TheSportsDB vêm da edge function `list-provider-competitions`
 * (que segura o token no servidor).
 */
export function useProviderCompetitions(provider: ProviderName, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["provider-competitions", provider],
    staleTime: 24 * 60 * 60_000, // catálogo muda raramente
    queryFn: async (): Promise<ProviderCompetition[]> => {
      if (provider === "espn") return ESPN_CATALOG;
      const { data, error } = await supabase.functions.invoke("list-provider-competitions", {
        body: { provider },
      });
      if (error) throw new Error(error.message);
      const payload = data as { competitions?: ProviderCompetition[]; error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      return payload?.competitions ?? [];
    },
  });
}
