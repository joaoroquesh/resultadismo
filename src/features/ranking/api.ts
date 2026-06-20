import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rpcCall } from "@/lib/rpc";
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
  /** Recorte "Que eu jogo": corta a pontuação de todos a este conjunto. */
  competitionIds?: string[] | null;
};

/** Competições que EU jogo (dos meus grupos) — alimenta o recorte "Que eu jogo". */
export function useMyPlayedCompetitionIds() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["my-played-comps", user?.id],
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await rpcCall<string[]>("get_my_played_competition_ids");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Top N do Resultadismo The Best. */
export function useGlobalStandings(filter: RTBFilter = {}, limit = 50) {
  const multi = Array.isArray(filter.competitionIds);
  return useQuery({
    queryKey: ["rtb-standings", filter, limit],
    staleTime: 30_000,
    queryFn: async (): Promise<RTBRow[]> => {
      if (multi) {
        const { data, error } = await rpcCall<RTBRow[]>("get_global_standings_multi", {
          p_competition_ids: filter.competitionIds ?? [],
          p_limit: limit,
        });
        if (error) throw new Error(error.message);
        return data ?? [];
      }
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

export type RTBWindowRow = RTBRow & { is_me: boolean };

/**
 * Janela de 3 (você + vizinhos) no Resultadismo The Best, sempre centrada no
 * Resultadista logado. Vazio se eu não pontuei / fiz opt-out → a UI cai no top-N.
 */
export function useGlobalRankWindow(
  filter: { competitionId?: string | null } = {},
  radius = 1,
) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["rtb-window", user?.id, filter, radius],
    staleTime: 30_000,
    queryFn: async (): Promise<RTBWindowRow[]> => {
      const { data, error } = await rpcCall<RTBWindowRow[]>("get_global_rank_window", {
        p_competition_id: filter.competitionId ?? undefined,
        p_radius: radius,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export type MyRTBRank = {
  rank: number;
  pontos: number;
  jogos: number;
  total_resultadistas: number;
};

// ── Resultadismo The Best AO VIVO ──────────────────────────────────────────
// Espelha os hooks acima, mas projeta os jogos em andamento (RPCs *_live).
// rank_anterior = posição no consolidado (só encerrados) → setas durante o ao
// vivo. ao_vivo = tenho jogo rolando no recorte; live_scoring = estou marcando
// ponto agora (pinta em vermelho). É SÓ exibição — o oficial segue no final.
export type RTBLiveRow = RTBRow & {
  rank_anterior: number;
  ao_vivo: boolean;
  live_scoring: boolean;
};
export type MyRTBLiveRank = MyRTBRank & {
  rank_anterior: number;
  ao_vivo: boolean;
  live_scoring: boolean;
};

// Unifica o recorte num array (null = todos): "que eu jogo" já é array; um
// campeonato vira [id]; "Todos" → null.
function resolveCompIds(filter: RTBFilter): string[] | null {
  if (Array.isArray(filter.competitionIds)) return filter.competitionIds;
  if (filter.competitionId) return [filter.competitionId];
  return null;
}

/** Top N do Resultadismo The Best, AO VIVO (com setas + selo ao vivo). */
export function useGlobalStandingsLive(filter: RTBFilter = {}, limit = 50) {
  const ids = resolveCompIds(filter);
  return useQuery({
    queryKey: ["rtb-standings-live", filter, limit],
    staleTime: 15_000,
    refetchInterval: (query) =>
      (query.state.data as RTBLiveRow[] | undefined)?.some((r) => r.ao_vivo) ? 15_000 : 45_000,
    queryFn: async (): Promise<RTBLiveRow[]> => {
      const { data, error } = await rpcCall<RTBLiveRow[]>("get_global_standings_live", {
        p_competition_ids: ids,
        p_limit: limit,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Minha posição no Resultadismo The Best, AO VIVO. */
export function useMyGlobalRankLive(filter: RTBFilter = {}) {
  const { user } = useAuth();
  const ids = resolveCompIds(filter);
  return useQuery({
    enabled: !!user,
    queryKey: ["rtb-my-rank-live", user?.id, filter],
    staleTime: 15_000,
    refetchInterval: (query) =>
      (query.state.data as MyRTBLiveRank | null | undefined)?.ao_vivo ? 15_000 : 45_000,
    queryFn: async (): Promise<MyRTBLiveRank | null> => {
      const { data, error } = await rpcCall<MyRTBLiveRank[]>("get_my_global_rank_live", {
        p_competition_ids: ids,
      });
      if (error) throw new Error(error.message);
      return (data ?? [])[0] ?? null;
    },
  });
}

/** Posição do Resultadista logado num recorte (default: tudo). */
export function useMyGlobalRank(
  filter: { competitionId?: string | null; year?: number | null; competitionIds?: string[] | null } = {},
) {
  const { user } = useAuth();
  const multi = Array.isArray(filter.competitionIds);
  return useQuery({
    enabled: !!user,
    queryKey: ["rtb-my-rank", user?.id, filter],
    staleTime: 30_000,
    queryFn: async (): Promise<MyRTBRank | null> => {
      if (multi) {
        const { data, error } = await rpcCall<MyRTBRank[]>("get_my_global_rank_multi", {
          p_competition_ids: filter.competitionIds ?? [],
        });
        if (error) throw new Error(error.message);
        return (data ?? [])[0] ?? null;
      }
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
      qc.invalidateQueries({ queryKey: ["rtb-standings-live"] });
      qc.invalidateQueries({ queryKey: ["rtb-my-rank"] });
      qc.invalidateQueries({ queryKey: ["rtb-my-rank-live"] });
      qc.invalidateQueries({ queryKey: ["profile-me"] });
    },
  });
}
