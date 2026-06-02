import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database";
import { buildLigaFixtures, buildCopaFixtures, buildParticipants } from "./build";

export type ConfrontoFormato = "liga" | "cup";

export interface ConfrontoStanding {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  jogos: number;
  vitorias: number;
  empates: number;
  derrotas: number;
  pontos: number;
  gols_pro: number;
  gols_contra: number;
  rank: number;
}

export interface ConfrontoTie {
  id: string;
  round_order: number;
  round_label: string;
  slot: number;
  matchday: number | null;
  member_a: string | null;
  member_b: string | null;
  name_a: string | null;
  name_b: string | null;
  avatar_a: string | null;
  avatar_b: string | null;
  pa: number;
  pb: number;
  winner: string | null;
  resolved: boolean;
}

/** Classificação 3/1/0 da Liga. */
export function useConfrontoStandings(lcId: string | undefined, enabled = true) {
  return useQuery({
    enabled: !!lcId && enabled,
    queryKey: ["confronto-standings", lcId],
    queryFn: async (): Promise<ConfrontoStanding[]> => {
      const { data, error } = await supabase.rpc("get_confronto_standings", { p_lc_id: lcId! });
      if (error) throw error;
      return (data ?? []) as ConfrontoStanding[];
    },
  });
}

/** Todos os confrontos (rodadas da Liga / chaveamento da Copa) com pontos e vencedor. */
export function useConfrontoTies(lcId: string | undefined, enabled = true) {
  return useQuery({
    enabled: !!lcId && enabled,
    queryKey: ["confronto-ties", lcId],
    queryFn: async (): Promise<ConfrontoTie[]> => {
      const { data, error } = await supabase.rpc("get_confronto_ties", { p_lc_id: lcId! });
      if (error) throw error;
      return (data ?? []) as ConfrontoTie[];
    },
  });
}

export interface TieDetailRow {
  match_id: string;
  kickoff_at: string | null;
  status: string;
  home_name: string | null;
  away_name: string | null;
  home_score: number | null;
  away_score: number | null;
  a_home: number | null;
  a_away: number | null;
  a_pts: number | null;
  a_joker: boolean;
  b_home: number | null;
  b_away: number | null;
  b_pts: number | null;
  b_joker: boolean;
}

/** Detalhe jogo a jogo de um confronto (meu palpite x o do adversário). */
export function useTieDetail(tieId: string | undefined, enabled = true) {
  return useQuery({
    enabled: !!tieId && enabled,
    queryKey: ["tie-detail", tieId],
    queryFn: async (): Promise<TieDetailRow[]> => {
      const { data, error } = await supabase.rpc("get_tie_detail", { p_tie_id: tieId! });
      if (error) throw error;
      return (data ?? []) as TieDetailRow[];
    },
  });
}

/** Participantes travados no sorteio. */
export function useConfrontoParticipants(lcId: string | undefined, enabled = true) {
  return useQuery({
    enabled: !!lcId && enabled,
    queryKey: ["confronto-participants", lcId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("confronto_participants")
        .select("user_id, seed, profile:profiles(display_name, avatar_url)")
        .eq("league_competition_id", lcId!)
        .order("seed");
      if (error) throw error;
      return data ?? [];
    },
  });
}

function invalidateConfronto(qc: ReturnType<typeof useQueryClient>, lcId: string, leagueId?: string) {
  qc.invalidateQueries({ queryKey: ["confronto-standings", lcId] });
  qc.invalidateQueries({ queryKey: ["confronto-ties", lcId] });
  qc.invalidateQueries({ queryKey: ["confronto-participants", lcId] });
  qc.invalidateQueries({ queryKey: ["league-competitions", leagueId] });
}

/**
 * Sorteia: trava os participantes (snapshot) e monta os confrontos.
 * Gera no client (round-robin p/ Liga, chaveamento p/ Copa) e grava via RPC transacional.
 */
export function useDrawConfronto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      lcId: string;
      leagueId: string;
      competitionId: string;
      formato: ConfrontoFormato;
    }) => {
      const { data: mem, error: memErr } = await supabase
        .from("league_members")
        .select("user_id, joined_at")
        .eq("league_id", input.leagueId)
        .eq("status", "active")
        .order("joined_at", { ascending: true });
      if (memErr) throw memErr;
      const ids = (mem ?? []).map((m) => m.user_id as string);
      if (ids.length < 2) throw new Error("Precisa de pelo menos 2 participantes ativos.");

      const { data: md, error: mdErr } = await supabase
        .from("matches")
        .select("matchday")
        .eq("competition_id", input.competitionId)
        .not("matchday", "is", null)
        .order("matchday", { ascending: true });
      if (mdErr) throw mdErr;
      const periods = [...new Set((md ?? []).map((r) => r.matchday as number))];
      if (periods.length === 0) throw new Error("A competição ainda não tem rodadas para o sorteio.");

      const ties =
        input.formato === "cup" ? buildCopaFixtures(ids, periods) : buildLigaFixtures(ids, periods);
      const participants = buildParticipants(ids);

      const { error } = await supabase.rpc("draw_confronto", {
        p_lc_id: input.lcId,
        p_participants: participants as unknown as Json,
        p_ties: ties as unknown as Json,
      });
      if (error) throw error;
      return { ties: ties.length, participants: ids.length };
    },
    onSuccess: (_r, v) => invalidateConfronto(qc, v.lcId, v.leagueId),
  });
}

/** Desfaz o sorteio (só enquanto nenhuma rodada começou). */
export function useUndoDraw() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lcId: string; leagueId: string }) => {
      const { error } = await supabase.rpc("undo_confronto_draw", { p_lc_id: input.lcId });
      if (error) throw error;
    },
    onSuccess: (_r, v) => invalidateConfronto(qc, v.lcId, v.leagueId),
  });
}
