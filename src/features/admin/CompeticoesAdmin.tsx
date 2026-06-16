import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check, RefreshCw, Plus, Trash2, Eye, EyeOff, Pencil, X,
  ChevronRight, ChevronDown, Star, GitCompare, ArchiveRestore,
} from "lucide-react";
import { CompetitionDangerDialog, type CompetitionDanger } from "./CompetitionDangerDialog";
import { useProviderCompetitions, type ProviderCompetition } from "./providers";
import { useSetCompetitionPublished, useRenameCompetition } from "./competitions";
import { useSetCompetitionSync } from "./sync";
import {
  useCompetitionsFull,
  useSetPrimarySource,
  useToggleSource,
  useAddSecondarySource,
  useRemoveSource,
  useRestoreCompetition,
  type CompFull,
} from "./competitionsAdmin";
import {
  COMP_GROUPS, compGroupOf, compOrderIdx, registryKey, registryName, type CompGroup,
} from "./competitionGroups";
import type { CompetitionSource } from "./dataSources";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import { Card } from "@/components/ui/Card";
import { NameRulesCard } from "./NameRulesCard";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Switch } from "@/components/ui/Switch";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useCreateCompetition, useSyncFootball } from "./api";
import type { DataProvider } from "@/lib/types";

const PROVIDER_LABEL: Record<string, string> = {
  espn: "ESPN",
  football_data: "football-data.org",
  thesportsdb: "TheSportsDB",
  fifawc: "FIFA WC",
  manual: "Manual",
};
const provLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

// Normaliza nome p/ agrupar entradas do catálogo que sejam o mesmo campeonato
// quando não há cruzamento no registro (fallback; o forte é registryKey).
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(campeonato|primera|premier|division|fc|cf)\b/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function healthDot(ok: boolean | null): string {
  return ok === true ? "bg-grass-500" : ok === false ? "bg-flame-500" : "bg-ink-300";
}
function sourceHealthText(s: CompetitionSource): string {
  if (!s.last_sync_checked_at) return "ainda não checada";
  return `${s.last_sync_ok === false ? "falhou" : "ok"} · ${fromNow(s.last_sync_checked_at)}`;
}

// ---------------------------------------------------------------------------
// Uma fonte de API da competição (primária ou secundária)
// ---------------------------------------------------------------------------
function SourceRow({ comp, s }: { comp: CompFull; s: CompetitionSource }) {
  const { toast } = useToast();
  const setPrimary = useSetPrimarySource();
  const toggle = useToggleSource();
  const remove = useRemoveSource();
  const [confirming, setConfirming] = useState(false);
  const isPrimary = s.role === "primary";

  return (
    <div className="flex items-center gap-2.5 rounded-md border border-border p-2.5">
      <span className={cn("size-2.5 shrink-0 rounded-full", healthDot(s.last_sync_ok))} title="Saúde da fonte" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-ink-900">{provLabel(s.provider)}</span>
          {isPrimary ? (
            <Badge tone="brand" className="gap-1">
              <Star className="size-3" /> Primária
            </Badge>
          ) : (
            <Badge tone="neutral">Secundária</Badge>
          )}
          {s.provider_code && (
            <span className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[11px] text-ink-500">
              {s.provider_code}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-ink-400">
          {isPrimary ? "dona do calendário" : "valida o placar"} · {sourceHealthText(s)}
          {s.matches_count != null ? ` · ${s.matches_count} jogo(s)` : ""}
        </p>
        {s.last_sync_ok === false && s.last_sync_error && (
          <p className="mt-0.5 line-clamp-2 text-xs font-medium text-flame-600">{s.last_sync_error}</p>
        )}
      </div>

      {!isPrimary &&
        (confirming ? (
          <div className="flex shrink-0 items-center gap-1">
            <Button
              size="sm"
              loading={setPrimary.isPending}
              onClick={async () => {
                try {
                  await setPrimary.mutateAsync({ competitionId: comp.id, sourceId: s.id });
                  toast(`${provLabel(s.provider)} agora é a fonte primária (dona do calendário).`, "success");
                } catch (e) {
                  toast(e instanceof Error ? e.message : "Erro.", "error");
                } finally {
                  setConfirming(false);
                }
              }}
            >
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              cancelar
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="shrink-0"
            title="Tornar a dona do calendário (a atual vira secundária)"
            onClick={() => setConfirming(true)}
          >
            Tornar primária
          </Button>
        ))}

      <Switch
        checked={s.enabled}
        disabled={toggle.isPending}
        label={`Ligar ${provLabel(s.provider)}`}
        onChange={(v) =>
          toggle.mutate(
            { id: s.id, enabled: v },
            { onSuccess: () => toast(v ? "Fonte ligada." : "Fonte desligada.", "info") },
          )
        }
      />

      {!isPrimary && (
        <Button
          size="icon"
          variant="ghost"
          className="shrink-0"
          aria-label={`Remover ${provLabel(s.provider)}`}
          loading={remove.isPending}
          onClick={() => {
            remove.mutate(s.id, { onSuccess: () => toast("Fonte removida.", "info") });
          }}
        >
          <Trash2 className="size-4 text-flame-500" />
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card de um campeonato (cabeçalho sempre visível + detalhe expansível)
// ---------------------------------------------------------------------------
function CompCard({ comp, onDanger }: { comp: CompFull; onDanger: (d: CompetitionDanger) => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(comp.name);

  const setSync = useSetCompetitionSync();
  const setPub = useSetCompetitionPublished();
  const rename = useRenameCompetition();
  const restore = useRestoreCompetition();

  const primary = comp.sources.find((s) => s.role === "primary");
  const published = comp.is_published !== false;
  const archived = comp.status !== "active";

  async function saveRename() {
    try {
      await rename.mutateAsync({ id: comp.id, displayName: name });
      toast("Nome atualizado.", "success");
      setEditing(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro.", "error");
    }
  }

  return (
    <Card className={cn("p-0", archived && "opacity-70")}>
      {/* cabeçalho */}
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={open}
        >
          {open ? (
            <ChevronDown className="size-4 shrink-0 text-ink-400" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-ink-400" />
          )}
          <span className={cn("size-2.5 shrink-0 rounded-full", healthDot(comp.last_sync_ok))} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-semibold text-ink-900">{comp.name}</span>
              {primary && <Badge tone="brand">{provLabel(primary.provider)}</Badge>}
              {!published && <Badge tone="gold">rascunho</Badge>}
              {archived && <Badge tone="outline">arquivada</Badge>}
              {comp.conflicts_count > 0 && (
                <Badge tone="flame">{comp.conflicts_count} conflito(s)</Badge>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs text-ink-400">
              {comp.sources.length} fonte(s) · {comp.matches_count} jogo(s)
              {comp.in_personalization ? " · na personalização" : ""}
            </span>
          </span>
        </button>
        {!archived && (
          <Switch
            checked={comp.sync_enabled}
            disabled={setSync.isPending}
            label={`Sync automático de ${comp.name}`}
            onChange={(v) =>
              setSync.mutate(
                { id: comp.id, value: v },
                { onSuccess: () => toast(v ? "Sync ligado." : "Sync pausado.", "info") },
              )
            }
          />
        )}
      </div>

      {/* detalhe */}
      {open && (
        <div className="space-y-3 border-t border-border p-3">
          {/* pilha de fontes */}
          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-ink-400">Fontes de API</p>
            {comp.sources.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-3 text-sm text-ink-400">
                Sem fontes. Use o <strong>catálogo</strong> abaixo pra anexar uma API a este campeonato.
              </p>
            ) : (
              comp.sources.map((s) => <SourceRow key={s.id} comp={comp} s={s} />)
            )}
            <p className="text-[11px] text-ink-400">
              Para adicionar uma fonte, anexe pelo <strong>catálogo</strong> no fim da página (sem
              digitar código).
            </p>
          </div>

          {/* ações da competição */}
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {editing ? (
              <div className="flex w-full items-center gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nome em português"
                  autoFocus
                  className="h-10 flex-1 rounded-md border border-ink-200 bg-surface px-3 outline-none focus:border-brand-500"
                />
                <Button size="sm" loading={rename.isPending} onClick={saveRename}>Salvar</Button>
                <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(comp.name); }}>
                  <X className="size-4" />
                </Button>
              </div>
            ) : archived ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  loading={restore.isPending}
                  onClick={() =>
                    restore.mutate(comp.id, { onSuccess: () => toast("Campeonato restaurado.", "success") })
                  }
                >
                  <ArchiveRestore className="size-4" /> Restaurar
                </Button>
                <Link
                  to={`/admin/competicoes/${comp.id}/jogos`}
                  className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-ink-100"
                >
                  <GitCompare className="size-3.5" /> Ver jogos / comparar
                </Link>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  loading={setPub.isPending}
                  onClick={() =>
                    published
                      ? onDanger({ id: comp.id, name: comp.name, action: "unpublish" })
                      : setPub.mutate({ id: comp.id, value: true }, { onSuccess: () => toast("Competição publicada!", "success") })
                  }
                >
                  {published ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {published ? "Despublicar" : "Publicar"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Renomear
                </Button>
                <Link
                  to={`/admin/competicoes/${comp.id}/jogos`}
                  className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-ink-100"
                  title="Ver os jogos e comparar o que cada fonte traz"
                >
                  <GitCompare className="size-3.5" /> Ver jogos / comparar
                </Link>
                <Button
                  size="sm"
                  variant="ghost"
                  className="ml-auto"
                  aria-label="Excluir ou arquivar competição"
                  onClick={() => onDanger({ id: comp.id, name: comp.name, action: "delete" })}
                >
                  <Trash2 className="size-4 text-flame-500" />
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Grupo colapsável (Seleções / Ligas e estaduais / Copas / Alternativos)
// ---------------------------------------------------------------------------
function GroupSection({
  group,
  comps,
  open,
  onToggle,
  onDanger,
}: {
  group: CompGroup;
  comps: CompFull[];
  open: boolean;
  onToggle: () => void;
  onDanger: (d: CompetitionDanger) => void;
}) {
  const failing = comps.filter((c) => c.last_sync_ok === false).length;
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 rounded-lg bg-surface-2 px-3.5 py-2.5 text-left ring-1 ring-border"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="size-4 text-ink-400" /> : <ChevronRight className="size-4 text-ink-400" />}
          <span className="font-semibold text-ink-900">{group}</span>
          <span className="text-xs text-ink-400">{comps.length}</span>
        </span>
        {failing > 0 && (
          <span className="flex items-center gap-1 text-xs font-semibold text-flame-600">
            <span className="size-2 rounded-full bg-flame-500" /> {failing} com erro
          </span>
        )}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {comps.length === 0 ? (
            <p className="px-1 py-2 text-sm text-ink-400">Nenhum campeonato neste grupo.</p>
          ) : (
            comps.map((c) => <CompCard key={c.id} comp={c} onDanger={onDanger} />)
          )}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Catálogo cruzado: agrupa as entradas dos provedores por CAMPEONATO (mesmo com
// nomes diferentes) e deixa ANEXAR cada provedor como fonte — sem digitar código.
// ---------------------------------------------------------------------------
type CatGroup = { key: string; name: string; entries: ProviderCompetition[] };

function CatalogSection({ comps }: { comps: CompFull[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const create = useCreateCompetition();
  const addSrc = useAddSecondarySource();
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Record<string, string>>({});

  const espn = useProviderCompetitions("espn");
  const fd = useProviderCompetitions("football_data");
  const tsd = useProviderCompetitions("thesportsdb");
  const fifa = useProviderCompetitions("fifawc");
  const loading = espn.isLoading || fd.isLoading || tsd.isLoading || fifa.isLoading;

  const all = useMemo(
    () => [...(espn.data ?? []), ...(fd.data ?? []), ...(tsd.data ?? []), ...(fifa.data ?? [])],
    [espn.data, fd.data, tsd.data, fifa.data],
  );

  // (provider:code) que já é fonte → a competição dona
  const sourceIndex = useMemo(() => {
    const m = new Map<string, CompFull>();
    comps.forEach((c) => c.sources.forEach((s) => m.set(`${s.provider}:${s.provider_code}`, c)));
    return m;
  }, [comps]);

  // agrupa por campeonato: registryKey (forte) ou nome normalizado (fallback)
  const groups = useMemo<CatGroup[]>(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? all.filter(
          (e) =>
            e.name.toLowerCase().includes(query) ||
            (e.country ?? "").toLowerCase().includes(query) ||
            e.code.toLowerCase().includes(query),
        )
      : all;
    const map = new Map<string, CatGroup>();
    for (const e of list) {
      const rk = registryKey(e.code);
      const key = rk ?? `n:${norm(e.name)}`;
      const g = map.get(key) ?? { key, name: registryName(e.code) ?? e.name, entries: [] };
      g.entries.push(e);
      map.set(key, g);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [all, q]);

  // melhor competição existente p/ um grupo (fonte já atachada → registryKey → nome)
  function autoTarget(g: CatGroup): CompFull | null {
    for (const e of g.entries) {
      const c = sourceIndex.get(`${e.provider}:${e.code}`);
      if (c) return c;
    }
    const rk = registryKey(g.entries[0]?.code ?? "");
    if (rk) {
      const c = comps.find((x) => registryKey(x.provider_code) === rk);
      if (c) return c;
    }
    const n = norm(g.name);
    return comps.find((x) => norm(x.name) === n || norm(x.raw_name) === n) ?? null;
  }

  async function attach(e: ProviderCompetition, targetId: string) {
    try {
      if (targetId && targetId !== "__new__") {
        await addSrc.mutateAsync({
          competitionId: targetId,
          provider: e.provider,
          providerCode: e.code,
          providerSeason: e.season ?? undefined,
        });
        toast(`${provLabel(e.provider)} anexada.`, "success");
      } else {
        await create.mutateAsync({
          name: e.name,
          provider: e.provider as DataProvider,
          providerCode: e.code,
          providerSeason: e.season ?? undefined,
          type: e.type === "CUP" ? "CUP" : "LEAGUE",
          isFeatured: false,
        });
        toast(`${e.name} criada como rascunho. Anexe as outras fontes e publique.`, "success");
      }
      qc.invalidateQueries({ queryKey: ["admin", "competitions-full"] });
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro.", "error");
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="text-sm font-semibold text-ink-900">Catálogo — anexar fontes a um campeonato</p>
        <p className="text-xs text-ink-500">
          As APIs que oferecem cada campeonato aparecem juntas (cruzadas mesmo com nomes diferentes).
          Anexe cada uma como fonte — sem digitar código. Campeonato novo nasce como rascunho.
        </p>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nome, país ou código…"
        className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3.5 outline-none focus:border-brand-500"
      />
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="max-h-[28rem] space-y-2 overflow-y-auto">
          {groups.length === 0 ? (
            <p className="p-4 text-center text-sm text-ink-400">Nada encontrado.</p>
          ) : (
            groups.map((g) => {
              const auto = autoTarget(g);
              const chosen = target[g.key] ?? (auto ? auto.id : "__new__");
              return (
                <div key={g.key} className="rounded-md border border-border p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink-900">{g.name}</span>
                    <Select
                      ariaLabel="Campeonato de destino"
                      value={chosen}
                      onChange={(v) => setTarget((t) => ({ ...t, [g.key]: v }))}
                      options={[
                        { value: "__new__", label: "➕ Criar novo campeonato" },
                        ...comps.map((c) => ({ value: c.id, label: c.name })),
                      ]}
                      className="w-56"
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {g.entries.map((e) => {
                      const owner = sourceIndex.get(`${e.provider}:${e.code}`);
                      if (owner) {
                        return (
                          <span
                            key={`${e.provider}:${e.code}`}
                            className="inline-flex items-center gap-1 rounded-pill bg-grass-50 px-2.5 py-1 text-xs font-semibold text-grass-700"
                            title={`Já é fonte de ${owner.name}`}
                          >
                            <Check className="size-3.5" /> {provLabel(e.provider)}
                          </span>
                        );
                      }
                      return (
                        <button
                          key={`${e.provider}:${e.code}`}
                          type="button"
                          disabled={create.isPending || addSrc.isPending}
                          onClick={() => attach(e, chosen)}
                          className="inline-flex items-center gap-1 rounded-pill border border-ink-200 px-2.5 py-1 text-xs font-semibold text-ink-700 transition hover:border-brand-500 hover:text-brand-700 disabled:opacity-50"
                          title={`${e.code}${e.season ? ` · temp. ${e.season}` : ""}`}
                        >
                          <Plus className="size-3.5" /> {provLabel(e.provider)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </Card>
  );
}

export function CompeticoesAdmin() {
  const { data: comps, isLoading } = useCompetitionsFull();
  const syncAll = useSyncFootball();
  const { toast } = useToast();

  const [danger, setDanger] = useState<CompetitionDanger | null>(null);
  const [openGroups, setOpenGroups] = useState<Set<CompGroup>>(new Set<CompGroup>(["Seleções"]));

  const grouped = useMemo(() => {
    const map = new Map<CompGroup, CompFull[]>();
    COMP_GROUPS.forEach((g) => map.set(g, []));
    for (const c of comps ?? []) {
      map.get(compGroupOf(c.provider_code, c.type))!.push(c);
    }
    for (const g of COMP_GROUPS) {
      map.get(g)!.sort((a, b) => {
        const oa = compOrderIdx(a.provider_code);
        const ob = compOrderIdx(b.provider_code);
        if (oa !== ob) return oa - ob;
        return a.name.localeCompare(b.name, "pt-BR");
      });
    }
    return map;
  }, [comps]);

  function toggleGroup(g: CompGroup) {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        fullWidth
        loading={syncAll.isPending}
        onClick={() =>
          syncAll
            .mutateAsync(undefined)
            .then((r) => {
              const failed = r.results.filter((x) => !x.ok);
              toast(failed.length ? `Sincronizado com ${failed.length} problema(s).` : `Sincronizado (${r.synced}).`, failed.length ? "error" : "success");
            })
            .catch((e) => toast(e instanceof Error ? e.message : "Erro no sync.", "error"))
        }
      >
        <RefreshCw className="size-4" /> Sincronizar todas
      </Button>

      {COMP_GROUPS.map((g) => (
        <GroupSection
          key={g}
          group={g}
          comps={grouped.get(g) ?? []}
          open={openGroups.has(g)}
          onToggle={() => toggleGroup(g)}
          onDanger={setDanger}
        />
      ))}

      <CatalogSection comps={comps ?? []} />

      {/* regras de nome de grupo (não é de API, mas é config de admin) */}
      <NameRulesCard />

      <CompetitionDangerDialog danger={danger} onClose={() => setDanger(null)} />
    </div>
  );
}
