import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpcCall } from "@/lib/rpc";

// Hooks de moderação do admin. Em arquivo separado de ./api para não conflitar
// com edições paralelas naquele arquivo.

export type DeletedLeague = {
  id: string;
  name: string;
  slug: string;
  deleted_at: string;
  owner_name: string | null;
};

/** Ligas na "lixeira" (soft-deleted, ainda restauráveis por ~10 min). */
export function useDeletedLeagues() {
  return useQuery({
    queryKey: ["admin", "deleted-leagues"],
    refetchInterval: 30_000, // mantém a contagem regressiva fresca
    queryFn: async (): Promise<DeletedLeague[]> => {
      const { data, error } = await rpcCall<DeletedLeague[]>("admin_list_deleted_leagues");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function useInvalidateLeagues() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["my-leagues"] });
  };
}

/** Exclui (soft) uma liga — reversível por ~10 min na lixeira. */
export function useSoftDeleteLeague() {
  const invalidate = useInvalidateLeagues();
  return useMutation({
    mutationFn: async (leagueId: string) => {
      const { error } = await rpcCall("admin_soft_delete_league", { p_league_id: leagueId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/** Restaura uma liga da lixeira. */
export function useRestoreLeague() {
  const invalidate = useInvalidateLeagues();
  return useMutation({
    mutationFn: async (leagueId: string) => {
      const { error } = await rpcCall("admin_restore_league", { p_league_id: leagueId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}
