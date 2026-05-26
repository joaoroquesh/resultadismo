import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Competition, MatchWithTeams, Prediction } from "@/lib/types";

const MATCH_SELECT =
  "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), competition:competitions(id,name,slug,emblem_url)";

export function useCompetitions() {
  return useQuery({
    queryKey: ["competitions"],
    queryFn: async (): Promise<Competition[]> => {
      const { data, error } = await supabase
        .from("competitions")
        .select("*")
        .eq("status", "active")
        .order("is_featured", { ascending: false })
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useMatches(competitionId: string | undefined) {
  return useQuery({
    enabled: !!competitionId,
    queryKey: ["matches", competitionId],
    queryFn: async (): Promise<MatchWithTeams[]> => {
      const { data, error } = await supabase
        .from("matches")
        .select(MATCH_SELECT)
        .eq("competition_id", competitionId!)
        .order("kickoff_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as MatchWithTeams[];
    },
  });
}

export function useMyPredictions(competitionId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!competitionId && !!user,
    queryKey: ["my-predictions", competitionId, user?.id],
    queryFn: async (): Promise<Map<string, Prediction>> => {
      const { data: matchRows, error: mErr } = await supabase
        .from("matches")
        .select("id")
        .eq("competition_id", competitionId!);
      if (mErr) throw mErr;
      const ids = (matchRows ?? []).map((m) => m.id);
      if (ids.length === 0) return new Map();

      const { data, error } = await supabase
        .from("predictions")
        .select("*")
        .eq("user_id", user!.id)
        .in("match_id", ids);
      if (error) throw error;
      const map = new Map<string, Prediction>();
      for (const p of data ?? []) map.set(p.match_id, p);
      return map;
    },
  });
}

export function useSavePrediction() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { matchId: string; home: number; away: number }) => {
      const { data, error } = await supabase
        .from("predictions")
        .upsert(
          {
            user_id: user!.id,
            match_id: input.matchId,
            home_pred: input.home,
            away_pred: input.away,
          },
          { onConflict: "user_id,match_id" },
        )
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
    },
  });
}

/** Assina mudanças de jogos (placar ao vivo) e revalida as queries afetadas. */
export function useMatchesRealtime(competitionId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!competitionId) return;
    const channel = supabase
      .channel(`matches-${competitionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          filter: `competition_id=eq.${competitionId}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["matches", competitionId] });
          qc.invalidateQueries({ queryKey: ["my-predictions", competitionId] });
          qc.invalidateQueries({ queryKey: ["standings"] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [competitionId, qc]);
}
