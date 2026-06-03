import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// Regra de nome por tipo de disputa (prefixo obrigatório), configurável no admin.
//   Copa   -> "Copa ..."
//   Liga   -> "Liga ..."
//   Pontos -> "Bolão ..." (campeonato por pontos)

export interface NamePrefixes {
  cup: string;
  liga: string;
  points: string;
}

export const NAME_PREFIX_DEFAULTS: NamePrefixes = {
  cup: "Copa",
  liga: "Liga",
  points: "Bolão",
};

/** Lê os prefixos vigentes (app_settings). Cai nos defaults se não houver. */
export function useNamePrefixes() {
  return useQuery({
    queryKey: ["name-prefixes"],
    staleTime: 60_000,
    queryFn: async (): Promise<NamePrefixes> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("name_prefix_cup, name_prefix_liga, name_prefix_points")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return {
        cup: data?.name_prefix_cup ?? NAME_PREFIX_DEFAULTS.cup,
        liga: data?.name_prefix_liga ?? NAME_PREFIX_DEFAULTS.liga,
        points: data?.name_prefix_points ?? NAME_PREFIX_DEFAULTS.points,
      };
    },
  });
}

/** Admin: ajusta os prefixos. */
export function useSetNamePrefixes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: NamePrefixes) => {
      const { error } = await supabase.rpc("admin_set_name_prefixes", {
        p_cup: p.cup,
        p_liga: p.liga,
        p_points: p.points,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["name-prefixes"] }),
  });
}

/** Prefixo exigido para o modo da disputa. */
export function requiredPrefix(mode: string, p: NamePrefixes): string {
  if (mode === "cup") return p.cup;
  if (mode === "liga") return p.liga;
  return p.points; // points | table
}

/** Erro de nome (ou null se ok): deve começar com o prefixo do tipo. */
export function competitionNameError(
  name: string,
  mode: string,
  p: NamePrefixes,
): string | null {
  const prefix = requiredPrefix(mode, p);
  const n = name.trim().toLowerCase();
  if (!n) return "Dê um nome à disputa.";
  if (!n.startsWith(prefix.trim().toLowerCase())) {
    return `O nome precisa começar com "${prefix}".`;
  }
  return null;
}
