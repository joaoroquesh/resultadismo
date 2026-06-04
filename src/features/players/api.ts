import { useQuery } from "@tanstack/react-query";
import { rpcCall } from "@/lib/rpc";

export type PlayerProfile = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  member_since: string;
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
