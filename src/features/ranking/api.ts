import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

export type RTBRow = {
  rank: number;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  pontos: number;
  jogos: number;
  cravadas: number;
  saldos: number;
  acertos: number;
};

export type RTBFilter = {
  competitionId?: string | null;
  year?: number | null;
  teamId?: string | null;
};

/** Top N do Resultadismo The Best. */
export function useGlobalStandings(filter: RTBFilter = {}, limit = 50) {
  return useQuery({
    queryKey: ["rtb-standings", filter, limit],
    staleTime: 30_000,
    queryFn: async (): Promise<RTBRow[]> => {
      const { data, error } = await supabase.rpc("get_global_standings", {
        p_competition_id: filter.competitionId ?? undefined,
        p_year: filter.year ?? undefined,
        p_team_id: filter.teamId ?? undefined,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as unknown as RTBRow[];
    },
  });
}

export type MyRTBRank = {
  rank: number;
  pontos: number;
  jogos: number;
  total_resultadistas: number;
};

/** Posição do Resultadista logado num recorte (default: tudo). */
export function useMyGlobalRank(filter: { competitionId?: string | null; year?: number | null } = {}) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["rtb-my-rank", user?.id, filter],
    staleTime: 30_000,
    queryFn: async (): Promise<MyRTBRank | null> => {
      const { data, error } = await supabase.rpc("get_my_global_rank", {
        p_competition_id: filter.competitionId ?? undefined,
        p_year: filter.year ?? undefined,
      });
      if (error) throw error;
      const row = (data ?? [])[0];
      return row ? (row as unknown as MyRTBRank) : null;
    },
  });
}

/** Toggle de "aparecer no ranking global". */
export function useSetGlobalRankingVisibility() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase.rpc("set_global_ranking_visibility", { p_value: value });
      if (error) throw error;
      return value;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rtb-standings"] });
      qc.invalidateQueries({ queryKey: ["rtb-my-rank"] });
      qc.invalidateQueries({ queryKey: ["profile-me"] });
    },
  });
}
