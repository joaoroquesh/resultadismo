import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Copy,
  Clock,
  Check,
  UserPlus,
  Trash2,
  ShieldCheck,
  Plus,
  LogOut,
} from "lucide-react";
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
import { useCompetitions } from "@/features/matches/api";
import { useStandings } from "./api";
import { StandingsTable } from "@/features/standings/StandingsTable";
import {
  useLeague,
  useLeagueMembers,
  useLeagueCompetitions,
  useUpdateMember,
  useRemoveMember,
  useLeaveLeague,
  useAddLeagueCompetition,
} from "./api";
import type { LeagueMode } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "classificacao" | "membros" | "competicoes";

export function LigaDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAppAdmin } = useAuth();

  const { data: league, isLoading } = useLeague(slug);
  const { data: members } = useLeagueMembers(league?.id);
  const { data: comps } = useLeagueCompetitions(league?.id);

  const myMember = members?.find((m) => m.profile?.id === user?.id);
  const isAdmin = isAppAdmin || myMember?.role === "owner" || myMember?.role === "admin";
  const isOwner = myMember?.role === "owner";

  const [tab, setTab] = useState<Tab>("classificacao");
  const [lcId, setLcId] = useState<string>();
  const activeLcId = lcId ?? comps?.[0]?.id;
  const { data: standings, isLoading: loadingStandings } = useStandings(activeLcId);

  const leave = useLeaveLeague();

  const tabs = useMemo(() => {
    const base: { value: Tab; label: string }[] = [
      { value: "classificacao", label: "Classificação" },
      { value: "membros", label: `Membros${members ? ` (${members.length})` : ""}` },
    ];
    if (isAdmin) base.push({ value: "competicoes", label: "Competições" });
    return base;
  }, [members, isAdmin]);

  if (isLoading) {
    return (
      <Page title="Liga">
        <Skeleton className="h-40 w-full" />
      </Page>
    );
  }
  if (!league) {
    return (
      <Page title="Liga">
        <EmptyState title="Liga não encontrada" description="Verifique o link ou o código." />
      </Page>
    );
  }

  function copyCode() {
    if (!league?.join_code) return;
    navigator.clipboard.writeText(league.join_code);
    toast("Código copiado!", "success");
  }

  async function handleLeave() {
    if (!league) return;
    try {
      await leave.mutateAsync(league.id);
      toast("Você saiu da liga.", "info");
      navigate("/ligas");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao sair.", "error");
    }
  }

  return (
    <Page
      title={league.name}
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/ligas")} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      {league.status === "pending" && (
        <div className="mb-4 flex items-start gap-2 rounded-md bg-gold-100 p-3 text-sm text-gold-800">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <p>Esta liga aguarda aprovação de um administrador para ficar ativa.</p>
        </div>
      )}

      {/* cabeçalho */}
      <Card className="mb-4 p-4">
        {league.description && <p className="mb-3 text-sm text-ink-600">{league.description}</p>}
        {(isAdmin || myMember) && league.join_code && (
          <button
            onClick={copyCode}
            className="flex w-full items-center justify-between rounded-md border border-dashed border-ink-200 px-3 py-2.5 text-left transition hover:bg-ink-50"
          >
            <div>
              <p className="text-xs text-ink-400">Código de convite</p>
              <p className="font-mono text-lg font-bold tracking-widest text-ink-900">
                {league.join_code}
              </p>
            </div>
            <Copy className="size-5 text-brand-600" />
          </button>
        )}
      </Card>

      <SegmentedControl<Tab> className="mb-4" value={tab} onChange={setTab} options={tabs} />

      {tab === "classificacao" && (
        <ClassificacaoTab
          comps={comps ?? []}
          activeLcId={activeLcId}
          onSelect={setLcId}
          standings={standings}
          loading={loadingStandings}
          currentUserId={user?.id}
        />
      )}

      {tab === "membros" && (
        <MembrosTab leagueId={league.id} members={members ?? []} isAdmin={isAdmin} />
      )}

      {tab === "competicoes" && isAdmin && (
        <CompeticoesTab leagueId={league.id} comps={comps ?? []} />
      )}

      {myMember && !isOwner && (
        <Button variant="ghost" fullWidth className="mt-6 text-flame-600" onClick={handleLeave}>
          <LogOut className="size-4" /> Sair da liga
        </Button>
      )}
    </Page>
  );
}

function ClassificacaoTab({
  comps,
  activeLcId,
  onSelect,
  standings,
  loading,
  currentUserId,
}: {
  comps: { id: string; name: string }[];
  activeLcId?: string;
  onSelect: (id: string) => void;
  standings: ReturnType<typeof useStandings>["data"];
  loading: boolean;
  currentUserId?: string;
}) {
  if (comps.length === 0) {
    return (
      <EmptyState
        title="Sem competições"
        description="Um administrador precisa vincular uma competição a esta liga."
      />
    );
  }
  return (
    <div className="space-y-3">
      {comps.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {comps.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "shrink-0 rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
                activeLcId === c.id
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-surface text-ink-600",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : standings && standings.length > 0 ? (
        <StandingsTable rows={standings} currentUserId={currentUserId} />
      ) : (
        <EmptyState title="Sem pontos ainda" description="A classificação aparece após os jogos." />
      )}
    </div>
  );
}

function MembrosTab({
  members,
  isAdmin,
}: {
  leagueId: string;
  members: ReturnType<typeof useLeagueMembers>["data"] & object;
  isAdmin: boolean;
}) {
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const { toast } = useToast();
  const list = members ?? [];

  return (
    <ul className="space-y-2">
      {list.map((m) => (
        <Card key={m.id} className="flex items-center gap-3 p-3">
          <Avatar src={m.profile?.avatar_url} name={m.profile?.display_name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-900">{m.profile?.display_name}</p>
            <div className="flex items-center gap-1.5">
              {m.role !== "member" && (
                <Badge tone="brand">{m.role === "owner" ? "Dono" : "Admin"}</Badge>
              )}
              {m.status === "pending" && <Badge tone="gold">pendente</Badge>}
            </div>
          </div>
          {isAdmin && m.role !== "owner" && (
            <div className="flex gap-1">
              {m.status === "pending" && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Aprovar"
                  onClick={() =>
                    update.mutate(
                      { memberId: m.id, status: "active" },
                      { onSuccess: () => toast("Membro aprovado!", "success") },
                    )
                  }
                >
                  <Check className="size-4 text-grass-600" />
                </Button>
              )}
              {m.status === "active" && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={m.role === "admin" ? "Rebaixar" : "Promover a admin"}
                  onClick={() =>
                    update.mutate({
                      memberId: m.id,
                      role: m.role === "admin" ? "member" : "admin",
                    })
                  }
                >
                  <ShieldCheck
                    className={cn("size-4", m.role === "admin" ? "text-brand-600" : "text-ink-300")}
                  />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                aria-label="Remover"
                onClick={() =>
                  remove.mutate(m.id, { onSuccess: () => toast("Membro removido.", "info") })
                }
              >
                <Trash2 className="size-4 text-flame-500" />
              </Button>
            </div>
          )}
        </Card>
      ))}
    </ul>
  );
}

function CompeticoesTab({
  leagueId,
  comps,
}: {
  leagueId: string;
  comps: { id: string; name: string; mode: string }[];
}) {
  const { data: competitions } = useCompetitions();
  const add = useAddLeagueCompetition();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [competitionId, setCompetitionId] = useState("");
  const [name, setName] = useState("");
  const [mode, setMode] = useState<LeagueMode>("table");

  async function handleAdd() {
    if (!competitionId || !name.trim()) return;
    try {
      await add.mutateAsync({ leagueId, competitionId, name: name.trim(), mode });
      toast("Competição adicionada!", "success");
      setOpen(false);
      setName("");
      setCompetitionId("");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao adicionar.", "error");
    }
  }

  return (
    <div className="space-y-3">
      {comps.map((c) => (
        <Card key={c.id} className="flex items-center justify-between p-3.5">
          <span className="font-semibold text-ink-900">{c.name}</span>
          <Badge tone="neutral">
            {c.mode === "table" ? "Tabela" : c.mode === "cup" ? "Copa" : "Pontos"}
          </Badge>
        </Card>
      ))}

      {open ? (
        <Card className="space-y-3 p-4">
          <select
            value={competitionId}
            onChange={(e) => setCompetitionId(e.target.value)}
            className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3 outline-none focus:border-brand-500"
          >
            <option value="">Escolher competição…</option>
            {competitions?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do bolão"
            className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3.5 outline-none focus:border-brand-500"
          />
          <SegmentedControl
            value={mode}
            onChange={setMode}
            options={[
              { value: "table", label: "Tabela" },
              { value: "points", label: "Pontos" },
            ]}
          />
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button fullWidth loading={add.isPending} onClick={handleAdd}>
              Adicionar
            </Button>
          </div>
        </Card>
      ) : (
        <Button variant="outline" fullWidth onClick={() => setOpen(true)}>
          <Plus className="size-4" /> Adicionar competição
        </Button>
      )}
    </div>
  );
}
