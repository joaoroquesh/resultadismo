import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, RefreshCw, Plus, ShieldCheck, Trash2, RotateCcw, Settings, Clock, Eye, EyeOff, Pencil, AlertTriangle } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { dayjs } from "@/lib/format";
import { useDeletedLeagues, useSoftDeleteLeague, useRestoreLeague } from "./moderation";
import { useProviderCompetitions, type ProviderCompetition, type ProviderName } from "./providers";
import {
  useDeleteCompetition,
  useSetCompetitionPublished,
  useRenameCompetition,
} from "./competitions";
import { PaymentAdmin } from "./PaymentAdmin";
import { cn } from "@/lib/utils";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { NameRulesCard } from "./NameRulesCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  usePendingLeagues,
  useApproveLeague,
  useRejectLeague,
  useAdminCompetitions,
  useCreateCompetition,
  useSyncFootball,
  useAllProfiles,
  useSetAppAdmin,
} from "./api";
import type { DataProvider } from "@/lib/types";

type Tab = "federações" | "competicoes" | "usuarios" | "pagamento";

export function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("federações");

  return (
    <Page
      title="Admin"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/perfil")} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <SegmentedControl<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "federações", label: "Federações" },
          { value: "competicoes", label: "Comp." },
          { value: "usuarios", label: "Users" },
          { value: "pagamento", label: "Pgto" },
        ]}
      />
      {tab === "federações" && <LigasAdmin />}
      {tab === "competicoes" && <CompeticoesAdmin />}
      {tab === "usuarios" && <UsuariosAdmin />}
      {tab === "pagamento" && <PaymentAdmin />}
    </Page>
  );
}

function LigasAdmin() {
  const { data: leagues, isLoading } = usePendingLeagues();
  const { data: trash } = useDeletedLeagues();
  const approve = useApproveLeague();
  const reject = useRejectLeague();
  const softDelete = useSoftDeleteLeague();
  const restore = useRestoreLeague();
  const { toast } = useToast();
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  // federações já excluídas (soft) saem das listas normais e vão pra Lixeira
  const live = (leagues ?? []).filter((l) => !(l as { deleted_at?: string | null }).deleted_at);
  const pending = live.filter((l) => l.status === "pending");
  const others = live.filter((l) => l.status !== "pending");

  function confirmDelete() {
    if (!toDelete) return;
    softDelete.mutate(toDelete.id, {
      onSuccess: () => {
        toast("Federação excluída. Você tem 10 min para desfazer na Lixeira.", "success");
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
          <EmptyState title="Nada pendente" description="Novas federações aparecerão aqui para aprovação." />
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
                    approve.mutate(l.id, { onSuccess: () => toast("Federação aprovada!", "success") })
                  }
                >
                  <Check className="size-4" /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  fullWidth
                  onClick={() =>
                    reject.mutate(l.id, { onSuccess: () => toast("Federação rejeitada.", "info") })
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
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Todas as federações</h2>
          {others.map((l) => (
            <Card key={l.id} className="flex items-center gap-2 p-3.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink-900">{l.name}</p>
                <p className="truncate text-xs text-ink-500">por {l.owner?.display_name ?? "—"}</p>
              </div>
              <Badge tone={l.status === "active" ? "grass" : l.status === "rejected" ? "flame" : "neutral"}>
                {l.status}
              </Badge>
              <Link to={`/federacoes/${l.slug}`} aria-label="Gerir federação">
                <Button size="icon" variant="ghost">
                  <Settings className="size-4" />
                </Button>
              </Link>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Excluir federação"
                onClick={() => setToDelete({ id: l.id, name: l.name })}
              >
                <Trash2 className="size-4 text-flame-500" />
              </Button>
            </Card>
          ))}
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
                      onSuccess: () => toast("Federação restaurada!", "success"),
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
        title="Excluir federação"
        message={`Excluir "${toDelete?.name ?? ""}"? Ela some para os membros, mas dá pra desfazer por 10 min na Lixeira.`}
        step2Message="Confirmação final: excluir esta federação agora?"
        confirmLabel="Excluir federação"
        loading={softDelete.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(spanish|english|italian|german|french|brazilian|primera|premier|league|liga|serie|division|campeonato)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function CompeticoesAdmin() {
  const { data: comps, isLoading } = useAdminCompetitions();
  const create = useCreateCompetition();
  const sync = useSyncFootball();
  const del = useDeleteCompetition();
  const setPub = useSetCompetitionPublished();
  const rename = useRenameCompetition();
  const { toast } = useToast();
  const [provider, setProvider] = useState<ProviderName>("football_data");
  const [filter, setFilter] = useState("");
  const { data: catalog, isLoading: loadingCatalog, error: catalogError } =
    useProviderCompetitions(provider);

  // estado da UI de gestão
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // (provider, provider_code) -> já no app, p/ marcar "adicionada"
  const addedKeys = useMemo(() => {
    const s = new Set<string>();
    (comps ?? []).forEach((c) => {
      if (c.provider_code) s.add(`${c.provider}:${c.provider_code}`);
    });
    return s;
  }, [comps]);

  // duplicatas: agrupa competições já adicionadas por nome normalizado
  const dupGroups = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const c of comps ?? []) {
      const k = normalizeName((c as { display_name?: string }).display_name || c.name);
      if (!k) continue;
      const arr = m.get(k) ?? [];
      arr.push(c.id);
      m.set(k, arr);
    }
    const dupIds = new Set<string>();
    for (const ids of m.values()) {
      if (ids.length > 1) ids.forEach((id) => dupIds.add(id));
    }
    return dupIds;
  }, [comps]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = catalog ?? [];
    if (!q) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.country ?? "").toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [catalog, filter]);

  async function handleSync(id?: string) {
    try {
      const r = await sync.mutateAsync(id);
      const failed = r.results.filter((x) => !x.ok);
      if (failed.length) toast(`Sync parcial: ${failed[0]!.error}`, "error");
      else toast(`Sincronizado (${r.synced} competição/ões).`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro no sync.", "error");
    }
  }

  async function handleAdd(c: ProviderCompetition) {
    try {
      await create.mutateAsync({
        name: c.name,
        provider: c.provider as DataProvider,
        providerCode: c.code,
        providerSeason: c.season ?? undefined,
        type: c.type === "CUP" ? "CUP" : "LEAGUE",
        isFeatured: false,
      });
      toast(`${c.name} adicionada como rascunho. Veja os jogos e publique.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro.", "error");
    }
  }

  function startEdit(id: string, current: string) {
    setEditingId(id);
    setEditingName(current);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditingName("");
  }
  async function saveEdit(id: string) {
    try {
      await rename.mutateAsync({ id, displayName: editingName });
      toast("Nome atualizado.", "success");
      cancelEdit();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro.", "error");
    }
  }
  async function togglePublish(id: string, value: boolean) {
    try {
      await setPub.mutateAsync({ id, value });
      toast(value ? "Competição publicada!" : "Voltou para rascunho.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro.", "error");
    }
  }
  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync(toDelete.id);
      toast(`${toDelete.name} excluída.`, "success");
      setToDelete(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao excluir.", "error");
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      <NameRulesCard />
      <Button variant="outline" fullWidth loading={sync.isPending} onClick={() => handleSync()}>
        <RefreshCw className="size-4" /> Sincronizar todas
      </Button>

      {/* já no app — com gestão completa */}
      {(comps ?? []).map((c) => {
        const cc = c as typeof c & {
          display_name?: string | null;
          is_published?: boolean;
        };
        const shown = cc.display_name || c.name;
        const isDup = dupGroups.has(c.id);
        const published = cc.is_published !== false;
        const isEditing = editingId === c.id;
        return (
          <Card key={c.id} className="p-3.5">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  placeholder="Nome em português"
                  autoFocus
                  className="h-10 flex-1 rounded-md border border-ink-200 bg-surface px-3 outline-none focus:border-brand-500"
                />
                <Button size="sm" loading={rename.isPending} onClick={() => saveEdit(c.id)}>
                  Salvar
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelEdit}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-ink-900">{shown}</p>
                      {!published && <Badge tone="gold">rascunho</Badge>}
                      {isDup && (
                        <Badge tone="flame" className="gap-1">
                          <AlertTriangle className="size-3" /> duplicata
                        </Badge>
                      )}
                    </div>
                    <p className="truncate text-xs text-ink-500">
                      {c.provider}
                      {c.provider_code ? ` · ${c.provider_code}` : ""}
                      {cc.display_name ? ` · original: ${c.name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => togglePublish(c.id, !published)}
                    loading={setPub.isPending}
                  >
                    {published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    {published ? "Despublicar" : "Publicar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => startEdit(c.id, shown)}>
                    <Pencil className="size-4" /> Renomear
                  </Button>
                  <Link
                    to={`/admin/competicoes/${c.id}/jogos`}
                    className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-500/10"
                    title="Ver e gerenciar os jogos desta competição"
                  >
                    <Eye className="size-3.5" /> Ver jogos
                  </Link>
                  {c.provider !== "manual" && (
                    <Button size="sm" variant="ghost" onClick={() => handleSync(c.id)}>
                      <RefreshCw className="size-4" /> Sincronizar
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setToDelete({ id: c.id, name: shown })}
                    aria-label="Excluir competição"
                  >
                    <Trash2 className="size-4 text-flame-500" />
                  </Button>
                </div>
              </>
            )}
          </Card>
        );
      })}

      {/* catálogo das APIs grátis */}
      <Card className="space-y-3 p-4">
        <div>
          <p className="text-sm font-semibold text-ink-900">Adicionar do catálogo</p>
          <p className="text-xs text-ink-500">
            Competições liberadas no plano da sua chave em cada provedor.
          </p>
        </div>
        <div className="flex gap-1 rounded-pill bg-ink-100 p-1">
          {(["football_data", "thesportsdb"] as ProviderName[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setProvider(p)}
              className={cn(
                "flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-all",
                provider === p
                  ? "bg-surface text-ink-950 shadow-[var(--shadow-soft)]"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              {p === "football_data" ? "football-data.org" : "TheSportsDB"}
            </button>
          ))}
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por nome, país ou código…"
          className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3.5 outline-none focus:border-brand-500"
        />
        {loadingCatalog ? (
          <Skeleton className="h-40 w-full" />
        ) : catalogError ? (
          <p className="text-sm text-flame-600">
            Erro ao buscar catálogo: {(catalogError as Error).message}
          </p>
        ) : (
          <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-md border border-border">
            {filtered.length === 0 ? (
              <li className="p-4 text-center text-sm text-ink-400">
                Nenhuma competição encontrada.
              </li>
            ) : (
              filtered.map((c) => {
                const added = addedKeys.has(`${c.provider}:${c.code}`);
                return (
                  <li
                    key={`${c.provider}:${c.code}`}
                    className="flex items-center gap-3 p-2.5"
                  >
                    {c.emblem ? (
                      <img src={c.emblem} alt="" className="size-7 shrink-0 rounded" />
                    ) : (
                      <div className="size-7 shrink-0 rounded bg-ink-100" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">{c.name}</p>
                      <p className="truncate text-[11px] text-ink-500">
                        {c.country ?? "—"} · {c.code}
                        {c.season ? ` · temp. ${c.season}` : ""}
                      </p>
                    </div>
                    {added ? (
                      <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-grass-600">
                        <Check className="size-3.5" /> adicionada
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        loading={create.isPending}
                        onClick={() => handleAdd(c)}
                      >
                        <Plus className="size-4" /> Adicionar
                      </Button>
                    )}
                  </li>
                );
              })
            )}
          </ul>
        )}
        <p className="text-[11px] text-ink-400">
          {filtered.length} de {catalog?.length ?? 0} ·{" "}
          {provider === "football_data" ? "football-data.org" : "TheSportsDB"}
        </p>
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        title="Excluir competição"
        message={`Excluir "${toDelete?.name ?? ""}"? Os jogos, times e palpites desta competição também somem. Não dá pra desfazer.`}
        step2Message="Confirmação final: excluir essa competição e tudo dentro dela?"
        confirmLabel="Excluir competição"
        loading={del.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

function UsuariosAdmin() {
  const { data: profiles, isLoading } = useAllProfiles();
  const setAdmin = useSetAppAdmin();
  const { user } = useAuth();
  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-2">
      {profiles?.map((p) => (
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
  );
}
