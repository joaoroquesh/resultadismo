import { useMutation, useQueryClient } from "@tanstack/react-query";
import { rpcCall } from "@/lib/rpc";

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
    mutationFn: async (id: string) => {
      const { error } = await rpcCall("admin_delete_competition", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useSetCompetitionPublished() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (input: { id: string; value: boolean }) => {
      const { error } = await rpcCall("admin_set_competition_published", {
        p_id: input.id,
        p_value: input.value,
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
