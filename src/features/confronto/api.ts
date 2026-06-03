import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database";
import {
  buildLigaFixtures,
  buildCopaFixtures,
  buildParticipants,
  buildSwissNextRound,
  pairKey,
  type Period,
} from "./build";

export type PeriodKind = "phase" | "week";

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
  /** Confronto decidido por W.O. (um lado saiu da federação). */
  walkover: boolean;
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
  /** Se cada lado palpitou (sempre disponível, sem revelar o palpite). */
  a_palpitou: boolean;
  b_palpitou: boolean;
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

export interface ConfrontoPeriod {
  period_index: number;
  kind: string; // 'matchday' | 'stage' | 'week'
  value: string;
  label: string;
  games: number;
  starts_on: string;
  ends_on: string;
}

/** Períodos da competição (fase ou semana), com nº de jogos — limita as rodadas no sorteio. */
export function useConfrontoPeriods(competitionId: string | undefined, kind: PeriodKind = "phase") {
  return useQuery({
    enabled: !!competitionId,
    queryKey: ["confronto-periods", competitionId, kind],
    queryFn: async (): Promise<ConfrontoPeriod[]> => {
      const { data, error } = await supabase.rpc("get_competition_periods", {
        p_competition_id: competitionId!,
        p_kind: kind,
      });
      if (error) throw error;
      return (data ?? []) as ConfrontoPeriod[];
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

/** IDs dos membros inscritos (opt-in) numa disputa. */
export function useConfrontoOptins(lcId: string | undefined, enabled = true) {
  return useQuery({
    enabled: !!lcId && enabled,
    queryKey: ["confronto-optins", lcId],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("confronto_optins")
        .select("user_id")
        .eq("league_competition_id", lcId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.user_id as string);
    },
  });
}

/** Membro liga/desliga a própria inscrição (opt-in). */
export function useToggleOptin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (lcId: string) => {
      const { data, error } = await supabase.rpc("toggle_confronto_optin", { p_lc_id: lcId });
      if (error) throw new Error(error.message);
      return data as boolean;
    },
    onSuccess: (_r, lcId) => qc.invalidateQueries({ queryKey: ["confronto-optins", lcId] }),
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
      /** Nº de rodadas escolhido no simulador (Liga). Copa ignora (definido pelo chaveamento). */
      rounds?: number;
      /** Forma das rodadas: por fase (grupos+mata-mata) ou por semana. */
      kind?: PeriodKind;
      /** Participantes escolhidos (ordem = seed). Se omitido, usa todos os membros ativos. */
      memberIds?: string[];
      /** Formato da Liga: 'partial' (turno/returno) ou 'swiss'. */
      ligaFormat?: "partial" | "swiss";
      /** Se setado (futuro), o sorteio fica agendado e é revelado nesse horário. */
      scheduledDrawAt?: string | null;
    }) => {
      let ids = input.memberIds ?? [];
      if (ids.length === 0) {
        const { data: mem, error: memErr } = await supabase
          .from("league_members")
          .select("user_id, joined_at")
          .eq("league_id", input.leagueId)
          .eq("status", "active")
          .order("joined_at", { ascending: true });
        if (memErr) throw memErr;
        ids = (mem ?? []).map((m) => m.user_id as string);
      }
      if (ids.length < 2) throw new Error("Precisa de pelo menos 2 participantes.");

      const { data: pdata, error: perr } = await supabase.rpc("get_competition_periods", {
        p_competition_id: input.competitionId,
        p_kind: input.kind ?? "phase",
      });
      if (perr) throw perr;
      const periods: Period[] = (pdata ?? []).map((p) => ({
        kind: p.kind,
        value: p.value,
        label: p.label,
        games: p.games,
      }));
      if (periods.length === 0) throw new Error("A competição ainda não tem rodadas para o sorteio.");

      const ties =
        input.formato === "cup"
          ? buildCopaFixtures(ids, periods)
          : buildLigaFixtures(ids, periods, input.rounds);
      const participants = buildParticipants(ids);

      const { error } = await supabase.rpc("draw_confronto", {
        p_lc_id: input.lcId,
        p_participants: participants as unknown as Json,
        p_ties: ties as unknown as Json,
        p_liga_format: input.ligaFormat ?? undefined,
        p_period_kind: input.kind ?? "phase",
        p_scheduled_draw_at: input.scheduledDrawAt ?? undefined,
      });
      if (error) throw error;
      return { ties: ties.length, participants: ids.length, scheduled: !!input.scheduledDrawAt };
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

/**
 * Suíço progressivo: gera a próxima rodada (se a atual já resolveu e há período
 * seguinte), pareando por classificação e evitando revanches. Idempotente: só
 * cria se ainda não existe a próxima rodada.
 */
export function useAdvanceSwiss() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { lcId: string; competitionId: string }) => {
      const { data: tiesData, error: tErr } = await supabase.rpc("get_confronto_ties", {
        p_lc_id: input.lcId,
      });
      if (tErr) throw tErr;
      const ties = (tiesData ?? []) as ConfrontoTie[];
      if (ties.length === 0) return { lcId: input.lcId, created: 0 };
      const maxRound = Math.max(...ties.map((t) => t.round_order));
      const cur = ties.filter((t) => t.round_order === maxRound);
      if (!cur.every((t) => t.resolved)) return { lcId: input.lcId, created: 0 };

      // Período da rodada atual (kind/value) — direto da tabela.
      const { data: rawTies } = await supabase
        .from("cup_ties")
        .select("round_order, period_kind, period_value")
        .eq("league_competition_id", input.lcId);
      const curRaw = (rawTies ?? []).filter((t) => t.round_order === maxRound);
      const curKind = (curRaw[0]?.period_kind as string | null) ?? "matchday";
      const curValue = (curRaw[0]?.period_value as string | null) ?? null;
      const periodKind = curKind === "week" ? "week" : "phase";

      const { data: periodsData, error: pErr } = await supabase.rpc("get_competition_periods", {
        p_competition_id: input.competitionId,
        p_kind: periodKind,
      });
      if (pErr) throw pErr;
      const periods = (periodsData ?? []) as ConfrontoPeriod[];
      const curIdx = periods.findIndex((p) => p.value === curValue && p.kind === curKind);
      const next = curIdx >= 0 ? periods[curIdx + 1] : undefined;
      if (!next) return { lcId: input.lcId, created: 0 }; // suíço completo

      const { data: standData } = await supabase.rpc("get_confronto_standings", { p_lc_id: input.lcId });
      const rank = new Map<string, number>(
        ((standData ?? []) as ConfrontoStanding[]).map((s, i) => [s.user_id, s.rank ?? i + 1]),
      );
      const { data: partData } = await supabase
        .from("confronto_participants")
        .select("user_id, seed")
        .eq("league_competition_id", input.lcId)
        .order("seed");
      const partIds = (partData ?? []).map((p) => p.user_id as string);
      const order = [...partIds].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));

      const played = new Set<string>();
      for (const t of ties) if (t.member_a && t.member_b) played.add(pairKey(t.member_a, t.member_b));

      const newTies = buildSwissNextRound(
        order,
        played,
        { kind: next.kind, value: next.value, label: next.label },
        maxRound + 1,
      );
      if (newTies.length === 0) return { lcId: input.lcId, created: 0 };

      const { error: aErr } = await supabase.rpc("append_confronto_ties", {
        p_lc_id: input.lcId,
        p_ties: newTies as unknown as Json,
      });
      if (aErr) throw new Error(aErr.message);
      return { lcId: input.lcId, created: newTies.length, round: maxRound + 1 };
    },
    onSuccess: (r) => invalidateConfronto(qc, r.lcId),
  });
}
