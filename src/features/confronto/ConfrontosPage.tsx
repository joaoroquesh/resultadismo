import { useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { ArrowLeft, Swords, Plus } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLeague, useLeagueCompetitions, useLeagueMembers } from "@/features/leagues/api";
import { ConfrontoSection } from "./ConfrontoSection";

// Página dedicada de Confrontos do grupo: /grupos/:slug/confrontos
// Só faz sentido quando confronto_enabled=true. Separada do detalhe (que foca
// no Bolão) pra reduzir carga visual e deixar claro: 2 modos = 2 lugares.
export function ConfrontosPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: league, isLoading: loadingLeague } = useLeague(slug);
  const { data: comps } = useLeagueCompetitions(league?.id);
  const { data: members } = useLeagueMembers(league?.id);

  const isAdmin =
    !!user &&
    !!members?.find(
      (m) => m.profile?.id === user.id && (m.role === "owner" || m.role === "admin"),
    );

  const isConfronto = (m: string) => m === "liga" || m === "cup";
  const confrontoDisputas =
    comps?.filter((c) => isConfronto(c.mode) && (isAdmin || c.confronto_state !== "draft")) ?? [];
  const [activeLcId, setActiveLcId] = useState<string | null>(null);
  const active = confrontoDisputas.find((c) => c.id === activeLcId) ?? confrontoDisputas[0];

  if (loadingLeague) {
    return (
      <Page title="Confrontos">
        <Skeleton className="h-32 w-full" />
      </Page>
    );
  }

  if (!league) {
    return (
      <Page title="Confrontos">
        <EmptyState title="Grupo não encontrado" description="Verifique o link." />
      </Page>
    );
  }

  if (!league.confronto_enabled) {
    return (
      <Page
        title="Confrontos"
        action={
          <Button variant="ghost" size="icon" onClick={() => navigate(`/grupos/${slug}`)} aria-label="Voltar">
            <ArrowLeft className="size-5" />
          </Button>
        }
      >
        <Card className="space-y-4 p-5 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-full bg-ink-100 text-ink-500">
            <Swords className="size-6" strokeWidth={2.2} />
          </span>
          <div>
            <h3 className="text-base font-extrabold text-ink-950">Confrontos em breve</h3>
            <p className="mx-auto mt-1 max-w-xs text-sm text-ink-500">
              Liga e Copa ainda não estão liberadas neste grupo.
            </p>
          </div>
          <Link to={`/grupos/${slug}`}>
            <Button variant="outline">Voltar para o grupo</Button>
          </Link>
        </Card>
      </Page>
    );
  }

  return (
    <Page
      title="Confrontos"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate(`/grupos/${slug}`)} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      {/* Header curto: contexto do grupo */}
      <Card className="mb-4 flex items-center justify-between gap-3 p-3.5">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Grupo
          </p>
          <p className="truncate font-bold text-ink-900">{league.name}</p>
        </div>
        <Link to={`/grupos/${slug}`} className="shrink-0 text-xs font-semibold text-brand-700 underline">
          ver grupo
        </Link>
      </Card>

      {/* Lista de disputas Liga/Copa */}
      {confrontoDisputas.length === 0 ? (
        <Card className="space-y-3 p-5 text-center">
          <Swords className="mx-auto size-8 text-ink-300" />
          <p className="text-sm text-ink-600">
            Nenhuma Liga ou Copa criada ainda.
            {isAdmin && " Crie uma na aba Competições do grupo."}
          </p>
          {isAdmin && (
            <Link to={`/grupos/${slug}?tab=competicoes`}>
              <Button>
                <Plus className="size-4" /> Criar disputa
              </Button>
            </Link>
          )}
        </Card>
      ) : (
        <>
          {confrontoDisputas.length > 1 && (
            <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
              {confrontoDisputas.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveLcId(c.id)}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
                    active?.id === c.id
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-ink-200 bg-surface text-ink-600",
                  )}
                >
                  {c.name}
                  <span className="rounded-pill bg-ink-100 px-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-500">
                    {c.mode === "cup" ? "Copa" : "Liga"}
                  </span>
                </button>
              ))}
            </div>
          )}

          {active && (
            <ConfrontoSection
              lcId={active.id}
              leagueId={league.id}
              competitionId={active.competition_id}
              mode={active.mode as "liga" | "cup"}
              state={active.confronto_state ?? "draft"}
              memberCount={members?.length ?? 0}
              isAdmin={isAdmin}
              currentUserId={user?.id}
              participantMode={active.participant_mode ?? "admin"}
              ligaFormat={active.liga_format ?? "partial"}
              scheduledDrawAt={active.scheduled_draw_at ?? null}
            />
          )}
        </>
      )}
    </Page>
  );
}
