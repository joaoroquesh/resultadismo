import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, X, Trash2, RotateCcw, Settings, Clock, Search } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { dayjs } from "@/lib/format";
import { useDeletedLeagues, useSoftDeleteLeague, useRestoreLeague } from "./moderation";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { usePendingLeagues, useApproveLeague, useRejectLeague } from "./api";

export function LigasAdmin() {
  const { data: leagues, isLoading } = usePendingLeagues();
  const { data: trash } = useDeletedLeagues();
  const approve = useApproveLeague();
  const reject = useRejectLeague();
  const softDelete = useSoftDeleteLeague();
  const restore = useRestoreLeague();
  const { toast } = useToast();
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [q, setQ] = useState("");

  // grupos já excluídas (soft) saem das listas normais e vão pra Lixeira
  const live = (leagues ?? []).filter((l) => !l.deleted_at);
  const pending = live.filter((l) => l.status === "pending");
  const others = live.filter((l) => l.status !== "pending");

  // busca na lista "Todos os grupos" (por nome ou dono)
  const filteredOthers = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return others;
    return others.filter(
      (l) =>
        l.name.toLowerCase().includes(term) ||
        (l.owner?.display_name ?? "").toLowerCase().includes(term),
    );
  }, [others, q]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  function confirmDelete() {
    if (!toDelete) return;
    softDelete.mutate(toDelete.id, {
      onSuccess: () => {
        toast("Grupo excluído. Você tem 10 min para desfazer na Lixeira.", "success");
        setToDelete(null);
      },
      onError: (e) => toast(e instanceof Error ? e.message : "Erro ao excluir.", "error"),
    });
  }

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Aguardando aprovação</h2>
        {pending.length === 0 ? (
          <EmptyState title="Nada pendente" description="Novos grupos aparecerão aqui para aprovação." />
        ) : (
          pending.map((l) => (
            <Card key={l.id} className="p-4">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="font-bold text-ink-900">{l.name}</h3>
                <Badge tone="gold">pendente</Badge>
              </div>
              <p className="mb-3 text-xs text-ink-500">
                por {l.owner?.display_name ?? "—"} · {l.visibility === "public" ? "pública" : "privada"}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  fullWidth
                  loading={approve.isPending}
                  onClick={() =>
                    approve.mutate(l.id, { onSuccess: () => toast("Grupo aprovado!", "success") })
                  }
                >
                  <Check className="size-4" /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  fullWidth
                  onClick={() =>
                    reject.mutate(l.id, { onSuccess: () => toast("Grupo rejeitado.", "info") })
                  }
                >
                  <X className="size-4" /> Rejeitar
                </Button>
              </div>
            </Card>
          ))
        )}
      </section>

      {others.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
              Todos os grupos ({others.length})
            </h2>
          </div>
          {others.length > 5 && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar grupo por nome ou dono…"
                className="h-10 w-full rounded-md border border-ink-200 bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-500"
              />
            </div>
          )}
          {filteredOthers.length === 0 ? (
            <EmptyState title="Nenhum grupo encontrado" description="Tente outro termo." />
          ) : (
            filteredOthers.map((l) => (
            <Card key={l.id} className="flex items-center gap-2 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-900">{l.name}</p>
                <p className="truncate text-xs text-ink-500">por {l.owner?.display_name ?? "—"}</p>
              </div>
              <Badge tone={l.status === "active" ? "grass" : l.status === "rejected" ? "flame" : "neutral"}>
                {l.status}
              </Badge>
              <Link to={`/grupos/${l.slug}`} aria-label="Gerir grupo">
                <Button size="icon" variant="ghost">
                  <Settings className="size-4" />
                </Button>
              </Link>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Excluir grupo"
                onClick={() => setToDelete({ id: l.id, name: l.name })}
              >
                <Trash2 className="size-4 text-flame-500" />
              </Button>
            </Card>
            ))
          )}
        </section>
      )}

      {trash && trash.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">
            Lixeira · desfazer em até 10 min
          </h2>
          {trash.map((d) => {
            const mins = 10 - dayjs().diff(dayjs(d.deleted_at), "minute");
            return (
              <Card key={d.id} className="flex items-center gap-2 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{d.name}</p>
                  <p className="flex items-center gap-1 text-xs text-ink-400">
                    <Clock className="size-3" />
                    {mins > 0 ? `apaga de vez em ~${mins} min` : "apagando…"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  loading={restore.isPending}
                  onClick={() =>
                    restore.mutate(d.id, {
                      onSuccess: () => toast("Grupo restaurado!", "success"),
                      onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
                    })
                  }
                >
                  <RotateCcw className="size-4" /> Restaurar
                </Button>
              </Card>
            );
          })}
        </section>
      )}

      <ConfirmDialog
        open={!!toDelete}
        title="Excluir grupo"
        message={`Excluir "${toDelete?.name ?? ""}"? Ela some para os membros, mas dá pra desfazer por 10 min na Lixeira.`}
        step2Message="Confirmação final: excluir este grupo agora?"
        confirmLabel="Excluir grupo"
        loading={softDelete.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
