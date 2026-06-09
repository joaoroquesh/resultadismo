import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpcCall } from "@/lib/rpc";
import { supabase } from "@/lib/supabase";

export type PlayerProfile = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  member_since: string;
  favorite_team_id: string | null;
  national_team_id: string | null;
  stats: {
    jogos: number;
    pontos: number;
    cravadas: number;
    saldos: number;
    acertos: number;
    erros: number;
    aproveitamento: number;
    acertividade: number;
  };
  leagues: { id: string; name: string; slug: string }[];
};

/** Perfil público de um jogador (stats globais + grupos visíveis ao solicitante). */
export function usePlayerProfile(userId: string | undefined) {
  return useQuery({
    enabled: !!userId,
    queryKey: ["player-profile", userId],
    queryFn: async (): Promise<PlayerProfile | null> => {
      const { data, error } = await rpcCall<PlayerProfile | null>("get_player_profile", {
        p_user_id: userId!,
      });
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });
}

/* ── Favoritos (Resultadistas fixados nas listas de palpites) ────────────── */

const FAV_KEY = ["user-favorites"];

/** Ids dos Resultadistas que EU favoritei (fixam no topo das listas). */
export function useMyFavorites(enabled = true) {
  return useQuery({
    enabled,
    queryKey: FAV_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase.from("user_favorites").select("fav_user_id");
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((r) => r.fav_user_id as string));
    },
  });
}

export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, next }: { userId: string; next: boolean }) => {
      if (next) {
        const { error } = await supabase
          .from("user_favorites")
          .insert({ fav_user_id: userId, user_id: (await supabase.auth.getUser()).data.user!.id });
        if (error && error.code !== "23505") throw new Error(error.message);
      } else {
        const { error } = await supabase.from("user_favorites").delete().eq("fav_user_id", userId);
        if (error) throw new Error(error.message);
      }
    },
    // otimista: a estrela responde na hora
    onMutate: async ({ userId, next }) => {
      await qc.cancelQueries({ queryKey: FAV_KEY });
      const prev = qc.getQueryData<Set<string>>(FAV_KEY);
      if (prev) {
        const n = new Set(prev);
        if (next) n.add(userId);
        else n.delete(userId);
        qc.setQueryData(FAV_KEY, n);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(FAV_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: FAV_KEY }),
  });
}
