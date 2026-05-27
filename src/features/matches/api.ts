import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Competition, MatchWithTeams, Prediction } from "@/lib/types";

const MATCH_SELECT =
  "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), competition:competitions(id,name,slug,emblem_url)";

export function useCompetitions() {
  return useQuery({
    queryKey: ["competitions"],
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
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
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Map<string, Prediction>> => {
      // 1 ida ao banco: palpites do usuário cujo jogo é desta competição.
      const { data, error } = await supabase
        .from("predictions")
        .select("*, matches!inner(competition_id)")
        .eq("user_id", user!.id)
        .eq("matches.competition_id", competitionId!);
      if (error) throw error;
      const map = new Map<string, Prediction>();
      for (const row of data ?? []) {
        const { matches: _m, ...pred } = row as Prediction & { matches: unknown };
        map.set(pred.match_id, pred as Prediction);
      }
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

export function useSetJoker() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { matchId: string; value: boolean }) => {
      const { error } = await supabase
        .from("predictions")
        .update({ is_joker: input.value })
        .eq("user_id", user!.id)
        .eq("match_id", input.matchId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-predictions"] }),
  });
}

export type MatchPrediction = {
  home_pred: number;
  away_pred: number;
  score_type: import("@/lib/types").ScoreType | null;
  points: number | null;
  user: { id: string; display_name: string; avatar_url: string | null } | null;
};

/** Palpites de todos para um jogo (visível após o kickoff, por RLS). */
export function useMatchPredictions(matchId: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["match-predictions", matchId],
    queryFn: async (): Promise<MatchPrediction[]> => {
      const { data, error } = await supabase
        .from("predictions")
        .select(
          "home_pred, away_pred, score_type, points, user:profiles!predictions_user_id_fkey(id, display_name, avatar_url)",
        )
        .eq("match_id", matchId)
        .order("points", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as unknown as MatchPrediction[];
    },
  });
}

/** Assina mudanças de jogos (placar ao vivo) e revalida as queries afetadas. */
export function useMatchesRealtime(competitionId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!competitionId) return;
    const channel = supabase
      .channel(`matches-${competitionId}-${Math.random().toString(36).slice(2)}`)
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
