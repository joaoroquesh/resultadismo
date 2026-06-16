import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { rpcCall } from "@/lib/rpc";
import type { CompetitionSource, SourceObservation } from "./dataSources";

// Camada de dados do redesign da aba Competições (e do painel da Visão). Usa
// rpcCall (não depende de database.ts) — RPCs criadas em
// 20260615210000_admin_competicoes_redesign.sql, todas gate is_app_admin().

// ---------------------------------------------------------------------------
// Visão — KPIs centrais de saúde/uso (admin_usage_stats)
// ---------------------------------------------------------------------------
export type UsageStats = {
  total_users: number;
  online_now: number;
  active_24h: number;
  accessed_today: number;
  new_users_today: number;
  usage_seconds_total: number;
  usage_seconds_avg: number;
  predictions_today: number;
  groups_total: number;
  groups_pending: number;
  groups_gestao_active: number;
  groups_paid: number;
};

export function useUsageStats() {
  return useQuery({
    queryKey: ["admin", "usage-stats"],
    refetchInterval: 60_000,
    queryFn: async (): Promise<UsageStats> => {
      const { data, error } = await rpcCall<UsageStats>("admin_usage_stats");
      if (error) throw new Error(error.message);
      return data as UsageStats;
    },
  });
}

// ---------------------------------------------------------------------------
// Competições + pilha de fontes + saúde, numa leitura só
// ---------------------------------------------------------------------------
export type CompFull = {
  id: string;
  name: string;
  raw_name: string;
  slug: string;
  provider: string;
  provider_code: string | null;
  provider_season: string | null;
  type: string | null;
  area: string | null;
  status: string;
  is_published: boolean;
  in_personalization: boolean;
  sync_enabled: boolean;
  last_sync_ok: boolean | null;
  last_sync_error: string | null;
  last_synced_at: string | null;
  matches_count: number;
  conflicts_count: number;
  sources: CompetitionSource[];
};

export function useCompetitionsFull() {
  return useQuery({
    queryKey: ["admin", "competitions-full"],
    queryFn: async (): Promise<CompFull[]> => {
      const { data, error } = await rpcCall<CompFull[]>("admin_list_competitions_full");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function useInvalidateComps() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin", "competitions-full"] });
    qc.invalidateQueries({ queryKey: ["admin", "health"] });
  };
}

// Promover uma fonte a primária (rebaixa a atual). Seguro: não mexe em jogos.
export function useSetPrimarySource() {
  const invalidate = useInvalidateComps();
  return useMutation({
    mutationFn: async (input: { competitionId: string; sourceId: string }) => {
      const { error } = await rpcCall("admin_set_primary_source", {
        p_competition_id: input.competitionId,
        p_source_id: input.sourceId,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

// Ligar/desligar uma fonte (a leitura volta por competitions-full).
export function useToggleSource() {
  const invalidate = useInvalidateComps();
  return useMutation({
    mutationFn: async (input: { id: string; enabled: boolean }) => {
      const { error } = await rpcCall("admin_set_competition_source_enabled", {
        p_id: input.id,
        p_enabled: input.enabled,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useAddSecondarySource() {
  const invalidate = useInvalidateComps();
  return useMutation({
    mutationFn: async (input: {
      competitionId: string;
      provider: string;
      providerCode: string;
      providerSeason?: string | null;
    }) => {
      const { error } = await rpcCall("admin_upsert_competition_source", {
        p_competition_id: input.competitionId,
        p_provider: input.provider,
        p_provider_code: input.providerCode,
        p_provider_season: input.providerSeason ?? undefined,
        p_role: "secondary",
        p_priority: 100,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useRemoveSource() {
  const invalidate = useInvalidateComps();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpcCall("admin_remove_competition_source", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

// Arquivar preservando placares (exclusão segura de campeonato em uso). Exige o
// nome exato como confirmação. NÃO apaga jogos nem match_sources.
export function useArchiveCompetition() {
  const invalidate = useInvalidateComps();
  return useMutation({
    mutationFn: async (input: { id: string; confirmName: string }) => {
      const { error } = await rpcCall("admin_archive_competition", {
        p_id: input.id,
        p_confirm_name: input.confirmName,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

export function useRestoreCompetition() {
  const invalidate = useInvalidateComps();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await rpcCall("admin_restore_competition", { p_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// "Ver jogos / comparar fontes" — todos os jogos da competição com o que CADA
// fonte reporta (admin_match_sources_for_competition).
// ---------------------------------------------------------------------------
export type MatchWithSources = {
  id: string;
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
  hidden: boolean;
  sources: (SourceObservation & { kickoff_at?: string | null })[];
};

export function useMatchSourcesForCompetition(competitionId: string | null) {
  return useQuery({
    enabled: !!competitionId,
    queryKey: ["admin", "match-sources", competitionId],
    refetchInterval: 60_000,
    queryFn: async (): Promise<MatchWithSources[]> => {
      const { data, error } = await rpcCall<MatchWithSources[]>(
        "admin_match_sources_for_competition",
        { p_competition_id: competitionId, p_limit: 500 },
      );
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}
