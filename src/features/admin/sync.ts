import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/database";

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
  today: number;
  next_24h: number;
  pending_alerts: number;
  pending_leagues: number;
  online_now: number;
  active_sessions: number;
  maintenance_mode: boolean;
  online_alert_threshold: number;
  access_enabled: boolean;
  access_max_active: number;
  sync_problems: number;
  competitions: CompHealth[];
};

// Fallback se o banco ainda não respondeu (o valor real vem de app_settings,
// editável pelo admin em Visão → Configurações).
export const ONLINE_ALERT_THRESHOLD = 100;

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
  competition_provider: string | null;
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
  entity_label: string | null;
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

export function useSetOnlineThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (value: number) => {
      const { error } = await supabase.rpc("admin_set_online_threshold", { p_value: value });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "health"] }),
  });
}

export function useUpdateAccess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { enabled: boolean; maxActive: number }) => {
      const { error } = await supabase.rpc("admin_update_access", {
        p_enabled: input.enabled,
        p_max_active: input.maxActive,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "health"] }),
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

// ---------------------------------------------------------------------------
// Moderação de usuário (só app-admin; 3 níveis). Ver migration 20260604000007.
// ---------------------------------------------------------------------------
export type UserModeration = {
  suspended: boolean;
  usage_seconds: number;
  last_active_at: string | null;
  is_online: boolean;
};

export function useUserModeration(userId: string | undefined, enabled: boolean) {
  return useQuery({
    enabled: enabled && !!userId,
    queryKey: ["admin", "user-moderation", userId],
    queryFn: async (): Promise<UserModeration> => {
      const { data, error } = await supabase.rpc("admin_user_moderation", { p_user_id: userId! });
      if (error) throw new Error(error.message);
      return data as unknown as UserModeration;
    },
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; suspended: boolean }) => {
      const { error } = await supabase.rpc("admin_set_user_suspended", {
        p_user_id: input.userId,
        p_suspended: input.suspended,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin", "user-moderation", v.userId] });
      qc.invalidateQueries({ queryKey: ["admin", "profiles"] });
    },
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; blockEmail: boolean; reason?: string }) => {
      const { error } = input.blockEmail
        ? await supabase.rpc("admin_block_email", { p_user_id: input.userId, p_reason: input.reason })
        : await supabase.rpc("admin_delete_user", { p_user_id: input.userId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "profiles"] }),
  });
}

// ---------------------------------------------------------------------------
// Avisos (broadcasts) — disparo de notificação por segmento. Ver migration
// 20260605000002_notifications_overhaul. Cada segmento já desconta quem
// desativou avisos; o gate de admin mora nas RPCs.
// ---------------------------------------------------------------------------
export type SegmentKey = "all" | "no_prediction" | "online" | "group" | "group_top";

// Alvos pros selects de 'group' / 'group_top' (federações + competições ativas)
export type GroupTarget = {
  league_id: string;
  lc_id: string;
  league_name: string;
  competition_name: string;
};

export type Broadcast = {
  id: string;
  title: string;
  body: string | null;
  url: string;
  segment: string;
  segment_label: string | null;
  sent_count: number | null;
  author_name: string;
  created_at: string;
};

export function useGroupTargets() {
  return useQuery({
    queryKey: ["admin", "group-targets"],
    staleTime: 60_000,
    queryFn: async (): Promise<GroupTarget[]> => {
      const { data, error } = await supabase.rpc("admin_list_group_targets");
      if (error) throw new Error(error.message);
      return (data ?? []) as GroupTarget[];
    },
  });
}

// Push ativo na base: quantos aparelhos inscritos, de quantas pessoas. Mantém o
// alcance do aviso honesto — in-app chega pra todo o segmento; push só pra quem
// tem aparelho inscrito.
export function useAdminPushStats() {
  return useQuery({
    queryKey: ["admin", "push-stats"],
    staleTime: 60_000,
    queryFn: async (): Promise<{ devices: number; users: number }> => {
      const { data, error } = await supabase.rpc("admin_push_stats");
      if (error) throw new Error(error.message);
      const row = (data as { devices: number; users: number }[] | null)?.[0];
      return { devices: Number(row?.devices ?? 0), users: Number(row?.users ?? 0) };
    },
  });
}

// Quanta gente recebe esse aviso (debounce fica no componente). Habilitável
// para não chamar a RPC antes de o segmento/argumento estarem prontos.
export function useBroadcastPreview(
  segment: SegmentKey,
  arg: Record<string, unknown>,
  enabled: boolean,
) {
  return useQuery({
    enabled,
    queryKey: ["admin", "broadcast-preview", segment, arg],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("admin_broadcast_preview", {
        p_segment: segment,
        p_arg: arg as Json,
      });
      if (error) throw new Error(error.message);
      return (data ?? 0) as number;
    },
  });
}

export function useSendBroadcast() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      body: string;
      url: string;
      segment: SegmentKey;
      arg: Record<string, unknown>;
    }): Promise<number> => {
      const { data, error } = await supabase.rpc("admin_send_broadcast", {
        p_title: input.title,
        p_body: input.body,
        p_url: input.url,
        p_segment: input.segment,
        p_arg: input.arg as Json,
      });
      if (error) throw new Error(error.message);
      return (data ?? 0) as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "broadcasts"] });
    },
  });
}

export function useBroadcasts() {
  return useQuery({
    queryKey: ["admin", "broadcasts"],
    refetchInterval: 30_000,
    queryFn: async (): Promise<Broadcast[]> => {
      const { data, error } = await supabase.rpc("admin_list_broadcasts", { p_limit: 50 });
      if (error) throw new Error(error.message);
      return (data ?? []) as Broadcast[];
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
