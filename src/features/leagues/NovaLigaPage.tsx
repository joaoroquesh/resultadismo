import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Info } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Coachmark } from "@/components/ui/Coachmark";
import { useToast } from "@/components/ui/Toast";
import { useCompetitions } from "@/features/matches/api";
import { useCreateLeague, startLeagueCheckout } from "./api";
import { LEAGUE_PRICE_BRL } from "@/lib/pricing";
import type { LeagueMode } from "@/lib/types";

export function NovaLigaPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: competitions } = useCompetitions();
  const create = useCreateLeague();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"private" | "public">("private");
  const [joinPolicy, setJoinPolicy] = useState<"invite" | "approval" | "open">("invite");
  const [competitionId, setCompetitionId] = useState<string>("");
  const [mode, setMode] = useState<LeagueMode>("table");

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
      // Liga criada como "pendente": segue para o checkout do Mercado Pago p/ ativar.
      try {
        const url = await startLeagueCheckout(league.id);
        window.location.href = url;
        return;
      } catch (payErr) {
        toast(
          payErr instanceof Error
            ? `Liga criada, mas o pagamento não iniciou: ${payErr.message}`
            : "Liga criada. Finalize o pagamento para ativá-la.",
          "info",
        );
        navigate(`/ligas/${league.slug}`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Erro ao criar liga.", "error");
    }
  }

  return (
    <Page
      title="Nova liga"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Card className="space-y-4 p-4">
          <Input
            label="Nome da liga"
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
              placeholder="Do que se trata a liga?"
              className="rounded-md border border-ink-200 bg-surface px-3.5 py-2.5 text-ink-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
        </Card>

        <Coachmark
          storageKey="resultadismo-coach-liga-acesso-v1"
          title="Quem entra na liga"
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
                  ? "Só membros enxergam a liga — ninguém de fora encontra."
                  : "Qualquer pessoa pode encontrar e acompanhar a liga. A entrada fica liberada para todos."}
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
                  ? "Ligas públicas são sempre abertas: quem quiser entra na hora."
                  : joinPolicy === "invite"
                    ? "Só entra quem recebe o código de convite da liga."
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
            <Coachmark
              storageKey="resultadismo-coach-liga-modo-v1"
              title="Modo de disputa"
              placement="top"
              content={
                <>
                  <span className="font-bold text-ink-50">Tabela</span>: a liga acompanha um campeonato
                  e quem somar mais pontos nos jogos lidera.{" "}
                  <span className="font-bold text-ink-50">Pontos</span>: disputa corrida, valendo o
                  total de pontos que cada um faz.
                </>
              }
            >
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-ink-800">Modo de disputa</label>
                <SegmentedControl
                  value={mode}
                  onChange={setMode}
                  options={[
                    { value: "table", label: "Tabela" },
                    { value: "points", label: "Pontos" },
                  ]}
                />
                <p className="text-xs leading-snug text-ink-500">
                  {mode === "table"
                    ? "Vale o campeonato inteiro: os pontos somam rodada após rodada numa classificação única."
                    : "Corrida por pontos: foco em acumular pontos nos jogos — quem somou mais, lidera."}
                </p>
              </div>
            </Coachmark>
          )}
        </Card>

        <div className="flex items-start gap-2 rounded-md bg-brand-50 p-3 text-xs text-brand-800">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Criar uma liga tem uma <strong>taxa única de {LEAGUE_PRICE_BRL}</strong>, paga via Pix ou
            cartão no Mercado Pago. A liga é ativada automaticamente após a confirmação do pagamento.
            Em dúvida sobre as opções?{" "}
            <Link to="/como-funciona" className="font-semibold underline">
              Veja como funciona
            </Link>
            .
          </p>
        </div>

        <Button type="submit" fullWidth loading={create.isPending} disabled={!name.trim()}>
          Criar liga • {LEAGUE_PRICE_BRL}
        </Button>
      </form>
    </Page>
  );
}
