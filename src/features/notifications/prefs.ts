import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

// Preferências de notificação por usuário (valem pra conta toda, não por
// dispositivo). O banco guarda em profiles.notif_prefs; default tudo ligado.
export type NotifPrefKey = "deadline" | "nudge" | "broadcast";
export type NotifPrefs = Record<NotifPrefKey, boolean>;

const DEFAULT_PREFS: NotifPrefs = { deadline: true, nudge: true, broadcast: true };

function normalizePrefs(raw: unknown): NotifPrefs {
  const obj = (raw ?? {}) as Partial<Record<NotifPrefKey, unknown>>;
  return {
    deadline: obj.deadline !== false,
    nudge: obj.nudge !== false,
    broadcast: obj.broadcast !== false,
  };
}

export function useNotificationPrefs() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["notif-prefs", user?.id],
    queryFn: async (): Promise<NotifPrefs> => {
      const { data, error } = await supabase.rpc("get_notification_prefs");
      if (error) throw error;
      return normalizePrefs(data);
    },
  });
}

export function useSetNotificationPref() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["notif-prefs", user?.id];
  return useMutation({
    mutationFn: async (input: { type: NotifPrefKey; enabled: boolean }) => {
      const { error } = await supabase.rpc("set_notification_pref", {
        p_type: input.type,
        p_enabled: input.enabled,
      });
      if (error) throw error;
    },
    // Otimista: o toggle responde na hora; reconcilia com o banco depois.
    onMutate: async ({ type, enabled }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<NotifPrefs>(key);
      qc.setQueryData<NotifPrefs>(key, (old) => ({ ...(old ?? DEFAULT_PREFS), [type]: enabled }));
      return { prev };
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
