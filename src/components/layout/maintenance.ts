import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export type Maintenance = { maintenance_mode: boolean; maintenance_message: string | null };

/**
 * Estado de manutenção (app_settings id=1). A policy de leitura é `authenticated`,
 * então só resolve para quem está logado — coerente com o gate atual (bloqueia só
 * logados não-admin; visitante deslogado segue na landing). Atualiza a cada minuto.
 */
export function useMaintenance() {
  return useQuery({
    queryKey: ["maintenance"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<Maintenance | null> => {
      const { data } = await supabase
        .from("app_settings")
        .select("maintenance_mode, maintenance_message")
        .eq("id", 1)
        .maybeSingle();
      return data ?? null;
    },
  });
}
