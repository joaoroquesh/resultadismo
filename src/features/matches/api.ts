import { useEffect } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import { track } from "@/lib/analytics";
import type { Competition, MatchWithTeams, Prediction } from "@/lib/types";

const MATCH_SELECT =
  "*, home_team:teams!matches_home_team_id_fkey(*), away_team:teams!matches_away_team_id_fkey(*), competition:competitions(id,name,slug,emblem_url)";

/**
 * Polling de segurança do placar ao vivo: enquanto houver jogo AO VIVO (ou "ao
 * vivo automático" — agendado cujo kickoff já passou há menos de 4h), revalida a
 * cada 60s, caso o Realtime caia/sature. Em repouso retorna false (zero
 * requisição extra). Combina com o Realtime (instantâneo) e o cron de 1 min.
 */
function liveRefetchInterval(rows: MatchWithTeams[] | undefined): number | false {
  if (!rows?.length) return false;
  const now = Date.now();
  const liveish = rows.some((m) => {
    if (m.status === "live") return true;
    if (m.status !== "scheduled" || !m.kickoff_at) return false;
    const k = new Date(m.kickoff_at).getTime();
    return k <= now && now - k < 4 * 3_600_000;
  });
  return liveish ? 60_000 : false;
}

/**
 * Acha a Copa do Mundo no catálogo da liga. Default sazonal da temporada
 * (Copa do Mundo 2026) — reaproveitado pelo NovaLigaPage e pela aba de
 * Competições do grupo. Quando a Copa sair do calendário a gente
 * troca aqui só uma vez.
 */
export function findWorldCupCompetition(
  comps: Competition[] | undefined,
): Competition | undefined {
  if (!comps?.length) return undefined;
  return comps.find((c) => {
    const code = (c.provider_code ?? "").toUpperCase();
    const name = `${c.display_name ?? ""} ${c.name}`.toLowerCase();
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
      let q = supabase.from("competitions").select("*").eq("status", "active");
      // público só vê publicadas; admin enxerga tudo (incl. rascunhos)
      if (!isAppAdmin) q = q.eq("is_published", true);
      const { data, error } = await q
        .order("is_featured", { ascending: false })
        .order("name");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export function useMatches(competitionId: string | undefined) {
  return useQuery({
    enabled: !!competitionId,
    queryKey: ["matches", competitionId],
    staleTime: 30_000,
    refetchInterval: (query) => liveRefetchInterval(query.state.data),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MatchWithTeams[]> => {
      // Filtra jogos anteriores à data em que a competição foi adicionada no app.
      // Jogos retroativos não interessam para os palpites e poluem a tela.
      const { data: comp, error: compErr } = await supabase
        .from("competitions")
        .select("created_at")
        .eq("id", competitionId!)
        .maybeSingle();
      if (compErr) throw new Error(compErr.message);
      const since = comp?.created_at ?? null;

      // jogos ocultados pelo admin saem no servidor (usa o índice parcial
      // matches_visible_idx) — não viajam pela rede nem aparecem para palpitar.
      let q = supabase
        .from("matches")
        .select(MATCH_SELECT)
        .eq("competition_id", competitionId!)
        .eq("hidden", false)
        .order("kickoff_at", { ascending: true });
      if (since) q = q.gte("kickoff_at", since);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MatchWithTeams[];
    },
  });
}

/**
 * "Todos os campeonatos": jogos visíveis de todas as competições ativas
 * (publicadas, p/ não-admin), respeitando o created_at de cada uma e o hidden.
 * Janela: dos últimos 7 dias em diante (foco no que está rolando/por vir).
 */
export function useAllMatches(enabled = true) {
  const { isAppAdmin } = useAuth();
  return useQuery({
    enabled,
    queryKey: ["matches", "all", isAppAdmin ? "admin" : "public"],
    staleTime: 30_000,
    refetchInterval: (query) => liveRefetchInterval(query.state.data),
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<MatchWithTeams[]> => {
      let cq = supabase.from("competitions").select("id, created_at").eq("status", "active");
      if (!isAppAdmin) cq = cq.eq("is_published", true);
      const { data: comps, error: ce } = await cq;
      if (ce) throw new Error(ce.message);
      const ids = (comps ?? []).map((c) => c.id);
      if (ids.length === 0) return [];
      const createdMap = new Map<string, string | null>(
        (comps ?? []).map((c) => [c.id, c.created_at ?? null]),
      );
      const floor = new Date(Date.now() - 7 * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("matches")
        .select(MATCH_SELECT)
        .in("competition_id", ids)
        .eq("hidden", false)
        .gte("kickoff_at", floor)
        .order("kickoff_at", { ascending: true });
      if (error) throw new Error(error.message);
      // só resta o piso por-competição (created_at), que é por linha → fica em JS.
      return (data ?? []).filter((m) => {
        const row = m as unknown as { competition_id: string; kickoff_at: string | null };
        const created = createdMap.get(row.competition_id);
        return !created || !row.kickoff_at || row.kickoff_at >= created;
      }) as unknown as MatchWithTeams[];
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
      if (error) throw new Error(error.message);
      const map = new Map<string, Prediction>();
      for (const row of data ?? []) {
        const { matches: _m, ...pred } = row as Prediction & { matches: unknown };
        map.set(pred.match_id, pred as Prediction);
      }
      return map;
    },
  });
}

/** Todos os palpites do usuário (modo "Todos os campeonatos"). */
export function useAllMyPredictions(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    enabled: enabled && !!user,
    queryKey: ["my-predictions", "all", user?.id],
    staleTime: 30_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<Map<string, Prediction>> => {
      const { data, error } = await supabase
        .from("predictions")
        .select("*")
        .eq("user_id", user!.id);
      if (error) throw new Error(error.message);
      const map = new Map<string, Prediction>();
      for (const row of data ?? []) map.set((row as Prediction).match_id, row as Prediction);
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
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      track("save_prediction");
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
      if (error) throw new Error(error.message);
    },
    onSuccess: (_data, input) => {
      track("set_joker", { enabled: input.value });
      qc.invalidateQueries({ queryKey: ["my-predictions"] });
    },
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
      if (error) throw new Error(error.message);
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

/** Antes do kickoff: membros da(s) grupo(s) do usuário e quem já palpitou (sem o placar). */
export function useMatchPredictStatus(matchId: string, enabled: boolean) {
  return useQuery({
    enabled,
    queryKey: ["match-predict-status", matchId],
    queryFn: async (): Promise<MatchPredictStatus[]> => {
      const { data, error } = await supabase.rpc("get_match_predict_status", {
        p_match_id: matchId,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as MatchPredictStatus[];
    },
  });
}

/** Assina mudanças de jogos (placar ao vivo) e revalida as queries afetadas. */
export function useMatchesRealtime(competitionId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    // Debounce: um sync atualiza vários jogos de uma vez; agrupamos a rajada
    // numa única revalidação para não disparar uma tempestade de refetch
    // (especialmente o de standings, que é o mais pesado). Invalidamos a família
    // ["matches"] inteira — cobre a visão "Todos" (["matches","all",…]) E cada
    // competição (["matches",id]), por isso o placar ao vivo atualiza em ambas.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["matches"] });
        qc.invalidateQueries({ queryKey: ["my-predictions"] });
        qc.invalidateQueries({ queryKey: ["standings"] });
      }, 1200);
    };
    // Sem competição (visão "Todos") assina a tabela inteira; com competição,
    // filtra no servidor. A RLS de matches é pública (select using(true)), então
    // a assinatura ampla não expõe nada além do que já é visível.
    const channel = supabase
      .channel(`matches-${competitionId ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "matches",
          ...(competitionId ? { filter: `competition_id=eq.${competitionId}` } : {}),
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
