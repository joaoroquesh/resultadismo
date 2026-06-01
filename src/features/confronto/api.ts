import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { roundRobin } from "./simulator";

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

/** Classificação de confronto (tabela 3/1/0) de uma disputa em modo Liga. */
export function useConfrontoStandings(lcId: string | undefined) {
  return useQuery({
    enabled: !!lcId,
    queryKey: ["confronto-standings", lcId],
    queryFn: async (): Promise<ConfrontoStanding[]> => {
      const { data, error } = await supabase.rpc("get_confronto_standings", { p_lc_id: lcId! });
      if (error) throw error;
      return (data ?? []) as ConfrontoStanding[];
    },
  });
}

/** Conta os confrontos já gerados (para mostrar "gerar" vs "regerar"). */
export function useConfrontoCount(lcId: string | undefined) {
  return useQuery({
    enabled: !!lcId,
    queryKey: ["confronto-count", lcId],
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from("cup_ties")
        .select("id", { count: "exact", head: true })
        .eq("league_competition_id", lcId!);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

/**
 * Gera os confrontos (round-robin) de uma disputa Liga.
 * Cada rodada do round-robin é mapeada a um matchday da competição (fase de grupos).
 * Roda no client (reaproveita o motor) e grava em cup_ties (RLS: admin da federação).
 */
export function useGenerateConfrontos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lcId: string; leagueId: string; competitionId: string }) => {
      const { lcId, leagueId, competitionId } = input;

      // membros ativos (ordem estável por entrada)
      const { data: mem, error: memErr } = await supabase
        .from("league_members")
        .select("user_id, joined_at")
        .eq("league_id", leagueId)
        .eq("status", "active")
        .order("joined_at", { ascending: true });
      if (memErr) throw memErr;
      const ids = (mem ?? []).map((m) => m.user_id as string);
      if (ids.length < 2) throw new Error("Precisa de pelo menos 2 membros ativos.");

      // matchdays disponíveis da competição (fase de grupos), ordenados e únicos
      const { data: md, error: mdErr } = await supabase
        .from("matches")
        .select("matchday")
        .eq("competition_id", competitionId)
        .not("matchday", "is", null)
        .order("matchday", { ascending: true });
      if (mdErr) throw mdErr;
      const matchdays = [...new Set((md ?? []).map((r) => r.matchday as number))];
      if (matchdays.length === 0) throw new Error("A competição ainda não tem rodadas para confronto.");

      // round-robin: cada rodada -> um matchday (até onde houver matchdays)
      const schedule = roundRobin(ids.length).slice(0, matchdays.length);
      const rows = schedule.flatMap((pairings, r) =>
        pairings
          .filter((p) => p.b !== null)
          .map((p, slot) => ({
            league_competition_id: lcId,
            round_order: r + 1,
            round_label: `Rodada ${r + 1}`,
            slot: slot + 1,
            member_a: ids[p.a]!,
            member_b: ids[p.b as number]!,
            matchday: matchdays[r]!,
            status: "pending" as const,
          })),
      );
      if (rows.length === 0) throw new Error("Não foi possível montar os confrontos.");

      // substitui os confrontos existentes
      const { error: delErr } = await supabase
        .from("cup_ties")
        .delete()
        .eq("league_competition_id", lcId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("cup_ties").insert(rows);
      if (insErr) throw insErr;
      return { rounds: schedule.length, ties: rows.length };
    },
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ["confronto-standings", vars.lcId] });
      qc.invalidateQueries({ queryKey: ["confronto-count", vars.lcId] });
    },
  });
}
