import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListOrdered, Shield } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useMyLeagues, useLeagueCompetitions, useStandings } from "@/features/leagues/api";
import { StandingsTable } from "./StandingsTable";

function Pills<T extends { id: string }>({
  items,
  selectedId,
  onSelect,
  label,
}: {
  items: (T & { name: string })[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  label: (item: T & { name: string }) => string;
}) {
  if (items.length <= 1) return null;
  return (
    <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onSelect(it.id)}
          className={cn(
            "shrink-0 rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
            selectedId === it.id
              ? "border-brand-600 bg-brand-50 text-brand-700"
              : "border-ink-200 bg-surface text-ink-600",
          )}
        >
          {label(it)}
        </button>
      ))}
    </div>
  );
}

export function ClassificacaoPage() {
  const { user } = useAuth();
  const { data: leagues, isLoading: loadingLeagues } = useMyLeagues();
  const [leagueId, setLeagueId] = useState<string>();
  const activeLeagueId = leagueId ?? leagues?.[0]?.id;

  const { data: comps, isLoading: loadingComps } = useLeagueCompetitions(activeLeagueId);
  const [lcId, setLcId] = useState<string>();
  const activeLcId = lcId ?? comps?.[0]?.id;

  useEffect(() => {
    setLcId(undefined);
  }, [activeLeagueId]);

  const { data: standings, isLoading: loadingStandings } = useStandings(activeLcId);

  if (loadingLeagues) {
    return (
      <Page title="Classificação">
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }

  if (!leagues || leagues.length === 0) {
    return (
      <Page title="Classificação">
        <EmptyState
          icon={<ListOrdered className="size-7" />}
          title="Você ainda não está em uma liga"
          description="Entre ou crie uma liga para ver a classificação dos seus palpites."
          action={
            <Link to="/ligas">
              <Button>
                <Shield className="size-4" /> Ver ligas
              </Button>
            </Link>
          }
        />
      </Page>
    );
  }

  return (
    <Page title="Classificação">
      <Pills
        items={leagues}
        selectedId={activeLeagueId}
        onSelect={setLeagueId}
        label={(l) => l.name}
      />
      {!loadingComps && comps && comps.length > 0 && (
        <Pills items={comps} selectedId={activeLcId} onSelect={setLcId} label={(c) => c.name} />
      )}

      {loadingStandings ? (
        <Skeleton className="h-64 w-full" />
      ) : !comps || comps.length === 0 ? (
        <EmptyState
          icon={<ListOrdered className="size-7" />}
          title="Sem competições nesta liga"
          description="O administrador da liga ainda não vinculou uma competição."
        />
      ) : standings && standings.length > 0 ? (
        <StandingsTable rows={standings} currentUserId={user?.id} />
      ) : (
        <EmptyState
          icon={<ListOrdered className="size-7" />}
          title="Sem pontos ainda"
          description="Assim que os jogos forem encerrados, a classificação aparece aqui."
        />
      )}
    </Page>
  );
}
