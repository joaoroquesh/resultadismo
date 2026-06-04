import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Info, Ticket, Trophy } from "lucide-react";
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
  // Pontos é o default da temporada de Copa: corrida individual por palpite.
  // Tabela continua disponível (campeonatos por pontos corridos).
  const [mode, setMode] = useState<LeagueMode>("points");
  const [discountCode, setDiscountCode] = useState("");
  const [discount, setDiscount] = useState<DiscountInfo | null>(null);
  const [checkingDiscount, setCheckingDiscount] = useState(false);
  const [redirecting, setRedirecting] = useState(false);

  // Pré-seleção da Copa do Mundo (default da temporada) — assim que o catálogo chega.
  useEffect(() => {
    if (competitionId || !competitions?.length) return;
    const wc = findWorldCupCompetition(competitions);
    if (wc) setCompetitionId(wc.id);
  }, [competitions, competitionId]);

  // Detecta se a competição escolhida é a Copa do Mundo (pra ajustar o copy/UI).
  const selectedComp = competitions?.find((c) => c.id === competitionId);
  const isWorldCup = !!selectedComp && selectedComp === findWorldCupCompetition(competitions);

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
    if (!name.trim() || redirecting) return;
    setRedirecting(true);
    try {
      // Fallback robusto: se o catálogo chegou tarde e o useEffect não pré-selecionou
      // a Copa, ainda assim cravamos ela no submit. Toda federação nasce com competição.
      const finalCompId = competitionId || findWorldCupCompetition(competitions)?.id;
      const finalMode: LeagueMode =
        finalCompId && finalCompId === findWorldCupCompetition(competitions)?.id ? "points" : mode;
      const league = await create.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        visibility,
        joinPolicy,
        competitionId: finalCompId || undefined,
        mode: finalMode,
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
      setRedirecting(false); // deu erro ao criar: libera o botão de novo
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
              aria-label="Competição (bolão inicial)"
              value={competitionId}
              onChange={(e) => setCompetitionId(e.target.value)}
              className="h-11 rounded-md border border-ink-200 bg-surface px-3 text-ink-950 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              {competitions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name ?? c.name}
                </option>
              ))}
            </select>
          </div>

          {isWorldCup ? (
            <div className="flex items-start gap-2 rounded-md bg-grass-50 p-3 text-xs text-grass-800 ring-1 ring-grass-200/60">
              <Trophy className="mt-0.5 size-4 shrink-0" />
              <p>
                <strong>Copa do Mundo 2026 — modo Pontos</strong> vem ativa por padrão. É a
                disputa da temporada: cada palpite vale pontos e quem somar mais lidera.
                Você pode trocar a competição depois, lá na página da federação.
              </p>
            </div>
          ) : (
            competitionId && (
              <Coachmark
                storageKey="resultadismo-coach-liga-modo-v1"
                title="Modo de disputa"
                placement="top"
                content={
                  <>
                    <span className="font-bold text-ink-50">Tabela</span>: a federação acompanha
                    um campeonato e quem somar mais pontos nos jogos lidera.{" "}
                    <span className="font-bold text-ink-50">Pontos</span>: disputa corrida,
                    valendo o total de pontos que cada um faz.
                  </>
                }
              >
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-medium text-ink-800">Modo de disputa</label>
                  <SegmentedControl
                    value={mode}
                    onChange={setMode}
                    options={[
                      { value: "points", label: "Pontos" },
                      { value: "table", label: "Tabela" },
                    ]}
                  />
                  <p className="text-xs leading-snug text-ink-500">
                    {mode === "table"
                      ? "Vale o campeonato inteiro: os pontos somam rodada após rodada numa classificação única."
                      : "Corrida por pontos: foco em acumular pontos nos jogos — quem somou mais, lidera."}
                  </p>
                </div>
              </Coachmark>
            )
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
                Criar uma federação tem uma{" "}
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
          <strong className="text-ink-700">O que é uma federação?</strong> É o espaço onde você e seus
          amigos jogam. Hoje ela roda o <strong>bolão da Copa</strong> (modo Tabela — quem soma mais
          pontos lidera). Depois da Copa, dará para adicionar ligas de vários campeonatos: Brasileirão,
          top 5 da Europa, Série B, Libertadores e Copa do Brasil.
        </div>

        <Button
          type="submit"
          fullWidth
          loading={submitting || redirecting}
          disabled={!name.trim() || redirecting}
        >
          {redirecting
            ? payMode === "live"
              ? "Abrindo o Mercado Pago…"
              : "Processando…"
            : isPaid
              ? `Criar federação • ${formatBRL(effectiveCents)}`
              : "Criar federação"}
        </Button>
      </form>
    </Page>
  );
}
