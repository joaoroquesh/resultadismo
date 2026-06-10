import { useMemo, useState } from "react";
import { CalendarClock, Trophy, Zap, LayoutGrid, Sparkles, Users } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { ScrollRow } from "@/components/ui/ScrollRow";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Coachmark } from "@/components/ui/Coachmark";
import { useAuth } from "@/features/auth/AuthProvider";
import { TeamCrest } from "@/components/TeamCrest";
import { cn } from "@/lib/utils";
import { dayjs } from "@/lib/format";
import { MatchCard } from "./MatchCard";
import { usePersonalizationState } from "@/features/onboarding/personalizationApi";
import { expandTeamSlugs, teamNameMatches } from "@/features/onboarding/teamsCatalog";
import {
  useCompetitions,
  useMatches,
  useAllMatches,
  useMyPredictions,
  useAllMyPredictions,
  useMatchesRealtime,
} from "./api";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { useMyGroupScopes } from "@/features/leagues/api";
import { LandingSections } from "@/features/landing/LandingSections";
import { FirstFold } from "@/features/landing/FirstFold";

const ALL = "all" as const;
type Scope = typeof ALL | string;

// Dia/semana ancorados no fuso de Brasília (igual ao limite de joker no servidor),
// pra a tela e a regra de "dobros nesta semana" não divergirem na virada do dia.
const TZ = "America/Sao_Paulo";
const dayKey = (iso: string | null) =>
  iso ? dayjs(iso).tz(TZ).format("YYYY-MM-DD") : "sem-data";

// segunda-feira (âncora da semana seg–dom) do dia, no formato YYYY-MM-DD
const weekKey = (iso: string | null) => {
  if (!iso) return "sem-data";
  const d = dayjs(iso).tz(TZ);
  const dow = (d.day() + 6) % 7; // 0=seg … 6=dom
  return d.subtract(dow, "day").format("YYYY-MM-DD");
};

// dia inicial sugerido: hoje, senão o próximo com jogos, senão o último (ou null se vazio)
const pickDefaultDay = (days: string[]): string | null => {
  if (days.length === 0) return null;
  const today = dayjs().format("YYYY-MM-DD");
  if (days.includes(today)) return today;
  return days.find((d) => d >= today) ?? days[days.length - 1]!;
};

export function JogosPage() {
  const { session, user } = useAuth();
  const { open: openLogin } = useLoginModal();
  const { data: competitions, isLoading: loadingComps } = useCompetitions();

  // Interesses da personalização → filtro "Meus interesses" (padrão quando existir).
  const { data: perso } = usePersonalizationState();
  const interestSlugs = useMemo(() => {
    if (!perso) return null;
    const slugs = new Set<string>();
    if (perso.favorite_team_id) slugs.add(perso.favorite_team_id);
    if (perso.national_team_id) slugs.add(perso.national_team_id);
    for (const arr of Object.values(perso.followed_teams ?? {}))
      for (const s of arr) slugs.add(s);
    return slugs.size ? expandTeamSlugs(slugs) : null;
  }, [perso]);
  const followedCompIds = useMemo(
    () => new Set(perso?.followed_competition_ids ?? []),
    [perso],
  );
  const hasInterests = !!interestSlugs || followedCompIds.size > 0;

  // Recortes dos MEUS grupos → aba "Grupos": os jogos que valem ponto pra mim,
  // mesmo fora dos interesses (pedido do João, 2026-06-10: interesse "só Brasil"
  // não pode esconder os jogos que o grupo conta).
  const { data: groupScopes } = useMyGroupScopes();
  const hasGroups = (groupScopes?.length ?? 0) > 0;
  const groupSlugSets = useMemo(() => {
    if (!groupScopes) return [];
    return groupScopes.map((s) => ({
      compId: s.competition_id,
      slugs: s.followed_team_slugs ? new Set(s.followed_team_slugs) : null,
    }));
  }, [groupScopes]);

  // Padrão: "Grupos" (o que vale ponto) > "Interesses" > "Todos".
  const MINE = "__mine__";
  const GROUPS = "__groups__";
  const [scopeManual, setScopeManual] = useState<Scope | null>(null);
  const scope: Scope = scopeManual ?? (hasGroups ? GROUPS : hasInterests ? MINE : ALL);
  const setScope = (s: Scope) => setScopeManual(s);
  const isMine = scope === MINE;
  const isGroups = scope === GROUPS;
  const isAll = scope === ALL || isMine || isGroups; // filtros usam a carga de "todos"
  const compId = isAll ? undefined : scope;

  // dados por escopo (um hook só fica ativo por vez via `enabled`)
  const single = useMatches(compId);
  const all = useAllMatches(isAll);
  const matchesRaw = isAll ? all.data : single.data;
  // "Meus interesses": campeonato seguido inteiro OU time/seleção de interesse
  // no jogo (vale em qualquer campeonato — Copa e amistosos). Interesse
  // indisponível é simplesmente ignorado.
  const matches = useMemo(() => {
    if (!matchesRaw) return matchesRaw;
    // "Grupos": jogo da competição de um bolão meu, dentro do recorte do grupo
    // (null = competição inteira). União entre todos os meus grupos.
    if (isGroups) {
      return matchesRaw.filter((m) =>
        groupSlugSets.some(({ compId: cid, slugs }) => {
          if (m.competition_id !== cid) return false;
          if (!slugs) return true;
          return (
            teamNameMatches(slugs, m.home_team?.short_name ?? m.home_team_name) ||
            teamNameMatches(slugs, m.home_team?.name ?? null) ||
            teamNameMatches(slugs, m.away_team?.short_name ?? m.away_team_name) ||
            teamNameMatches(slugs, m.away_team?.name ?? null)
          );
        }),
      );
    }
    if (!isMine) return matchesRaw;
    return matchesRaw.filter((m) => {
      if (m.competition_id && followedCompIds.has(m.competition_id)) return true;
      if (!interestSlugs) return false;
      return (
        teamNameMatches(interestSlugs, m.home_team?.short_name ?? m.home_team_name) ||
        teamNameMatches(interestSlugs, m.home_team?.name ?? null) ||
        teamNameMatches(interestSlugs, m.away_team?.short_name ?? m.away_team_name) ||
        teamNameMatches(interestSlugs, m.away_team?.name ?? null)
      );
    });
  }, [isMine, isGroups, matchesRaw, interestSlugs, followedCompIds, groupSlugSets]);
  const loadingMatches = isAll ? all.isLoading : single.isLoading;

  const singlePred = useMyPredictions(compId);
  const allPred = useAllMyPredictions(isAll);
  const predMap = isAll ? allPred.data : singlePred.data;

  useMatchesRealtime(compId);

  // dia escolhido pelo usuário (null = usa o default automático do escopo).
  const [picked, setPicked] = useState<string | null>(null);

  // troca de campeonato (ou "Todos") = contexto de dia novo → zera a escolha.
  // Ajuste no render via valor anterior, sem efeito ("you might not need an effect").
  const [prevScope, setPrevScope] = useState(scope);
  if (scope !== prevScope) {
    setPrevScope(scope);
    setPicked(null);
  }

  // dias únicos com jogos, ordenados
  const days = useMemo(() => {
    if (!matches) return [];
    const set = new Set<string>();
    for (const m of matches) set.add(dayKey(m.kickoff_at));
    return Array.from(set).filter((d) => d !== "sem-data").sort();
  }, [matches]);

  // dia efetivo (derivado): mantém a escolha do usuário se ainda existe no escopo;
  // senão crava hoje (ou o próximo dia com jogos, ou o último). Sem efeito.
  const day = picked && days.includes(picked) ? picked : pickDefaultDay(days);

  const dayMatches = useMemo(() => {
    if (!matches || !day) return [];
    return matches
      .filter((m) => dayKey(m.kickoff_at) === day)
      .sort((a, b) => dayjs(a.kickoff_at ?? 0).valueOf() - dayjs(b.kickoff_at ?? 0).valueOf());
  }, [matches, day]);

  // dobros usados por (competição × semana) — funciona pra um campeonato e pra "Todos"
  const jokerMax = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of competitions ?? []) m.set(c.id, c.jokers_per_week ?? 2);
    return m;
  }, [competitions]);

  const jokersByCompWeek = useMemo(() => {
    const m = new Map<string, number>();
    if (!matches || !predMap) return m;
    for (const mt of matches) {
      if (!predMap.get(mt.id)?.is_joker) continue;
      const compKey = mt.competition_id ?? "?";
      const k = `${compKey}:${weekKey(mt.kickoff_at)}`;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [matches, predMap]);

  const dayPoints = useMemo(() => {
    let sum = 0;
    for (const m of dayMatches) {
      const p = predMap?.get(m.id);
      if (p?.points != null) sum += p.points * (p.is_joker ? 2 : 1);
    }
    return sum;
  }, [dayMatches, predMap]);

  // o resumo de pontos do dia só faz sentido quando há jogo encerrado no dia
  const dayScored = useMemo(() => dayMatches.some((m) => m.status === "finished"), [dayMatches]);

  const totalPoints = useMemo(() => {
    let sum = 0;
    predMap?.forEach((p) => {
      if (p.points != null) sum += p.points * (p.is_joker ? 2 : 1);
    });
    return sum;
  }, [predMap]);

  // resumo de dobros da semana só faz sentido num campeonato (limite é por comp)
  const selectedComp = isAll ? undefined : competitions?.find((c) => c.id === scope);
  const maxJokers = selectedComp?.jokers_per_week ?? 2;
  const jokersUsedThisWeek =
    !isAll && day ? jokersByCompWeek.get(`${scope}:${weekKey(day)}`) ?? 0 : 0;

  const hasComps = (competitions?.length ?? 0) > 0;

  // Grade de jogos: 1 coluna no mobile, 2 no desktop pra aproveitar a largura.
  // Teaser deslogado: no máximo 2 linhas (4 no desktop, 2 no mobile). Limita o que
  // renderiza — sem overflow/clip, pra não cortar o anel (ring) dos cards ao vivo.
  const foldGames = session ? dayMatches : dayMatches.slice(0, 4);
  const gamesGrid = (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 lg:grid-cols-2",
        !session && "max-lg:[&>*:nth-child(n+3)]:hidden", // mobile: só 2 (2 linhas)
      )}
    >
      {foldGames.map((m) => {
        const compKey = m.competition_id ?? "?";
        const wk = weekKey(m.kickoff_at);
        return (
          <MatchCard
            key={m.id}
            match={m}
            prediction={predMap?.get(m.id) ?? null}
            jokersUsed={jokersByCompWeek.get(`${compKey}:${wk}`) ?? 0}
            maxJokers={jokerMax.get(compKey) ?? 2}
          />
        );
      })}
    </div>
  );

  return (
    <Page
      wide
      title={session ? "Jogos" : undefined}
      action={
        totalPoints > 0 ? (
          <Badge tone="brand" className="gap-1">
            <Trophy className="size-3.5" /> {totalPoints} pts
          </Badge>
        ) : undefined
      }
    >
      {/* seletor de competição: "Todos" primeiro (padrão) */}
      {loadingComps ? (
        <Skeleton className="mb-3 h-9 w-full" />
      ) : (
        hasComps &&
        (() => {
          const scopeRow = (
            <ScrollRow dataTour="jogos-filtros" className="-mx-4 mb-3" innerClassName="px-4">
              {session && hasInterests && (
                <button
                  onClick={() => setScope(MINE)}
                  aria-pressed={isMine}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
                    isMine
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-ink-200 bg-surface text-ink-600",
                  )}
                >
                  <Sparkles className="size-3.5" /> Interesses
                </button>
              )}
              {session && hasGroups && (
                <button
                  onClick={() => setScope(GROUPS)}
                  aria-pressed={isGroups}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
                    isGroups
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-ink-200 bg-surface text-ink-600",
                  )}
                >
                  <Users className="size-3.5" /> Grupos
                </button>
              )}
              <button
                onClick={() => setScope(ALL)}
                aria-pressed={scope === ALL}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
                  scope === ALL
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-ink-200 bg-surface text-ink-600",
                )}
              >
                <LayoutGrid className="size-3.5" /> Todos
              </button>
              {competitions!.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setScope(c.id)}
                  aria-pressed={scope === c.id}
                  className={cn(
                    "flex shrink-0 items-center gap-2 rounded-pill border px-3 py-1.5 text-sm font-semibold transition",
                    scope === c.id
                      ? "border-brand-600 bg-surface text-brand-700"
                      : "border-ink-200 bg-surface text-ink-600",
                  )}
                >
                  {c.emblem_url && <TeamCrest src={c.emblem_url} name={c.name} size={18} />}
                  {c.short_name ?? c.name}
                </button>
              ))}
            </ScrollRow>
          );
          // O coachmark da aba Grupos só pra quem TEM a aba (logado + em grupo).
          return session && hasGroups ? (
            <Coachmark
              storageKey="resultadismo-coach-jogos-grupos-v1"
              title="Os jogos dos seus grupos"
              placement="bottom"
              content={
                <>
                  A aba <span className="font-bold text-ink-50">Grupos</span> mostra{" "}
                  <span className="font-bold text-ink-50">todos os jogos que valem ponto</span> nos
                  grupos em que você está, mesmo os que ficam fora dos seus interesses. Palpite por
                  aqui pra não perder nenhum!
                </>
              }
            >
              {scopeRow}
            </Coachmark>
          ) : (
            scopeRow
          );
        })()
      )}

      {/* tabs de dia */}
      {!loadingMatches && days.length > 0 && (
        <ScrollRow className="-mx-4 mb-4" innerClassName="px-4">
          {days.map((d) => {
            const isToday = d === dayjs().format("YYYY-MM-DD");
            const hasLive = matches?.some(
              (m) => dayKey(m.kickoff_at) === d && m.status === "live",
            );
            return (
              <button
                key={d}
                onClick={() => setPicked(d)}
                className={cn(
                  "relative flex shrink-0 flex-col items-center rounded-md border px-3 py-1.5 text-sm font-semibold leading-tight transition",
                  day === d
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-ink-200 bg-surface text-ink-600",
                )}
              >
                <span className="text-[10px] font-medium uppercase opacity-80">
                  {isToday ? "Hoje" : dayjs(d).format("ddd")}
                </span>
                <span>{dayjs(d).format("DD/MM")}</span>
                {hasLive && (
                  <span className="absolute -right-0.5 -top-0.5 size-2 animate-pulse-live rounded-full bg-flame-500 ring-2 ring-surface" />
                )}
              </button>
            );
          })}
        </ScrollRow>
      )}

      {/* resumo: pontos DO DIA selecionado (escopo atual) + dobros da semana */}
      {session && (dayScored || !isAll) && (
        <div className="mb-3 flex flex-wrap items-center justify-center gap-2 text-xs">
          {dayScored && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-ink-100 px-2.5 py-0.5 font-medium text-ink-600">
              Neste dia:{" "}
              <span className="font-bold text-brand-700">
                {dayPoints} {dayPoints === 1 ? "pt" : "pts"}
              </span>
            </span>
          )}
          {!isAll && (
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
              defaultOpen={user ? undefined : false}
            >
              <span className="inline-flex items-center gap-1 rounded-pill bg-brand-600 px-2 py-0.5 font-semibold text-white">
                <Zap className="size-3 fill-brand-600" /> {jokersUsedThisWeek}/{maxJokers} dobros
                nesta semana
              </span>
            </Coachmark>
          )}
        </div>
      )}

      {loadingMatches ? (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : dayMatches.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="size-7" />}
          title="Sem jogos"
          description={
            isAll
              ? "Quando rolar algum jogo nas competições ativas, ele aparece aqui por dia."
              : "Quando houver jogos nesta competição, eles aparecem aqui por dia."
          }
        />
      ) : !session ? (
        <FirstFold scrollTargetId="conheca-resultadismo">{gamesGrid}</FirstFold>
      ) : (
        gamesGrid
      )}

      {/* Landing híbrida para visitantes deslogados. */}
      {!session && <LandingSections onOpenLogin={openLogin} />}
    </Page>
  );
}
