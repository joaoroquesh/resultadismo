import { useMemo, useRef, useState } from "react";
import { CalendarClock, Trophy, Zap, LayoutGrid, Sparkles, Users, Share2, Check, X, ChevronDown } from "lucide-react";
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
import { MatchesStickyHeader } from "./MatchesStickyHeader";
import { useGamesScroll } from "./useGamesScroll";
import { useDaySwipe } from "./useDaySwipe";
import { provisionalScoreType, provisionalPoints } from "@/lib/score";
import { teamCrestPath } from "@/lib/teamCrests";
import { buildScoreShareImage, shareImageBlob, type ShareRow } from "./shareImage";
import { useToast } from "@/components/ui/Toast";
import { usePersonalizationState } from "@/features/onboarding/personalizationApi";
import { expandTeamSlugs, teamNameMatches } from "@/features/onboarding/teamsCatalog";
import {
  useCompetitions,
  useMatches,
  useAllMatches,
  useMyPredictions,
  useAllMyPredictions,
  useMatchesRealtime,
  useMyJokerWeekCounts,
} from "./api";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { useMyGroupScopes } from "@/features/leagues/api";
import { LandingSections } from "@/features/landing/LandingSections";
import { FirstFold } from "@/features/landing/FirstFold";

const ALL = "all" as const;
type Scope = typeof ALL | string;

// Limite GLOBAL de dobros (2×) por semana — o mesmo número que o banco enforça
// (enforce_joker_limit). Vale somando TODAS as competições, não por campeonato.
const WEEKLY_JOKER_LIMIT = 2;

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

// domingo (último dia da semana seg–dom, antes do reset na segunda) no formato DD/MM
const weekEndLabel = (iso: string | null) => {
  const monday = weekKey(iso);
  if (monday === "sem-data") return "";
  return dayjs(monday).add(6, "day").format("DD/MM");
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
  const { toast } = useToast();
  const { profile } = useAuth();

  // seleção do "compartilhar como imagem": null = fora do modo; Set = ids
  // escolhidos. Declarado AQUI em cima porque o bloco de troca de escopo
  // logo abaixo zera a seleção (useState depois = TDZ → crash no render).
  const [shareSel, setShareSel] = useState<Set<string> | null>(null);

  // troca de campeonato (ou "Todos") = contexto de dia novo → zera a escolha.
  // Ajuste no render via valor anterior, sem efeito ("you might not need an effect").
  const [prevScope, setPrevScope] = useState(scope);
  if (scope !== prevScope) {
    setPrevScope(scope);
    setPicked(null);
    setShareSel(null); // escopo novo = outra lista de jogos; seleção de imagem zera
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

  // ATENÇÃO à ordem: quem lê dayMatches (isShareable etc.) precisa vir DEPOIS
  // desta declaração — função içada acima lendo o memo faz o React Compiler
  // pular o componente ("Existing memoization could not be preserved").
  const dayMatches = useMemo(() => {
    if (!matches || !day) return [];
    return matches
      .filter((m) => dayKey(m.kickoff_at) === day)
      .sort((a, b) => dayjs(a.kickoff_at ?? 0).valueOf() - dayjs(b.kickoff_at ?? 0).valueOf());
  }, [matches, day]);

  // ── compartilhar placares como IMAGEM (1+ jogos, atravessa os dias) ───────
  // mesma régua do "ao vivo automático" do card: agendado que já começou há <4h
  // conta como rolando (a API às vezes demora a virar o status).
  const isLiveish = (m: (typeof dayMatches)[number]) => {
    if (m.status === "live") return true;
    if (m.status !== "scheduled" || !m.kickoff_at) return false;
    const ms = dayjs().valueOf() - dayjs(m.kickoff_at).valueOf();
    return ms > 0 && ms < 4 * 60 * 60 * 1000;
  };
  const isShareable = (m: (typeof dayMatches)[number]) => {
    const pred = predMap?.get(m.id);
    if (!pred) return false;
    return m.status === "finished" || isLiveish(m);
  };
  function toggleShare(id: string) {
    setShareSel((prev) => {
      const n = new Set(prev ?? []);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  async function generateShare() {
    if (!shareSel || shareSel.size === 0) return;
    // Nome de exibição: o COMPLETO quando cabe na linha (evita "Á. do Sul");
    // escudo: tenta o nome completo primeiro (o curto abreviado não resolve).
    const teamLabel = (full?: string | null, short?: string | null) =>
      full && full.length <= 14 ? full : short ?? full ?? "Time";
    const crestOf = (full?: string | null, short?: string | null) =>
      (full ? teamCrestPath(full) : null) ?? (short ? teamCrestPath(short) : null);
    // a seleção atravessa as abas de dia: junta TODOS os marcados do escopo,
    // em ordem de horário, com a data curta em cada um pra dar contexto.
    const rows: ShareRow[] = (matches ?? [])
      .filter((m) => shareSel.has(m.id))
      .sort((a, b) => dayjs(a.kickoff_at ?? 0).valueOf() - dayjs(b.kickoff_at ?? 0).valueOf())
      .map((m) => {
        const pred = predMap!.get(m.id)!;
        const finished = m.status === "finished";
        const hs = m.home_score ?? 0;
        const as_ = m.away_score ?? 0;
        const type =
          finished && pred.score_type
            ? pred.score_type
            : provisionalScoreType(pred.home_pred, pred.away_pred, hs, as_);
        const homeFull = m.home_team?.name ?? m.home_team_name;
        const awayFull = m.away_team?.name ?? m.away_team_name;
        return {
          homeName: teamLabel(homeFull, m.home_team?.short_name),
          awayName: teamLabel(awayFull, m.away_team?.short_name),
          homeCrest: crestOf(homeFull, m.home_team?.short_name),
          awayCrest: crestOf(awayFull, m.away_team?.short_name),
          homePred: pred.home_pred,
          awayPred: pred.away_pred,
          homeScore: m.home_score ?? (finished ? null : 0),
          awayScore: m.away_score ?? (finished ? null : 0),
          live: !finished && isLiveish(m),
          type,
          joker: pred.is_joker ?? false,
          advanceBonus: finished ? pred.advance_bonus ?? 0 : 0,
          date: m.kickoff_at
            ? dayjs(m.kickoff_at).format("ddd DD/MM").replace(".", "").toUpperCase()
            : null,
        };
      });
    const blob = await buildScoreShareImage(rows, profile?.display_name ?? "Resultadista");
    const how = await shareImageBlob(blob, "resultadismo-palpites.png");
    toast(how === "shared" ? "Imagem compartilhada! 📸" : "Imagem salva! 📸", "success");
    setShareSel(null);
  }

  // Dobros usados por SEMANA (global — todas as competições), do usuário logado.
  // Vem de RPC própria (independe da aba carregada), então o badge "X/2 dobros
  // nesta semana" funciona em Interesses/Grupos/Todos/campeonato.
  const jokerWeekCounts = useMyJokerWeekCounts();

  const dayPoints = useMemo(() => {
    let sum = 0;
    for (const m of dayMatches) {
      const p = predMap?.get(m.id);
      if (!p) continue;
      const mult = p.is_joker ? 2 : 1;
      if (p.points != null) {
        sum += p.points * mult; // jogo encerrado → pontuação oficial
      } else if (m.status === "live" && m.home_score != null && m.away_score != null) {
        // jogo ao vivo → projeta com o placar corrente (mesma regra 3/2/1 do banco)
        sum += provisionalPoints(provisionalScoreType(p.home_pred, p.away_pred, m.home_score, m.away_score)) * mult;
      }
    }
    return sum;
  }, [dayMatches, predMap]);

  // o resumo de pontos do dia aparece quando há jogo encerrado OU ao vivo no dia
  const dayScored = useMemo(
    () => dayMatches.some((m) => m.status === "finished" || m.status === "live"),
    [dayMatches],
  );

  const totalPoints = useMemo(() => {
    let sum = 0;
    predMap?.forEach((p) => {
      if (p.points != null) sum += p.points * (p.is_joker ? 2 : 1);
    });
    return sum;
  }, [predMap]);

  // Dobros da semana do DIA selecionado (global). Aparece em TODAS as abas.
  const jokersUsedThisWeek = day ? jokerWeekCounts.data?.get(weekKey(day)) ?? 0 : 0;
  const jokerWeekEnd = day ? weekEndLabel(day) : "";

  const hasComps = (competitions?.length ?? 0) > 0;

  // Grade de jogos: 1 coluna no mobile, 2 no desktop pra aproveitar a largura.
  // Teaser deslogado: no máximo 2 linhas (4 no desktop, 2 no mobile). Limita o que
  // renderiza — sem overflow/clip, pra não cortar o anel (ring) dos cards ao vivo.
  const foldGames = session ? dayMatches : dayMatches.slice(0, 4);

  // Ao TOCAR a aba do dia (ou abrir a tela), leva até o AO VIVO (ou o próximo a
  // começar) parando com um pedaço do card de cima à mostra. No SWIPE não rola —
  // seria uma subida vertical durante o deslize horizontal (estranho); o swipe
  // marca skipAutoScroll pra pular. resetKey re-dispara ao trocar aba/dia.
  const skipAutoScroll = useRef(false);
  const { setRef } = useGamesScroll({
    games: foldGames.map((m) => ({ id: m.id, status: m.status })),
    resetKey: `${scope}|${day ?? ""}`,
    enabled: !!session,
    skipRef: skipAutoScroll,
  });

  // Arrastar pro lado troca de dia, deslizando (carrossel de 3 painéis no
  // useDaySwipe). idx/vizinhos alimentam o gesto e os painéis de preview.
  const dayIdx = day ? days.indexOf(day) : -1;
  const prevDay = dayIdx > 0 ? days[dayIdx - 1]! : null;
  const nextDay = dayIdx >= 0 && dayIdx < days.length - 1 ? days[dayIdx + 1]! : null;
  const { railRef, active: swiping } = useDaySwipe({
    enabled: !!session && days.length >= 2,
    index: dayIdx,
    count: days.length,
    onPick: (dir) => {
      const target = days[dayIdx + dir];
      if (target) {
        skipAutoScroll.current = true; // swipe não auto-rola (evita a "subida")
        setPicked(target);
      }
    },
  });

  // jogos de um dia vizinho (só calculado durante o arraste, pros painéis de preview).
  const matchesOfDay = (d: string) =>
    (matches ?? [])
      .filter((m) => dayKey(m.kickoff_at) === d)
      .sort((a, b) => dayjs(a.kickoff_at ?? 0).valueOf() - dayjs(b.kickoff_at ?? 0).valueOf());

  // Uma grade de jogos (central = interativa com refs/seleção; preview = só visual).
  const renderDayGrid = (list: typeof foldGames, center: boolean) => (
    <div
      className={cn(
        "grid grid-cols-1 gap-3 lg:grid-cols-2",
        !session && "max-lg:[&>*:nth-child(n+3)]:hidden", // mobile: só 2 (2 linhas)
      )}
    >
      {list.map((m) => {
        const wk = weekKey(m.kickoff_at);
        const selectable = center && shareSel != null && isShareable(m);
        const selected = center && !!shareSel?.has(m.id);
        return (
          <div
            key={m.id}
            ref={center ? setRef(m.id) : undefined}
            className="relative scroll-mt-28"
          >
            <MatchCard
              match={m}
              prediction={predMap?.get(m.id) ?? null}
              jokersUsed={jokerWeekCounts.data?.get(wk) ?? 0}
              maxJokers={WEEKLY_JOKER_LIMIT}
              onShare={() => setShareSel(new Set([m.id]))}
            />
            {center && shareSel != null && (
              <button
                type="button"
                onClick={() => selectable && toggleShare(m.id)}
                aria-label={selectable ? "Selecionar jogo pra imagem" : "Sem palpite pra compartilhar"}
                aria-pressed={selected}
                className={cn(
                  "absolute inset-0 rounded-lg transition",
                  selected
                    ? "ring-2 ring-inset ring-brand-600"
                    : selectable
                      ? "bg-surface/10 hover:ring-2 hover:ring-inset hover:ring-ink-300"
                      : "cursor-not-allowed bg-background/60",
                )}
              >
                {selectable && (
                  <span
                    className={cn(
                      "absolute right-2 top-2 grid size-6 place-items-center rounded-full border-2",
                      selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-surface",
                    )}
                  >
                    {selected && <Check className="size-4" strokeWidth={3} />}
                  </span>
                )}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  // Viewport do carrossel: SANGRA até a borda da tela (-mx-4) e o respiro lateral
  // (px-4) vai DENTRO de cada página. Assim o clip corta nas bordas da tela (longe
  // dos cards → não corta o anel dos ao vivo) e nasce um VÃO entre as páginas
  // (16+16px), dando a sensação de rolar pro dia ao lado. O trilho (railRef) segue
  // o dedo via translateX; os vizinhos só existem durante o arraste. No desktop
  // (lg) volta ao normal (sem sangria/clip; gesto é só mobile).
  const gamesGrid = (
    <div className="-mx-4 overflow-x-clip lg:mx-0 lg:overflow-visible">
      <div ref={railRef} className="relative will-change-transform">
        {swiping && prevDay && (
          <div className="absolute inset-x-0 top-0 -translate-x-full px-4">
            {renderDayGrid(matchesOfDay(prevDay), false)}
          </div>
        )}
        <div className="px-4 lg:px-0">{renderDayGrid(foldGames, true)}</div>
        {swiping && nextDay && (
          <div className="absolute inset-x-0 top-0 translate-x-full px-4">
            {renderDayGrid(matchesOfDay(nextDay), false)}
          </div>
        )}
      </div>
    </div>
  );

  const shareBar =
    shareSel != null ? (
      <div className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-sm items-center gap-2 rounded-lg bg-surface p-3 shadow-[var(--shadow-pop)] ring-1 ring-border lg:bottom-6">
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink-900">
          {shareSel.size === 0
            ? "Toque nos jogos"
            : shareSel.size === 1
              ? "1 jogo: toque em mais (até de outro dia)"
              : `${shareSel.size} jogos na imagem`}
        </p>
        <button
          type="button"
          onClick={() => setShareSel(null)}
          aria-label="Cancelar"
          className="grid size-8 place-items-center rounded-md text-ink-400 transition hover:bg-ink-100"
        >
          <X className="size-4" />
        </button>
        <button
          type="button"
          disabled={shareSel.size === 0}
          onClick={() => void generateShare()}
          className="rounded-pill bg-brand-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700 disabled:opacity-40"
        >
          Gerar imagem
        </button>
      </div>
    ) : null;

  // Rótulos da barra de contexto condensada (competição + dia ativos).
  const activeComp = isAll ? undefined : competitions?.find((c) => c.id === scope);
  const scopeLabel = isMine
    ? "Interesses"
    : isGroups
      ? "Grupos"
      : scope === ALL
        ? "Todos"
        : activeComp?.short_name ?? activeComp?.name ?? "Jogos";
  const dayLabel = day
    ? day === dayjs().format("YYYY-MM-DD")
      ? `Hoje ${dayjs(day).format("DD/MM")}`
      : dayjs(day).format("ddd DD/MM").replace(".", "")
    : "";

  // Barra fininha que assume quando o cabeçalho condensa. Competição E data num
  // único botão: toque volta ao topo pra ver/mudar os filtros (competição e dia).
  const compactBar = (
    <div className="flex w-full items-center gap-2 text-sm">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="Voltar ao topo pra escolher competição e dia"
        className="flex min-w-0 items-center gap-1.5"
      >
        <span className="truncate font-semibold text-ink-900">{scopeLabel}</span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-400" />
        {dayLabel && (
          <>
            <span className="text-ink-300">·</span>
            <span className="shrink-0 font-medium text-ink-600">{dayLabel}</span>
          </>
        )}
      </button>
      {session && (dayScored || day != null) && (
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          {dayScored && (
            <span className="shrink-0 rounded-pill bg-ink-100 px-2 py-0.5 text-xs font-bold text-brand-700">
              Neste dia: {dayPoints} pts
            </span>
          )}
          {day != null && (
            <Coachmark
              storageKey="resultadismo-coach-dobro-v1"
              title="Dobro de Pontos"
              placement="bottom"
              content={
                <>
                  Ative o <span className="font-bold text-ink-50">2×</span> num palpite e ele vale o
                  dobro. Você tem {WEEKLY_JOKER_LIMIT} por semana (de segunda a domingo, somando
                  todos os campeonatos), e o limite <span className="font-bold text-ink-50">zera toda
                  segunda</span>. Use nos jogos de mais confiança.
                </>
              }
              defaultOpen={user ? undefined : false}
            >
              <span className="inline-flex items-center gap-1 rounded-pill bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white">
                <Zap className="size-3 fill-white" /> {jokersUsedThisWeek}/{WEEKLY_JOKER_LIMIT}
              </span>
            </Coachmark>
          )}
        </span>
      )}
    </div>
  );

  // Resumo do dia (no TOPO da barra fina, centralizado): pontos do dia no escopo
  // atual + dobros da semana. Mesma altura da barra grudada (h-11) → não pisca.
  const daySummary =
    session && (dayScored || day != null) ? (
      <div className="flex w-full items-center justify-center gap-2 text-xs">
        {dayScored && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-ink-100 px-2.5 py-0.5 font-medium text-ink-600">
            Neste dia:{" "}
            <span className="font-bold text-brand-700">
              {dayPoints} {dayPoints === 1 ? "pt" : "pts"}
            </span>
          </span>
        )}
        {day != null && (
          <Coachmark
            storageKey="resultadismo-coach-dobro-v1"
            title="Dobro de Pontos"
            placement="bottom"
            content={
              <>
                Ative o <span className="font-bold text-ink-50">2×</span> num palpite e ele vale o
                dobro. Você tem {WEEKLY_JOKER_LIMIT} por semana (de segunda a domingo, somando
                todos os campeonatos), e o limite <span className="font-bold text-ink-50">zera toda
                segunda</span>. Use nos jogos de mais confiança.
              </>
            }
            defaultOpen={user ? undefined : false}
          >
            <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-brand-600 px-2 py-0.5 font-semibold text-white">
              <Zap className="size-3 fill-brand-600" /> {jokersUsedThisWeek}/{WEEKLY_JOKER_LIMIT}{" "}
              dobros até {jokerWeekEnd}
            </span>
          </Coachmark>
        )}
      </div>
    ) : null;

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
      {session && (
        <MatchesStickyHeader
        summary={daySummary}
        stuckBar={compactBar}
        carousels={
          <>
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

      {/* tabs de dia — py-1.5 no scroller dá respiro pra bolinha "ao vivo" não
          ser cortada no topo pelo overflow; o dia ativo nasce centralizado
          (centerKey=scope: re-centra ao trocar de aba, não a cada clique). */}
      {!loadingMatches && days.length > 0 && (
        <ScrollRow
          className="-mx-4 mb-4"
          innerClassName="px-4 py-1.5"
          centerSelector="[data-day-active]"
          /* re-centraliza quando a LISTA de dias muda (load frio logado em
             grupo: groupScopes/perso chegam DEPOIS dos jogos e trocam os dias)
             ou o dia ativo muda — não a cada render/realtime com os mesmos dias. */
          centerKey={`${scope}|${day ?? ""}|${days.length}|${days[0] ?? ""}|${days[days.length - 1] ?? ""}`}
        >
          {days.map((d) => {
            const isToday = d === dayjs().format("YYYY-MM-DD");
            const hasLive = matches?.some(
              (m) => dayKey(m.kickoff_at) === d && m.status === "live",
            );
            return (
              <button
                key={d}
                onClick={() => setPicked(d)}
                data-day-active={day === d ? "" : undefined}
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
          {session && (shareSel != null || dayMatches.some(isShareable)) && (
            <button
              type="button"
              onClick={() => setShareSel(shareSel ? null : new Set())}
              aria-pressed={!!shareSel}
              aria-label="Compartilhar placares como imagem"
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-semibold transition",
                shareSel
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-ink-200 bg-surface text-ink-600",
              )}
            >
              <Share2 className="size-3.5" /> {shareSel ? "Cancelar" : "Compartilhar"}
            </button>
          )}
        </ScrollRow>
      )}

          </>
        }
        />
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
          title="Bola parada por enquanto"
          description={
            isAll
              ? "Assim que rolar jogo nas competições ativas, ele aparece aqui pra você cravar o placar e provar que entende de bola."
              : "Assim que rolar jogo nesta competição, ele aparece aqui pra você cravar o placar."
          }
        />
      ) : !session ? (
        <FirstFold scrollTargetId="conheca-resultadismo">{gamesGrid}</FirstFold>
      ) : (
        gamesGrid
      )}

      {/* Landing híbrida para visitantes deslogados. */}
      {!session && <LandingSections onOpenLogin={openLogin} />}
      {shareBar}
    </Page>
  );
}
