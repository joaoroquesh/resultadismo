import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpcCall } from "@/lib/rpc";

export type CompetitionUsage = {
  name: string;
  matches: number;
  predictions: number;
  groups: number;
  in_use: boolean;
};

/** Quanto a competição é usada (palpites/grupos/jogos) — alimenta o diálogo de exclusão. */
export function useCompetitionUsage(id: string | null) {
  return useQuery({
    enabled: !!id,
    queryKey: ["admin", "competition-usage", id],
    queryFn: async (): Promise<CompetitionUsage | null> => {
      const { data, error } = await rpcCall<CompetitionUsage[]>("admin_competition_usage", {
        p_id: id,
      });
      if (error) throw new Error(error.message);
      return (data && data[0]) ?? null;
    },
  });
}

// Hooks de moderação de competições. Casados com as RPCs SECURITY DEFINER
// (admin_delete_competition / admin_set_competition_published / admin_rename_competition).
// Apenas app_admin executa — o servidor enforça.

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin"] });
    qc.invalidateQueries({ queryKey: ["competitions"] });
    qc.invalidateQueries({ queryKey: ["matches"] });
  };
}

export function useDeleteCompetition() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; confirmName?: string }) => {
      const { error } = await rpcCall("admin_delete_competition", {
        p_id: input.id,
        p_confirm_name: input.confirmName ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useSetCompetitionPublished() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; value: boolean; confirmName?: string }) => {
      const { error } = await rpcCall("admin_set_competition_published", {
        p_id: input.id,
        p_value: input.value,
        p_confirm_name: input.confirmName ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useRenameCompetition() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; displayName: string }) => {
      const { error } = await rpcCall("admin_rename_competition", {
        p_id: input.id,
        p_display_name: input.displayName,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}
