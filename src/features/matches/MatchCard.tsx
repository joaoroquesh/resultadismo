import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock, ChevronDown, Users } from "lucide-react";
import { TeamCrest } from "@/components/TeamCrest";
import { ScorePill } from "@/components/ScorePill";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { formatTime, isLocked } from "@/lib/format";
import { useSavePrediction, useMatchPredictions } from "./api";
import type { MatchWithTeams, Prediction, ScoreType } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

// estilo da caixa de placar conforme o estado
const scoreBoxByType: Record<ScoreType, string> = {
  cravada: "bg-gold-500 text-gold-950 border-gold-500",
  saldo: "bg-grass-600 text-white border-grass-600",
  acerto: "bg-aqua-700 text-white border-aqua-700",
  erro: "bg-ink-200 text-ink-400 border-ink-200",
};

export function MatchCard({
  match,
  prediction,
}: {
  match: MatchWithTeams;
  prediction: Prediction | null;
}) {
  const finished = match.status === "finished";
  const live = match.status === "live";
  const locked = match.status !== "scheduled" || isLocked(match.kickoff_at);
  const open = !locked;
  const pending = open && !prediction;
  const hasResult = match.home_score != null && match.away_score != null;

  const save = useSavePrediction();
  const [home, setHome] = useState(prediction ? String(prediction.home_pred) : "");
  const [away, setAway] = useState(prediction ? String(prediction.away_pred) : "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [showGalera, setShowGalera] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (locked) return;
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const h = parseInt(home, 10);
    const a = parseInt(away, 10);
    if (Number.isNaN(h) || Number.isNaN(a)) return;
    if (prediction && prediction.home_pred === h && prediction.away_pred === a) return;
    setSaveState("saving");
    const t = setTimeout(() => {
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

  const scoreType = finished ? prediction?.score_type ?? null : null;

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg ring-1 transition",
        finished ? "bg-ink-100 ring-border" : "bg-surface ring-border shadow-[var(--shadow-soft)]",
        live && "ring-2 ring-flame-400",
        pending && "ring-2 ring-gold-300",
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
        {match.group_name && (
          <span className="rounded-pill border border-ink-200 px-1.5 py-0 text-[10px] text-ink-400">
            {match.group_name}
          </span>
        )}
      </div>

      {/* resultado: time + palpite + time */}
      <div className="flex items-center justify-center gap-1.5 px-2 py-2.5">
        <TeamSide name={match.home_team?.short_name ?? match.home_team_name} team={match.home_team} align="right" />
        <div className="flex items-center gap-1.5">
          <ScoreBox
            value={home}
            onChange={setHome}
            editable={open}
            scoreType={scoreType}
            live={live}
            locked={locked && !finished}
          />
          <span className="text-sm font-bold text-ink-300">×</span>
          <ScoreBox
            value={away}
            onChange={setAway}
            editable={open}
            scoreType={scoreType}
            live={live}
            locked={locked && !finished}
          />
        </div>
        <TeamSide name={match.away_team?.short_name ?? match.away_team_name} team={match.away_team} align="left" />
      </div>

      {/* resultado real */}
      {(finished || (live && hasResult)) && (
        <div className="flex items-center justify-center gap-2 border-t border-ink-200/60 py-1.5 text-xs">
          <span className="text-ink-400">Resultado</span>
          <span className={cn("font-extrabold tabular-nums", live ? "text-flame-600" : "text-ink-800")}>
            {match.home_score} × {match.away_score}
          </span>
          {finished && scoreType && <ScorePill type={scoreType} withLabel />}
        </div>
      )}

      {/* rodapé do palpite (aberto) */}
      {open && (
        <div className="flex h-7 items-center justify-center gap-1 border-t border-ink-100 text-[11px] font-medium">
          {saveState === "saving" && (
            <span className="flex items-center gap-1 text-ink-400">
              <Loader2 className="size-3 animate-spin" /> salvando…
            </span>
          )}
          {saveState === "saved" && (
            <span className="flex items-center gap-1 text-gold-700">
              <Check className="size-3" /> salvo
            </span>
          )}
          {saveState === "error" && <span className="text-flame-600">erro ao salvar</span>}
          {saveState === "idle" &&
            (pending ? (
              <span className="text-gold-700">faça seu palpite</span>
            ) : (
              <span className="text-ink-400">palpite salvo</span>
            ))}
        </div>
      )}

      {/* sem palpite + travado */}
      {locked && !prediction && (
        <div className="flex h-7 items-center justify-center gap-1 border-t border-ink-200/60 text-[11px] text-ink-400">
          <Lock className="size-3" /> você não palpitou
        </div>
      )}

      {/* palpites da galera (após kickoff) */}
      {locked && (
        <>
          <button
            onClick={() => setShowGalera((v) => !v)}
            className="flex w-full items-center justify-center gap-1.5 border-t border-ink-200/60 py-1.5 text-[11px] font-semibold text-ink-500 transition hover:bg-ink-50"
          >
            <Users className="size-3.5" /> Palpites da galera
            <ChevronDown className={cn("size-3.5 transition", showGalera && "rotate-180")} />
          </button>
          {showGalera && <Galera matchId={match.id} finished={finished} />}
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
      <TeamCrest team={team} name={name} size={26} />
      <span className="line-clamp-2 text-[11px] font-semibold leading-tight text-ink-800">{name}</span>
    </div>
  );
}

function ScoreBox({
  value,
  onChange,
  editable,
  scoreType,
  live,
  locked,
}: {
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  scoreType: ScoreType | null;
  live: boolean;
  locked: boolean;
}) {
  const base =
    "relative flex size-9 items-center justify-center rounded-md border text-lg font-bold tabular-nums";

  if (editable) {
    const empty = value === "";
    return (
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={99}
        aria-label="Placar"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
        placeholder="–"
        className={cn(
          base,
          "outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20",
          empty ? "border-ink-200 bg-surface text-ink-950" : "border-brand-500 bg-surface text-ink-950",
        )}
      />
    );
  }

  // travado (mostra o palpite)
  const display = value === "" ? "–" : value;
  return (
    <span
      className={cn(
        base,
        scoreType
          ? scoreBoxByType[scoreType]
          : live
            ? "border-ink-300 bg-transparent text-ink-500"
            : "border-ink-200 bg-ink-200/40 text-ink-500",
      )}
    >
      {display}
      {scoreType && scoreType !== "erro" && (
        <span
          className={cn(
            "absolute -right-1.5 -top-1.5 rounded-full px-1 text-[9px] font-bold leading-tight",
            scoreType === "cravada" && "bg-gold-600 text-white",
            scoreType === "saldo" && "bg-grass-700 text-white",
            scoreType === "acerto" && "bg-aqua-900 text-white",
          )}
        >
          +{scoreType === "cravada" ? 3 : scoreType === "saldo" ? 2 : 1}
        </span>
      )}
    </span>
  );
}

function Galera({ matchId, finished }: { matchId: string; finished: boolean }) {
  const { data, isLoading } = useMatchPredictions(matchId, true);

  if (isLoading) {
    return <div className="px-3 py-3 text-center text-xs text-ink-400">carregando…</div>;
  }
  if (!data || data.length === 0) {
    return <div className="px-3 py-3 text-center text-xs text-ink-400">ninguém palpitou ainda</div>;
  }
  return (
    <ul className="divide-y divide-ink-100 bg-surface/60 px-1 py-1">
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
