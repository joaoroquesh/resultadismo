import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rpcCall } from "@/lib/rpc";

// Hooks da aba "Dados" do admin (F7): conflitos de placar entre fontes +
// override manual com lock + gestão de fontes por competição. Casados com as
// RPCs SECURITY DEFINER (gate is_app_admin no banco).

export type SourceObservation = {
  provider: string;
  home: number | null;
  away: number | null;
  status: string | null;
  fetched_at: string | null;
};

export type MatchConflict = {
  id: string;
  competition: string;
  home_team_name: string;
  away_team_name: string;
  kickoff_at: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  frozen: boolean;
  manual_lock: boolean;
  score_conflict: boolean;
  score_sources_count: number;
  sources: SourceObservation[];
};

export type CompetitionSource = {
  id: string;
  provider: string;
  provider_code: string | null;
  provider_season: string | null;
  role: string;
  priority: number;
  enabled: boolean;
  last_sync_ok: boolean | null;
  last_sync_error: string | null;
  last_sync_checked_at: string | null;
  /** Quantos jogos da competição esta fonte já observou (admin_list_competitions_full). */
  matches_count?: number | null;
};

export type CompLite = { id: string; name: string; provider: string; provider_code: string | null };

function useInvalidateData() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin", "match-conflicts"] });
    qc.invalidateQueries({ queryKey: ["matches"] });
  };
}

export function useMatchConflicts() {
  return useQuery({
    queryKey: ["admin", "match-conflicts"],
    queryFn: async (): Promise<MatchConflict[]> => {
      const { data, error } = await rpcCall<MatchConflict[]>("admin_list_match_conflicts", { p_limit: 200 });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useOverrideMatch() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (input: {
      matchId: string; home: number; away: number; status?: string | null; lock?: boolean;
    }) => {
      const { error } = await rpcCall("admin_override_match", {
        p_match_id: input.matchId, p_home_score: input.home, p_away_score: input.away,
        p_status: input.status ?? undefined, p_lock: input.lock ?? true,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useSetMatchLock() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (input: { matchId: string; locked: boolean }) => {
      const { error } = await rpcCall("admin_set_match_lock", { p_match_id: input.matchId, p_locked: input.locked });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useUnfreezeMatch() {
  const invalidate = useInvalidateData();
  return useMutation({
    mutationFn: async (matchId: string) => {
      const { error } = await rpcCall("admin_unfreeze_match", { p_match_id: matchId });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

// ---- Fontes por competição ----
export function useCompetitionsLite() {
  return useQuery({
    queryKey: ["admin", "competitions-lite"],
    staleTime: 60_000,
    queryFn: async (): Promise<CompLite[]> => {
      const { data, error } = await supabase
        .from("competitions")
        .select("id, name, provider, provider_code")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as CompLite[];
    },
  });
}

export function useCompetitionSources(competitionId: string | null) {
  return useQuery({
    enabled: !!competitionId,
    queryKey: ["admin", "competition-sources", competitionId],
    queryFn: async (): Promise<CompetitionSource[]> => {
      const { data, error } = await rpcCall<CompetitionSource[]>("admin_list_competition_sources", {
        p_competition_id: competitionId,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function useInvalidateSources(competitionId: string | null) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["admin", "competition-sources", competitionId] });
}

export function useUpsertCompetitionSource(competitionId: string | null) {
  const invalidate = useInvalidateSources(competitionId);
  return useMutation({
    mutationFn: async (input: {
      provider: string; providerCode: string; providerSeason?: string | null; role?: string; priority?: number;
    }) => {
      const { error } = await rpcCall("admin_upsert_competition_source", {
        p_competition_id: competitionId, p_provider: input.provider, p_provider_code: input.providerCode,
        p_provider_season: input.providerSeason ?? undefined, p_role: input.role ?? "secondary",
        p_priority: input.priority ?? 100,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useSetSourceEnabled(competitionId: string | null) {
  const invalidate = useInvalidateSources(competitionId);
  return useMutation({
    mutationFn: async (input: { id: string; enabled: boolean }) => {
      const { error } = await rpcCall("admin_set_competition_source_enabled", { p_id: input.id, p_enabled: input.enabled });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useRemoveCompetitionSource(competitionId: string | null) {
  const invalidate = useInvalidateSources(competitionId);
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpcCall("admin_remove_competition_source", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

/* ── Times fora do registro canônico (sync_unmapped) ─────────────────────── */

export type UnmappedTeam = {
  id: string;
  kind: string;
  provider: string;
  name: string;
  short_name: string | null;
  tla: string | null;
  crest_url: string | null;
  status: string;
  seen_count: number;
  first_seen: string;
  last_seen: string;
};

export function useUnmappedTeams() {
  return useQuery({
    queryKey: ["admin-unmapped-teams"],
    staleTime: 30_000,
    queryFn: async (): Promise<UnmappedTeam[]> => {
      const { data, error } = await rpcCall<UnmappedTeam[]>("admin_list_unmapped");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useResolveUnmapped() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpcCall("admin_resolve_unmapped", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-unmapped-teams"] }),
  });
}
