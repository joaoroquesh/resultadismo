import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bug, Lightbulb, Archive, Hammer, CheckCircle2, RotateCcw, Mail } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import { useAdminFeedback, useUpdateFeedback, type AdminFeedback, type FeedbackStatus } from "./api";

const FILTERS: { key: FeedbackStatus | "todos"; label: string }[] = [
  { key: "novo", label: "Novos" },
  { key: "backlog", label: "Backlog" },
  { key: "resolvido", label: "Resolvidos" },
  { key: "arquivado", label: "Arquivados" },
  { key: "todos", label: "Todos" },
];

export function FeedbackAdmin({ product }: { product?: "classico" | "retro" } = {}) {
  const { data, isLoading } = useAdminFeedback(product);
  const [filter, setFilter] = useState<FeedbackStatus | "todos">("novo");

  const counts = useMemo(() => {
    const c: Record<string, number> = { novo: 0, backlog: 0, resolvido: 0, arquivado: 0, todos: 0 };
    for (const f of data ?? []) {
      c[f.status] = (c[f.status] ?? 0) + 1;
      c.todos += 1;
    }
    return c;
  }, [data]);

  const list = (data ?? []).filter((f) => filter === "todos" || f.status === filter);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold transition",
              filter === f.key ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
            )}
          >
            {f.label}
            <span className={cn("tabular-nums", filter === f.key ? "text-white/80" : "text-ink-400")}>
              {counts[f.key] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <EmptyState title="Nada aqui" description="Nenhum item nesse filtro." />
      ) : (
        <div className="space-y-2">
          {list.map((f) => (
            <FeedbackCard key={f.id} f={f} />
          ))}
        </div>
      )}
    </div>
  );
}

function FeedbackCard({ f }: { f: AdminFeedback }) {
  const update = useUpdateFeedback();
  const { toast } = useToast();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(f.admin_reply ?? "");

  function run(status: FeedbackStatus, replyText?: string, msg?: string) {
    update.mutate(
      { id: f.id, status, reply: replyText },
      {
        onSuccess: () => {
          toast(msg ?? "Atualizado.", "success");
          setReplying(false);
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
      },
    );
  }

  const isBug = f.kind === "bug";
  return (
    <Card className={cn("p-3.5", f.status === "novo" && "ring-1 ring-brand-300/50")}>
      <div className="flex items-start gap-2">
        {isBug ? (
          <Bug className="mt-0.5 size-4 shrink-0 text-flame-500" />
        ) : (
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-gold-500" />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{f.title}</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-600">{f.body}</p>
        </div>
        <Badge tone={isBug ? "flame" : "gold"}>{isBug ? "erro" : "ideia"}</Badge>
      </div>

      {/* Contexto do erro */}
      {isBug && (f.page || f.app_version || f.user_agent) && (
        <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
          {f.page && <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-ink-600">📍 {f.page}</span>}
          {f.app_version && <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-ink-600">v{f.app_version}</span>}
          {f.user_agent && (
            <span className="max-w-full truncate rounded-pill bg-ink-100 px-2 py-0.5 text-ink-500" title={f.user_agent}>
              {shortUA(f.user_agent)}
            </span>
          )}
        </div>
      )}

      {/* Autor + contato */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink-400">
        <span>
          por{" "}
          {f.user_id ? (
            <Link to={`/jogador/${f.user_id}`} className="font-semibold text-brand-600 hover:underline">
              {f.author_name ?? "—"}
            </Link>
          ) : (
            <span className="font-semibold">{f.author_name ?? "—"}</span>
          )}
        </span>
        {f.author_email && (
          <a href={`mailto:${f.author_email}`} className="inline-flex items-center gap-1 hover:text-ink-700">
            <Mail className="size-3" /> {f.author_email}
          </a>
        )}
        <span>· {fromNow(f.created_at)}</span>
      </div>

      {/* Resposta já dada */}
      {f.status === "resolvido" && f.admin_reply && !replying && (
        <div className="mt-2 rounded-md bg-surface-2 p-2.5 text-xs text-grass-800">
          <span className="font-semibold">Resposta enviada:</span> {f.admin_reply}
        </div>
      )}

      {/* Editor de resposta (resolver) */}
      {replying ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="Resposta pro autor (ex.: 'Corrigido! Já está no ar.'). Ela chega como notificação."
            className="w-full resize-none rounded-md border border-ink-200 bg-surface p-2.5 text-sm outline-none focus:border-brand-500"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              fullWidth
              loading={update.isPending}
              onClick={() => run("resolvido", reply.trim() || undefined, "Resolvido! Autor notificado. ✅")}
            >
              <CheckCircle2 className="size-4" /> Resolver e responder
            </Button>
            <Button size="sm" variant="outline" onClick={() => setReplying(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {f.status !== "resolvido" && (
            <Button size="sm" onClick={() => setReplying(true)}>
              <CheckCircle2 className="size-4" /> Resolver
            </Button>
          )}
          {f.status !== "backlog" && f.status !== "resolvido" && (
            <Button size="sm" variant="outline" loading={update.isPending} onClick={() => run("backlog", undefined, "Mandado pro backlog.")}>
              <Hammer className="size-4" /> Backlog
            </Button>
          )}
          {f.status !== "arquivado" && f.status !== "resolvido" && (
            <Button size="sm" variant="ghost" loading={update.isPending} onClick={() => run("arquivado", undefined, "Arquivado.")}>
              <Archive className="size-4" /> Arquivar
            </Button>
          )}
          {(f.status === "arquivado" || f.status === "resolvido") && (
            <Button size="sm" variant="ghost" loading={update.isPending} onClick={() => run("novo", undefined, "Reaberto.")}>
              <RotateCcw className="size-4" /> Reabrir
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}

// Resumo legível do user agent (navegador + SO), pro admin não ler a string toda.
function shortUA(ua: string): string {
  const browser =
    /edg/i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Navegador";
  const os =
    /iphone|ipad|ios/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}
