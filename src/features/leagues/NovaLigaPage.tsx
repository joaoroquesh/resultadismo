import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Info, Ticket, Trophy, Lock } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Coachmark } from "@/components/ui/Coachmark";
import { useToast } from "@/components/ui/Toast";
import { useCompetitions, findWorldCupCompetition } from "@/features/matches/api";
import { useCreateLeague, startLeagueCheckout } from "./api";
import {
  usePaymentSettings,
  useSimulatePayment,
  validateDiscount,
  applyDiscount,
  isPromoActive,
  effectivePriceCents,
  type DiscountInfo,
} from "@/features/payments/api";
import { formatBRL } from "@/lib/pricing";

export function NovaLigaPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: competitions } = useCompetitions();
  const create = useCreateLeague();
  const simulate = useSimulatePayment();
  const { data: settings } = usePaymentSettings();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinPolicy, setJoinPolicy] = useState<"invite" | "approval" | "open">("invite");
  const [discountCode, setDiscountCode] = useState("");
  const [discount, setDiscount] = useState<DiscountInfo | null>(null);
  const [checkingDiscount, setCheckingDiscount] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Temporada da Copa: todo grupo nasce com a Copa do Mundo (modo Pontos), travada.
  // O banco também enforça (trigger group_eligible). Outros campeonatos chegam depois.
  const worldCup = competitions?.length ? findWorldCupCompetition(competitions) : undefined;

  const payMode = settings?.payment_mode ?? "disabled";
  const baseCents = settings?.league_price_cents ?? 990;
  const promoActive = isPromoActive(settings);
  const currentCents = effectivePriceCents(settings); // promo se valendo, senão base
  const isPaid = payMode !== "disabled";
  const effectiveCents = applyDiscount(currentCents, discount); // cupom sobre o preço vigente
  const appliedCode = discount?.valid ? discount.code : undefined;

  async function handleApplyDiscount() {
    if (!discountCode.trim()) return;
    setCheckingDiscount(true);
    try {
      const info = await validateDiscount(discountCode);
      setDiscount(info);
      toast(info.valid ? "Cupom aplicado!" : (info.reason ?? "Cupom inválido."), info.valid ? "success" : "error");
    } catch {
      toast("Não foi possível validar o cupom.", "error");
    } finally {
      setCheckingDiscount(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // Clique único: ignora cliques repetidos enquanto cria/abre o pagamento.
    if (!name.trim() || redirecting || !worldCup) return;
    setRedirecting(true);
    try {
      // Todo grupo nasce com a Copa do Mundo em modo Pontos (o submit fica
      // desabilitado até o catálogo carregar; o banco também enforça).
      const league = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        joinPolicy,
        competitionId: worldCup.id,
        mode: "points",
      });
      const slug = league.slug;

      // Modo desativado: grupo gratuito (passa pela aprovação do admin, como antes).
      if (payMode === "disabled") {
        toast("Grupo criado! Aguarde a aprovação para começar.", "success");
        navigate(`/grupos/${slug}`);
        return;
      }

      // Modo teste: simula o pagamento (sem Mercado Pago) e já ativa.
      if (payMode === "test") {
        try {
          await simulate.mutateAsync({ leagueId: league.id, code: appliedCode });
          toast("Pagamento simulado aprovado — grupo ativo!", "success");
        } catch {
          toast("Grupo criado. Conclua o pagamento de teste na página dele.", "info");
        }
        navigate(`/grupos/${slug}`);
        return;
      }

      // Modo Mercado Pago: vai para o checkout (ou ativa de graça se 100% de desconto).
      try {
        const res = await startLeagueCheckout(league.id, appliedCode);
        if (res.free) {
          toast("Grupo ativado com desconto!", "success");
          navigate(`/grupos/${slug}`);
          return;
        }
        if (res.url) {
          window.location.href = res.url;
          return;
        }
      } catch (payErr) {
        toast(
          payErr instanceof Error
            ? `Grupo criado, mas o pagamento não iniciou: ${payErr.message}`
            : "Grupo criado. Finalize o pagamento para ativá-lo.",
          "info",
        );
        navigate(`/grupos/${slug}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao criar grupo.", "error");
      setRedirecting(false); // deu erro ao criar: libera o botão de novo
    }
  }

  const submitting = create.isPending || simulate.isPending;

  return (
    <Page
      title="Novo grupo"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4 p-4">
          <Input
            label="Nome do grupo"
            placeholder="Ex.: Amigos da Pelada"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={60}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-800">Descrição (opcional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              maxLength={200}
              placeholder="Do que se trata o grupo?"
              className="rounded-md border border-ink-200 bg-surface px-3.5 py-2.5 text-ink-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </Card>

        <Coachmark
          storageKey="resultadismo-coach-liga-acesso-v2"
          title="Quem entra no grupo"
          placement="bottom"
          content={
            <>
              <span className="font-bold text-ink-50">Privado</span> só entra com o código de
              convite e ninguém de fora encontra.{" "}
              <span className="font-bold text-ink-50">Público</span> aparece pra todo mundo na lista
              de grupos — e você escolhe se a entrada é{" "}
              <span className="font-bold text-ink-50">aberta</span> (entra na hora) ou{" "}
              <span className="font-bold text-ink-50">por aprovação</span> (você libera cada pedido).
            </>
          }
        >
          <Card className="space-y-4 p-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-ink-800">Visibilidade</label>
              <SegmentedControl
                value={visibility}
                onChange={(v) => {
                  setVisibility(v);
                  // Modelo: privado ⇒ só convite; público ⇒ aberto (default) ou aprovação.
                  setJoinPolicy(v === "public" ? "open" : "invite");
                }}
                options={[
                  { value: "private", label: "Privado" },
                  { value: "public", label: "Público" },
                ]}
              />
              <p className="text-xs leading-snug text-ink-500">
                {visibility === "private"
                  ? "Ninguém de fora encontra. Você chama a galera pelo código de convite."
                  : "Aparece na lista de grupos públicos pra qualquer Resultadista achar e entrar."}
              </p>
            </div>

            {visibility === "public" ? (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-ink-800">Como entram no grupo</label>
                <SegmentedControl<"open" | "approval">
                  value={joinPolicy === "approval" ? "approval" : "open"}
                  onChange={setJoinPolicy}
                  options={[
                    { value: "open", label: "Aberto" },
                    { value: "approval", label: "Por aprovação" },
                  ]}
                />
                <p className="text-xs leading-snug text-ink-500">
                  {joinPolicy === "approval"
                    ? "Qualquer um pede pra entrar e um admin libera cada pedido."
                    : "Entrada livre: quem quiser participar entra na hora."}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-md bg-ink-50 px-3 py-2.5 text-xs leading-snug text-ink-600">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-ink-400" />
                <p>
                  Grupo privado entra <span className="font-semibold text-ink-800">só com o
                  código de convite</span>. Depois de criar, você compartilha o código no WhatsApp.
                </p>
              </div>
            )}
          </Card>
        </Coachmark>

        <Card className="space-y-4 p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-800">Competição da temporada</label>
            {/* Travada na Copa: nesta temporada todo grupo joga a Copa do Mundo. */}
            <div className="flex h-11 items-center justify-between gap-2 rounded-md border border-ink-200 bg-surface-2 px-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Trophy className="size-4 shrink-0 text-brand-600" />
                <span className="truncate font-semibold text-ink-900">
                  {worldCup ? (worldCup.display_name ?? worldCup.name) : "Copa do Mundo 2026"}
                </span>
              </span>
              <Lock className="size-3.5 shrink-0 text-ink-400" aria-label="Competição fixa" />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-md border-l-2 border-grass-600 bg-surface-2 p-3 text-xs text-grass-800">
            <Trophy className="mt-0.5 size-4 shrink-0" />
            <p>
              <strong>É a temporada da Copa!</strong> Todo grupo joga a{" "}
              <strong>Copa do Mundo 2026 em modo Pontos</strong>: cada palpite vale pontos e quem
              somar mais lidera. Depois da Copa, outros campeonatos chegam para os grupos
              (Brasileirão, Libertadores e mais). Os <strong>amistosos</strong> ficam abertos para
              palpitar na aba Jogos, mas não valem pontos no grupo.
            </p>
          </div>
        </Card>

        {isPaid && (
          <Card className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink-800">
              <Ticket className="size-4 text-brand-600" /> Cupom de desconto (opcional)
            </div>
            <div className="flex gap-2">
              <input
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value);
                  setDiscount(null);
                }}
                placeholder="Ex.: COPA10"
                className="h-11 flex-1 rounded-md border border-ink-200 bg-surface px-3 uppercase text-ink-950 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={handleApplyDiscount}
                loading={checkingDiscount}
                disabled={!discountCode.trim()}
              >
                Aplicar
              </Button>
            </div>
            {discount?.valid && (
              <p className="text-xs font-medium text-grass-700">
                Cupom {discount.code} aplicado — você paga {formatBRL(effectiveCents)}
                {effectiveCents === 0 && " (grátis!)"}.
              </p>
            )}
          </Card>
        )}

        <div className="flex items-start gap-2 rounded-md border-l-2 border-brand-600 bg-surface-2 p-3 text-xs text-brand-800">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            {payMode === "disabled" ? (
              <>
                Para evitar abusos, novos grupos passam por uma aprovação rápida de um administrador
                antes de ficarem ativos.
              </>
            ) : payMode === "test" ? (
              <>
                <strong>Modo de teste:</strong> o pagamento é simulado (sem cobrança real) só para você
                testar o fluxo. O grupo fica ativo na hora.
              </>
            ) : (
              <>
                Criar um grupo tem uma{" "}
                <strong>taxa única de {formatBRL(currentCents)}</strong>
                {promoActive && (
                  <>
                    {" "}
                    <span className="text-brand-700/70 line-through">{formatBRL(baseCents)}</span> —
                    promoção da Copa
                  </>
                )}
                , paga via Pix ou cartão no Mercado Pago. Ativa automaticamente após a confirmação.
              </>
            )}{" "}
            Em dúvida?{" "}
            <Link to="/como-funciona" className="font-semibold underline">
              Veja como funciona
            </Link>
            .
          </p>
        </div>

        <div className="rounded-md border border-border bg-surface p-3 text-xs leading-relaxed text-ink-500">
          <strong className="text-ink-700">O que é um grupo?</strong> É o espaço onde você e seus
          amigos jogam. Nesta temporada ele roda o <strong>bolão da Copa</strong> (modo Pontos: quem
          soma mais pontos lidera). Depois da Copa, dará para adicionar outros campeonatos:
          Brasileirão, top 5 da Europa, Série B, Libertadores e Copa do Brasil.
        </div>

        <Button
          type="submit"
          fullWidth
          loading={submitting || redirecting}
          disabled={!name.trim() || redirecting || !worldCup}
        >
          {redirecting
            ? payMode === "live"
              ? "Abrindo o Mercado Pago…"
              : "Processando…"
            : isPaid
              ? `Criar grupo • ${formatBRL(effectiveCents)}`
              : "Criar grupo"}
        </Button>
      </form>
    </Page>
  );
}
