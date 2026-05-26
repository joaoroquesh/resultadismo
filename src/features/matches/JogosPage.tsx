import { useMemo, useState } from "react";
import { CalendarClock, Trophy } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { TeamCrest } from "@/components/TeamCrest";
import { cn } from "@/lib/utils";
import { dayjs, formatDayLabel } from "@/lib/format";
import { MatchCard } from "./MatchCard";
import { useCompetitions, useMatches, useMyPredictions, useMatchesRealtime } from "./api";
import type { MatchWithTeams } from "@/lib/types";

type Tab = "abertos" | "resultados";

export function JogosPage() {
  const { data: competitions, isLoading: loadingComps } = useCompetitions();
  const [compId, setCompId] = useState<string | null>(null);
  const selectedId = compId ?? competitions?.[0]?.id;

  const { data: matches, isLoading: loadingMatches } = useMatches(selectedId);
  const { data: predMap } = useMyPredictions(selectedId);
  useMatchesRealtime(selectedId);
  const [tab, setTab] = useState<Tab>("abertos");

  const totalPoints = useMemo(() => {
    let sum = 0;
    predMap?.forEach((p) => {
      if (p.points != null) sum += p.points;
    });
    return sum;
  }, [predMap]);

  const groups = useMemo(() => {
    if (!matches) return [];
    const filtered = matches.filter((m) =>
      tab === "abertos" ? m.status !== "finished" : m.status === "finished",
    );
    filtered.sort((a, b) => {
      const ta = a.kickoff_at ? dayjs(a.kickoff_at).valueOf() : 0;
      const tb = b.kickoff_at ? dayjs(b.kickoff_at).valueOf() : 0;
      return tab === "abertos" ? ta - tb : tb - ta;
    });
    const byDay = new Map<string, MatchWithTeams[]>();
    for (const m of filtered) {
      const key = m.kickoff_at ? dayjs(m.kickoff_at).format("YYYY-MM-DD") : "sem-data";
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(m);
    }
    return Array.from(byDay.entries());
  }, [matches, tab]);

  return (
    <Page
      title="Jogos"
      action={
        totalPoints > 0 ? (
          <Badge tone="brand" className="gap-1">
            <Trophy className="size-3.5" /> {totalPoints} pts
          </Badge>
        ) : undefined
      }
    >
      {/* seletor de competição */}
      {loadingComps ? (
        <Skeleton className="mb-4 h-9 w-full" />
      ) : (
        competitions &&
        competitions.length > 0 && (
          <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
            {competitions.map((c) => (
              <button
                key={c.id}
                onClick={() => setCompId(c.id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
                  selectedId === c.id
                    ? "border-brand-600 bg-brand-50 text-brand-700"
                    : "border-ink-200 bg-surface text-ink-600",
                )}
              >
                {c.emblem_url && <TeamCrest src={c.emblem_url} name={c.name} size={18} />}
                {c.short_name ?? c.name}
              </button>
            ))}
          </div>
        )
      )}

      <SegmentedControl<Tab>
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: "abertos", label: "Jogos" },
          { value: "resultados", label: "Resultados" },
        ]}
      />

      {loadingMatches ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-7" />}
          title={tab === "abertos" ? "Nenhum jogo aberto" : "Nenhum resultado ainda"}
          description={
            tab === "abertos"
              ? "Quando houver jogos para palpitar, eles aparecem aqui."
              : "Os jogos encerrados e seus pontos aparecem aqui."
          }
        />
      ) : (
        <div className="space-y-5">
          {groups.map(([day, dayMatches]) => (
            <section key={day} className="space-y-2.5">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                {day === "sem-data" ? "A definir" : formatDayLabel(dayMatches[0]!.kickoff_at)}
              </h2>
              {dayMatches.map((m) => (
                <MatchCard key={m.id} match={m} prediction={predMap?.get(m.id) ?? null} />
              ))}
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
