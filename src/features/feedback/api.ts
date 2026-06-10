import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { track } from "@/lib/analytics";
import { useAuth } from "@/features/auth/AuthProvider";
import { version as APP_VERSION } from "../../../package.json";

export type FeedbackKind = "bug" | "idea";
export type FeedbackStatus = "novo" | "arquivado" | "backlog" | "resolvido";

// ---------------------------------------------------------------------------
// Usuário: enviar um report e acompanhar os próprios
// ---------------------------------------------------------------------------
export type MyFeedback = {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  page: string | null;
  status: FeedbackStatus;
  admin_reply: string | null;
  created_at: string;
  resolved_at: string | null;
  product?: "classico" | "retro";
};

export function useSubmitFeedback() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: {
      kind: FeedbackKind;
      title: string;
      body: string;
      page?: string | null;
      product?: "classico" | "retro";
    }) => {
      // Contexto (página/versão/device) só faz sentido — e só é enviado — em erro.
      const args =
        input.kind === "bug"
          ? {
              p_kind: input.kind,
              p_title: input.title,
              p_body: input.body,
              p_page: input.page ?? undefined,
              p_app_version: APP_VERSION,
              p_user_agent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
              p_product: input.product ?? "classico",
            }
          : { p_kind: input.kind, p_title: input.title, p_body: input.body, p_product: input.product ?? "classico" };
      const { error } = await supabase.rpc("submit_feedback", args);
      if (error) throw new Error(error.message);
      track("feedback_submit", { kind: input.kind });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-feedback", user?.id] }),
  });
}

export function useMyFeedback(product: "classico" | "retro" = "classico") {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["my-feedback", product, user?.id],
    queryFn: async (): Promise<MyFeedback[]> => {
      // RLS: o usuário só enxerga os próprios reports (feedback_select_own_or_admin).
      const me = (await supabase.auth.getUser()).data.user?.id;
      const { data, error } = await supabase
        .from("feedback")
        .select("id,kind,title,body,page,status,admin_reply,created_at,resolved_at")
        .eq("product", product)
        .eq("user_id", me ?? "")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MyFeedback[];
    },
  });
}

// ---------------------------------------------------------------------------
// Admin: listar tudo + gerir o ciclo (arquivar / backlog / resolver+responder)
// ---------------------------------------------------------------------------
export type AdminFeedback = {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  page: string | null;
  app_version: string | null;
  user_agent: string | null;
  status: FeedbackStatus;
  admin_reply: string | null;
  created_at: string;
  resolved_at: string | null;
  user_id: string | null;
  author_name: string | null;
  author_email: string | null;
  product: "classico" | "retro";
};

export function useAdminFeedback(product?: "classico" | "retro") {
  return useQuery({
    queryKey: ["admin-feedback", product ?? "all"],
    queryFn: async (): Promise<AdminFeedback[]> => {
      const { data, error } = await supabase.rpc("admin_list_feedback");
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as AdminFeedback[];
      return product ? rows.filter((f) => (f.product ?? "classico") === product) : rows;
    },
  });
}

export function useUpdateFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: FeedbackStatus; reply?: string | null }) => {
      const { error } = await supabase.rpc("admin_update_feedback", {
        p_id: input.id,
        p_status: input.status,
        p_reply: input.reply ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-feedback"] }),
  });
}
