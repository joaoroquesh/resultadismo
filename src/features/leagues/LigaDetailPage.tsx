import { useEffect, useMemo, useState } from "react";
import { track } from "@/lib/analytics";
import { shareGroupInvite } from "./inviteShare";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Clock, LogOut, Pencil, Sparkles, MessageCircle } from "lucide-react";
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
  useLeagueCheckout,
} from "./api";
import { usePaymentSettings, useSimulatePayment, useCompLeague } from "@/features/payments/api";
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
      potPayers.size,
      (potLc.pot_split ?? {}) as { 1?: number; 2?: number; 3?: number },
    );
    return { payers: potPayers, prizeByUserId: prizeByUser(standings, potPayers, prizes) };
  }, [potOn, potLc, potPayers, activeLcId, standings]);

  const leave = useLeaveLeague();
  const setConfronto = useSetConfrontoEnabled();
  const checkout = useLeagueCheckout();
  const simulate = useSimulatePayment();
  const comp = useCompLeague();
  const { data: paySettings } = usePaymentSettings();
  const payMode = paySettings?.payment_mode ?? "disabled";
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // Enquanto o pagamento estiver pendente, atualiza o grupo periodicamente
  // (a webhook do Mercado Pago a ativa em segundos).
  useEffect(() => {
    if (league?.payment_status !== "pending") return;
    let ticks = 0;
    const t = setInterval(() => {
      ticks += 1;
      qc.invalidateQueries({ queryKey: ["league", slug] });
      if (ticks >= 36) clearInterval(t); // para após ~3 min (evita poll indefinido)
    }, 5000);
    return () => clearInterval(t);
  }, [league?.payment_status, slug, qc]);

  // Mensagem ao voltar do checkout do Mercado Pago.
  useEffect(() => {
    const pag = searchParams.get("pagamento");
    if (!pag) return;
    if (pag === "sucesso") toast("Pagamento recebido! Ativando seu grupo…", "success");
    else if (pag === "processando")
      toast("Pagamento em processamento. O grupo será ativado em instantes.", "info");
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
    // Gestão antes de Competições: dá destaque à funcionalidade nova do bolão.
    if (potLc && (potLc.pot_enabled || isAdmin)) base.push({ value: "bolao", label: "Gestão" });
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
        <EmptyState title="Grupo não encontrada" description="Verifique o link ou o código." />
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
      toast(err instanceof Error ? err.message : "Erro ao sair.", "error");
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
      {league.name_approved === false && (
        <div className="mb-4 flex items-start gap-2 rounded-md bg-surface-2 p-3 text-sm text-flame-700">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <p>
            O <strong>nome</strong> deste grupo foi sinalizado pela moderação e está escondido.{" "}
            {isOwner ? (
              <>
                Toque em <strong>Editar grupo</strong> e escolha outro nome — o grupo segue ativo o
                tempo todo.
              </>
            ) : (
              <>O dono vai escolher um novo nome. O grupo segue funcionando normalmente.</>
            )}
          </p>
        </div>
      )}

      {league.payment_status === "pending" && league.status !== "active" ? (
        <div className="mb-4 rounded-md bg-surface-2 p-3 text-sm text-gold-800">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0" />
            <p>
              {payMode === "test"
                ? "Modo de teste: conclua o pagamento simulado para ativar este grupo."
                : "Este grupo será ativado assim que o pagamento for confirmado. Acabou de pagar? Pode levar alguns segundos."}
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
                      onSuccess: () => toast("Pagamento simulado — grupo ativo!", "success"),
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
                    onSuccess: () => toast("Grupo liberada sem pagamento.", "success"),
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
        <div className="mb-4 rounded-md bg-surface-2 p-3 text-sm text-gold-800">
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 size-4 shrink-0" />
            <p>Este grupo aguarda aprovação de um administrador para ficar ativa.</p>
          </div>
          {isAppAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              loading={comp.isPending}
              onClick={() =>
                comp.mutate(league.id, {
                  onSuccess: () => toast("Grupo liberada.", "success"),
                  onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
                })
              }
            >
              Liberar sem pagamento
            </Button>
          )}
        </div>
      ) : null}

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

      {/* Anúncio da Gestão do Bolão: só pra quem vê a aba (admin sempre; membro com pot ativo). */}
      {tabs.some((t) => t.value === "bolao") ? (
        <Coachmark
          storageKey="resultadismo-coach-gestao-bolao-v1"
          title="Novidade: Gestão do Bolão"
          placement="bottom"
          caretTargetSelector="[data-value='bolao']"
          className="mb-4"
          content={
            <>
              Na aba <span className="font-bold text-ink-50">Gestão</span> o grupo organiza o
              bolão: quem pagou, valor da inscrição e divisão do prêmio. O dinheiro continua
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
            ? "Você vai sair deste grupo. Não vai mais participar e precisará ser convidado de novo para voltar. Se houver uma Liga ou Copa em andamento, você perde os confrontos restantes por W.O. e não volta a essas disputas — nem reentrando no grupo."
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
