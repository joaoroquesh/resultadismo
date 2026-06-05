import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { useAuth } from "@/features/auth/AuthProvider";

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
};

export function useNotifications() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["notifications", user?.id],
    queryFn: async (): Promise<Notification[]> => {
      // RPC server-side: filtra notificações de jogos OCULTOS (migration ...029).
      // Quando o admin oculta um jogo, é como se ele não existisse — palpite
      // não soma pontos (...028) e o lembrete/cutucada some daqui.
      const { data, error } = await supabase.rpc("get_my_notifications", {
        p_limit: 30,
      });
      if (error) throw error;
      return (data ?? []) as unknown as Notification[];
    },
  });
}

/**
 * Total real de não lidas (o badge do app). A lista de notificações é limitada
 * a 30; esta RPC conta TODAS sem teto, pra reconciliar o número ao abrir o app.
 */
export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["notifications-unread", user?.id],
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.rpc("get_unread_count");
      if (error) throw error;
      return (data ?? 0) as number;
    },
  });
}

export function useMarkAllRead() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .is("read_at", null);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications", user?.id] });
      qc.invalidateQueries({ queryKey: ["notifications-unread", user?.id] });
    },
  });
}

export function useNudge() {
  return useMutation({
    mutationFn: async (input: { matchId: string; toUser: string }) => {
      // Cutucada só pra quem ainda não palpitou o jogo. O backend valida:
      // jogo aberto, alvo não palpitou, par compartilho grupo que dispute
      // aquela competição, anti-spam de 30 min.
      const { error } = await supabase.rpc("nudge_for_match", {
        p_match_id: input.matchId,
        p_to_user: input.toUser,
      });
      if (error) throw error;
    },
    onSuccess: () => track("nudge_sent"),
  });
}

/** Assina novas notificações em tempo real (cutucadas chegam na hora). */
export function useNotificationsRealtime() {
  const { user } = useAuth();
  const qc = useQueryClient();
  useEffect(() => {
    if (!user) return;
    // Debounce: agrupa rajadas (ex.: vários lembretes) numa única revalidação.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["notifications", user.id] });
        qc.invalidateQueries({ queryKey: ["notifications-unread", user.id] });
      }, 800);
    };
    const channel = supabase
      .channel(`notifications-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        invalidate,
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [user, qc]);
}
