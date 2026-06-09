import { useState } from "react";
import { Radio, Clock, Ban, Trash2, ShieldX, Undo2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import { useUserModeration, useSuspendUser, useDeleteUser } from "./sync";

// Retorna só a duração ("5min", "2h 10min", "30s") ou "" quando não há uso.
function fmtUsage(s: number | null | undefined): string {
  if (!s) return "";
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h${m > 0 ? ` ${m}min` : ""}` : `${m}min`;
}

type Pending = "suspend" | "delete" | "block" | null;

/**
 * Painel de moderação — só pra app-admin, no perfil de OUTRO usuário.
 * 3 níveis: suspender (reversível) · excluir (e-mail recadastra) · excluir +
 * bloquear e-mail (definitivo). As ações que bloqueiam/excluem passam por
 * dupla verificação (ConfirmDialog de 2 passos).
 */
export function UserModerationPanel({
  userId,
  userName,
  onDeleted,
}: {
  userId: string;
  userName: string;
  onDeleted: () => void;
}) {
  const { data: mod, isLoading } = useUserModeration(userId, true);
  const suspend = useSuspendUser();
  const del = useDeleteUser();
  const { toast } = useToast();
  const [pending, setPending] = useState<Pending>(null);

  const busy = suspend.isPending || del.isPending;

  function confirmAction() {
    if (pending === "suspend") {
      suspend.mutate(
        { userId, suspended: true },
        {
          onSuccess: () => {
            toast("Conta suspensa. O login fica bloqueado.", "success");
            setPending(null);
          },
          onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
        },
      );
    } else {
      del.mutate(
        { userId, blockEmail: pending === "block" },
        {
          onSuccess: () => {
            toast(pending === "block" ? "Conta excluída e e-mail bloqueado." : "Conta excluída.", "success");
            setPending(null);
            onDeleted();
          },
          onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
        },
      );
    }
  }

  const dialog =
    pending === "suspend"
      ? {
          title: "Suspender este usuário?",
          message: `"${userName}" não vai conseguir entrar até você reativar. Os dados e palpites ficam guardados.`,
          step2: "Confirme: bloquear o login desta pessoa agora?",
          label: "Suspender login",
        }
      : pending === "delete"
        ? {
            title: "Excluir esta conta?",
            message: `Apaga "${userName}" e os dados dela. O e-mail PODE criar conta de novo depois.`,
            step2: "Confirmação final: excluir esta conta de vez?",
            label: "Excluir conta",
          }
        : {
            title: "Excluir e bloquear o e-mail?",
            message: `Apaga "${userName}" e impede aquele e-mail de criar conta de novo. Ação definitiva.`,
            step2: "Confirmação final: excluir e bloquear o e-mail?",
            label: "Excluir e bloquear",
          };

  return (
    <div>
      <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-flame-600">
        Moderação · só admin
      </h3>
      <Card className="space-y-3 p-4">
        {/* Status */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className={cn("inline-flex items-center gap-1.5 font-semibold", mod?.is_online ? "text-grass-600" : "text-ink-400")}>
            <Radio className="size-4" /> {mod?.is_online ? "Online agora" : "Offline"}
          </span>
          <span className="inline-flex items-center gap-1.5 text-ink-500">
            <Clock className="size-4" />
            {isLoading
              ? "…"
              : mod?.usage_seconds
                ? `${fmtUsage(mod.usage_seconds)} de uso`
                : "sem uso ainda"}
          </span>
          {mod?.last_active_at && (
            <span className="text-xs text-ink-400">visto {fromNow(mod.last_active_at)}</span>
          )}
        </div>

        {mod?.suspended && (
          <div className="rounded-md bg-surface-2 px-3 py-2 text-sm font-medium text-flame-700 ring-1 ring-flame-600">
            Conta suspensa — login bloqueado.
          </div>
        )}

        {/* Ações */}
        <div className="flex flex-col gap-2">
          {mod?.suspended ? (
            <Button
              variant="outline"
              fullWidth
              loading={suspend.isPending}
              onClick={() =>
                suspend.mutate(
                  { userId, suspended: false },
                  { onSuccess: () => toast("Conta reativada.", "success") },
                )
              }
            >
              <Undo2 className="size-4" /> Reativar conta
            </Button>
          ) : (
            <Button variant="outline" fullWidth disabled={busy} onClick={() => setPending("suspend")}>
              <Ban className="size-4" /> Suspender login
            </Button>
          )}

          <div className="flex gap-2">
            <Button variant="danger" fullWidth disabled={busy} onClick={() => setPending("delete")}>
              <Trash2 className="size-4" /> Excluir
            </Button>
            <Button variant="danger" fullWidth disabled={busy} onClick={() => setPending("block")}>
              <ShieldX className="size-4" /> Excluir + bloquear
            </Button>
          </div>
          <p className="text-[11px] leading-snug text-ink-400">
            Suspender é reversível. Excluir apaga os dados; "+ bloquear" ainda impede o e-mail de
            voltar. Ações destrutivas pedem dupla confirmação.
          </p>
        </div>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title={dialog.title}
        message={dialog.message}
        step2Message={dialog.step2}
        confirmLabel={dialog.label}
        loading={busy}
        onConfirm={confirmAction}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
