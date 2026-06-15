import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Swords, ChevronRight, Target, Share2 } from "lucide-react";
import { describeTeamScope } from "@/features/onboarding/teamsCatalog";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { track } from "@/lib/analytics";
import { StandingsTable } from "@/features/standings/StandingsTable";
import { shareImageBlob } from "@/features/matches/shareImage";
import { buildStandingsShareImage } from "../standingsShareImage";
import { useStandings } from "../api";

// Esta tab agora mostra APENAS Bolões (modo points/table). Confrontos (Liga/
// Copa) viraram página dedicada em /grupos/:slug/confrontos. Quando o grupo
// tem confronto_enabled e há alguma Liga/Copa, mostra um CTA pra navegar.
export function ClassificacaoTab({
  comps,
  activeLcId,
  onSelect,
  standings,
  loading,
  currentUserId,
  isAdmin,
  confrontoEnabled,
  pot,
  leagueName,
}: {
  comps: {
    id: string;
    name: string;
    mode: string;
    competition_id: string;
    confronto_state?: string;
    followed_team_slugs?: string[] | null;
  }[];
  activeLcId?: string;
  onSelect: (id: string) => void;
  standings: ReturnType<typeof useStandings>["data"];
  loading: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  confrontoEnabled: boolean;
  pot?: { payers: Set<string>; prizeByUserId: Map<string, number> };
  leagueName: string;
}) {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [sharing, setSharing] = useState(false);

  async function shareStandings() {
    if (!standings || standings.length === 0) return;
    setSharing(true);
    track("share", { method: "whatsapp", content_type: "group_standings" });
    try {
      const blob = await buildStandingsShareImage(standings, {
        leagueName,
        prizeByUserId: pot?.prizeByUserId,
      });
      const how = await shareImageBlob(blob, "resultadismo-classificacao.png");
      if (how === "downloaded") toast("Imagem salva! Agora é só compartilhar.", "success");
    } catch {
      toast("Não consegui gerar a imagem. Tente de novo.", "error");
    } finally {
      setSharing(false);
    }
  }
  const isConfronto = (m: string) => m === "liga" || m === "cup";
  const boloes = comps.filter((c) => !isConfronto(c.mode));
  const temConfronto = comps.some(
    (c) => isConfronto(c.mode) && (isAdmin || c.confronto_state !== "draft"),
  );
  const active = boloes.find((c) => c.id === activeLcId) ?? boloes[0];

  // Sincroniza seleção do pai com o primeiro Bolão visível.
  useEffect(() => {
    if (active && active.id !== activeLcId) onSelect(active.id);
  }, [active, activeLcId, onSelect]);

  if (boloes.length === 0) {
    return (
      <EmptyState
        title="Sem bolão neste grupo"
        description={
          isAdmin
            ? "Adicione um campeonato em Competições."
            : "Um administrador precisa vincular um campeonato."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* CTA pra Confrontos — só se o grupo tem confronto ativo */}
      {confrontoEnabled && temConfronto && (
        <Link to={`/grupos/${slug}/confrontos`}>
          <Card className="flex items-center gap-3 p-3.5 transition active:scale-[0.99]">
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-surface-2 text-brand-600">
              <Swords className="size-4.5" strokeWidth={2.4} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink-900">Confrontos</p>
              <p className="text-xs text-ink-500">Liga e Copa do grupo</p>
            </div>
            <ChevronRight className="size-5 text-ink-300" />
          </Card>
        </Link>
      )}

      {/* Seletor de bolão (se >1) */}
      {boloes.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {boloes.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "inline-flex shrink-0 items-center rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
                active?.id === c.id
                  ? "border-brand-600 bg-surface text-brand-700"
                  : "border-ink-200 bg-surface text-ink-600",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Recorte: deixa CLARO pro MEMBRO quais jogos valem ponto neste grupo
          (só quando há recorte; "Todas" não polui a tela). Evita a frustração
          de palpitar um jogo que não conta. */}
      {(() => {
        const scope = describeTeamScope(active?.followed_team_slugs);
        if (scope.kind === "all") return null;
        return (
          <div className="mb-3 flex items-start gap-2 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-ink-600">
            <Target className="mt-0.5 size-4 shrink-0 text-brand-600" />
            <p>
              Neste grupo valem os jogos de{" "}
              <span className="font-semibold text-ink-900">
                {scope.kind === "brasil" ? "só o Brasil" : scope.names.join(", ")}
              </span>
              . Você pode palpitar em qualquer jogo, mas só esses contam no ranking aqui.
            </p>
          </div>
        );
      })()}

      {/* Tabela do bolão ativo */}
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : standings && standings.length > 0 ? (
        <>
          <StandingsTable rows={standings} currentUserId={currentUserId} pot={pot} />
          <Button
            variant="outline"
            fullWidth
            className="mt-3"
            loading={sharing}
            onClick={shareStandings}
          >
            <Share2 className="size-4" /> Compartilhar classificação
          </Button>
        </>
      ) : (
        <EmptyState title="Sem pontos ainda" description="A classificação aparece após os jogos." />
      )}
    </div>
  );
}
