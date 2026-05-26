import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Lock } from "lucide-react";
import { TeamCrest } from "@/components/TeamCrest";
import { ScorePill } from "@/components/ScorePill";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { formatKickoff, isLocked } from "@/lib/format";
import { useSavePrediction } from "./api";
import type { MatchWithTeams, Prediction, ScoreType } from "@/lib/types";

type SaveState = "idle" | "saving" | "saved" | "error";

const predBg: Record<ScoreType, string> = {
  cravada: "bg-gold-500 text-gold-950 border-gold-500",
  saldo: "bg-grass-600 text-white border-grass-600",
  acerto: "bg-aqua-700 text-white border-aqua-700",
  erro: "bg-ink-100 text-ink-500 border-ink-200",
};

export function MatchCard({
  match,
  prediction,
}: {
  match: MatchWithTeams;
  prediction: Prediction | null;
}) {
  const locked = match.status !== "scheduled" || isLocked(match.kickoff_at);
  const finished = match.status === "finished";
  const live = match.status === "live";

  const save = useSavePrediction();
  const [home, setHome] = useState<string>(prediction ? String(prediction.home_pred) : "");
  const [away, setAway] = useState<string>(prediction ? String(prediction.away_pred) : "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const firstRender = useRef(true);

  // Auto-save com debounce quando ambos os campos forem válidos.
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
            setTimeout(() => setSaveState("idle"), 1800);
          },
          onError: () => setSaveState("error"),
        },
      );
    }, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [home, away]);

  return (
    <Card className={cn("overflow-hidden", live && "ring-2 ring-flame-400")}>
      {/* topo: contexto + horário/status */}
      <div className="flex items-center justify-between border-b border-ink-100 px-3.5 py-2 text-xs">
        <span className="truncate font-medium text-ink-500">
          {[match.group_name, match.round].filter(Boolean).join(" · ") || match.stage || ""}
        </span>
        {live ? (
          <span className="flex items-center gap-1.5 font-bold text-flame-600">
            <span className="size-2 animate-pulse-live rounded-full bg-flame-500" />
            AO VIVO
          </span>
        ) : finished ? (
          <span className="font-semibold text-ink-400">Encerrado</span>
        ) : (
          <span className="font-semibold text-ink-600">{formatKickoff(match.kickoff_at)}</span>
        )}
      </div>

      {/* corpo: times + placar */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-3.5">
        {/* mandante */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <TeamCrest team={match.home_team} name={match.home_team_name} size={40} />
          <span className="line-clamp-2 text-xs font-semibold text-ink-800">
            {match.home_team?.short_name ?? match.home_team_name}
          </span>
        </div>

        {/* centro: inputs (aberto) ou placar (travado) */}
        <div className="flex min-w-[92px] flex-col items-center gap-1">
          {locked ? (
            <ResultCenter match={match} live={live} finished={finished} />
          ) : (
            <div className="flex items-center gap-1.5">
              <ScoreInput value={home} onChange={setHome} ariaLabel="Placar mandante" />
              <span className="text-lg font-bold text-ink-300">×</span>
              <ScoreInput value={away} onChange={setAway} ariaLabel="Placar visitante" />
            </div>
          )}
        </div>

        {/* visitante */}
        <div className="flex flex-col items-center gap-1.5 text-center">
          <TeamCrest team={match.away_team} name={match.away_team_name} size={40} />
          <span className="line-clamp-2 text-xs font-semibold text-ink-800">
            {match.away_team?.short_name ?? match.away_team_name}
          </span>
        </div>
      </div>

      {/* rodapé: estado do palpite */}
      <Footer
        locked={locked}
        finished={finished}
        prediction={prediction}
        saveState={saveState}
        hasInput={home !== "" && away !== ""}
      />
    </Card>
  );
}

function ScoreInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={99}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => {
        const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 2);
        onChange(v);
      }}
      placeholder="–"
      className="size-12 rounded-md border border-ink-200 bg-surface text-center text-xl font-bold text-ink-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
    />
  );
}

function ResultCenter({
  match,
  live,
  finished,
}: {
  match: MatchWithTeams;
  live: boolean;
  finished: boolean;
}) {
  const hasScore = match.home_score != null && match.away_score != null;
  if (!hasScore) {
    return <span className="text-sm font-medium text-ink-400">aguardando</span>;
  }
  return (
    <div
      className={cn(
        "flex items-baseline gap-1.5 text-2xl font-extrabold tabular-nums",
        live ? "text-flame-600" : "text-ink-950",
      )}
    >
      <span>{match.home_score}</span>
      <span className="text-ink-300">×</span>
      <span>{match.away_score}</span>
      {match.home_pen != null && match.away_pen != null && (
        <span className="ml-1 self-center text-xs font-semibold text-ink-400">
          ({match.home_pen}-{match.away_pen} pên)
        </span>
      )}
    </div>
  );
}

function Footer({
  locked,
  finished,
  prediction,
  saveState,
  hasInput,
}: {
  locked: boolean;
  finished: boolean;
  prediction: Prediction | null;
  saveState: SaveState;
  hasInput: boolean;
}) {
  // Aberto para palpite
  if (!locked) {
    return (
      <div className="flex h-8 items-center justify-center gap-1.5 border-t border-ink-100 text-xs font-medium">
        {saveState === "saving" && (
          <span className="flex items-center gap-1 text-ink-400">
            <Loader2 className="size-3.5 animate-spin" /> salvando…
          </span>
        )}
        {saveState === "saved" && (
          <span className="flex items-center gap-1 text-grass-600">
            <Check className="size-3.5" /> palpite salvo
          </span>
        )}
        {saveState === "error" && <span className="text-flame-600">erro ao salvar</span>}
        {saveState === "idle" &&
          (prediction ? (
            <span className="text-ink-400">
              palpite: {prediction.home_pred} × {prediction.away_pred}
            </span>
          ) : (
            <span className="text-ink-400">{hasInput ? "" : "faça seu palpite"}</span>
          ))}
      </div>
    );
  }

  // Travado / finalizado
  return (
    <div className="flex h-9 items-center justify-center gap-2 border-t border-ink-100 px-3 text-xs">
      {prediction ? (
        <>
          <span className="font-medium text-ink-500">
            seu palpite: <span className="font-bold text-ink-800">
              {prediction.home_pred} × {prediction.away_pred}
            </span>
          </span>
          {finished && prediction.score_type && <ScorePill type={prediction.score_type} withLabel />}
        </>
      ) : (
        <span className="flex items-center gap-1 text-ink-400">
          <Lock className="size-3.5" /> você não palpitou
        </span>
      )}
    </div>
  );
}
