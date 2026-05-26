import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Competition, League, MatchStatus, Profile, DataProvider } from "@/lib/types";

export function usePendingLeagues() {
  return useQuery({
    queryKey: ["admin", "pending-leagues"],
    queryFn: async (): Promise<(League & { owner: { display_name: string } | null })[]> => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*, owner:profiles!leagues_owner_id_fkey(display_name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as (League & { owner: { display_name: string } | null })[];
    },
  });
}

export function useApproveLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("approve_league", { p_league_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "pending-leagues"] }),
  });
}

export function useRejectLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("reject_league", { p_league_id: id });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "pending-leagues"] }),
  });
}

export function useAdminCompetitions() {
  return useQuery({
    queryKey: ["admin", "competitions"],
    queryFn: async (): Promise<Competition[]> => {
      const { data, error } = await supabase
        .from("competitions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function useCreateCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      shortName?: string;
      provider: DataProvider;
      providerCode?: string;
      providerSeason?: string;
      type: "LEAGUE" | "CUP";
      isFeatured: boolean;
    }) => {
      const { data, error } = await supabase
        .from("competitions")
        .insert({
          name: input.name,
          slug: `${slugify(input.name)}-${Math.random().toString(36).slice(2, 5)}`,
          short_name: input.shortName || null,
          provider: input.provider,
          provider_code: input.providerCode || null,
          provider_season: input.providerSeason || null,
          type: input.type,
          is_featured: input.isFeatured,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "competitions"] }),
  });
}

export function useSyncFootball() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (competitionId?: string) => {
      const { data, error } = await supabase.functions.invoke("sync-football", {
        body: competitionId ? { competitionId } : {},
      });
      if (error) throw error;
      return data as { synced: number; results: { competition: string; ok: boolean; error?: string }[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export function useAdminMatches(competitionId: string | undefined) {
  return useQuery({
    enabled: !!competitionId,
    queryKey: ["admin", "matches", competitionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .eq("competition_id", competitionId!)
        .order("kickoff_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSaveMatchResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      matchId: string;
      home: number | null;
      away: number | null;
      status: MatchStatus;
    }) => {
      const { error } = await supabase
        .from("matches")
        .update({
          home_score: input.home,
          away_score: input.away,
          status: input.status,
        })
        .eq("id", input.matchId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "matches"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["standings"] });
    },
  });
}

export function useCreateMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      competitionId: string;
      homeTeam: string;
      awayTeam: string;
      kickoffAt: string;
      round?: string;
      groupName?: string;
    }) => {
      const { error } = await supabase.from("matches").insert({
        competition_id: input.competitionId,
        provider: "manual",
        home_team_name: input.homeTeam,
        away_team_name: input.awayTeam,
        kickoff_at: input.kickoffAt,
        round: input.round || null,
        group_name: input.groupName || null,
        status: "scheduled",
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "matches"] }),
  });
}

export function useAllProfiles() {
  return useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSetAppAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; value: boolean }) => {
      const { error } = await supabase.rpc("set_app_admin", {
        p_user_id: input.userId,
        p_value: input.value,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "profiles"] }),
  });
}
