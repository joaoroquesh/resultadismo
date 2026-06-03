import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { Competition, MatchWithTeams, Prediction } from "@/lib/types";

const MATCH_SELECT =
  "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), competition:competitions(id,name,slug,emblem_url)";

/**
 * Acha a Copa do Mundo no catálogo da liga. Default sazonal da temporada
 * (Copa do Mundo 2026) — reaproveitado pelo NovaLigaPage e pela aba de
 * Competições da federação. Quando a Copa sair do calendário a gente
 * troca aqui só uma vez.
 */
export function findWorldCupCompetition(
  comps: Competition[] | undefined,
): Competition | undefined {
  if (!comps?.length) return undefined;
  return comps.find((c) => {
    const code = (c.provider_code ?? "").toUpperCase();
    const name = `${(c as { display_name?: string | null }).display_name ?? ""} ${c.name}`.toLowerCase();
    return (
      code === "WC" ||
      code === "4429" || // TheSportsDB FIFA World Cup
      name.includes("copa do mundo") ||
      name.includes("world cup")
    );
  });
}

export function useCompetitions() {
  const { isAppAdmin } = useAuth();
  return useQuery({
    // cache separado p/ admin (vê rascunhos) e público (só publicadas)
    queryKey: ["competitions", isAppAdmin ? "admin" : "public"],
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Competition[]> => {
      // colunas `is_published` e `display_name` foram adicionadas via migração
      // depois dos types gerados — cast para `any` evita ter que rerodar `supabase gen types`.
      let q = supabase.from("competitions").select("*").eq("status", "active");
      // público só vê publicadas; admin enxerga tudo (incl. rascunhos)
      if (!isAppAdmin) q = (q as unknown as { eq: (c: string, v: unknown) => typeof q }).eq("is_published", true);
      const { data, error } = await q
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
      // Filtra jogos anteriores à data em que a competição foi adicionada no app.
      // Jogos retroativos não interessam para os palpites e poluem a tela.
      const { data: comp, error: compErr } = await supabase
        .from("competitions")
        .select("created_at")
        .eq("id", competitionId!)
        .maybeSingle();
      if (compErr) throw compErr;
      const since = comp?.created_at ?? null;

      let q = supabase
        .from("matches")
        .select(MATCH_SELECT)
        .eq("competition_id", competitionId!)
        .order("kickoff_at", { ascending: true });
      if (since) q = q.gte("kickoff_at", since);
      const { data, error } = await q;
      if (error) throw error;
      // jogos ocultados pelo admin não entram para palpitar. Filtro client-side
      // (resiliente: se a coluna `hidden` ainda não existir no deploy, m.hidden
      // é undefined e nada é escondido — sem quebrar a tela).
      return (data ?? []).filter(
        (m) => !(m as { hidden?: boolean }).hidden,
      ) as unknown as MatchWithTeams[];
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

export type MatchPredictStatus = {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  predicted: boolean;
  league_id: string;
};

/** Antes do kickoff: membros da(s) federação(s) do usuário e quem já palpitou (sem o placar). */
export function useMatchPredictStatus(matchId: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["match-predict-status", matchId],
    queryFn: async (): Promise<MatchPredictStatus[]> => {
      const { data, error } = await supabase.rpc("get_match_predict_status", {
        p_match_id: matchId,
      });
      if (error) throw error;
      return (data ?? []) as MatchPredictStatus[];
    },
  });
}

/** Assina mudanças de jogos (placar ao vivo) e revalida as queries afetadas. */
export function useMatchesRealtime(competitionId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!competitionId) return;
    // Debounce: um sync atualiza vários jogos de uma vez; agrupamos a rajada
    // numa única revalidação para não disparar uma tempestade de refetch
    // (especialmente o de standings, que é o mais pesado).
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["matches", competitionId] });
        qc.invalidateQueries({ queryKey: ["my-predictions", competitionId] });
        qc.invalidateQueries({ queryKey: ["standings"] });
      }, 1200);
    };
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
        invalidate,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [competitionId, qc]);
}
