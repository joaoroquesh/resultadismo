import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { Swords, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { StandingsTable } from "@/features/standings/StandingsTable";
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
}: {
  comps: {
    id: string;
    name: string;
    mode: string;
    competition_id: string;
    confronto_state?: string;
  }[];
  activeLcId?: string;
  onSelect: (id: string) => void;
  standings: ReturnType<typeof useStandings>["data"];
  loading: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  confrontoEnabled: boolean;
}) {
  const { slug } = useParams<{ slug: string }>();
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

      {/* Tabela do bolão ativo */}
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
