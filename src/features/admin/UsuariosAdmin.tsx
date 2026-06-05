import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Search, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SortControl, type SortDir, type SortFieldDef } from "@/components/ui/SortControl";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthProvider";
import { useAllProfiles, useSetAppAdmin, type AdminUser } from "./api";

type UserSortKey = "online" | "nome" | "entrada" | "uso";

const USER_FIELDS: readonly SortFieldDef<UserSortKey>[] = [
  { key: "online", label: "Online", defaultDir: "desc", ascLabel: "Offline 1º", descLabel: "Online 1º" },
  { key: "nome", label: "Nome", defaultDir: "asc", ascLabel: "A→Z", descLabel: "Z→A" },
  { key: "entrada", label: "Entrada", defaultDir: "desc", ascLabel: "Mais antigos", descLabel: "Mais recentes" },
  { key: "uso", label: "Uso", defaultDir: "desc", ascLabel: "Menos uso", descLabel: "Mais uso" },
];

// Comparação em ordem CRESCENTE; a direção é aplicada por fora (sinal).
function cmpUsers(a: AdminUser, b: AdminUser, key: UserSortKey): number {
  switch (key) {
    case "online": {
      const d = (a.is_online ? 1 : 0) - (b.is_online ? 1 : 0);
      if (d !== 0) return d;
      // desempate: atividade mais recente por último (no "Online 1º" fica no topo)
      return (a.last_active_at ?? "").localeCompare(b.last_active_at ?? "");
    }
    case "entrada":
      return a.created_at.localeCompare(b.created_at);
    case "uso":
      return (a.usage_seconds ?? 0) - (b.usage_seconds ?? 0);
    default:
      return a.display_name.localeCompare(b.display_name, "pt-BR");
  }
}

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
  const [sort, setSort] = useState<UserSortKey>("online");
  const [dir, setDir] = useState<SortDir>("desc");

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = (profiles ?? []).filter(
      (p) =>
        !term ||
        p.display_name.toLowerCase().includes(term) ||
        (p.email ?? "").toLowerCase().includes(term),
    );
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => sign * cmpUsers(a, b, sort));
  }, [profiles, q, sort, dir]);

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

      <SortControl
        fields={USER_FIELDS}
        value={sort}
        dir={dir}
        onChange={(k, d) => {
          setSort(k);
          setDir(d);
        }}
      />

      {/* Resumo — "online" em destaque (verde) p/ ficar claro quem está conectado */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
        <span>
          <strong className="font-bold text-ink-700">{list.length}</strong> usuários
        </span>
        <span className="inline-flex items-center gap-1.5 font-semibold text-grass-600">
          <span className="size-2 animate-pulse-live rounded-full bg-grass-500" />
          {onlineCount} online agora
        </span>
        <span>{adminCount} admin</span>
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
    <Card
      className={cn(
        "flex items-center gap-3 p-3",
        p.is_online && "ring-1 ring-grass-400/50",
      )}
    >
      {/* clicar no corpo abre o perfil do jogador */}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="relative shrink-0">
          <Avatar src={p.avatar_url} name={p.display_name} size="md" />
          {p.is_online && (
            <span
              className="absolute -bottom-0.5 -right-0.5 size-3 animate-pulse-live rounded-full bg-grass-500 ring-2 ring-surface"
              title="Online agora"
            />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate font-semibold text-ink-900">{p.display_name}</p>
            {p.is_online && (
              <span className="shrink-0 rounded-pill bg-grass-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-grass-700">
                online
              </span>
            )}
          </div>
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
