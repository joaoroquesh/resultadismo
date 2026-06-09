import { Plus, XCircle, AlertTriangle, Check, Clock, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import { useSyncAlerts, useResolveSyncAlert, type SyncAlert, type SyncAlertKind } from "./sync";

const KIND: Record<
  SyncAlertKind,
  { icon: typeof Plus; label: string; tone: "gold" | "flame" | "brand" | "ink" }
> = {
  new_match: { icon: Plus, label: "Jogo novo", tone: "gold" },
  cancelled: { icon: XCircle, label: "Cancelamento", tone: "flame" },
  api_error: { icon: AlertTriangle, label: "API com problema", tone: "flame" },
  team_resolved: { icon: Check, label: "Confronto definido", tone: "brand" },
  kickoff_changed: { icon: Clock, label: "Horário mudou", tone: "ink" },
};

const TONE_BG: Record<string, string> = {
  gold: "bg-surface-2 text-gold-700",
  flame: "bg-surface-2 text-flame-600",
  brand: "bg-surface-2 text-brand-700",
  ink: "bg-ink-100 text-ink-500",
};

function PendingAlert({ alert }: { alert: SyncAlert }) {
  const resolve = useResolveSyncAlert();
  const { toast } = useToast();
  const meta = KIND[alert.kind] ?? KIND.new_match;
  const Icon = meta.icon;

  // Rótulos de ação por tipo (clareza: o admin sabe exatamente o que cada botão faz)
  const actions =
    alert.kind === "new_match"
      ? { yes: "Inserir jogo", no: "Ignorar" }
      : alert.kind === "cancelled"
        ? { yes: "Cancelar o jogo", no: "Manter" }
        : { yes: "Marcar resolvido", no: null };

  function act(action: "approve" | "reject") {
    resolve.mutate(
      { id: alert.id, action },
      {
        onSuccess: () =>
          toast(action === "approve" ? "Feito!" : "Alerta dispensado.", "success"),
        onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
      },
    );
  }

  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-full", TONE_BG[meta.tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-400">{meta.label}</p>
          <span className="shrink-0 text-[11px] text-ink-400">{fromNow(alert.created_at)}</span>
        </div>
        <p className="mt-0.5 text-sm font-medium text-ink-900">{alert.message}</p>
        {(alert.competition_name || alert.competition_provider) && (
          <p className="text-xs text-ink-400">
            {[alert.competition_name, alert.competition_provider].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="mt-2 flex gap-2">
          <Button
            size="sm"
            variant={alert.kind === "cancelled" || alert.kind === "api_error" ? "outline" : "primary"}
            loading={resolve.isPending}
            onClick={() => act("approve")}
          >
            {actions.yes}
          </Button>
          {actions.no && (
            <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => act("reject")}>
              {actions.no}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryRow({ alert }: { alert: SyncAlert }) {
  const meta = KIND[alert.kind] ?? KIND.new_match;
  const Icon = meta.icon;
  const resolvedLabel =
    alert.status === "approved" ? "aprovado" : alert.status === "rejected" ? "recusado" : "aplicado";
  return (
    <div className="flex items-center gap-3 px-3.5 py-2">
      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full", TONE_BG[meta.tone])}>
        <Icon className="size-3" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-ink-600">{alert.message}</p>
        {(alert.competition_name || alert.competition_provider) && (
          <p className="truncate text-[11px] text-ink-400">
            {[alert.competition_name, alert.competition_provider].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[11px] text-ink-400">
        {resolvedLabel} · {fromNow(alert.resolved_at ?? alert.created_at)}
      </span>
    </div>
  );
}

export function SyncAlertsPanel() {
  const { data: alerts, isLoading } = useSyncAlerts();

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const pending = (alerts ?? []).filter((a) => a.status === "pending");
  const history = (alerts ?? []).filter((a) => a.status !== "pending");

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
          Precisam de você {pending.length > 0 && `(${pending.length})`}
        </h2>
        {pending.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck className="size-7" />}
            title="Tudo em dia"
            description="Nenhuma decisão pendente. Jogos novos e cancelamentos vão aparecer aqui."
          />
        ) : (
          <Card className="divide-y divide-border p-0">
            {pending.map((a) => (
              <PendingAlert key={a.id} alert={a} />
            ))}
          </Card>
        )}
      </section>

      {history.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Histórico</h2>
          <Card className="divide-y divide-border p-0">
            {history.slice(0, 30).map((a) => (
              <HistoryRow key={a.id} alert={a} />
            ))}
          </Card>
        </section>
      )}
    </div>
  );
}
