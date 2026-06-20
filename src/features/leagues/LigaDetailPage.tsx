import { useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { shareGroupInvite } from "./inviteShare";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Copy, LogOut, Pencil, Sparkles, MessageCircle } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Coachmark } from "@/components/ui/Coachmark";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Escudo } from "@/components/ui/Escudo";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/features/auth/AuthProvider";
import {
  useStandings,
  useLeague,
  useLeagueMembers,
  useLeagueCompetitions,
  useLeaveLeague,
  useSetConfrontoEnabled,
} from "./api";
import { RefundFederationButton } from "./RefundFederationButton";
import { ClassificacaoTab } from "./tabs/ClassificacaoTab";
import { MembrosTab } from "./tabs/MembrosTab";
import { CompeticoesTab } from "./tabs/CompeticoesTab";
import { GrupoEditor } from "./tabs/GrupoEditor";
import { groupDisplayName } from "./groupName";
import { GestaoBolaoTab } from "./tabs/GestaoBolaoTab";
import { usePotPayers } from "./api";
import { computePot, prizeByUser } from "./potMath";

type Tab = "classificacao" | "membros" | "competicoes" | "bolao";

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
  // ?editar=1 (lápis no card de /grupos) já abre o editor do grupo direto.
  const [editorOpen, setEditorOpen] = useState(
    () => new URLSearchParams(window.location.search).get("editar") === "1",
  );
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [lcId, setLcId] = useState<string>();
  const activeLcId = lcId ?? comps?.[0]?.id;
  const { data: standings, isLoading: loadingStandings } = useStandings(activeLcId);

  // Gestão do Bolão (ADR 0008): vive no bolão base do grupo (mode points/table).
  const potLc = useMemo(() => {
    const found = (comps ?? []).find((c) => c.mode === "points" || c.mode === "table");
    return found as
      | (typeof found & {
          pot_enabled?: boolean | null;
          pot_entry_cents?: number | null;
          pot_split?: Record<string, number> | null;
          pot_locked?: boolean | null;
          pot_pix_key?: string | null;
        })
      | undefined;
  }, [comps]);
  const potOn = potLc?.pot_enabled === true;
  const { data: potPayers } = usePotPayers(potOn ? potLc?.id : null);
  // Selo 💰 na classificação: quem leva o quê HOJE (só quando a aba olha o bolão).
  const potForStandings = useMemo(() => {
    if (!potOn || !potLc || !potPayers || activeLcId !== potLc.id || !standings) return undefined;
    const { prizes } = computePot(
      potLc.pot_entry_cents ?? 0,
      potPayers.confirmed.size,
      (potLc.pot_split ?? {}) as { 1?: number; 2?: number; 3?: number },
    );
    return {
      payers: potPayers.confirmed,
      // prizes (cents por colocação) seguem pra ClassificacaoTab recalcular o
      // prêmio sobre a classificação AO VIVO; prizeByUserId é o FINAL (share).
      prizes,
      prizeByUserId: prizeByUser(standings, potPayers.confirmed, prizes),
    };
  }, [potOn, potLc, potPayers, activeLcId, standings]);

  const leave = useLeaveLeague();
  const setConfronto = useSetConfrontoEnabled();

  const tabs = useMemo(() => {
    const base: { value: Tab; label: string }[] = [
      { value: "classificacao", label: "Classificação" },
      { value: "membros", label: `Membros${members ? ` (${members.length})` : ""}` },
    ];
    // Bolão valendo antes de Competições: dá destaque à funcionalidade nova do bolão pago.
    if (potLc && (potLc.pot_enabled || isAdmin)) base.push({ value: "bolao", label: "Bolão valendo" });
    if (isAdmin) base.push({ value: "competicoes", label: "Competições" });
    return base;
  }, [members, isAdmin, potLc]);

  if (isLoading) {
    return (
      <Page title="Grupo">
        <Skeleton className="h-40 w-full" />
      </Page>
    );
  }
  if (!league) {
    return (
      <Page title="Grupo">
        <EmptyState title="Grupo não encontrado" description="Verifique o link ou o código." />
      </Page>
    );
  }

  const confrontoEnabled = league.confronto_enabled ?? false;

  function copyCode() {
    if (!league?.join_code) return;
    navigator.clipboard.writeText(league.join_code);
    track("copy_invite", { content_type: "group_invite" });
    toast("Código copiado!", "success");
  }

  // Compartilha o convite: texto único em inviteShare.ts (pitch + "Entre no meu
  // grupo" com o NOME + código + link parametrizado ?convite=). Web Share primeiro
  // (preserva emojis que o wa.me corrompe); wa.me como fallback.
  function shareWhatsApp() {
    if (!league?.join_code) return;
    track("share", { method: "whatsapp", content_type: "group_invite" });
    shareGroupInvite(league.name, league.join_code);
  }

  async function handleLeave() {
    if (!league) return;
    try {
      await leave.mutateAsync(league.id);
      toast("Você saiu do grupo.", "info");
      navigate("/grupos");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Não rolou sair agora. Tenta de novo?", "error");
    }
  }

  return (
    <Page
      title={groupDisplayName(league)}
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/grupos")} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      {/* Card 1 — Identidade: escudo + descrição + Editar */}
      <Card className="mb-4 p-4">
        <div className="flex items-start gap-3">
          <Escudo src={league.logo_url} name={league.name} size="xl" />
          <div className="min-w-0 flex-1">
            {league.description ? (
              <p className="text-sm text-ink-600">{league.description}</p>
            ) : isAdmin ? (
              <button
                type="button"
                onClick={() => setEditorOpen(true)}
                className="text-sm font-medium text-brand-600 transition hover:text-brand-700"
              >
                + Adicionar descrição
              </button>
            ) : (
              <p className="text-xs italic text-ink-400">Sem descrição.</p>
            )}
          </div>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => setEditorOpen((v) => !v)}
            >
              <Pencil className="size-4" /> {editorOpen ? "Fechar" : "Editar"}
            </Button>
          )}
        </div>
      </Card>

      {/* Editor do grupo — nome + descrição + escudo */}
      {isAdmin && editorOpen && (
        <GrupoEditor
          leagueId={league.id}
          currentName={league.name}
          currentDescription={league.description}
          currentLogo={league.logo_url}
          onClose={() => setEditorOpen(false)}
        />
      )}

      {/* Card 2 — Convide: código + WhatsApp */}
      {(isAdmin || myMember) && league.join_code && (
        <Card className="mb-4 p-4">
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
          <button
            type="button"
            onClick={shareWhatsApp}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-grass-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-grass-700"
          >
            <MessageCircle className="size-4" />
            Compartilhar no WhatsApp
          </button>
        </Card>
      )}

      {isAppAdmin && (
        <Card className="mb-4 border border-border bg-surface-2 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-ink-900">
                <Sparkles className="size-4 shrink-0 text-brand-600" />
                Modo Confronto (teste)
                <span className="rounded-pill bg-brand-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  admin
                </span>
              </p>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                {confrontoEnabled
                  ? "Liberado: este grupo pode criar disputas de Liga e Copa, sortear os confrontos e adicionar várias competições."
                  : "Bloqueado: Liga e Copa aparecem como “em breve”. Libere para este grupo testar o Confronto e o sorteio."}
              </p>
            </div>
            <Button
              size="sm"
              className="w-full shrink-0 sm:w-auto"
              variant={confrontoEnabled ? "outline" : undefined}
              loading={setConfronto.isPending}
              onClick={() =>
                setConfronto.mutate(
                  { leagueId: league.id, value: !confrontoEnabled },
                  {
                    onSuccess: () =>
                      toast(
                        confrontoEnabled
                          ? "Confronto desativado neste grupo."
                          : "Confronto liberado para este grupo.",
                        "success",
                      ),
                    onError: (e) =>
                      toast(e instanceof Error ? e.message : "Não deu pra atualizar agora. Tenta de novo?", "error"),
                  },
                )
              }
            >
              {confrontoEnabled ? "Desativar" : "Ativar Confronto"}
            </Button>
          </div>
        </Card>
      )}

      {/* Anúncio do Bolão valendo: só pra quem vê a aba (admin sempre; membro com pot ativo). */}
      {tabs.some((t) => t.value === "bolao") ? (
        <Coachmark
          storageKey="resultadismo-coach-gestao-bolao-v1"
          title="Novidade: Bolão valendo"
          placement="bottom"
          caretTargetSelector="[data-value='bolao']"
          className="mb-4"
          content={
            <>
              Na aba <span className="font-bold text-ink-50">Bolão valendo</span> o grupo organiza o
              bolão pago: quem pagou, valor da inscrição e divisão do prêmio. O dinheiro continua
              entre vocês, fora do Resultadismo.
            </>
          }
        >
          <SegmentedControl<Tab> value={tab} onChange={setTab} options={tabs} />
        </Coachmark>
      ) : (
        <SegmentedControl<Tab> className="mb-4" value={tab} onChange={setTab} options={tabs} />
      )}

      {tab === "classificacao" && (
        <ClassificacaoTab
          comps={comps ?? []}
          activeLcId={activeLcId}
          onSelect={setLcId}
          standings={standings}
          loading={loadingStandings}
          currentUserId={user?.id}
          isAdmin={isAdmin}
          confrontoEnabled={league.confronto_enabled ?? false}
          pot={potForStandings}
          leagueName={league.name}
        />
      )}

      {tab === "membros" && (
        <MembrosTab
          members={members ?? []}
          isAdmin={isAdmin}
          potLc={potOn && potLc ? { id: potLc.id, locked: potLc.pot_locked === true } : undefined}
          currentUserId={user?.id}
        />
      )}

      {tab === "bolao" && potLc && (
        <GestaoBolaoTab
          leagueId={league.id}
          lc={potLc}
          isAdmin={isAdmin}
          isOwner={isOwner}
          currentUserId={user?.id}
        />
      )}

      {tab === "competicoes" && isAdmin && (
        <CompeticoesTab
          leagueId={league.id}
          comps={comps ?? []}
          confrontoEnabled={confrontoEnabled}
        />
      )}

      {myMember && !isOwner && (
        <Button
          variant="ghost"
          fullWidth
          className="mt-6 text-flame-600"
          onClick={() => setLeaveOpen(true)}
        >
          <LogOut className="size-4" /> Sair do grupo
        </Button>
      )}

      {isOwner && (
        <RefundFederationButton
          leagueId={league.id}
          paymentStatus={league.payment_status}
          approvedAt={league.approved_at}
        />
      )}

      <ConfirmDialog
        open={leaveOpen}
        title="Sair do grupo?"
        message={
          confrontoEnabled
            ? "Você vai sair deste grupo. Não vai mais participar e precisará ser convidado de novo para voltar. Se houver uma Liga ou Copa em andamento, você perde os confrontos restantes por W.O. e não volta a essas disputas, nem reentrando no grupo."
            : "Você vai sair deste grupo. Não vai mais participar e precisará ser convidado de novo para voltar."
        }
        step2Message={
          confrontoEnabled
            ? "Confirmação final: sair mesmo? Os confrontos em andamento viram derrota por W.O."
            : "Confirmação final: sair mesmo deste grupo?"
        }
        confirmLabel="Sair do grupo"
        loading={leave.isPending}
        onConfirm={handleLeave}
        onCancel={() => setLeaveOpen(false)}
      />
    </Page>
  );
}
