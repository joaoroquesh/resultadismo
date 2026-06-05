import { useMemo, useState } from "react";
import { ShieldCheck, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAllProfiles, useSetAppAdmin } from "./api";

export function UsuariosAdmin() {
  const { data: profiles, isLoading } = useAllProfiles();
  const setAdmin = useSetAppAdmin();
  const { user } = useAuth();
  const { toast } = useToast();
  const [q, setQ] = useState("");

  // Admins primeiro, depois ordem alfabética; filtra por nome ou e-mail.
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (profiles ?? [])
      .filter(
        (p) =>
          !term ||
          p.display_name.toLowerCase().includes(term) ||
          (p.email ?? "").toLowerCase().includes(term),
      )
      .sort((a, b) => {
        if (a.is_app_admin !== b.is_app_admin) return a.is_app_admin ? -1 : 1;
        return a.display_name.localeCompare(b.display_name, "pt-BR");
      });
  }, [profiles, q]);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  const adminCount = (profiles ?? []).filter((p) => p.is_app_admin).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="h-10 w-full rounded-md border border-ink-200 bg-surface pl-9 pr-3 text-sm outline-none focus:border-brand-500"
          />
        </div>
        <span className="shrink-0 text-xs text-ink-400">
          {list.length} · {adminCount} admin{adminCount === 1 ? "" : "s"}
        </span>
      </div>

      {list.length === 0 ? (
        <EmptyState title="Ninguém encontrado" description="Tente outro nome ou e-mail." />
      ) : (
        <div className="space-y-2">
          {list.map((p) => (
            <Card key={p.id} className="flex items-center gap-3 p-3">
              <Avatar src={p.avatar_url} name={p.display_name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-900">{p.display_name}</p>
                <p className="truncate text-xs text-ink-500">{p.email}</p>
              </div>
              {p.is_app_admin && <Badge tone="brand">admin</Badge>}
              {p.id !== user?.id && (
                <Button
                  size="sm"
                  variant={p.is_app_admin ? "outline" : "ghost"}
                  aria-label={p.is_app_admin ? "Remover admin" : "Tornar admin"}
                  loading={setAdmin.isPending}
                  onClick={() =>
                    setAdmin.mutate(
                      { userId: p.id, value: !p.is_app_admin },
                      { onSuccess: () => toast("Papel atualizado.", "success") },
                    )
                  }
                >
                  <ShieldCheck className="size-4" />
                </Button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
