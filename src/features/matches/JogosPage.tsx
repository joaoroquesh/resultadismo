import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Trophy, Zap } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Coachmark } from "@/components/ui/Coachmark";
import { useAuth } from "@/features/auth/AuthProvider";
import { TeamCrest } from "@/components/TeamCrest";
import { cn } from "@/lib/utils";
import { dayjs } from "@/lib/format";
import { MatchCard } from "./MatchCard";
import { useCompetitions, useMatches, useMyPredictions, useMatchesRealtime } from "./api";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { LandingSections } from "@/features/landing/LandingSections";

const dayKey = (iso: string | null) => (iso ? dayjs(iso).format("YYYY-MM-DD") : "sem-data");

// segunda-feira (âncora da semana seg–dom) do dia, no formato YYYY-MM-DD
const weekKey = (iso: string | null) => {
  if (!iso) return "sem-data";
  const d = dayjs(iso);
  const dow = (d.day() + 6) % 7; // 0=seg … 6=dom
  return d.subtract(dow, "day").format("YYYY-MM-DD");
};

export function JogosPage() {
  const { session, user } = useAuth();
  const { open: openLogin } = useLoginModal();
  const { data: competitions, isLoading: loadingComps } = useCompetitions();
  const [compId, setCompId] = useState<string | null>(null);
  const selectedId = compId ?? competitions?.[0]?.id;

  const { data: matches, isLoading: loadingMatches } = useMatches(selectedId);
  const { data: predMap } = useMyPredictions(selectedId);
  useMatchesRealtime(selectedId);

  const [day, setDay] = useState<string | null>(null);
  const dayRowRef = useRef<HTMLDivElement>(null);

  // dias únicos com jogos, ordenados
  const days = useMemo(() => {
    if (!matches) return [];
    const set = new Set<string>();
    for (const m of matches) set.add(dayKey(m.kickoff_at));
    return Array.from(set).filter((d) => d !== "sem-data").sort();
  }, [matches]);

  // auto-seleciona hoje (ou próximo dia futuro, ou último)
  useEffect(() => {
    if (days.length === 0) {
      setDay(null);
      return;
    }
    setDay((cur) => {
      if (cur && days.includes(cur)) return cur;
      const today = dayjs().format("YYYY-MM-DD");
      if (days.includes(today)) return today;
      const future = days.find((d) => d >= today);
      return future ?? days[days.length - 1]!;
    });
  }, [days]);

  const dayMatches = useMemo(() => {
    if (!matches || !day) return [];
    return matches
      .filter((m) => dayKey(m.kickoff_at) === day)
      .sort((a, b) => dayjs(a.kickoff_at ?? 0).valueOf() - dayjs(b.kickoff_at ?? 0).valueOf());
  }, [matches, day]);

  const dayPoints = useMemo(() => {
    let sum = 0;
    for (const m of dayMatches) {
      const p = predMap?.get(m.id);
      if (p?.points != null) sum += p.points * (p.is_joker ? 2 : 1);
    }
    return sum;
  }, [dayMatches, predMap]);

  const totalPoints = useMemo(() => {
    let sum = 0;
    predMap?.forEach((p) => {
      if (p.points != null) sum += p.points * (p.is_joker ? 2 : 1);
    });
    return sum;
  }, [predMap]);

  const maxJokers = competitions?.find((c) => c.id === selectedId)?.jokers_per_week ?? 2;
  // dobros usados na semana (seg–dom) do dia selecionado
  const jokersUsedThisWeek = useMemo(() => {
    if (!matches || !day) return 0;
    const wk = weekKey(day);
    let n = 0;
    for (const m of matches) {
      if (weekKey(m.kickoff_at) !== wk) continue;
      if (predMap?.get(m.id)?.is_joker) n++;
    }
    return n;
  }, [matches, day, predMap]);

  return (
    <Page
      // deslogado: sem título "Jogos" — o Header mostra a marca (landing pública)
      title={session ? "Jogos" : undefined}
      action={
        totalPoints > 0 ? (
          <Badge tone="brand" className="gap-1">
            <Trophy className="size-3.5" /> {totalPoints} pts
          </Badge>
        ) : undefined
      }
    >
      {/* competições */}
      {loadingComps ? (
        <Skeleton className="mb-3 h-9 w-full" />
      ) : (
        competitions &&
        competitions.length > 0 && (
          <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4">
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

      {/* tabs de dia */}
      {!loadingMatches && days.length > 0 && (
        <div ref={dayRowRef} className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
          {days.map((d) => {
            const isToday = d === dayjs().format("YYYY-MM-DD");
            return (
              <button
                key={d}
                onClick={() => setDay(d)}
                className={cn(
                  "flex shrink-0 flex-col items-center rounded-md border px-3 py-1.5 text-sm font-semibold leading-tight transition",
                  day === d
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-ink-200 bg-surface text-ink-600",
                )}
              >
                <span className="text-[10px] font-medium uppercase opacity-80">
                  {isToday ? "Hoje" : dayjs(d).format("ddd")}
                </span>
                <span>{dayjs(d).format("DD/MM")}</span>
              </button>
            );
          })}
        </div>
      )}

      {predMap && (
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          {dayPoints > 0 && (
            <span className="font-medium text-ink-500">
              Você fez <span className="font-bold text-brand-700">{dayPoints} pts</span> neste dia
            </span>
          )}
          <Coachmark
            storageKey="resultadismo-coach-dobro-v1"
            title="Dobro de Pontos"
            placement="bottom"
            content={
              <>
                Ative o <span className="font-bold text-ink-50">2×</span> num palpite e ele vale o
                dobro. Você tem {maxJokers} por semana — use nos jogos que tiver mais confiança.
              </>
            }
            // só faz sentido para quem está logado e pode palpitar
            defaultOpen={user ? undefined : false}
          >
            <span className="inline-flex items-center gap-1 rounded-pill bg-gold-100 px-2 py-0.5 font-semibold text-gold-800">
              <Zap className="size-3 fill-gold-700" /> {jokersUsedThisWeek}/{maxJokers} dobros nesta
              semana
            </span>
          </Coachmark>
        </div>
      )}

      {loadingMatches ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : dayMatches.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-7" />}
          title="Sem jogos"
          description="Quando houver jogos nesta competição, eles aparecem aqui por dia."
        />
      ) : (
        <div className="space-y-3">
          {dayMatches.map((m) => (
            <MatchCard
              key={m.id}
              match={m}
              prediction={predMap?.get(m.id) ?? null}
              jokersUsed={jokersUsedThisWeek}
              maxJokers={maxJokers}
            />
          ))}
        </div>
      )}

      {/* Landing híbrida: vende o jogo para visitantes deslogados ao rolar.
          Para quem já entrou, a home fica 100% focada nos jogos. */}
      {!session && <LandingSections onOpenLogin={openLogin} />}
    </Page>
  );
}
