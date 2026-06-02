import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Info, Ticket } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Coachmark } from "@/components/ui/Coachmark";
import { useToast } from "@/components/ui/Toast";
import { useCompetitions } from "@/features/matches/api";
import { useCreateLeague, startLeagueCheckout } from "./api";
import {
  usePaymentSettings,
  useSimulatePayment,
  validateDiscount,
  applyDiscount,
  type DiscountInfo,
} from "@/features/payments/api";
import { formatBRL } from "@/lib/pricing";
import type { LeagueMode } from "@/lib/types";

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
  const [competitionId, setCompetitionId] = useState<string>("");
  const [tipo, setTipo] = useState<"pontos" | "confronto">("pontos");
  const [formato, setFormato] = useState<"liga" | "cup">("liga");
  const mode: LeagueMode = tipo === "pontos" ? "points" : formato;
  const [discountCode, setDiscountCode] = useState("");
  const [discount, setDiscount] = useState<DiscountInfo | null>(null);
  const [checkingDiscount, setCheckingDiscount] = useState(false);

  const payMode = settings?.payment_mode ?? "disabled";
  const priceCents = settings?.league_price_cents ?? 990;
  const isPaid = payMode !== "disabled";
  const effectiveCents = applyDiscount(priceCents, discount);
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
    if (!name.trim()) return;
    try {
      const league = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        joinPolicy,
        competitionId: competitionId || undefined,
        mode,
      });
      const slug = league.slug;

      // Modo desativado: federação gratuita (passa pela aprovação do admin, como antes).
      if (payMode === "disabled") {
        toast("Federação criada! Aguarde a aprovação para começar.", "success");
        navigate(`/federacoes/${slug}`);
        return;
      }

      // Modo teste: simula o pagamento (sem Mercado Pago) e já ativa.
      if (payMode === "test") {
        try {
          await simulate.mutateAsync({ leagueId: league.id, code: appliedCode });
          toast("Pagamento simulado aprovado — federação ativa!", "success");
        } catch {
          toast("Federação criada. Conclua o pagamento de teste na página dela.", "info");
        }
        navigate(`/federacoes/${slug}`);
        return;
      }

      // Modo Mercado Pago: vai para o checkout (ou ativa de graça se 100% de desconto).
      try {
        const res = await startLeagueCheckout(league.id, appliedCode);
        if (res.free) {
          toast("Federação ativada com desconto!", "success");
          navigate(`/federacoes/${slug}`);
          return;
        }
        if (res.url) {
          window.location.href = res.url;
          return;
        }
      } catch (payErr) {
        toast(
          payErr instanceof Error
            ? `Federação criada, mas o pagamento não iniciou: ${payErr.message}`
            : "Federação criada. Finalize o pagamento para ativá-la.",
          "info",
        );
        navigate(`/federacoes/${slug}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao criar federação.", "error");
    }
  }

  const submitting = create.isPending || simulate.isPending;

  return (
    <Page
      title="Nova federação"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4 p-4">
          <Input
            label="Nome da federação"
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
              placeholder="Do que se trata a federação?"
              className="rounded-md border border-ink-200 bg-surface px-3.5 py-2.5 text-ink-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </Card>

        <Coachmark
          storageKey="resultadismo-coach-liga-acesso-v1"
          title="Quem entra na federação"
          placement="bottom"
          content={
            <>
              <span className="font-bold text-ink-50">Privada</span> não aparece na busca;{" "}
              <span className="font-bold text-ink-50">Pública</span> qualquer um acha. E o acesso pode
              ser por <span className="font-bold text-ink-50">Convite</span> (só com link),{" "}
              <span className="font-bold text-ink-50">Aprovação</span> (você libera cada pedido) ou{" "}
              <span className="font-bold text-ink-50">Aberta</span> (entra direto).
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
                  setJoinPolicy(v === "public" ? "open" : "invite");
                }}
                options={[
                  { value: "private", label: "Privada" },
                  { value: "public", label: "Pública" },
                ]}
              />
              <p className="text-xs leading-snug text-ink-500">
                {visibility === "private"
                  ? "Só membros enxergam a federação — ninguém de fora encontra."
                  : "Qualquer pessoa pode encontrar e acompanhar a federação. A entrada fica liberada para todos."}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-ink-800">Quem pode entrar</label>
              <SegmentedControl
                value={joinPolicy}
                onChange={setJoinPolicy}
                options={[
                  { value: "invite", label: "Convite" },
                  { value: "approval", label: "Aprovação" },
                  { value: "open", label: "Aberta" },
                ]}
              />
              <p className="text-xs leading-snug text-ink-500">
                {visibility === "public"
                  ? "Federações públicas são sempre abertas: quem quiser entra na hora."
                  : joinPolicy === "invite"
                    ? "Só entra quem recebe o código de convite da federação."
                    : joinPolicy === "approval"
                      ? "Qualquer um pode pedir para entrar, mas um admin precisa aprovar."
                      : "Entrada livre: quem quiser participar entra sem convite nem aprovação."}
              </p>
            </div>
          </Card>
        </Coachmark>

        <Card className="space-y-4 p-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-ink-800">Competição (bolão inicial)</label>
            <select
              value={competitionId}
              onChange={(e) => setCompetitionId(e.target.value)}
              className="h-11 rounded-md border border-ink-200 bg-surface px-3 text-ink-950 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Escolher depois</option>
              {competitions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {competitionId && (
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-ink-800">Modo de disputa</label>
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
                  ? "Pontos: todo mundo acumula pontos e quem somou mais lidera. Entra quando quiser."
                  : formato === "liga"
                    ? "Liga: todos contra todos; cada rodada vale 3/1/0 e forma uma tabela."
                    : "Copa: mata-mata; quem perde o confronto está fora, até sobrar o campeão."}
              </p>
              {tipo === "confronto" && (
                <p className="rounded-md bg-brand-500/10 px-3 py-2 text-[11px] leading-relaxed text-brand-700">
                  No confronto você <span className="font-semibold">sorteia</span> depois de criar —
                  isso trava os participantes. Quem entrar na federação depois não joga esta disputa.
                </p>
              )}
            </div>
          )}
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

        <div className="flex items-start gap-2 rounded-md bg-brand-50 p-3 text-xs text-brand-800">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            {payMode === "disabled" ? (
              <>
                Para evitar abusos, novas federações passam por uma aprovação rápida de um administrador
                antes de ficarem ativas.
              </>
            ) : payMode === "test" ? (
              <>
                <strong>Modo de teste:</strong> o pagamento é simulado (sem cobrança real) só para você
                testar o fluxo. A federação ativa na hora.
              </>
            ) : (
              <>
                Criar uma federação tem uma <strong>taxa única de {formatBRL(priceCents)}</strong>, paga
                via Pix ou cartão no Mercado Pago. Ativa automaticamente após a confirmação.
              </>
            )}{" "}
            Em dúvida?{" "}
            <Link to="/como-funciona" className="font-semibold underline">
              Veja como funciona
            </Link>
            .
          </p>
        </div>

        <Button type="submit" fullWidth loading={submitting} disabled={!name.trim()}>
          {isPaid ? `Criar federação • ${formatBRL(effectiveCents)}` : "Criar federação"}
        </Button>
      </form>
    </Page>
  );
}
