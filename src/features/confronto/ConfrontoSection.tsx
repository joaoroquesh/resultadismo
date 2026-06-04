import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Trophy,
  ListOrdered,
  Dices,
  RotateCcw,
  Check,
  TriangleAlert,
  Clock,
  Users,
  ChevronDown,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { useLeagueMembers } from "@/features/leagues/api";
import { MAX_JOGADORES } from "./simulator";
import {
  roundsNeeded,
  buildLigaFixtures,
  buildCopaFixtures,
  shuffleSeeded,
  type Period,
  type DrawTie,
} from "./build";
import {
  useConfrontoTies,
  useConfrontoPeriods,
  useConfrontoOptins,
  useToggleOptin,
  useDrawConfronto,
  useUndoDraw,
  useAdvanceSwiss,
  useAdvanceCup,
  type ConfrontoFormato,
  type ConfrontoTie,
  type PeriodKind,
} from "./api";
import { LigaTable, ConfrontoRounds, CopaBracket, MyConfrontoCard, TieDetailModal } from "./ConfrontoViews";

export function ConfrontoSection({
  lcId,
  leagueId,
  competitionId,
  mode,
  state,
  memberCount,
  isAdmin,
  currentUserId,
  participantMode = "admin",
  ligaFormat = "partial",
  scheduledDrawAt = null,
}: {
  lcId: string;
  leagueId: string;
  competitionId: string;
  mode: string; // 'liga' | 'cup'
  state: string; // 'draft' | 'scheduled' | 'drawn' | 'finished'
  memberCount: number;
  isAdmin: boolean;
  currentUserId?: string;
  participantMode?: string; // 'admin' | 'optin'
  ligaFormat?: string; // 'partial' | 'swiss'
  scheduledDrawAt?: string | null;
}) {
  const formato: ConfrontoFormato = mode === "cup" ? "cup" : "liga";

  if (state === "scheduled") {
    return (
      <ScheduledView
        lcId={lcId}
        leagueId={leagueId}
        scheduledDrawAt={scheduledDrawAt}
        formato={formato}
        isAdmin={isAdmin}
      />
    );
  }
  if (state !== "drawn" && state !== "finished") {
    return (
      <SorteioPanel
        lcId={lcId}
        leagueId={leagueId}
        competitionId={competitionId}
        formato={formato}
        memberCount={memberCount}
        isAdmin={isAdmin}
        participantMode={participantMode}
        currentUserId={currentUserId}
      />
    );
  }
  return (
    <DrawnView
      lcId={lcId}
      leagueId={leagueId}
      competitionId={competitionId}
      formato={formato}
      ligaFormat={ligaFormat}
      isAdmin={isAdmin}
      currentUserId={currentUserId}
    />
  );
}

/* -------------------- Agendado: revela no horário -------------------- */
function ScheduledView({
  lcId,
  leagueId,
  scheduledDrawAt,
  formato,
  isAdmin,
}: {
  lcId: string;
  leagueId: string;
  scheduledDrawAt: string | null;
  formato: ConfrontoFormato;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const undo = useUndoDraw();
  const qc = useQueryClient();
  const when = scheduledDrawAt ? new Date(scheduledDrawAt) : null;

  // Gatilho lazy: se o horário já passou, revela ao abrir (o cron é o backstop).
  useEffect(() => {
    if (!when || when > new Date()) return;
    supabase.rpc("release_confronto_if_due", { p_lc_id: lcId }).then(({ data }) => {
      if (data) {
        qc.invalidateQueries({ queryKey: ["confronto-ties", lcId] });
        qc.invalidateQueries({ queryKey: ["league-competitions", leagueId] });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lcId, scheduledDrawAt]);

  return (
    <div className="rounded-lg bg-surface p-5 text-center shadow-[var(--shadow-soft)] ring-1 ring-border">
      <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-brand-500/10 text-brand-600">
        <Clock className="size-6" />
      </span>
      <p className="font-bold text-ink-950">Sorteio agendado</p>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-ink-500">
        Os confrontos da {formato === "cup" ? "Copa" : "Liga"} serão revelados{" "}
        {when ? (
          <span className="font-semibold text-ink-700">
            {when.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        ) : (
          "em breve"
        )}
        . Os participantes já estão travados.
      </p>
      {isAdmin && (
        <button
          type="button"
          onClick={() =>
            undo.mutate(
              { lcId, leagueId },
              {
                onSuccess: () => toast("Agendamento desfeito. Você pode reconfigurar.", "info"),
                onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
              },
            )
          }
          disabled={undo.isPending}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-400 transition-colors hover:text-flame-600 disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" /> Desfazer agendamento
        </button>
      )}
    </div>
  );
}

/* -------------------- Rascunho: simular, configurar e sortear -------------------- */
function SorteioPanel({
  lcId,
  leagueId,
  competitionId,
  formato,
  memberCount,
  isAdmin,
  participantMode = "admin",
  currentUserId,
}: {
  lcId: string;
  leagueId: string;
  competitionId: string;
  formato: ConfrontoFormato;
  memberCount: number;
  isAdmin: boolean;
  participantMode?: string;
  currentUserId?: string;
}) {
  const { toast } = useToast();
  const draw = useDrawConfronto();
  const isOptin = participantMode === "optin";
  const { data: optins } = useConfrontoOptins(lcId, isOptin);
  const toggleOptin = useToggleOptin();
  const [kind, setKind] = useState<PeriodKind>("phase");
  const { data: periods, isLoading: loadingPeriods } = useConfrontoPeriods(competitionId, kind);
  const [confirm, setConfirm] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testN, setTestN] = useState(Math.max(2, memberCount));
  const [drawWhen, setDrawWhen] = useState<"now" | "datetime" | "first">("now");
  const [drawAt, setDrawAt] = useState("");

  const isLiga = formato === "liga";
  const Icon = formato === "cup" ? Trophy : ListOrdered;

  // Membros ativos na ordem de entrada (= seed do sorteio).
  const { data: members } = useLeagueMembers(leagueId);
  const allPlayers = useMemo(() => {
    const active = (members ?? []).filter((m) => m.status === "active");
    const mapped = active
      .map((m) => ({ id: m.profile?.id as string, name: m.profile?.display_name ?? "—" }))
      .filter((p) => p.id);
    // "sorteio" da ordem: embaralha de forma estável (seed = id da disputa).
    return shuffleSeeded(mapped, lcId);
  }, [members, lcId]);
  const nameOf = (id: string | null) =>
    id ? (allPlayers.find((p) => p.id === id)?.name ?? "—") : "—";

  // Seleção (modo admin): todos marcados por padrão. Opt-in: usa as inscrições.
  const [selected, setSelected] = useState<Record<string, boolean> | null>(null);
  const sel = selected ?? Object.fromEntries(allPlayers.map((p) => [p.id, true]));
  const optedSet = useMemo(() => new Set(optins ?? []), [optins]);
  const [cap, setCap] = useState<number | null>(null);

  // Participantes resolvidos (ordem de entrada) + limite opcional de vagas.
  const players = useMemo(() => {
    const base = isOptin
      ? allPlayers.filter((p) => optedSet.has(p.id))
      : allPlayers.filter((p) => sel[p.id]);
    return cap && cap > 0 ? base.slice(0, cap) : base;
  }, [allPlayers, isOptin, optedSet, sel, cap]);

  const n = Math.max(2, players.length);
  const P = periods?.length ?? 0;
  const fullTurno = Math.max(1, n - 1);

  // Formato da Liga, escolhido aqui no simulador (mesmo cabendo turno, pode optar suíço).
  const [ligaFmt, setLigaFmt] = useState<"turno" | "returno" | "swiss">("turno");
  const isSwiss = isLiga && ligaFmt === "swiss";
  // turno = n-1 rodadas; returno = 2(n-1); ambos limitados pelos períodos. Suíço = progressivo.
  const rounds = isSwiss
    ? 1
    : ligaFmt === "returno"
      ? Math.min(2 * fullTurno, P || 2 * fullTurno)
      : Math.min(fullTurno, P || fullTurno);
  const turnoCabe = fullTurno <= P;
  const returnoCabe = 2 * fullTurno <= P;
  const realRounds = isLiga ? (isSwiss ? Math.min(P, fullTurno) : rounds) : roundsNeeded("cup", n);
  const viavel =
    P > 0 &&
    players.length >= 2 &&
    (isLiga
      ? isSwiss
        ? true
        : ligaFmt === "returno"
          ? returnoCabe
          : turnoCabe
      : realRounds <= P);
  const confrontosPorRodada = Math.floor(n / 2);

  // Preview de teste (hipotético — só simulação, não altera o sorteio real).
  const testRounds = roundsNeeded(isLiga ? "liga" : "cup", testN);
  const testViavel = P > 0 && (isLiga ? Math.min(testRounds, P) : testRounds) <= P;
  const periodList: Period[] = useMemo(
    () => (periods ?? []).map((p) => ({ kind: p.kind, value: p.value, label: p.label, games: p.games })),
    [periods],
  );
  const previewTies = useMemo<DrawTie[]>(() => {
    const ids = players.map((p) => p.id);
    if (ids.length < 2 || periodList.length === 0) return [];
    return isLiga
      ? buildLigaFixtures(ids, periodList, isSwiss ? 1 : rounds)
      : buildCopaFixtures(ids, periodList);
  }, [players, periodList, rounds, isLiga, isSwiss]);
  const previewRound1 = previewTies.filter((t) => t.round_order === 1);
  const previewByes = previewRound1.filter((t) => t.member_b === null).length;
  const previewRoundsCount = previewTies.length
    ? Math.max(...previewTies.map((t) => t.round_order))
    : 0;
  const bracketFases = [...new Set(previewTies.map((t) => t.round_label))];

  const doDraw = async () => {
    let scheduledDrawAt: string | null = null;
    if (drawWhen === "datetime" && drawAt) {
      scheduledDrawAt = new Date(drawAt).toISOString();
    } else if (drawWhen === "first") {
      const { data } = await supabase
        .from("matches")
        .select("kickoff_at")
        .eq("competition_id", competitionId)
        .not("kickoff_at", "is", null)
        .order("kickoff_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      scheduledDrawAt = (data?.kickoff_at as string | undefined) ?? null;
    }
    draw.mutate(
      {
        lcId,
        leagueId,
        competitionId,
        formato,
        kind,
        rounds: isLiga ? (isSwiss ? 1 : rounds) : undefined,
        memberIds: players.map((p) => p.id),
        ligaFormat: isSwiss ? "swiss" : "partial",
        scheduledDrawAt,
      },
      {
        onSuccess: (r) => {
          toast(
            r.scheduled
              ? "Sorteio agendado! A disputa será revelada no horário."
              : `Sorteado! ${r.ties} confrontos entre ${r.participants} jogadores.`,
            "success",
          );
          setConfirm(false);
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Erro ao sortear.", "error"),
      },
    );
  };

  return (
    <div className="space-y-3">
      {/* Participantes: admin marca quem entra, ou usa as inscrições (opt-in) */}
      <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-800">
            {isOptin ? "Inscritos" : "Participantes"}
          </p>
          <span className="text-xs text-ink-400">
            {players.length} de {allPlayers.length}
          </span>
        </div>

        {isOptin ? (
          optedSet.size === 0 ? (
            <p className="text-xs leading-relaxed text-ink-500">
              Ninguém se inscreveu ainda. Cada membro confirma com “Quero jogar”.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {allPlayers
                .filter((p) => optedSet.has(p.id))
                .map((p) => (
                  <li
                    key={p.id}
                    className="rounded-pill bg-brand-500/10 px-2.5 py-1 text-xs font-semibold text-brand-700"
                  >
                    {p.name}
                  </li>
                ))}
            </ul>
          )
        ) : isAdmin ? (
          <>
            <div className="mb-2 flex gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelected(Object.fromEntries(allPlayers.map((p) => [p.id, true])))}
                className="font-semibold text-brand-600"
              >
                Todos
              </button>
              <span className="text-ink-300">·</span>
              <button
                type="button"
                onClick={() => setSelected(Object.fromEntries(allPlayers.map((p) => [p.id, false])))}
                className="font-semibold text-ink-500"
              >
                Limpar
              </button>
            </div>
            <ul className="no-scrollbar max-h-44 space-y-0.5 overflow-y-auto">
              {allPlayers.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-ink-50">
                    <input
                      type="checkbox"
                      checked={!!sel[p.id]}
                      onChange={(e) => setSelected({ ...sel, [p.id]: e.target.checked })}
                      className="size-4 accent-brand-600"
                    />
                    <span className="min-w-0 truncate text-ink-800">{p.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-xs text-ink-500">
            {players.length} {players.length === 1 ? "jogador entra" : "jogadores entram"} nesta disputa.
          </p>
        )}

        {/* Limite de vagas (Copa: fechar potência de 2) */}
        {!isLiga && isAdmin && allPlayers.length > 2 && (
          <div className="mt-3 border-t border-ink-100 pt-3">
            <p className="mb-1.5 text-xs font-medium text-ink-700">Fechar mata-mata (limite de vagas)</p>
            <div className="flex flex-wrap gap-1.5">
              {[4, 8, 16, 32].filter((s) => s <= allPlayers.length).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCap(s)}
                  className={cn(
                    "rounded-pill px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                    cap === s ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                  )}
                >
                  {s}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCap(null)}
                className={cn(
                  "rounded-pill px-2.5 py-0.5 text-[11px] font-semibold transition-colors",
                  cap === null ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                )}
              >
                sem limite
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Forma das rodadas: por fase (grupos+mata-mata) ou por semana, com nº de jogos */}
      <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-800">Forma das rodadas</p>
          <div className="inline-flex rounded-pill bg-ink-100 p-0.5 text-xs font-semibold">
            {(["phase", "week"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  "rounded-pill px-2.5 py-1 transition-colors",
                  kind === k ? "bg-surface text-brand-700 shadow-[var(--shadow-soft)]" : "text-ink-500",
                )}
              >
                {k === "phase" ? "Por fase" : "Por semana"}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs leading-relaxed text-ink-500">
          {kind === "phase"
            ? "Cada fase do campeonato (grupos + mata-mata) é uma rodada de confronto."
            : "Cada semana do calendário é uma rodada de confronto."}
        </p>
        {loadingPeriods ? (
          <Skeleton className="mt-3 h-16 w-full" />
        ) : P > 0 ? (
          <ul className="no-scrollbar mt-3 max-h-44 space-y-1 overflow-y-auto">
            {periods!.map((p) => (
              <li
                key={p.period_index}
                className="flex items-center justify-between gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate font-medium text-ink-700">
                  {p.period_index}. {p.label}
                </span>
                <span className="shrink-0 tabular-nums text-ink-400">
                  {p.games} {p.games === 1 ? "jogo" : "jogos"}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {/* Formato + viabilidade */}
      <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-600">
            <Icon className="size-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink-950">
              {isLiga ? "Liga (todos contra todos)" : "Copa (mata-mata)"}
            </p>
            <p className="text-sm text-ink-500">
              {n} {n === 1 ? "jogador" : "jogadores"} · {realRounds}{" "}
              {realRounds === 1 ? "rodada" : "rodadas"}
              {!isLiga && " · mata-mata"}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold",
              viavel ? "bg-grass-100 text-grass-800" : "bg-flame-100 text-flame-700",
            )}
          >
            {viavel ? <Check className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
            {viavel ? "Cabe na competição" : "Não cabe"}
          </span>
        </div>

        {/* Formato da Liga: Turno / Turno e Returno / Suíço (escolhido aqui) */}
        {isLiga && P > 0 && (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <p className="mb-2 text-sm font-semibold text-ink-800">Formato da Liga</p>
            <div className="flex gap-1 rounded-pill bg-ink-100 p-1">
              {(
                [
                  { v: "turno", label: "Turno", ok: turnoCabe },
                  { v: "returno", label: "Ida e volta", ok: returnoCabe },
                  { v: "swiss", label: "Suíço", ok: true },
                ] as const
              ).map((o) => (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => setLigaFmt(o.v)}
                  title={!o.ok ? "Não cabe nos períodos da competição" : undefined}
                  className={cn(
                    "flex-1 rounded-pill px-2 py-1.5 text-xs font-semibold transition-colors",
                    ligaFmt === o.v
                      ? "bg-surface text-brand-700 shadow-[var(--shadow-soft)]"
                      : o.ok
                        ? "text-ink-500"
                        : "text-ink-400",
                  )}
                >
                  {o.label}
                  {!o.ok && <TriangleAlert className="ml-1 inline size-3 text-flame-500" />}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-500">
              {ligaFmt === "turno"
                ? `Todos contra todos uma vez (${fullTurno} ${fullTurno === 1 ? "rodada" : "rodadas"}).`
                : ligaFmt === "returno"
                  ? `Todos contra todos, ida e volta (${2 * fullTurno} rodadas).`
                  : `Cada rodada sai por classificação a cada fase, sem revanche (até ${Math.min(P, fullTurno)} rodadas).`}{" "}
              {confrontosPorRodada} por rodada · {P} {P === 1 ? "período" : "períodos"} disponíveis.
            </p>
          </div>
        )}

        {!viavel && P > 0 && (
          <p className="mt-3 rounded-md bg-flame-50 px-3 py-2 text-xs leading-relaxed text-flame-700">
            {isLiga
              ? `Reduza as rodadas — a competição só tem ${P} períodos.`
              : `A Copa precisa de ${realRounds} fases e a competição só tem ${P} períodos. Use uma competição com mais rodadas.`}
          </p>
        )}
        {P === 0 && !loadingPeriods && (
          <p className="mt-3 rounded-md bg-brand-500/10 px-3 py-2 text-xs text-brand-700">
            A competição ainda não tem rodadas (matchdays) para o sorteio.
          </p>
        )}
      </div>

      {/* Prévia do sorteio — exatamente o que será criado */}
      {previewRound1.length > 0 && (
        <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink-800">Prévia do sorteio</p>
            <span className="text-xs text-ink-400">
              {isLiga
                ? `${previewRoundsCount} ${previewRoundsCount === 1 ? "rodada" : "rodadas"}`
                : `chave de ${1 << previewRoundsCount}${previewByes ? ` · ${previewByes} bye${previewByes > 1 ? "s" : ""}` : ""}`}
            </span>
          </div>

          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-600">
            {isLiga ? "Rodada 1" : (previewRound1[0]?.round_label ?? "1ª fase")}
          </p>
          <ul className="space-y-1">
            {previewRound1.map((t) => (
              <li
                key={`${t.round_order}-${t.slot}`}
                className="flex items-center gap-2 rounded-md bg-surface-2 px-2.5 py-1.5 text-sm"
              >
                <span className="min-w-0 flex-1 truncate text-right font-semibold text-ink-900">
                  {nameOf(t.member_a)}
                </span>
                {t.member_b === null ? (
                  <span className="shrink-0 rounded-pill bg-ink-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-400">
                    passa (bye)
                  </span>
                ) : (
                  <span className="shrink-0 text-xs font-bold text-ink-300">×</span>
                )}
                <span className="min-w-0 flex-1 truncate font-semibold text-ink-900">
                  {t.member_b === null ? "" : nameOf(t.member_b)}
                </span>
              </li>
            ))}
          </ul>

          {isSwiss && (
            <p className="mt-2 text-xs text-ink-400">
              Suíço: sorteamos só a 1ª rodada. As próximas saem por classificação a cada fase
              (até {Math.min(P, fullTurno)} rodadas), sem revanche.
            </p>
          )}
          {isLiga && !isSwiss && previewRoundsCount > 1 && (
            <p className="mt-2 text-xs text-ink-400">
              + {previewRoundsCount - 1} {previewRoundsCount - 1 === 1 ? "rodada" : "rodadas"} com
              outros adversários (cada um joga {previewRoundsCount} confrontos).
            </p>
          )}
          {!isLiga && bracketFases.length > 1 && (
            <p className="mt-2 flex flex-wrap items-center gap-1 text-xs text-ink-400">
              {bracketFases.map((f, i) => (
                <span key={f} className="inline-flex items-center gap-1">
                  {i > 0 && <ArrowRight className="size-3 text-ink-300" />}
                  {f}
                </span>
              ))}
            </p>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-ink-400">
            A ordem dos confrontos é sorteada. É exatamente o confronto que será criado.
          </p>
        </div>
      )}

      {/* Testar com mais jogadores (só simulação) */}
      <div className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
        <button
          type="button"
          onClick={() => setTestOpen((v) => !v)}
          aria-expanded={testOpen}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-ink-700"
        >
          <span className="inline-flex items-center gap-2">
            <Users className="size-4 text-brand-600" /> Testar com mais jogadores
          </span>
          <ChevronDown className={cn("size-4 transition-transform", testOpen && "rotate-180")} />
        </button>
        {testOpen && (
          <div className="space-y-2 border-t border-ink-100 px-4 py-3">
            <p className="text-xs text-ink-500">Só simulação — não altera o sorteio real.</p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={2}
                max={MAX_JOGADORES}
                value={testN}
                onChange={(e) => setTestN(Number(e.target.value))}
                className="h-1.5 flex-1 accent-brand-600"
                aria-label="Jogadores no teste"
              />
              <span className="w-16 text-right text-sm font-bold tabular-nums text-ink-900">
                {testN} jog.
              </span>
            </div>
            <p className="text-xs leading-relaxed text-ink-600">
              {isLiga
                ? `Turno completo: ${Math.max(1, testN - 1)} rodadas · ${Math.floor(testN / 2)} confrontos por rodada.`
                : `Mata-mata: ${testRounds} fases (chave de ${1 << testRounds}).`}{" "}
              <span className={testViavel ? "text-grass-700" : "text-flame-600"}>
                {P === 0 ? "" : testViavel ? "Cabe na competição." : `Não cabe nos ${P} períodos.`}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Ação */}
      {isAdmin ? (
        <>
          <Button fullWidth disabled={players.length < 2 || !viavel} onClick={() => setConfirm(true)}>
            <Dices className="size-4" /> Sortear confrontos
          </Button>
          {players.length < 2 && (
            <p className="px-1 text-center text-xs text-ink-400">
              {isOptin
                ? "Aguarde pelo menos 2 inscritos para sortear."
                : "Selecione pelo menos 2 participantes."}
            </p>
          )}
        </>
      ) : isOptin ? (
        <Button
          fullWidth
          variant={currentUserId && optedSet.has(currentUserId) ? "outline" : undefined}
          loading={toggleOptin.isPending}
          onClick={() =>
            toggleOptin.mutate(lcId, {
              onSuccess: (joined) =>
                toast(joined ? "Você está dentro! Boa sorte." : "Inscrição cancelada.", joined ? "success" : "info"),
              onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
            })
          }
        >
          {currentUserId && optedSet.has(currentUserId) ? "Sair da disputa" : "Quero jogar"}
        </Button>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-md bg-surface-2 px-3 py-3 text-sm text-ink-500">
          <Clock className="size-4" /> Aguardando o administrador sortear os confrontos.
        </div>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} label="Sortear confrontos?">
        <div className="space-y-4 p-5">
          <h2 className="pr-8 text-lg font-extrabold tracking-tight text-ink-950">
            Sortear confrontos?
          </h2>
          <p className="text-sm leading-relaxed text-ink-600">
            Vou travar os <span className="font-bold text-ink-900">{players.length} participantes</span>{" "}
            e montar{" "}
            {isLiga ? (
              <>
                <span className="font-bold text-ink-900">{rounds} rodadas</span> de Liga
              </>
            ) : (
              "o chaveamento da Copa"
            )}
            . Quem entrar na federação depois <span className="font-semibold">não joga</span> esta{" "}
            {isLiga ? "Liga" : "Copa"}.
          </p>
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink-800">Quando sortear?</p>
            <div className="flex flex-col gap-1">
              {(
                [
                  { v: "now", label: "Agora (instantâneo)" },
                  { v: "first", label: "No 1º jogo do campeonato" },
                  { v: "datetime", label: "Agendar data e hora" },
                ] as const
              ).map((o) => (
                <label
                  key={o.v}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 text-sm text-ink-700"
                >
                  <input
                    type="radio"
                    name="drawWhen"
                    checked={drawWhen === o.v}
                    onChange={() => setDrawWhen(o.v)}
                    className="size-4 accent-brand-600"
                  />
                  {o.label}
                </label>
              ))}
            </div>
            {drawWhen === "datetime" && (
              <input
                type="datetime-local"
                value={drawAt}
                onChange={(e) => setDrawAt(e.target.value)}
                className="h-10 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm outline-none focus:border-brand-500"
              />
            )}
            {drawWhen !== "now" && (
              <p className="rounded-md bg-brand-500/10 px-3 py-2 text-xs text-brand-700">
                A disputa aparece como <span className="font-semibold">"sorteio agendado"</span> e é
                revelada automaticamente no horário.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button
              fullWidth
              loading={draw.isPending}
              disabled={drawWhen === "datetime" && !drawAt}
              onClick={doDraw}
            >
              <Dices className="size-4" /> {drawWhen === "now" ? "Sortear" : "Agendar sorteio"}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------- Sorteada: visões -------------------- */
function DrawnView({
  lcId,
  leagueId,
  competitionId,
  formato,
  ligaFormat = "partial",
  isAdmin,
  currentUserId,
}: {
  lcId: string;
  leagueId: string;
  competitionId: string;
  formato: ConfrontoFormato;
  ligaFormat?: string;
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const { toast } = useToast();
  const { data: ties, isLoading } = useConfrontoTies(lcId);
  const undo = useUndoDraw();
  const advance = useAdvanceSwiss();
  const advanceCup = useAdvanceCup();
  const [openTie, setOpenTie] = useState<ConfrontoTie | null>(null);
  const [tab, setTab] = useState<"tabela" | "rodadas">("tabela");

  // Copa: ao abrir o chaveamento (e quando os resultados mudam), promove os
  // vencedores p/ a próxima fase. Idempotente — converge (só invalida se mexeu).
  useEffect(() => {
    if (formato === "cup" && (ties?.length ?? 0) > 0) {
      advanceCup.mutate({ lcId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formato, lcId, ties]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const list = ties ?? [];
  const started = list.some((t) => t.resolved);
  const isSwiss = formato === "liga" && ligaFormat === "swiss";
  const maxRound = list.length ? Math.max(...list.map((t) => t.round_order)) : 0;
  const latestResolved =
    maxRound > 0 && list.filter((t) => t.round_order === maxRound).every((t) => t.resolved);
  const canAdvance = isSwiss && isAdmin && latestResolved;

  return (
    <div className="space-y-4">
      <MyConfrontoCard ties={list} currentUserId={currentUserId} onOpen={setOpenTie} />

      {canAdvance && (
        <Button
          variant="outline"
          fullWidth
          loading={advance.isPending}
          onClick={() =>
            advance.mutate(
              { lcId, competitionId },
              {
                onSuccess: (r) =>
                  toast(
                    r.created > 0
                      ? `Rodada ${r.round} gerada por classificação!`
                      : "Sem próxima rodada agora (suíço completo ou rodada em andamento).",
                    r.created > 0 ? "success" : "info",
                  ),
                onError: (e) => toast(e instanceof Error ? e.message : "Erro ao gerar rodada.", "error"),
              },
            )
          }
        >
          <Dices className="size-4" /> Gerar próxima rodada (suíço)
        </Button>
      )}

      {formato === "cup" ? (
        <div>
          <h4 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
            Chaveamento
          </h4>
          <CopaBracket ties={list} currentUserId={currentUserId} onOpenTie={setOpenTie} />
        </div>
      ) : (
        <>
          <div className="inline-flex rounded-pill bg-ink-100 p-0.5 text-sm font-semibold">
            {(["tabela", "rodadas"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-pill px-3 py-1 transition-colors",
                  tab === t ? "bg-surface text-brand-700 shadow-[var(--shadow-soft)]" : "text-ink-500",
                )}
              >
                {t === "tabela" ? "Classificação" : "Rodadas"}
              </button>
            ))}
          </div>
          {tab === "tabela" ? (
            <LigaTable lcId={lcId} currentUserId={currentUserId} />
          ) : (
            <ConfrontoRounds ties={list} currentUserId={currentUserId} onOpenTie={setOpenTie} />
          )}
        </>
      )}

      {isAdmin && !started && (
        <button
          type="button"
          onClick={() =>
            undo.mutate(
              { lcId, leagueId },
              {
                onSuccess: () => toast("Sorteio desfeito. Você pode ajustar e sortear de novo.", "info"),
                onError: (e) => toast(e instanceof Error ? e.message : "Erro ao desfazer.", "error"),
              },
            )
          }
          disabled={undo.isPending}
          className="inline-flex items-center gap-1.5 px-1 py-1 text-[11px] font-semibold text-ink-400 transition-colors hover:text-flame-600 disabled:opacity-50"
        >
          <RotateCcw className={cn("size-3.5", undo.isPending && "animate-spin")} /> Desfazer sorteio
        </button>
      )}

      <TieDetailModal tie={openTie} currentUserId={currentUserId} onClose={() => setOpenTie(null)} />
    </div>
  );
}
