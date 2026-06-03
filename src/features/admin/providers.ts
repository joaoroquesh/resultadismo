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

/**
 * Catálogo de competições liberadas no plano da chave do provedor. Vem da edge
 * function `list-provider-competitions` (que segura o token no servidor).
 */
export function useProviderCompetitions(provider: ProviderName, enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["provider-competitions", provider],
    staleTime: 24 * 60 * 60_000, // catálogo muda raramente
    queryFn: async (): Promise<ProviderCompetition[]> => {
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
