import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Search, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAllProfiles, useSetAppAdmin, type AdminUser } from "./api";

type SortKey = "nome" | "recentes" | "antigos" | "uso";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "nome", label: "Nome" },
  { key: "recentes", label: "Recentes" },
  { key: "antigos", label: "Antigos" },
  { key: "uso", label: "Mais uso" },
];

function fmtUsage(s: number): string {
  if (!s || s < 60) return s ? `${s}s de uso` : "sem uso ainda";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h${m > 0 ? ` ${m}min` : ""} de uso`;
  return `${m}min de uso`;
}

export function UsuariosAdmin() {
  const { data: profiles, isLoading } = useAllProfiles();
  const setAdmin = useSetAppAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("nome");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = (profiles ?? []).filter(
      (p) =>
        !term ||
        p.display_name.toLowerCase().includes(term) ||
        (p.email ?? "").toLowerCase().includes(term),
    );
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      switch (sort) {
        case "recentes":
          return b.created_at.localeCompare(a.created_at);
        case "antigos":
          return a.created_at.localeCompare(b.created_at);
        case "uso":
          return (b.usage_seconds ?? 0) - (a.usage_seconds ?? 0);
        default: // nome — admins primeiro, depois alfabético
          if (a.is_app_admin !== b.is_app_admin) return a.is_app_admin ? -1 : 1;
          return a.display_name.localeCompare(b.display_name, "pt-BR");
      }
    });
    return sorted;
  }, [profiles, q, sort]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const adminCount = (profiles ?? []).filter((p) => p.is_app_admin).length;
  const onlineCount = (profiles ?? []).filter((p) => p.is_online).length;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nome ou e-mail…"
          className="h-10 w-full rounded-md border border-ink-200 bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              className={cn(
                "shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold transition",
                sort === s.key ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="shrink-0 text-xs text-ink-400">
          {list.length} · {onlineCount} on · {adminCount} adm
        </span>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Ninguém encontrado" description="Tente outro nome ou e-mail." />
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <UserRow
              key={p.id}
              p={p}
              isSelf={p.id === user?.id}
              busy={setAdmin.isPending}
              onOpen={() => navigate(`/jogador/${p.id}`)}
              onToggleAdmin={() =>
                setAdmin.mutate(
                  { userId: p.id, value: !p.is_app_admin },
                  { onSuccess: () => toast("Papel atualizado.", "success") },
                )
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({
  p,
  isSelf,
  busy,
  onOpen,
  onToggleAdmin,
}: {
  p: AdminUser;
  isSelf: boolean;
  busy: boolean;
  onOpen: () => void;
  onToggleAdmin: () => void;
}) {
  return (
    <Card className="flex items-center gap-3 p-3">
      {/* clicar no corpo abre o perfil do jogador */}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="relative shrink-0">
          <Avatar src={p.avatar_url} name={p.display_name} size="md" />
          {p.is_online && (
            <span
              className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-grass-500 ring-2 ring-surface"
              title="Online agora"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900">{p.display_name}</p>
          <p className="truncate text-xs text-ink-500">{p.email}</p>
          <p className="truncate text-[11px] text-ink-400">
            entrou {fromNow(p.created_at)} · {fmtUsage(p.usage_seconds)}
          </p>
        </div>
      </button>

      {p.is_app_admin && <Badge tone="brand">admin</Badge>}
      {!isSelf && (
        <Button
          size="icon"
          variant={p.is_app_admin ? "outline" : "ghost"}
          aria-label={p.is_app_admin ? "Remover admin" : "Tornar admin"}
          loading={busy}
          onClick={onToggleAdmin}
        >
          <ShieldCheck className="size-4" />
        </Button>
      )}
      <ChevronRight className="size-4 shrink-0 text-ink-300" />
    </Card>
  );
}
