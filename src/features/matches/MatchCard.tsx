import { useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { Check, Loader2, Lock, ChevronDown, Users, Zap, Hand, Plus, Minus, Star, Share2 } from "lucide-react";
import { TeamCrest } from "@/components/TeamCrest";
import { ScorePill } from "@/components/ScorePill";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { formatTime, isLocked, formatDeadline, matchPhaseLabel } from "@/lib/format";
import { useAuth } from "@/features/auth/AuthProvider";
import { useToast } from "@/components/ui/Toast";
import { useSavePrediction, useSetJoker, useMatchPredictions, useMatchPredictStatus } from "./api";
import { useNudge } from "@/features/notifications/api";
import { useMyLeagues, useLeagueMembers } from "@/features/leagues/api";
import { useMyFavorites, useToggleFavorite } from "@/features/players/api";
import { supabase } from "@/lib/supabase";
import type { MatchWithTeams, Prediction, ScoreType } from "@/lib/types";
import { SCORE_LABEL, SCORE_POINTS } from "@/lib/types";
import { provisionalScoreType } from "@/lib/score";
import { buildScoreShareImage, shareImageBlob } from "./shareImage";

type SaveState = "idle" | "saving" | "saved" | "error";

// Prévia AO VIVO: suave — só a borda (e o número) na cor do tipo, sem fundo.
const scoreBoxLiveByType: Record<ScoreType, string> = {
  cravada: "border-gold-500 bg-transparent text-gold-700",
  saldo: "border-grass-600 bg-transparent text-grass-700",
  acerto: "border-aqua-700 bg-transparent text-aqua-700",
  erro: "border-ink-300 bg-transparent text-ink-500",
};
const liveTextByType: Record<ScoreType, string> = {
  cravada: "text-gold-700",
  saldo: "text-grass-700",
  acerto: "text-aqua-700",
  erro: "text-ink-400",
};

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

  // EDIÇÃO é temporária: o +/− só aparece enquanto a pessoa está editando.
  // Sem palpite o placar fica "– ×–"; com palpite, mostra os números (tocáveis).
  // Tocar abre o stepper (e, sem palpite, já vale 0×0 — o autosave salva).
  // Após ~3,5s sem mexer (ou depois do "salvo"), o stepper some sozinho.
  const [active, setActive] = useState(false);
  function startPredicting() {
    if (!canEdit || active) return;
    setActive(true);
    if (home === "" || away === "") {
      setHome("0");
      setAway("0");
    }
  }
  useEffect(() => {
    if (!active) return;
    if (saveState === "saving") return; // espera o save terminar
    const t = setTimeout(() => setActive(false), 3500);
    return () => clearTimeout(t);
  }, [active, home, away, saveState]);

  const scoreType = finished ? prediction?.score_type ?? null : null;
  // Prévia ao vivo: como o palpite está pontuando AGORA (cor suave + texto).
  const liveType: ScoreType | null =
    live && prediction ? provisionalScoreType(prediction.home_pred, prediction.away_pred, liveHome, liveAway) : null;

  const { profile } = useAuth();
  const shareType = scoreType ?? liveType;
  async function shareResult() {
    if (!prediction || !shareType) return;
    const blob = await buildScoreShareImage(
      [{
        homeName: match.home_team?.short_name ?? match.home_team_name ?? "Time",
        awayName: match.away_team?.short_name ?? match.away_team_name ?? "Time",
        homePred: prediction.home_pred,
        awayPred: prediction.away_pred,
        homeScore: finished ? match.home_score : liveHome,
        awayScore: finished ? match.away_score : liveAway,
        live,
        type: shareType,
        joker: isJoker,
      }],
      profile?.display_name ?? "Resultadista",
    );
    const how = await shareImageBlob(blob, "resultadismo-palpite.png");
    toast(how === "shared" ? "Imagem compartilhada! 📸" : "Imagem salva! 📸", "success");
  }

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
              aria-label={home === "" ? "Fazer palpite" : "Editar palpite"}
              className="flex items-center gap-1.5 rounded-md px-1 py-0.5 transition hover:bg-ink-50"
            >
              <ScoreBox value={home} onChange={() => {}} editable={false} scoreType={null} live={false} mine={home !== ""} />
              <span className="text-sm font-bold text-ink-300">×</span>
              <ScoreBox value={away} onChange={() => {}} editable={false} scoreType={null} live={false} mine={away !== ""} />
            </button>
          ) : (
            <>
              <ScoreBox value={home} onChange={setHomeScore} editable={canEdit && active} scoreType={scoreType} live={live} liveType={liveType} />
              <span className="text-sm font-bold text-ink-300">×</span>
              <ScoreBox value={away} onChange={setAwayScore} editable={canEdit && active} scoreType={scoreType} live={live} liveType={liveType} />
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
          {live && liveType && (
            <span className={cn("text-xs font-semibold tabular-nums", liveTextByType[liveType])}>
              {SCORE_LABEL[liveType]}{" "}
              {liveType === "erro" ? "0" : `+${SCORE_POINTS[liveType] * (isJoker ? 2 : 1)}`}
            </span>
          )}
          {prediction && shareType && (
            <button
              type="button"
              onClick={() => void shareResult()}
              aria-label="Compartilhar resultado como imagem"
              className="grid size-6 shrink-0 place-items-center rounded text-ink-400 transition hover:bg-ink-100 hover:text-brand-700"
            >
              <Share2 className="size-3.5" />
            </button>
          )}
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
          {showGalera && <GaleraArea matchId={match.id} locked={locked} finished={finished} />}
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
      <TeamCrest team={team} name={name} size={28} eager />
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
  liveType = null,
  mine = false,
}: {
  value: string;
  onChange: (v: string) => void;
  editable: boolean;
  scoreType: ScoreType | null;
  live: boolean;
  /** prévia AO VIVO: borda na cor do tipo que o palpite está fazendo agora. */
  liveType?: ScoreType | null;
  /** palpite salvo (pré-jogo, fechado): números fortes + borda da marca. */
  mine?: boolean;
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
          : mine
            ? "border-brand-500 bg-surface text-ink-950"
            : live && liveType
              ? scoreBoxLiveByType[liveType]
              : live
                ? "border-ink-300 bg-transparent text-ink-500"
                : "border-border bg-ink-100 text-ink-500",
      )}
    >
      {display}
    </span>
  );
}

/**
 * Área "quem já palpitou / palpites da galera": com mais de um grupo, chips
 * (scroll lateral) filtram a lista POR GRUPO — o grupo favorito (estrela ao lado
 * do chip ativo; profiles.favorite_group_id) abre por padrão. Resultadistas
 * favoritados (estrela na linha) fixam no topo.
 */
function GaleraArea({
  matchId,
  locked,
  finished,
}: {
  matchId: string;
  locked: boolean;
  finished: boolean;
}) {
  const { session, user, profile, refreshProfile } = useAuth();
  const { data: leagues } = useMyLeagues();
  const myLeagues = useMemo(
    () => (leagues ?? []).filter((l) => l.my_status === "active"),
    [leagues],
  );
  const favGroup = profile?.favorite_group_id ?? null;
  // undefined = ainda sem escolha manual → segue o grupo favorito.
  const [selManual, setSelManual] = useState<string | null | undefined>(undefined);
  const selRaw = selManual === undefined ? favGroup : selManual;
  const sel = selRaw && myLeagues.some((l) => l.id === selRaw) ? selRaw : null;

  const { data: members } = useLeagueMembers(sel ?? undefined);
  const memberIds = useMemo(() => {
    if (!sel || !members) return null;
    return new Set(members.map((m) => m.profile?.id).filter(Boolean) as string[]);
  }, [sel, members]);

  const { data: favs } = useMyFavorites(!!session);
  const toggleFav = useToggleFavorite();
  const isFav = (id: string) => !!favs?.has(id);
  const star = (id: string) => toggleFav.mutate({ userId: id, next: !isFav(id) });

  async function setFavoriteGroup(id: string | null) {
    if (!user) return;
    await supabase.from("profiles").update({ favorite_group_id: id }).eq("id", user.id);
    void refreshProfile();
  }

  return (
    <div>
      {myLeagues.length > 1 && (
        <div className="flex items-center gap-1.5 overflow-x-auto border-t border-border px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <GroupChip active={sel === null} onClick={() => setSelManual(null)}>
            Todos
          </GroupChip>
          {myLeagues.map((l) => (
            <GroupChip key={l.id} active={sel === l.id} onClick={() => setSelManual(l.id)}>
              {l.name}
            </GroupChip>
          ))}
          {sel && (
            <button
              type="button"
              aria-label={favGroup === sel ? "Remover grupo favorito" : "Marcar como grupo favorito"}
              aria-pressed={favGroup === sel}
              title="Grupo favorito abre primeiro"
              onClick={() => void setFavoriteGroup(favGroup === sel ? null : sel)}
              className="grid size-7 shrink-0 place-items-center rounded-pill text-gold-600 transition hover:bg-ink-100"
            >
              <Star className={cn("size-4", favGroup === sel && "fill-gold-500 text-gold-500")} />
            </button>
          )}
        </div>
      )}
      {locked ? (
        <Galera
          matchId={matchId}
          finished={finished}
          memberIds={memberIds}
          isFav={isFav}
          onStar={session ? star : undefined}
          myId={user?.id ?? null}
        />
      ) : (
        <PredictStatus matchId={matchId} memberIds={memberIds} isFav={isFav} onStar={star} />
      )}
    </div>
  );
}

function GroupChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "max-w-36 shrink-0 truncate rounded-pill border px-2.5 py-1 text-[11px] font-semibold transition",
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-ink-200 bg-surface text-ink-600 hover:border-ink-300",
      )}
    >
      {children}
    </button>
  );
}

function FavStar({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label={on ? "Remover dos favoritos" : "Favoritar Resultadista"}
      aria-pressed={on}
      onClick={onClick}
      className="grid size-6 shrink-0 place-items-center rounded text-ink-300 transition hover:bg-ink-100 hover:text-gold-600"
    >
      <Star className={cn("size-3.5", on && "fill-gold-500 text-gold-500")} />
    </button>
  );
}

function Galera({
  matchId,
  finished,
  memberIds,
  isFav,
  onStar,
  myId,
}: {
  matchId: string;
  finished: boolean;
  memberIds: Set<string> | null;
  isFav: (id: string) => boolean;
  onStar?: (id: string) => void;
  myId: string | null;
}) {
  const { data, isLoading } = useMatchPredictions(matchId, true);

  if (isLoading) return <div className="px-3 py-3 text-center text-xs text-ink-400">carregando…</div>;
  const filtered = (data ?? []).filter(
    (p) => !memberIds || (p.user?.id && memberIds.has(p.user.id)),
  );
  if (filtered.length === 0)
    return <div className="px-3 py-3 text-center text-xs text-ink-400">ninguém palpitou ainda</div>;
  // favoritos primeiro (ordem original preservada dentro de cada bloco)
  const rows = filtered
    .map((p, i) => ({ p, i }))
    .sort((a, b) => Number(isFav(b.p.user?.id ?? "")) - Number(isFav(a.p.user?.id ?? "")) || a.i - b.i);

  return (
    <ul className="divide-y divide-border border-t border-border bg-surface/60 px-1 py-1">
      {rows.map(({ p, i }) => (
        <li key={p.user?.id ?? i} className="flex items-center gap-2 px-2.5 py-1.5">
          <Avatar src={p.user?.avatar_url} name={p.user?.display_name} size="xs" />
          <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">
            {p.user?.display_name ?? "—"}
          </span>
          {onStar && p.user?.id && p.user.id !== myId && (
            <FavStar on={isFav(p.user.id)} onClick={() => onStar(p.user!.id)} />
          )}
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
function PredictStatus({
  matchId,
  memberIds,
  isFav,
  onStar,
}: {
  matchId: string;
  memberIds: Set<string> | null;
  isFav: (id: string) => boolean;
  onStar: (id: string) => void;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const nudge = useNudge();
  const { data, isLoading } = useMatchPredictStatus(matchId, true);

  if (isLoading)
    return <div className="px-3 py-3 text-center text-xs text-ink-400">carregando…</div>;
  const filtered = (data ?? []).filter((m) => !memberIds || memberIds.has(m.user_id));
  if (filtered.length === 0)
    return (
      <div className="px-3 py-3 text-center text-xs text-ink-400">
        Entre num grupo para ver quem já palpitou.
      </div>
    );

  const done = filtered.filter((d) => d.predicted).length;
  const rows = filtered
    .map((m, i) => ({ m, i }))
    .sort((a, b) => Number(isFav(b.m.user_id)) - Number(isFav(a.m.user_id)) || a.i - b.i);

  return (
    <div className="border-t border-border bg-surface/60">
      <p className="px-3 pt-2 text-center text-[11px] font-medium text-ink-500">
        <span className="font-bold text-ink-700">
          {done} de {filtered.length}
        </span>{" "}
        já palpitaram
      </p>
      <ul className="divide-y divide-border px-1 py-1">
        {rows.map(({ m }) => (
          <li key={m.user_id} className="flex items-center gap-2 px-2.5 py-1.5">
            <Avatar src={m.avatar_url} name={m.display_name} size="xs" />
            <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink-800">
              {m.display_name}
              {m.user_id === user?.id && <span className="text-ink-400"> (você)</span>}
            </span>
            {m.user_id !== user?.id && (
              <FavStar on={isFav(m.user_id)} onClick={() => onStar(m.user_id)} />
            )}
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
