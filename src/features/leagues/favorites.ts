import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpcCall } from "@/lib/rpc";
import { useAuth } from "@/features/auth/AuthProvider";

// Grupos favoritos: o usuário favorita grupos (ordem = ordem de favoritar) e a
// prévia da classificação (janela de 3) de cada um aparece no topo da /grupos.
// Tudo via RPC (rpcCall) pra não depender dos tipos gerados em database.ts, que
// outra frente regenera (regra 9 §7). → migration 20260610190000_grupo_favorito.

export type GroupRankRow = {
  rank: number;
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  pontos: number;
  jogos: number;
  cravadas: number;
  saldos: number;
  acertos: number;
  is_me: boolean;
};

export type GroupRankWindow = { leagueId: string; rows: GroupRankRow[] };

const FAV_KEY = "favorite-groups";
const WINDOW_KEY = "group-rank-window";

/** IDs dos grupos favoritados, na ordem de favoritar. */
export function useFavoriteGroups() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: [FAV_KEY, user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await rpcCall<string[]>("get_my_favorite_groups");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Favorita / desfavorita um grupo (otimista). Devolve o array atualizado. */
export function useToggleFavoriteGroup() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leagueId: string): Promise<string[]> => {
      const { data, error } = await rpcCall<string[]>("toggle_favorite_group", {
        p_league_id: leagueId,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    onMutate: async (leagueId) => {
      await qc.cancelQueries({ queryKey: [FAV_KEY, user?.id] });
      const prev = qc.getQueryData<string[]>([FAV_KEY, user?.id]) ?? [];
      const next = prev.includes(leagueId)
        ? prev.filter((id) => id !== leagueId)
        : [...prev, leagueId];
      qc.setQueryData([FAV_KEY, user?.id], next);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData([FAV_KEY, user?.id], ctx.prev);
    },
    onSettled: (data) => {
      if (data) qc.setQueryData([FAV_KEY, user?.id], data);
      qc.invalidateQueries({ queryKey: [FAV_KEY, user?.id] });
    },
  });
}

/**
 * Janela de 3 (você + vizinhos) da classificação de cada grupo favorito.
 * Uma query por grupo (useQueries). `rows` VAZIO = grupo ainda sem pontuação →
 * a UI não mostra aquele slide (gate "só aparece quando tiver pontuação").
 */
export function useGroupRankWindows(leagueIds: string[]) {
  const { user } = useAuth();
  return useQueries({
    queries: leagueIds.map((leagueId) => ({
      enabled: !!user && !!leagueId,
      queryKey: [WINDOW_KEY, leagueId, user?.id],
      staleTime: 30_000,
      queryFn: async (): Promise<GroupRankWindow> => {
        const { data, error } = await rpcCall<GroupRankRow[]>("get_group_rank_window", {
          p_league_id: leagueId,
          p_radius: 1,
        });
        if (error) throw new Error(error.message);
        return { leagueId, rows: data ?? [] };
      },
    })),
  });
}
