import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Copy, Clock, LogOut, Palette, Sparkles } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
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
import { EscudoStudio } from "./tabs/EscudoStudio";

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
  const [leaveOpen, setLeaveOpen] = useState(false);
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

  const confrontoEnabled = league.confronto_enabled ?? false;

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
      {league.status === "active" && league.name_approved === false && (
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
        <MembrosTab members={members ?? []} isAdmin={isAdmin} />
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
          <LogOut className="size-4" /> Sair da federação
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
        title="Sair da federação?"
        message={
          confrontoEnabled
            ? "Você vai sair desta federação. Não vai mais participar e precisará ser convidado de novo para voltar. Se houver uma Liga ou Copa em andamento, você perde os confrontos restantes por W.O. e não volta a essas disputas — nem reentrando na federação."
            : "Você vai sair desta federação. Não vai mais participar e precisará ser convidado de novo para voltar."
        }
        step2Message={
          confrontoEnabled
            ? "Confirmação final: sair mesmo? Os confrontos em andamento viram derrota por W.O."
            : "Confirmação final: sair mesmo desta federação?"
        }
        confirmLabel="Sair da federação"
        loading={leave.isPending}
        onConfirm={handleLeave}
        onCancel={() => setLeaveOpen(false)}
      />
    </Page>
  );
}
