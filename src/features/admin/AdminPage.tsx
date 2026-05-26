import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Check, X, RefreshCw, Plus, ShieldCheck } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
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
  useAdminMatches,
  useSaveMatchResult,
  useAllProfiles,
  useSetAppAdmin,
} from "./api";
import type { DataProvider, MatchStatus } from "@/lib/types";

type Tab = "ligas" | "competicoes" | "jogos" | "usuarios";

export function AdminPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("ligas");

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
          { value: "ligas", label: "Ligas" },
          { value: "competicoes", label: "Comp." },
          { value: "jogos", label: "Jogos" },
          { value: "usuarios", label: "Users" },
        ]}
      />
      {tab === "ligas" && <LigasAdmin />}
      {tab === "competicoes" && <CompeticoesAdmin />}
      {tab === "jogos" && <JogosAdmin />}
      {tab === "usuarios" && <UsuariosAdmin />}
    </Page>
  );
}

function LigasAdmin() {
  const { data: leagues, isLoading } = usePendingLeagues();
  const approve = useApproveLeague();
  const reject = useRejectLeague();
  const { toast } = useToast();

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  const pending = leagues?.filter((l) => l.status === "pending") ?? [];
  const others = leagues?.filter((l) => l.status !== "pending") ?? [];

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Aguardando aprovação</h2>
        {pending.length === 0 ? (
          <EmptyState title="Nada pendente" description="Novas ligas aparecerão aqui para aprovação." />
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
                    approve.mutate(l.id, { onSuccess: () => toast("Liga aprovada!", "success") })
                  }
                >
                  <Check className="size-4" /> Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  fullWidth
                  onClick={() =>
                    reject.mutate(l.id, { onSuccess: () => toast("Liga rejeitada.", "info") })
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
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Todas as ligas</h2>
          {others.map((l) => (
            <Card key={l.id} className="flex items-center justify-between p-3.5">
              <span className="font-semibold text-ink-900">{l.name}</span>
              <Badge tone={l.status === "active" ? "grass" : l.status === "rejected" ? "flame" : "neutral"}>
                {l.status}
              </Badge>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}

function CompeticoesAdmin() {
  const { data: comps, isLoading } = useAdminCompetitions();
  const create = useCreateCompetition();
  const sync = useSyncFootball();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState<DataProvider>("football_data");
  const [code, setCode] = useState("");
  const [season, setSeason] = useState("");

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

  async function handleCreate() {
    if (!name.trim()) return;
    try {
      await create.mutateAsync({
        name: name.trim(),
        provider,
        providerCode: code.trim() || undefined,
        providerSeason: season.trim() || undefined,
        type: "LEAGUE",
        isFeatured: false,
      });
      toast("Competição criada!", "success");
      setOpen(false);
      setName("");
      setCode("");
      setSeason("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro.", "error");
    }
  }

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-3">
      <Button variant="outline" fullWidth loading={sync.isPending} onClick={() => handleSync()}>
        <RefreshCw className="size-4" /> Sincronizar todas
      </Button>

      {comps?.map((c) => (
        <Card key={c.id} className="p-3.5">
          <div className="flex items-center justify-between">
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{c.name}</p>
              <p className="text-xs text-ink-500">
                {c.provider}
                {c.provider_code ? ` · ${c.provider_code}` : ""}
                {c.is_featured ? " · destaque" : ""}
              </p>
            </div>
            {c.provider !== "manual" && (
              <Button size="sm" variant="ghost" onClick={() => handleSync(c.id)}>
                <RefreshCw className="size-4" />
              </Button>
            )}
          </div>
        </Card>
      ))}

      {open ? (
        <Card className="space-y-3 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome (ex.: Brasileirão Série A)"
            className="h-11 w-full rounded-md border border-ink-200 px-3.5 outline-none focus:border-brand-500"
          />
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as DataProvider)}
            className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3 outline-none focus:border-brand-500"
          >
            <option value="football_data">football-data.org</option>
            <option value="thesportsdb">TheSportsDB</option>
            <option value="manual">Manual</option>
          </select>
          {provider !== "manual" && (
            <div className="flex gap-2">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Código (ex.: WC, BSA)"
                className="h-11 w-full rounded-md border border-ink-200 px-3.5 outline-none focus:border-brand-500"
              />
              <input
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="Temporada (ex.: 2026)"
                className="h-11 w-full rounded-md border border-ink-200 px-3.5 outline-none focus:border-brand-500"
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button fullWidth loading={create.isPending} onClick={handleCreate}>
              Criar
            </Button>
          </div>
        </Card>
      ) : (
        <Button variant="ghost" fullWidth onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Nova competição
        </Button>
      )}
    </div>
  );
}

function JogosAdmin() {
  const { data: comps } = useAdminCompetitions();
  const [compId, setCompId] = useState<string>();
  const activeId = compId ?? comps?.[0]?.id;
  const { data: matches, isLoading } = useAdminMatches(activeId);

  return (
    <div className="space-y-3">
      <select
        value={activeId ?? ""}
        onChange={(e) => setCompId(e.target.value)}
        className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3 outline-none focus:border-brand-500"
      >
        {comps?.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        matches?.map((m) => <MatchAdminRow key={m.id} match={m} />)
      )}
    </div>
  );
}

function MatchAdminRow({ match }: { match: { id: string; home_team_name: string | null; away_team_name: string | null; home_score: number | null; away_score: number | null; status: string } }) {
  const save = useSaveMatchResult();
  const { toast } = useToast();
  const [home, setHome] = useState(match.home_score?.toString() ?? "");
  const [away, setAway] = useState(match.away_score?.toString() ?? "");
  const [status, setStatus] = useState<MatchStatus>(match.status as MatchStatus);

  return (
    <Card className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-800">
        <span className="flex-1 truncate text-right">{match.home_team_name}</span>
        <input
          type="number"
          value={home}
          onChange={(e) => setHome(e.target.value)}
          className="size-10 rounded-md border border-ink-200 text-center font-bold outline-none focus:border-brand-500"
        />
        <span className="text-ink-300">×</span>
        <input
          type="number"
          value={away}
          onChange={(e) => setAway(e.target.value)}
          className="size-10 rounded-md border border-ink-200 text-center font-bold outline-none focus:border-brand-500"
        />
        <span className="flex-1 truncate">{match.away_team_name}</span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as MatchStatus)}
          className="h-9 flex-1 rounded-md border border-ink-200 bg-surface px-2 text-sm outline-none focus:border-brand-500"
        >
          <option value="scheduled">Agendado</option>
          <option value="live">Ao vivo</option>
          <option value="finished">Encerrado</option>
          <option value="postponed">Adiado</option>
          <option value="cancelled">Cancelado</option>
        </select>
        <Button
          size="sm"
          loading={save.isPending}
          onClick={() =>
            save.mutate(
              {
                matchId: match.id,
                home: home === "" ? null : Number(home),
                away: away === "" ? null : Number(away),
                status,
              },
              { onSuccess: () => toast("Resultado salvo!", "success") },
            )
          }
        >
          Salvar
        </Button>
      </div>
    </Card>
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
