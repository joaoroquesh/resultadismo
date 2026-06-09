import { useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { Check, Loader2, Lock, ChevronDown, Users, Zap, Hand, Plus, Minus } from "lucide-react";
import { TeamCrest } from "@/components/TeamCrest";
import { ScorePill } from "@/components/ScorePill";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { formatTime, isLocked, formatDeadline, matchPhaseLabel } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { useSavePrediction, useSetJoker, useMatchPredictions, useMatchPredictStatus } from "./api";
import { useNudge } from "@/features/notifications/api";
import type { MatchWithTeams, Prediction, ScoreType } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

const scoreBoxByType: Record<ScoreType, string> = {
  cravada: "bg-gold-500 text-gold-950 border-gold-500",
  saldo: "bg-grass-600 text-white border-grass-600",
  acerto: "bg-aqua-700 text-white border-aqua-700",
  erro: "bg-ink-200 text-ink-400 border-ink-200",
};

export function MatchCard({
  match,
  prediction,
  jokersUsed = 0,
  maxJokers = 99,
}: {
  match: MatchWithTeams;
  prediction: Prediction | null;
  jokersUsed?: number;
  maxJokers?: number;
}) {
  const { session } = useAuth();
  const { open: openLogin } = useLoginModal();
  const { toast } = useToast();

  // Tick a cada 30s só pra jogos perto do horário (6h antes → 4h depois), pra o
  // "ao vivo automático" virar na hora sem depender de uma resposta da API.
  const [now, setNow] = useState(() => Date.now());
  const kickoffMs = match.kickoff_at ? new Date(match.kickoff_at).getTime() : null;
  useEffect(() => {
    if (match.status !== "scheduled" || kickoffMs == null) return;
    const delta = kickoffMs - Date.now();
    if (delta > 6 * 3_600_000 || delta < -4 * 3_600_000) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [match.status, kickoffMs]);

  const finished = match.status === "finished";
  // Ao vivo automático: o jogo aparece AO VIVO (0×0) assim que dá o horário,
  // mesmo antes da API confirmar. Janela de 4h cobre 90'+prorrogação; se a API
  // nunca atualizar (provável quebra → vira alerta no admin), reverte depois.
  const autoLive =
    match.status === "scheduled" &&
    kickoffMs != null &&
    kickoffMs <= now &&
    now - kickoffMs < 4 * 3_600_000;
  const live = match.status === "live" || autoLive;
  const locked = match.status !== "scheduled" || isLocked(match.kickoff_at);
  const canEdit = !locked && !!session;
  const pending = canEdit && !prediction;
  // Placar mostrado ao vivo: o da API, ou 0×0 enquanto ela não confirma.
  const liveHome = match.home_score ?? 0;
  const liveAway = match.away_score ?? 0;
  const isJoker = prediction?.is_joker ?? false;

  const save = useSavePrediction();
  const joker = useSetJoker();
  const [home, setHome] = useState(prediction ? String(prediction.home_pred) : "");
  const [away, setAway] = useState(prediction ? String(prediction.away_pred) : "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showGalera, setShowGalera] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (!canEdit) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a)) return;
    if (prediction && prediction.home_pred === h && prediction.away_pred === a) return;
    const t = setTimeout(() => {
      setSaveState("saving");
      save.mutate(
        { matchId: match.id, home: h, away: a },
        {
          onSuccess: () => {
            setSaveState("saved");
            setTimeout(() => setSaveState("idle"), 1600);
          },
          onError: () => setSaveState("error"),
        },
      );
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, away]);

  // Stepper: mexer num placar inicializa o outro em "0" (palpite começa 0×0).
  const setHomeScore = (v: string) => {
    setHome(v);
    setAway((a) => (a === "" ? "0" : a));
  };
  const setAwayScore = (v: string) => {
    setAway(v);
    setHome((h) => (h === "" ? "0" : h));
  };

  // "Em edição": já tem palpite OU clicou no card pra fazer um. Antes disso o
  // placar fica "– ×–" (NÃO palpitado, ≠ de um 0×0 real). Clicar no card já vale
  // 0×0 (o autosave salva sozinho, mesmo sem tocar no +/−). Nunca um lado vazio.
  const [active, setActive] = useState(!!prediction);
  function startPredicting() {
    if (!canEdit || active) return;
    setActive(true);
    setHome("0");
    setAway("0");
  }

  const scoreType = finished ? prediction?.score_type ?? null : null;

  return (
    <div
      className={cn(
        "animate-rise overflow-hidden rounded-lg ring-1 transition-shadow",
        finished ? "bg-ink-100 ring-border" : "bg-surface ring-border shadow-[var(--shadow-soft)]",
        live && "ring-2 ring-flame-400",
        pending && "ring-2 ring-gold-300",
        isJoker && !pending && "ring-2 ring-gold-400",
      )}
    >
      {/* label */}
      <div className="flex items-center justify-center gap-2 px-3 pt-2.5 text-[11px] text-ink-500">
        {live ? (
          <span className="flex items-center gap-1 font-bold text-flame-600">
            <span className="size-1.5 animate-pulse-live rounded-full bg-flame-500" /> AO VIVO
          </span>
        ) : (
          <span className="font-semibold text-ink-600">{formatTime(match.kickoff_at)}</span>
        )}
        <span className="text-ink-300">·</span>
        <span className="truncate">{match.competition?.name ?? match.round}</span>
        {(() => {
          const phase = matchPhaseLabel(match);
          return phase ? (
            <span className="shrink-0 rounded-pill border border-border px-1.5 py-0 text-[10px] text-ink-400">
              {phase}
            </span>
          ) : null;
        })()}
        {canEdit &&
          (() => {
            const d = formatDeadline(match.kickoff_at);
            return d ? (
              <span className={cn("font-semibold", d.urgent ? "text-flame-600" : "text-ink-400")}>
                {d.text}
              </span>
            ) : null;
          })()}
        {isJoker && (
          <span className="ml-auto flex items-center gap-0.5 rounded-pill bg-brand-600 px-1.5 py-0 text-[10px] font-bold text-white">
            <Zap className="size-2.5 fill-white" /> 2×
          </span>
        )}
      </div>

      {/* resultado: time + palpite + time */}
      <div className="flex items-center justify-center gap-1.5 px-2 py-2.5">
        <TeamSide name={match.home_team?.short_name ?? match.home_team_name} team={match.home_team} align="right" />
        <div className="flex items-center gap-1.5">
          {canEdit && !active ? (
            <button
              type="button"
              onClick={startPredicting}
              aria-label="Fazer palpite"
              className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-ink-50"
            >
              <ScoreBox value="" onChange={() => {}} editable={false} scoreType={null} live={false} />
              <span className="text-sm font-bold text-ink-300">×</span>
              <ScoreBox value="" onChange={() => {}} editable={false} scoreType={null} live={false} />
            </button>
          ) : (
            <>
              <ScoreBox value={home} onChange={setHomeScore} editable={canEdit && active} scoreType={scoreType} live={live} />
              <span className="text-sm font-bold text-ink-300">×</span>
              <ScoreBox value={away} onChange={setAwayScore} editable={canEdit && active} scoreType={scoreType} live={live} />
            </>
          )}
        </div>
        <TeamSide name={match.away_team?.short_name ?? match.away_team_name} team={match.away_team} align="left" />
      </div>

      {/* resultado real (ao vivo mostra 0×0 enquanto a API não confirma) */}
      {(finished || live) && (
        <div className="flex items-center justify-center gap-2 border-t border-border py-1.5 text-xs">
          <span className="text-ink-400">{live ? "Ao vivo" : "Resultado"}</span>
          <span className={cn("font-extrabold tabular-nums", live ? "text-flame-600" : "text-ink-800")}>
            {finished ? `${match.home_score} × ${match.away_score}` : `${liveHome} × ${liveAway}`}
          </span>
          {finished && scoreType && <ScorePill type={scoreType} withLabel doubled={isJoker} />}
        </div>
      )}

      {/* footer: ações de palpite */}
      {canEdit ? (
        <div className="flex h-9 items-center justify-between gap-2 border-t border-border px-3 text-[11px] font-medium">
          <span className="flex items-center gap-1">
            {saveState === "saving" && (
              <span className="flex items-center gap-1 text-ink-400">
                <Loader2 className="size-3 animate-spin" /> salvando…
              </span>
            )}
            {saveState === "saved" && (
              <span className="flex items-center gap-1 text-grass-600">
                <Check className="size-3" /> salvo
              </span>
            )}
            {saveState === "error" && <span className="text-flame-600">erro</span>}
            {saveState === "idle" &&
              (pending ? (
                <span className="text-gold-700">faça seu palpite</span>
              ) : (
                <span className="text-ink-400">palpite salvo</span>
              ))}
          </span>
          {prediction && (
            <button
              disabled={!isJoker && jokersUsed >= maxJokers}
              onClick={() =>
                joker.mutate(
                  { matchId: match.id, value: !isJoker },
                  { onError: (e) => toast(e instanceof Error ? e.message : "Erro no dobro", "error") },
                )
              }
              className={cn(
                "flex items-center gap-1 rounded-pill px-2 py-1 text-[11px] font-bold transition-colors disabled:opacity-40",
                isJoker
                  ? "bg-brand-600 text-white"
                  : "text-ink-400 hover:bg-ink-100 hover:text-brand-700",
              )}
              aria-pressed={isJoker}
              aria-label="Dobrar pontos (2x)"
              title={
                !isJoker && jokersUsed >= maxJokers
                  ? "Você já usou seus dobros desta semana"
                  : "Dobrar os pontos deste jogo"
              }
            >
              <Zap className={cn("size-3.5", isJoker && "fill-white")} /> 2×
            </button>
          )}
        </div>
      ) : !session && !finished && !live ? (
        <button
          type="button"
          onClick={() => {
            track("cta_click", { location: "match_card" });
            openLogin();
          }}
          className="flex h-9 w-full items-center justify-center gap-1.5 border-t border-border text-[11px] font-semibold text-brand-600 transition-colors hover:bg-ink-50"
        >
          Entrar para palpitar
        </button>
      ) : locked && session && !prediction ? (
        <div className="flex h-8 items-center justify-center gap-1 border-t border-border text-[11px] text-ink-400">
          <Lock className="size-3" /> você não palpitou
        </div>
      ) : null}

      {/* Após o início: placares da galera. Antes: só quem já palpitou (sem placar). */}
      {(locked || !!session) && (
        <>
          <button
            onClick={() => setShowGalera((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-border py-1.5 text-[11px] font-semibold text-ink-500 transition-colors hover:bg-ink-50"
          >
            <Users className="size-3.5" /> {locked ? "Palpites da galera" : "Quem já palpitou"}
            <ChevronDown className={cn("size-3.5 transition-transform", showGalera && "rotate-180")} />
          </button>
          {showGalera &&
            (locked ? (
              <Galera matchId={match.id} finished={finished} />
            ) : (
              <PredictStatus matchId={match.id} />
            ))}
        </>
      )}
    </div>
  );
}

function TeamSide({
  name,
  team,
  align,
}: {
  name: string | null;
  team: MatchWithTeams["home_team"];
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5",
        align === "right" ? "flex-row-reverse text-right" : "text-left",
      )}
    >
      <TeamCrest team={team} name={name} size={28} />
      <span className="line-clamp-2 text-xs font-semibold leading-tight text-ink-800">{name}</span>
    </div>
  );
}

function ScoreBox({
  value,
  onChange,
  editable,
  scoreType,
  live,
}: {
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  scoreType: ScoreType | null;
  live: boolean;
}) {
  const base =
    "relative flex size-10 items-center justify-center rounded-md border text-center text-xl font-bold leading-none tabular-nums";

  if (editable) {
    const MAX = 19;
    const empty = value === "";
    const n = empty ? 0 : Math.min(MAX, Math.max(0, parseInt(value, 10) || 0));
    const set = (next: number) => onChange(String(Math.min(MAX, Math.max(0, next))));
    const btn =
      "grid size-7 place-items-center rounded-md text-ink-500 transition hover:bg-ink-100 hover:text-brand-700 active:scale-90 disabled:pointer-events-none disabled:opacity-30";
    return (
      <div className="flex flex-col items-center gap-0.5">
        <button type="button" aria-label="Aumentar placar" onClick={() => set(n + 1)} disabled={n >= MAX} className={btn}>
          <Plus className="size-4" strokeWidth={3} />
        </button>
        <span
          className={cn(
            base,
            "select-none bg-surface",
            empty ? "border-border text-ink-400" : "border-brand-500 text-ink-950",
          )}
        >
          {n}
        </span>
        <button type="button" aria-label="Diminuir placar" onClick={() => set(n - 1)} disabled={n <= 0} className={btn}>
          <Minus className="size-4" strokeWidth={3} />
        </button>
      </div>
    );
  }

  const display = value === "" ? "–" : value;
  return (
    <span
      className={cn(
        base,
        scoreType
          ? scoreBoxByType[scoreType]
          : live
            ? "border-ink-300 bg-transparent text-ink-500"
            : "border-border bg-ink-200/40 text-ink-500",
      )}
    >
      {display}
    </span>
  );
}

function Galera({ matchId, finished }: { matchId: string; finished: boolean }) {
  const { data, isLoading } = useMatchPredictions(matchId, true);

  if (isLoading) return <div className="px-3 py-3 text-center text-xs text-ink-400">carregando…</div>;
  if (!data || data.length === 0)
    return <div className="px-3 py-3 text-center text-xs text-ink-400">ninguém palpitou ainda</div>;

  return (
    <ul className="divide-y divide-border bg-surface/60 px-1 py-1">
      {data.map((p, i) => (
        <li key={p.user?.id ?? i} className="flex items-center gap-2 px-2.5 py-1.5">
          <Avatar src={p.user?.avatar_url} name={p.user?.display_name} size="xs" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">
            {p.user?.display_name ?? "—"}
          </span>
          <span className="text-xs font-bold tabular-nums text-ink-600">
            {p.home_pred} × {p.away_pred}
          </span>
          {finished && p.score_type && <ScorePill type={p.score_type} />}
        </li>
      ))}
    </ul>
  );
}

/** Antes do kickoff: membros do grupo e quem já palpitou (sem revelar o placar). */
function PredictStatus({ matchId }: { matchId: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const nudge = useNudge();
  const { data, isLoading } = useMatchPredictStatus(matchId, true);

  if (isLoading)
    return <div className="px-3 py-3 text-center text-xs text-ink-400">carregando…</div>;
  if (!data || data.length === 0)
    return (
      <div className="px-3 py-3 text-center text-xs text-ink-400">
        Entre num grupo para ver quem já palpitou.
      </div>
    );

  const done = data.filter((d) => d.predicted).length;

  return (
    <div className="bg-surface/60">
      <p className="px-3 pt-2 text-center text-[11px] font-medium text-ink-500">
        <span className="font-bold text-ink-700">
          {done} de {data.length}
        </span>{" "}
        já palpitaram
      </p>
      <ul className="divide-y divide-border px-1 py-1">
        {data.map((m) => (
          <li key={m.user_id} className="flex items-center gap-2 px-2.5 py-1.5">
            <Avatar src={m.avatar_url} name={m.display_name} size="xs" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">
              {m.display_name}
              {m.user_id === user?.id && <span className="text-ink-400"> (você)</span>}
            </span>
            {m.predicted ? (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-grass-600">
                <Check className="size-3.5" /> palpitou
              </span>
            ) : m.user_id === user?.id ? (
              <span className="text-[11px] font-semibold text-gold-700">falta você!</span>
            ) : (
              <button
                disabled={nudge.isPending}
                onClick={() =>
                  nudge.mutate(
                    { matchId, toUser: m.user_id },
                    {
                      onSuccess: () => toast("Cutucada enviada! 👉", "success"),
                      onError: (e) => toast(e instanceof Error ? e.message : "Erro", "error"),
                    },
                  )
                }
                className="flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-semibold text-gold-700 transition-colors hover:bg-ink-100 disabled:opacity-50"
              >
                <Hand className="size-3.5" /> cutucar
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
