import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Tipos (espelham os jsonb/tabelas das RPCs de admin de sincronização)
// ---------------------------------------------------------------------------
export type CompHealth = {
  id: string;
  name: string;
  provider: string;
  sync_enabled: boolean;
  last_synced_at: string | null;
  last_sync_ok: boolean | null;
  last_sync_error: string | null;
  last_sync_checked_at: string | null;
};

export type SystemHealth = {
  live_now: number;
  next_24h: number;
  pending_alerts: number;
  active_sessions: number;
  maintenance_mode: boolean;
  sync_problems: number;
  competitions: CompHealth[];
};

export type SyncAlertKind =
  | "new_match"
  | "cancelled"
  | "team_resolved"
  | "kickoff_changed"
  | "api_error";

export type SyncAlert = {
  id: string;
  competition_id: string | null;
  competition_name: string | null;
  match_id: string | null;
  kind: SyncAlertKind;
  status: "pending" | "approved" | "rejected" | "applied";
  message: string | null;
  payload: Record<string, unknown>;
  created_at: string;
  resolved_at: string | null;
};

export type AuditEntry = {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: Record<string, unknown>;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Saúde do sistema (dashboard)
// ---------------------------------------------------------------------------
export function useSystemHealth() {
  return useQuery({
    queryKey: ["admin", "health"],
    refetchInterval: 30_000, // o painel se mantém vivo sozinho
    queryFn: async (): Promise<SystemHealth> => {
      const { data, error } = await supabase.rpc("admin_system_health");
      if (error) throw new Error(error.message);
      return data as unknown as SystemHealth;
    },
  });
}

// ---------------------------------------------------------------------------
// Alertas de sincronização
// ---------------------------------------------------------------------------
export function useSyncAlerts() {
  return useQuery({
    queryKey: ["admin", "sync-alerts"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<SyncAlert[]> => {
      const { data, error } = await supabase.rpc("admin_list_sync_alerts", { p_limit: 100 });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as SyncAlert[];
    },
  });
}

export function useResolveSyncAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; action: "approve" | "reject" }) => {
      const { error } = await supabase.rpc("admin_resolve_sync_alert", {
        p_id: input.id,
        p_action: input.action,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "sync-alerts"] });
      qc.invalidateQueries({ queryKey: ["admin", "health"] });
      qc.invalidateQueries({ queryKey: ["admin", "matches"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    },
  });
}

// ---------------------------------------------------------------------------
// Toggles e ações
// ---------------------------------------------------------------------------
export function useSetCompetitionSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; value: boolean }) => {
      const { error } = await supabase.rpc("admin_set_competition_sync", {
        p_id: input.id,
        p_value: input.value,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "health"] });
      qc.invalidateQueries({ queryKey: ["admin", "competitions"] });
    },
  });
}

export function useSetMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { on: boolean; message?: string }) => {
      const { error } = await supabase.rpc("admin_set_maintenance", {
        p_on: input.on,
        p_message: input.message, // undefined → RPC usa o default (null)
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "health"] });
      qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
  });
}

export function useReopenMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { matchId: string; minutes: number }) => {
      const { error } = await supabase.rpc("admin_reopen_match", {
        p_match_id: input.matchId,
        p_minutes: input.minutes,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "matches"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    },
  });
}

export function useRecentAudit() {
  return useQuery({
    queryKey: ["admin", "audit"],
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase.rpc("admin_recent_audit", { p_limit: 40 });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AuditEntry[];
    },
  });
}

// Sincroniza agora (botão manual): mode catalog (= completo) ou scores.
export function useSyncNow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input?: { competitionId?: string; mode?: "scores" | "catalog" }) => {
      const { data, error } = await supabase.functions.invoke("sync-football", {
        body: {
          ...(input?.competitionId ? { competitionId: input.competitionId } : {}),
          mode: input?.mode ?? "catalog",
        },
      });
      if (error) throw new Error(error.message);
      return data as {
        synced: number;
        results: { competition: string; ok: boolean; error?: string; alerted?: number }[];
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    },
  });
}
