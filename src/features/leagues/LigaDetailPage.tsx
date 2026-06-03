import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Copy,
  Clock,
  Check,
  Hand,
  Trash2,
  ShieldCheck,
  Plus,
  LogOut,
  Palette,
  Sparkles,
} from "lucide-react";
import { useNudge } from "@/features/notifications/api";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Escudo } from "@/components/ui/Escudo";
import { CrestEditor } from "@/components/ui/CrestEditor";
import { FLAMULA_SHAPES } from "@/lib/crest";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCompetitions, findWorldCupCompetition } from "@/features/matches/api";
import { useStandings } from "./api";
import { StandingsTable } from "@/features/standings/StandingsTable";
import { ConfrontoSection } from "@/features/confronto/ConfrontoSection";
import {
  useLeague,
  useLeagueMembers,
  useLeagueCompetitions,
  useUpdateMember,
  useRemoveMember,
  useLeaveLeague,
  useSetConfrontoEnabled,
  useAddLeagueCompetition,
  useDeleteLeagueCompetition,
  useUpdateLeagueLogo,
  useLeagueCheckout,
} from "./api";
import { usePaymentSettings, useSimulatePayment, useCompLeague } from "@/features/payments/api";
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
  const [escudoOpen, setEscudoOpen] = useState(false);
  const [lcId, setLcId] = useState<string>();
  const activeLcId = lcId ?? comps?.[0]?.id;
  const { data: standings, isLoading: loadingStandings } = useStandings(activeLcId);

  const leave = useLeaveLeague();
  const setConfronto = useSetConfrontoEnabled();
  const checkout = useLeagueCheckout();
  const simulate = useSimulatePayment();
  const comp = useCompLeague();
  const { data: paySettings } = usePaymentSettings();
  const payMode = paySettings?.payment_mode ?? "disabled";
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Enquanto o pagamento estiver pendente, atualiza a federação periodicamente
  // (a webhook do Mercado Pago a ativa em segundos).
  useEffect(() => {
    if (league?.payment_status !== "pending") return;
    const t = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["league", slug] });
    }, 5000);
    return () => clearInterval(t);
  }, [league?.payment_status, slug, qc]);

  // Mensagem ao voltar do checkout do Mercado Pago.
  useEffect(() => {
    const pag = searchParams.get("pagamento");
    if (!pag) return;
    if (pag === "sucesso") toast("Pagamento recebido! Ativando sua federação…", "success");
    else if (pag === "processando")
      toast("Pagamento em processamento. A federação será ativada em instantes.", "info");
    else if (pag === "falhou")
      toast("O pagamento não foi concluído. Você pode tentar de novo.", "error");
    searchParams.delete("pagamento");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, toast]);

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
      <Page title="Federação">
        <Skeleton className="h-40 w-full" />
      </Page>
    );
  }
  if (!league) {
    return (
      <Page title="Federação">
        <EmptyState title="Federação não encontrada" description="Verifique o link ou o código." />
      </Page>
    );
  }

  const confrontoEnabled = (league as { confronto_enabled?: boolean }).confronto_enabled ?? false;

  function copyCode() {
    if (!league?.join_code) return;
    navigator.clipboard.writeText(league.join_code);
    toast("Código copiado!", "success");
  }

  async function handleLeave() {
    if (!league) return;
    try {
      await leave.mutateAsync(league.id);
      toast("Você saiu da federação.", "info");
      navigate("/federacoes");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao sair.", "error");
    }
  }

  return (
    <Page
      title={league.name}
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/federacoes")} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      {league.status === "active" &&
        (league as { name_approved?: boolean }).name_approved === false && (
          <div className="mb-4 flex items-start gap-2 rounded-md bg-brand-50 p-3 text-sm text-brand-800">
            <Clock className="mt-0.5 size-4 shrink-0" />
            <p>
              Sua federação está <strong>ativa</strong> e já dá pra jogar! Só o <strong>nome</strong>{" "}
              está em análise rápida da moderação — se precisar de ajuste, a gente te avisa.
            </p>
          </div>
        )}

      {league.payment_status === "pending" && league.status !== "active" ? (
        <div className="mb-4 rounded-md bg-gold-100 p-3 text-sm text-gold-800">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0" />
            <p>
              {payMode === "test"
                ? "Modo de teste: conclua o pagamento simulado para ativar esta federação."
                : "Esta federação será ativada assim que o pagamento for confirmado. Acabou de pagar? Pode levar alguns segundos."}
            </p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {isOwner && payMode === "test" && (
              <Button
                size="sm"
                loading={simulate.isPending}
                onClick={() =>
                  simulate.mutate(
                    { leagueId: league.id },
                    {
                      onSuccess: () => toast("Pagamento simulado — federação ativa!", "success"),
                      onError: (e) => toast(e instanceof Error ? e.message : "Erro ao simular.", "error"),
                    },
                  )
                }
              >
                Simular pagamento
              </Button>
            )}
            {isOwner && payMode === "live" && (
              <Button
                size="sm"
                loading={checkout.isPending}
                onClick={() =>
                  checkout.mutate(league.id, {
                    onError: (e) =>
                      toast(
                        e instanceof Error ? e.message : "Não foi possível abrir o pagamento. Tente recarregar a página.",
                        "error",
                      ),
                  })
                }
              >
                Pagar agora
              </Button>
            )}
            {isAppAdmin && (
              <Button
                size="sm"
                variant="outline"
                loading={comp.isPending}
                onClick={() =>
                  comp.mutate(league.id, {
                    onSuccess: () => toast("Federação liberada sem pagamento.", "success"),
                    onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
                  })
                }
              >
                Liberar sem pagamento
              </Button>
            )}
          </div>
        </div>
      ) : league.status === "pending" ? (
        <div className="mb-4 rounded-md bg-gold-100 p-3 text-sm text-gold-800">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0" />
            <p>Esta federação aguarda aprovação de um administrador para ficar ativa.</p>
          </div>
          {isAppAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              loading={comp.isPending}
              onClick={() =>
                comp.mutate(league.id, {
                  onSuccess: () => toast("Federação liberada.", "success"),
                  onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
                })
              }
            >
              Liberar sem pagamento
            </Button>
          )}
        </div>
      ) : null}

      {/* cabeçalho — escudo + descrição + identidade */}
      <Card className="mb-4 p-4">
        <div className="flex items-start gap-3">
          <Escudo src={league.logo_url} name={league.name} size="xl" />
          <div className="min-w-0 flex-1">
            {league.description ? (
              <p className="text-sm text-ink-600">{league.description}</p>
            ) : (
              <p className="text-xs italic text-ink-400">Sem descrição.</p>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setEscudoOpen((v) => !v)}
                className="mt-2 inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-xs font-semibold text-brand-600 transition hover:bg-brand-500/10"
              >
                <Palette className="size-3.5" />
                {escudoOpen ? "Fechar editor" : "Personalizar escudo"}
              </button>
            )}
          </div>
        </div>

        {(isAdmin || myMember) && league.join_code && (
          <button
            onClick={copyCode}
            className="mt-4 flex w-full items-center justify-between rounded-md border border-dashed border-ink-200 px-3 py-2.5 text-left transition hover:bg-ink-50"
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

      {isAdmin && escudoOpen && (
        <EscudoStudio
          leagueId={league.id}
          leagueName={league.name}
          currentLogo={league.logo_url}
          onClose={() => setEscudoOpen(false)}
        />
      )}

      {isAppAdmin && (
        <Card className="mb-4 border border-brand-200 bg-brand-500/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink-900">
                <Sparkles className="size-4 text-brand-600" />
                Modo Confronto (teste)
                <span className="rounded-pill bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  admin
                </span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                {confrontoEnabled
                  ? "Liberado: esta federação pode criar disputas de Liga e Copa, sortear os confrontos e adicionar várias competições."
                  : "Bloqueado: Liga e Copa aparecem como “em breve”. Libere para esta federação testar o Confronto e o sorteio."}
              </p>
            </div>
            <Button
              size="sm"
              variant={confrontoEnabled ? "outline" : undefined}
              loading={setConfronto.isPending}
              onClick={() =>
                setConfronto.mutate(
                  { leagueId: league.id, value: !confrontoEnabled },
                  {
                    onSuccess: () =>
                      toast(
                        confrontoEnabled
                          ? "Confronto desativado nesta federação."
                          : "Confronto liberado para esta federação.",
                        "success",
                      ),
                    onError: (e) =>
                      toast(e instanceof Error ? e.message : "Erro ao atualizar.", "error"),
                  },
                )
              }
            >
              {confrontoEnabled ? "Desativar" : "Ativar Confronto"}
            </Button>
          </div>
        </Card>
      )}

      <SegmentedControl<Tab> className="mb-4" value={tab} onChange={setTab} options={tabs} />

      {tab === "classificacao" && (
        <ClassificacaoTab
          comps={comps ?? []}
          activeLcId={activeLcId}
          onSelect={setLcId}
          standings={standings}
          loading={loadingStandings}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          leagueId={league.id}
          memberCount={(members ?? []).filter((m) => m.status === "active").length}
        />
      )}

      {tab === "membros" && (
        <MembrosTab leagueId={league.id} members={members ?? []} isAdmin={isAdmin} />
      )}

      {tab === "competicoes" && isAdmin && (
        <CompeticoesTab
          leagueId={league.id}
          comps={comps ?? []}
          confrontoEnabled={(league as { confronto_enabled?: boolean }).confronto_enabled ?? false}
        />
      )}

      {myMember && !isOwner && (
        <Button variant="ghost" fullWidth className="mt-6 text-flame-600" onClick={handleLeave}>
          <LogOut className="size-4" /> Sair da federação
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
  isAdmin,
  leagueId,
  memberCount,
}: {
  comps: { id: string; name: string; mode: string; competition_id: string; confronto_state?: string }[];
  activeLcId?: string;
  onSelect: (id: string) => void;
  standings: ReturnType<typeof useStandings>["data"];
  loading: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  leagueId: string;
  memberCount: number;
}) {
  if (comps.length === 0) {
    return (
      <EmptyState
        title="Sem competições"
        description="Um administrador precisa vincular uma competição a esta federação."
      />
    );
  }
  const active = comps.find((c) => c.id === activeLcId);
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
      {active && activeLcId && (active.mode === "liga" || active.mode === "cup") ? (
        <ConfrontoSection
          lcId={activeLcId}
          leagueId={leagueId}
          competitionId={active.competition_id}
          mode={active.mode}
          state={active.confronto_state ?? "draft"}
          memberCount={memberCount}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />
      ) : loading ? (
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
  leagueId,
  members,
  isAdmin,
}: {
  leagueId: string;
  members: ReturnType<typeof useLeagueMembers>["data"] & object;
  isAdmin: boolean;
}) {
  const update = useUpdateMember();
  const remove = useRemoveMember();
  const nudge = useNudge();
  const { user } = useAuth();
  const { toast } = useToast();
  const list = members ?? [];

  function cutucar(toUser: string) {
    nudge.mutate(
      { leagueId, toUser },
      {
        onSuccess: () => toast("Cutucada enviada! 👉", "success"),
        onError: (e) => toast(e instanceof Error ? e.message : "Erro", "error"),
      },
    );
  }

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
          {m.status === "active" && m.profile?.id !== user?.id && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Cutucar"
              onClick={() => cutucar(m.profile!.id)}
            >
              <Hand className="size-4 text-gold-600" />
            </Button>
          )}
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

// Limite inicial: 1 competição por federação. Quando a base de usuários crescer e
// os modos extras (Liga / Copa) estiverem prontos, soltamos o limite e habilitamos
// os outros modos de disputa.
const MAX_COMPETITIONS_PER_LEAGUE = 1;

function CompeticoesTab({
  leagueId,
  comps,
  confrontoEnabled,
}: {
  leagueId: string;
  comps: { id: string; name: string; mode: string }[];
  confrontoEnabled: boolean;
}) {
  const { data: competitions } = useCompetitions();
  const add = useAddLeagueCompetition();
  const del = useDeleteLeagueCompetition();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [competitionId, setCompetitionId] = useState("");
  const [name, setName] = useState("");
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  // Federação comum: modo fixo em "points" (Liga/Copa ficam como "em breve").
  // Federação habilitada pelo admin (confronto_enabled): o admin escolhe Pontos ou
  // Confronto (Liga/Copa) e pode criar várias competições (sem o limite do MVP).
  const [tipo, setTipo] = useState<"pontos" | "confronto">("pontos");
  const [formato, setFormato] = useState<"liga" | "cup">("liga");
  const mode: LeagueMode = !confrontoEnabled || tipo === "pontos" ? "points" : formato;

  // Pré-seleciona Copa do Mundo no formulário ao abrir, se ainda não escolheu.
  useEffect(() => {
    if (!open || competitionId || !competitions?.length) return;
    const wc = findWorldCupCompetition(competitions);
    if (wc) {
      setCompetitionId(wc.id);
      setName((cur) => cur || "Copa do Mundo 2026 — Pontos");
    }
  }, [open, competitions, competitionId]);

  // Federações habilitadas (teste de Confronto) não têm limite de competições.
  const reachedLimit = !confrontoEnabled && comps.length >= MAX_COMPETITIONS_PER_LEAGUE;

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

  async function confirmDelete() {
    if (!toDelete) return;
    try {
      await del.mutateAsync({ leagueId, lcId: toDelete.id });
      toast(`Competição "${toDelete.name}" removida.`, "success");
      setToDelete(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao remover.", "error");
    }
  }

  return (
    <div className="space-y-3">
      {comps.map((c) => (
        <Card key={c.id} className="flex items-center gap-2 p-3.5">
          <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">{c.name}</span>
          <Badge tone="neutral">
            {c.mode === "liga"
              ? "Liga"
              : c.mode === "cup"
                ? "Copa"
                : c.mode === "table"
                  ? "Tabela"
                  : "Pontos"}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Remover competição"
            onClick={() => setToDelete({ id: c.id, name: c.name })}
          >
            <Trash2 className="size-4 text-flame-500" />
          </Button>
        </Card>
      ))}

      {reachedLimit ? (
        <p className="rounded-md bg-ink-50 px-3 py-2 text-xs text-ink-500">
          Limite inicial de {MAX_COMPETITIONS_PER_LEAGUE} competição por federação.
          Remova a atual para trocar por outra.
        </p>
      ) : open ? (
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
          {confrontoEnabled ? (
            <div className="space-y-2">
              <label className="text-sm font-medium text-ink-800">Tipo de disputa</label>
              <SegmentedControl<"pontos" | "confronto">
                value={tipo}
                onChange={setTipo}
                options={[
                  { value: "pontos", label: "Pontos" },
                  { value: "confronto", label: "Confronto" },
                ]}
              />
              {tipo === "confronto" && (
                <SegmentedControl<"liga" | "cup">
                  value={formato}
                  onChange={setFormato}
                  options={[
                    { value: "liga", label: "Liga" },
                    { value: "cup", label: "Copa" },
                  ]}
                />
              )}
              <p className="text-xs leading-snug text-ink-500">
                {tipo === "pontos"
                  ? "Corrida de pontos: todo mundo acumula, quem somou mais lidera."
                  : formato === "liga"
                    ? "Liga: todos contra todos; cada rodada vale 3/1/0 e forma uma tabela."
                    : "Copa: mata-mata; quem perde o confronto está fora."}
              </p>
              {tipo === "confronto" && (
                <p className="rounded-md bg-brand-500/10 px-3 py-2 text-[11px] leading-relaxed text-brand-700">
                  Depois de criar, você <span className="font-semibold">sorteia os confrontos</span>.
                  Isso trava os participantes: quem entrar depois não joga esta disputa.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-ink-700">Modo de disputa</p>
              <div className="flex gap-1 rounded-pill bg-ink-100 p-1">
                <button
                  type="button"
                  className="flex-1 rounded-pill bg-surface px-3 py-1.5 text-sm font-semibold text-ink-950 shadow-[var(--shadow-soft)]"
                >
                  Pontos
                </button>
                <button
                  type="button"
                  disabled
                  className="flex-1 cursor-not-allowed rounded-pill px-3 py-1.5 text-xs font-semibold text-ink-400"
                  title="Em breve"
                >
                  Liga · em breve
                </button>
                <button
                  type="button"
                  disabled
                  className="flex-1 cursor-not-allowed rounded-pill px-3 py-1.5 text-xs font-semibold text-ink-400"
                  title="Em breve"
                >
                  Copa · em breve
                </button>
              </div>
              <p className="text-xs leading-snug text-ink-500">
                Corrida de pontos: soma tudo numa classificação única. Os modos
                <strong> Liga </strong> (confronto direto) e <strong>Copa</strong> (mata-mata) chegam
                em breve.
              </p>
            </div>
          )}
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

      <ConfirmDialog
        open={!!toDelete}
        title="Remover competição"
        message={`Remover "${toDelete?.name ?? ""}" da federação? A classificação dela e o histórico de palpites somem junto.`}
        step2Message="Confirmação final: remover esta competição e o que está dentro?"
        confirmLabel="Remover competição"
        loading={del.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

/**
 * Editor da flâmula da federação: forma (3 flâmulas) + cores (sólido/listras/
 * grade/bola) e rotação. Salvo como `crest:flamula:...` em `leagues.logo_url`,
 * então o mesmo renderer (`Escudo`) pinta em qualquer lugar do app.
 */
function EscudoStudio({
  leagueId,
  leagueName,
  currentLogo,
  onClose,
}: {
  leagueId: string;
  leagueName: string;
  currentLogo: string | null;
  onClose: () => void;
}) {
  const update = useUpdateLeagueLogo();
  const { toast } = useToast();
  const [crest, setCrest] = useState<string>(currentLogo ?? "");

  async function handleSave() {
    try {
      await update.mutateAsync({ leagueId, logoUrl: crest || null });
      toast("Flâmula salva!", "success");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar flâmula.", "error");
    }
  }

  async function handleReset() {
    try {
      await update.mutateAsync({ leagueId, logoUrl: null });
      toast("Flâmula voltou para o automático.", "info");
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao resetar.", "error");
    }
  }

  return (
    <Card className="mb-4 space-y-4 p-4">
      <p className="text-sm font-semibold text-ink-800">Flâmula da federação</p>

      {/* Preview ao vivo */}
      <div className="flex items-center gap-4 rounded-md bg-ink-50 p-3">
        <Escudo src={crest || null} name={leagueName} size="xl" />
        <div className="min-w-0">
          <p className="truncate font-bold text-ink-900">{leagueName}</p>
          <p className="text-xs text-ink-500">
            Pré-visualização — a flâmula aparece na federação e na classificação.
          </p>
        </div>
      </div>

      <CrestEditor
        kind="flamula"
        name={leagueName}
        initial={currentLogo}
        shapes={FLAMULA_SHAPES}
        allowBall
        onChange={setCrest}
      />

      <div className="flex flex-wrap gap-2 pt-2">
        <Button fullWidth loading={update.isPending} onClick={handleSave}>
          Salvar flâmula
        </Button>
        <Button variant="ghost" onClick={handleReset} loading={update.isPending}>
          Voltar ao automático
        </Button>
      </div>
    </Card>
  );
}
