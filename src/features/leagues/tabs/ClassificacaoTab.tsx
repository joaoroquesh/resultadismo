import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils";
import { StandingsTable } from "@/features/standings/StandingsTable";
import { ConfrontoSection } from "@/features/confronto/ConfrontoSection";
import { useStandings } from "../api";

export function ClassificacaoTab({
  comps,
  activeLcId,
  onSelect,
  standings,
  loading,
  currentUserId,
  isAdmin,
  leagueId,
  memberCount,
}: {
  comps: {
    id: string;
    name: string;
    mode: string;
    competition_id: string;
    confronto_state?: string;
    participant_mode?: string;
    liga_format?: string;
    scheduled_draw_at?: string | null;
  }[];
  activeLcId?: string;
  onSelect: (id: string) => void;
  standings: ReturnType<typeof useStandings>["data"];
  loading: boolean;
  currentUserId?: string;
  isAdmin: boolean;
  leagueId: string;
  memberCount: number;
}) {
  // Separa as disputas por tipo: Pontos (corrida por campeonato) e Confronto (Liga/Copa).
  const isConfronto = (m: string) => m === "liga" || m === "cup";
  const pontos = comps.filter((c) => !isConfronto(c.mode));
  // Rascunho (em configuração) só aparece pro admin; pros demais, só quando liberado.
  const confronto = comps.filter(
    (c) => isConfronto(c.mode) && (isAdmin || c.confronto_state !== "draft"),
  );
  const hasBoth = pontos.length > 0 && confronto.length > 0;
  const activeComp = comps.find((c) => c.id === activeLcId);
  const [view, setView] = useState<"pontos" | "confronto">(
    activeComp && isConfronto(activeComp.mode)
      ? "confronto"
      : pontos.length === 0 && confronto.length > 0
        ? "confronto"
        : "pontos",
  );

  const group: "pontos" | "confronto" = hasBoth
    ? view
    : confronto.length > 0
      ? "confronto"
      : "pontos";
  const list = group === "confronto" ? confronto : pontos;
  const active = list.find((c) => c.id === activeLcId) ?? list[0];

  // Mantém a seleção do pai (e a query de classificação) em sincronia com a aba visível.
  useEffect(() => {
    if (active && active.id !== activeLcId) onSelect(active.id);
  }, [active, activeLcId, onSelect]);

  if (comps.length === 0) {
    return (
      <EmptyState
        title="Sem competições"
        description="Um administrador precisa vincular uma competição a esta federação."
      />
    );
  }

  return (
    <div className="space-y-3">
      {hasBoth && (
        <>
          <SegmentedControl<"pontos" | "confronto">
            value={view}
            onChange={setView}
            options={[
              { value: "pontos", label: "Pontos" },
              { value: "confronto", label: "Confronto" },
            ]}
          />
          <p className="px-1 text-xs leading-relaxed text-ink-500">
            {group === "pontos"
              ? "Corrida de pontos por campeonato — quem somou mais lidera."
              : "Duelos diretos: Liga (tabela 3/1/0) e Copa (mata-mata)."}
          </p>
        </>
      )}

      {list.length > 1 && (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {list.map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
                active?.id === c.id
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-ink-200 bg-surface text-ink-600",
              )}
            >
              {c.name}
              {isConfronto(c.mode) && (
                <span className="rounded-pill bg-ink-100 px-1.5 text-[10px] font-bold uppercase tracking-wide text-ink-500">
                  {c.mode === "cup" ? "Copa" : "Liga"}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {active && isConfronto(active.mode) ? (
        <ConfrontoSection
          lcId={active.id}
          leagueId={leagueId}
          competitionId={active.competition_id}
          mode={active.mode}
          state={active.confronto_state ?? "draft"}
          memberCount={memberCount}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          participantMode={active.participant_mode ?? "admin"}
          ligaFormat={active.liga_format ?? "partial"}
          scheduledDrawAt={active.scheduled_draw_at ?? null}
        />
      ) : loading ? (
        <Skeleton className="h-64 w-full" />
      ) : standings && standings.length > 0 ? (
        <StandingsTable rows={standings} currentUserId={currentUserId} />
      ) : (
        <EmptyState title="Sem pontos ainda" description="A classificação aparece após os jogos." />
      )}
    </div>
  );
}
