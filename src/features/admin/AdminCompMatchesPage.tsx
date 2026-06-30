import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Eye, EyeOff, Pencil, Check, X, ExternalLink, Clock, ChevronDown, ChevronRight, Lock, Unlock, Snowflake, AlertTriangle, Swords } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { dayjs, formatDayLabel, formatTime, fromNow } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MatchStatus } from "@/lib/types";
import {
  useAdminCompetitions,
  useAdminMatches,
  useSaveMatchResult,
  useSetMatchHidden,
  useSetMatchKnockout,
  useSetMatchOverride,
  useSyncFootball,
  type AdminMatch,
} from "./api";
import { useReopenMatch } from "./sync";
import { useMatchSourcesForCompetition, type MatchWithSources } from "./competitionsAdmin";
import { useOverrideMatch, useSetMatchLock, useUnfreezeMatch } from "./dataSources";

const CMP_PROVIDER_LABEL: Record<string, string> = {
  espn: "ESPN",
  football_data: "football-data.org",
  thesportsdb: "TheSportsDB",
  manual: "Manual",
};
const cmpProv = (p: string) => CMP_PROVIDER_LABEL[p] ?? p;

const STATUS_OPTS: { value: MatchStatus; label: string }[] = [
  { value: "scheduled", label: "Agendado" },
  { value: "live", label: "Ao vivo" },
  { value: "finished", label: "Encerrado" },
  { value: "postponed", label: "Adiado" },
  { value: "cancelled", label: "Cancelado" },
];

// Situação ao vivo (matches.live_phase). Códigos iguais aos do card (MatchCard).
const LIVE_PHASE_OPTS: { value: string; label: string }[] = [
  { value: "", label: "—" },
  { value: "1t", label: "1º tempo" },
  { value: "intervalo", label: "Intervalo" },
  { value: "2t", label: "2º tempo" },
  { value: "prorrogacao", label: "Prorrogação" },
  { value: "penaltis", label: "Pênaltis" },
];

function statusPill(s: MatchStatus): { tone: "neutral" | "flame" | "grass" | "gold"; label: string } {
  switch (s) {
    case "live":
      return { tone: "flame", label: "AO VIVO" };
    case "finished":
      return { tone: "grass", label: "Encerrado" };
    case "postponed":
      return { tone: "gold", label: "Adiado" };
    case "cancelled":
      return { tone: "neutral", label: "Cancelado" };
    default:
      return { tone: "neutral", label: "Agendado" };
  }
}

function dayKey(iso: string | null): string {
  return iso ? dayjs(iso).format("YYYY-MM-DD") : "0000";
}

function TeamBadge({ url }: { url: string | null | undefined }) {
  const [err, setErr] = useState(false);
  // sem escudo: não renderiza nada (mais limpo que um círculo vazio)
  if (!url || err) return null;
  return (
    <img
      src={url}
      alt=""
      className="size-6 shrink-0 object-contain"
      loading="lazy"
      onError={() => setErr(true)}
    />
  );
}

export function AdminCompMatchesPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: comps } = useAdminCompetitions();
  const { data: matches, isLoading } = useAdminMatches(id);
  const sync = useSyncFootball();
  const [view, setView] = useState<"jogos" | "comparar">("jogos");

  const comp = comps?.find((c) => c.id === id) as
    | { name: string; display_name?: string | null; provider: string }
    | undefined;
  const compName = comp?.display_name || comp?.name || "Jogos";

  const groups = useMemo(() => {
    const map = new Map<string, AdminMatch[]>();
    for (const m of matches ?? []) {
      const k = dayKey(m.kickoff_at);
      (map.get(k) ?? map.set(k, []).get(k)!).push(m);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [matches]);

  const total = matches?.length ?? 0;
  const hiddenCount = (matches ?? []).filter((m) => m.hidden).length;

  async function handleSync() {
    try {
      const r = await sync.mutateAsync(id);
      const failed = r.results.filter((x) => !x.ok);
      if (failed.length) toast(`Sync parcial: ${failed[0]!.error}`, "error");
      else toast("Jogos sincronizados.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não consegui sincronizar agora. Tenta de novo?", "error");
    }
  }

  return (
    <Page
      title={compName}
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin?t=competicoes")} aria-label="Voltar para Competições">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <Card className="mb-4 space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-ink-600">
              {total} {total === 1 ? "jogo" : "jogos"}
              {hiddenCount > 0 && ` · ${hiddenCount} oculto${hiddenCount > 1 ? "s" : ""}`}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-ink-500">
              Oculte jogos que não quer no bolão. Force placar e status pra testar a pontuação
              (o ideal é a API atualizar sozinha).
            </p>
          </div>
          {comp?.provider && comp.provider !== "manual" && (
            <Button size="sm" variant="outline" loading={sync.isPending} onClick={handleSync}>
              <RefreshCw className="size-4" /> Sincronizar
            </Button>
          )}
        </div>
        <Link
          to={`/?comp=${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700"
        >
          <ExternalLink className="size-3.5" /> Ver como jogador (tela de palpites)
        </Link>
      </Card>

      <div className="mb-3 flex gap-1 rounded-pill bg-ink-100 p-1">
        {(
          [
            ["jogos", "Jogos"],
            ["comparar", "Comparar fontes"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-all",
              view === v ? "bg-surface text-ink-950 shadow-[var(--shadow-soft)]" : "text-ink-500 hover:text-ink-700",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {view === "comparar" ? (
        <CompareView competitionId={id ?? null} />
      ) : isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : total === 0 ? (
        <EmptyState
          title="Nenhum jogo ainda"
          description={
            comp?.provider && comp.provider !== "manual"
              ? "Sincronize para puxar os jogos da API."
              : "Esta competição ainda não tem jogos."
          }
          action={
            comp?.provider && comp.provider !== "manual" ? (
              <Button loading={sync.isPending} onClick={handleSync}>
                <RefreshCw className="size-4" /> Sincronizar agora
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2.5">
          {(() => {
            // Acordeão: só o dia de HOJE aberto por padrão (ou o próximo dia com
            // jogo, se não houver jogo hoje). Os outros começam recolhidos.
            const todayKey = dayjs().format("YYYY-MM-DD");
            const keys = groups.map(([k]) => k);
            const openKey = keys.includes(todayKey)
              ? todayKey
              : (keys.find((k) => k >= todayKey) ?? keys[keys.length - 1]);
            return groups.map(([key, list]) => (
              <DaySection key={key} list={list} defaultOpen={key === openKey} />
            ));
          })()}
        </div>
      )}
    </Page>
  );
}

// Seção de um dia, recolhível (acordeão). Mostra contagem e badge de "ao vivo".
function DaySection({ list, defaultOpen }: { list: AdminMatch[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const liveCount = list.filter((m) => m.status === "live").length;
  return (
    <section className="overflow-hidden rounded-lg ring-1 ring-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 bg-surface-2 px-3 py-2.5 text-left"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-ink-400" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-ink-400" />
        )}
        <span className="text-sm font-bold text-ink-800">
          {formatDayLabel(list[0]?.kickoff_at ?? null)}
        </span>
        <span className="text-xs text-ink-400">· {list.length} jogo{list.length === 1 ? "" : "s"}</span>
        {liveCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-pill bg-flame-600 px-2 py-0.5 text-[11px] font-bold text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-flame-500" /> {liveCount} ao vivo
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 p-2">
          {list.map((m) => (
            <AdminMatchRow key={m.id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function AdminMatchRow({ match }: { match: AdminMatch }) {
  const save = useSaveMatchResult();
  const setHidden = useSetMatchHidden();
  const setKnockout = useSetMatchKnockout();
  const override = useSetMatchOverride();
  const reopen = useReopenMatch();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState(match.home_score?.toString() ?? "");
  const [away, setAway] = useState(match.away_score?.toString() ?? "");
  const [status, setStatus] = useState<MatchStatus>(match.status);
  // mata-mata: pênaltis + "quem avançou" ("" = automático). situação: live_phase.
  const [homePen, setHomePen] = useState(match.home_pen?.toString() ?? "");
  const [awayPen, setAwayPen] = useState(match.away_pen?.toString() ?? "");
  const [advancer, setAdvancer] = useState<string>(match.advanced_team_id ?? "");
  const [livePhase, setLivePhase] = useState<string>(match.live_phase ?? "");

  const homeName = match.home_team?.short_name || match.home_team_name || "A definir";
  const awayName = match.away_team?.short_name || match.away_team_name || "A definir";
  const pill = statusPill(match.status);
  const hasScore = match.home_score != null && match.away_score != null;
  // "é mata-mata" é automático quando há fase reconhecida (trigger deriva da stage);
  // só dá pra forçar na mão em jogo SEM fase (manual/W.O.).
  const stageLocked = !!match.stage && match.stage.trim() !== "";
  const isKnockout = match.is_knockout;

  function resetFields() {
    setHome(match.home_score?.toString() ?? "");
    setAway(match.away_score?.toString() ?? "");
    setStatus(match.status);
    setHomePen(match.home_pen?.toString() ?? "");
    setAwayPen(match.away_pen?.toString() ?? "");
    setAdvancer(match.advanced_team_id ?? "");
    setLivePhase(match.live_phase ?? "");
  }

  async function handleSave() {
    try {
      await save.mutateAsync({
        matchId: match.id,
        home: home === "" ? null : Number(home),
        away: away === "" ? null : Number(away),
        status,
        // pênaltis + quem avançou só fazem sentido no mata-mata (undefined = não toca).
        homePen: isKnockout ? (homePen === "" ? null : Number(homePen)) : undefined,
        awayPen: isKnockout ? (awayPen === "" ? null : Number(awayPen)) : undefined,
        advancedTeamId: isKnockout ? (advancer === "" ? null : advancer) : undefined,
        // situação só existe ao vivo; em qualquer outro status, limpa.
        livePhase: status === "live" ? (livePhase === "" ? null : livePhase) : null,
      });
      toast("Resultado salvo.", "success");
      setEditing(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu pra salvar agora. Tenta de novo?", "error");
    }
  }

  async function toggleKnockout() {
    try {
      await setKnockout.mutateAsync({ matchId: match.id, isKnockout: !match.is_knockout });
      toast(match.is_knockout ? "Não é mais mata-mata." : "Marcado como mata-mata.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu agora. Tenta de novo?", "error");
    }
  }

  // Trava contra a API: "soft"/"hard" gravam os valores do editor + travam;
  // "off" só destrava. Pênaltis só entram no mata-mata.
  async function applyOverride(mode: "soft" | "hard" | "off") {
    try {
      await override.mutateAsync(
        mode === "off"
          ? { matchId: match.id, mode }
          : {
              matchId: match.id,
              mode,
              home: home === "" ? null : Number(home),
              away: away === "" ? null : Number(away),
              homePen: isKnockout ? (homePen === "" ? null : Number(homePen)) : undefined,
              awayPen: isKnockout ? (awayPen === "" ? null : Number(awayPen)) : undefined,
              status,
            },
      );
      toast(
        mode === "off"
          ? "Destravado — a API volta a atualizar."
          : mode === "soft"
            ? "Placar adiantado. A API libera quando trouxer o mesmo."
            : "Placar travado contra a API.",
        "success",
      );
      setEditing(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu agora. Tenta de novo?", "error");
    }
  }

  async function toggleHidden() {
    try {
      await setHidden.mutateAsync({ matchId: match.id, hidden: !match.hidden });
      toast(match.hidden ? "Jogo visível de novo." : "Jogo ocultado do bolão.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu agora. Tenta de novo?", "error");
    }
  }

  return (
    <Card className={cn("p-3", match.hidden && "opacity-60")}>
      <div className="flex items-center gap-3">
        {/* placar / horário no centro de um confronto */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <TeamBadge url={match.home_team?.crest_url} />
          <span className="min-w-0 flex-1 truncate text-right text-sm font-semibold text-ink-900">
            {homeName}
          </span>
          <span className="shrink-0 px-1 text-center font-bold tabular-nums text-ink-900">
            {hasScore ? `${match.home_score} – ${match.away_score}` : formatTime(match.kickoff_at)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">
            {awayName}
          </span>
          <TeamBadge url={match.away_team?.crest_url} />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <Badge tone={pill.tone} className={cn(match.status === "live" && "animate-pulse")}>
          {pill.label}
        </Badge>
        {match.hidden && <Badge tone="neutral">oculto</Badge>}
        <span className="ml-auto" />
        <Button size="sm" variant="ghost" onClick={toggleHidden} loading={setHidden.isPending}>
          {match.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          {match.hidden ? "Mostrar" : "Ocultar"}
        </Button>
        <Button size="sm" variant={editing ? "secondary" : "ghost"} onClick={() => setEditing((v) => !v)}>
          <Pencil className="size-4" /> {editing ? "Fechar" : "Editar"}
        </Button>
      </div>

      {editing && (
        <div className="mt-3 space-y-3 rounded-md bg-ink-50 p-3">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-ink-800">
            <span className="flex-1 truncate text-right">{homeName}</span>
            <input
              type="number"
              inputMode="numeric"
              value={home}
              onChange={(e) => setHome(e.target.value)}
              className="size-11 rounded-md border border-ink-200 bg-surface text-center font-bold outline-none focus:border-brand-500"
            />
            <span className="text-ink-300">×</span>
            <input
              type="number"
              inputMode="numeric"
              value={away}
              onChange={(e) => setAway(e.target.value)}
              className="size-11 rounded-md border border-ink-200 bg-surface text-center font-bold outline-none focus:border-brand-500"
            />
            <span className="flex-1 truncate">{awayName}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setStatus(o.value)}
                className={cn(
                  "rounded-pill px-3 py-1.5 text-xs font-semibold transition",
                  status === o.value
                    ? "bg-brand-600 text-white"
                    : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          {/* Situação ao vivo (live_phase): só quando o status escolhido é "Ao vivo". */}
          {status === "live" && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-ink-600">Situação (ao vivo)</p>
              <div className="flex flex-wrap gap-1.5">
                {LIVE_PHASE_OPTS.map((o) => (
                  <button
                    key={o.value || "none"}
                    type="button"
                    onClick={() => setLivePhase(o.value)}
                    className={cn(
                      "rounded-pill px-3 py-1.5 text-xs font-semibold transition",
                      livePhase === o.value
                        ? "bg-brand-600 text-white"
                        : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {!match.manual_lock && (
                <p className="text-[11px] leading-snug text-ink-400">
                  Enquanto o jogo não estiver <strong>travado</strong>, a API pode sobrescrever a
                  situação no próximo sync.
                </p>
              )}
            </div>
          )}

          {/* Mata-mata: é-mata-mata + pênaltis + quem avançou. Escondido p/ jogo de
              fase reconhecida que NÃO é mata-mata (ex.: fase de grupos). */}
          {(isKnockout || !stageLocked) && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-ink-700">
                <Swords className="size-3.5" /> Mata-mata
              </div>
              {stageLocked ? (
                <p className="text-[11px] leading-snug text-ink-500">
                  {isKnockout ? "É mata-mata" : "Não é mata-mata"} — automático pela fase{" "}
                  <span className="font-semibold">{match.stage}</span>.
                </p>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-ink-600">É mata-mata? (jogo sem fase)</span>
                  <Button
                    size="sm"
                    variant={isKnockout ? "secondary" : "ghost"}
                    loading={setKnockout.isPending}
                    onClick={toggleKnockout}
                    aria-pressed={isKnockout}
                  >
                    {isKnockout ? "Sim" : "Não"}
                  </Button>
                </div>
              )}
              {isKnockout && (
                <>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <span className="flex-1 truncate text-right text-xs text-ink-600">pên. {homeName}</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={homePen}
                      onChange={(e) => setHomePen(e.target.value)}
                      aria-label={`Pênaltis ${homeName}`}
                      className="size-10 rounded-md border border-ink-200 bg-surface text-center font-bold outline-none focus:border-brand-500"
                    />
                    <span className="text-ink-300">×</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      value={awayPen}
                      onChange={(e) => setAwayPen(e.target.value)}
                      aria-label={`Pênaltis ${awayName}`}
                      className="size-10 rounded-md border border-ink-200 bg-surface text-center font-bold outline-none focus:border-brand-500"
                    />
                    <span className="flex-1 truncate text-xs text-ink-600">{awayName}</span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-ink-600">Quem avançou</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { v: "", label: "Automático" },
                        ...(match.home_team_id ? [{ v: match.home_team_id, label: homeName }] : []),
                        ...(match.away_team_id ? [{ v: match.away_team_id, label: awayName }] : []),
                      ].map((o) => (
                        <button
                          key={o.v || "auto"}
                          type="button"
                          onClick={() => setAdvancer(o.v)}
                          aria-pressed={advancer === o.v}
                          className={cn(
                            "rounded-pill px-3 py-1.5 text-xs font-semibold transition",
                            advancer === o.v
                              ? "bg-brand-600 text-white"
                              : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-[11px] leading-snug text-ink-400">
                      Automático = pelo placar e pênaltis. Defina um time só p/ W.O. ou erro da fonte.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Trava contra a API (sync): adiantar (segura até a API alcançar) ou
              travar de vez. Grava os valores do editor junto. */}
          <div className="space-y-2 rounded-md border border-border bg-surface p-2.5">
            <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold text-ink-700">
              <Lock className="size-3.5" /> Trava contra a API
              {match.manual_lock && match.soft_lock && <Badge tone="gold">adiantado</Badge>}
              {match.manual_lock && !match.soft_lock && <Badge tone="gold">travado</Badge>}
              {match.frozen && <Badge tone="neutral">congelado</Badge>}
            </div>
            <p className="text-[11px] leading-snug text-ink-400">
              <strong>Adiantar</strong>: crava o placar agora e a API segue — libera sozinho quando ela
              trouxer o mesmo. <strong>Travar</strong>: fixa placar e pênaltis contra qualquer update.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" loading={override.isPending} onClick={() => applyOverride("soft")}>
                <Clock className="size-4" /> Adiantar
              </Button>
              <Button size="sm" variant="outline" loading={override.isPending} onClick={() => applyOverride("hard")}>
                <Lock className="size-4" /> Travar
              </Button>
              {match.manual_lock && (
                <Button size="sm" variant="ghost" loading={override.isPending} onClick={() => applyOverride("off")}>
                  <Unlock className="size-4" /> Destravar
                </Button>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                resetFields();
              }}
            >
              <X className="size-4" /> Cancelar
            </Button>
            <Button size="sm" fullWidth loading={save.isPending} onClick={handleSave}>
              <Check className="size-4" /> Salvar resultado
            </Button>
          </div>

          {/* Reabrir palpites: emergência (jogo adiado). Empurra o kickoff 15 min
              pra frente, destravando os palpites. */}
          <button
            type="button"
            disabled={reopen.isPending}
            onClick={() =>
              reopen.mutate(
                { matchId: match.id, minutes: 15 },
                {
                  onSuccess: () => toast("Palpites reabertos por 15 min.", "success"),
                  onError: (e) => toast(e instanceof Error ? e.message : "Não deu pra reabrir agora. Tenta de novo?", "error"),
                },
              )
            }
            className="flex w-full items-center justify-center gap-1.5 text-xs font-medium text-ink-400 underline-offset-2 hover:text-ink-600 hover:underline disabled:opacity-50"
          >
            <Clock className="size-3.5" /> Reabrir palpites por 15 min (jogo adiado)
          </button>
        </div>
      )}
    </Card>
  );
}

// ===========================================================================
// Comparar fontes — todos os jogos com o que CADA API reportou, lado a lado.
// ===========================================================================
function CompareView({ competitionId }: { competitionId: string | null }) {
  const { data, isLoading } = useMatchSourcesForCompetition(competitionId);

  // MESMA estrutura/ordenação da aba Jogos: agrupa por dia ASC e acordeão.
  const groups = useMemo(() => {
    const map = new Map<string, MatchWithSources[]>();
    for (const m of data ?? []) {
      const k = dayKey(m.kickoff_at);
      const arr = map.get(k);
      if (arr) arr.push(m);
      else map.set(k, [m]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [data]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="Sem jogos pra comparar"
        description="Sincronize a competição pra trazer os jogos e o que cada fonte reporta."
      />
    );
  }

  // Acordeão: só o dia de HOJE aberto (ou o próximo com jogo) — igual a Jogos.
  const todayKey = dayjs().format("YYYY-MM-DD");
  const keys = groups.map(([k]) => k);
  const openKey = keys.includes(todayKey)
    ? todayKey
    : (keys.find((k) => k >= todayKey) ?? keys[keys.length - 1]);

  return (
    <div className="space-y-2.5">
      <p className="px-1 text-xs leading-snug text-ink-500">
        Cada cartão mostra o placar final + o que <strong>cada fonte</strong> reportou. Divergências
        ficam em vermelho; fonte sem placar é ignorada. No celular, arraste as fontes pro lado.
      </p>
      {groups.map(([key, list]) => (
        <CompareDaySection key={key} list={list} defaultOpen={key === openKey} />
      ))}
    </div>
  );
}

// Seção de um dia, recolhível — espelha DaySection (mesma cara/ordenação) p/ comparar fontes.
function CompareDaySection({ list, defaultOpen }: { list: MatchWithSources[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const liveCount = list.filter((m) => m.status === "live").length;
  return (
    <section className="overflow-hidden rounded-lg ring-1 ring-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 bg-surface-2 px-3 py-2.5 text-left"
      >
        {open ? (
          <ChevronDown className="size-4 shrink-0 text-ink-400" />
        ) : (
          <ChevronRight className="size-4 shrink-0 text-ink-400" />
        )}
        <span className="text-sm font-bold text-ink-800">{formatDayLabel(list[0]?.kickoff_at ?? null)}</span>
        <span className="text-xs text-ink-400">· {list.length} jogo{list.length === 1 ? "" : "s"}</span>
        {liveCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-pill bg-flame-600 px-2 py-0.5 text-[11px] font-bold text-white">
            <span className="size-1.5 animate-pulse rounded-full bg-flame-500" /> {liveCount} ao vivo
          </span>
        )}
      </button>
      {open && (
        <div className="space-y-2 p-2">
          {list.map((m) => (
            <CompareRow key={m.id} match={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function CompareRow({ match }: { match: MatchWithSources }) {
  const { toast } = useToast();
  const override = useOverrideMatch();
  const lock = useSetMatchLock();
  const unfreeze = useUnfreezeMatch();
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState(match.home_score?.toString() ?? "");
  const [away, setAway] = useState(match.away_score?.toString() ?? "");
  const [status, setStatus] = useState<MatchStatus>((match.status as MatchStatus) ?? "scheduled");

  const finalHas = match.home_score != null && match.away_score != null;
  const finalLabel = finalHas ? `${match.home_score} – ${match.away_score}` : "—";

  async function saveOverride() {
    try {
      await override.mutateAsync({
        matchId: match.id,
        home: home === "" ? 0 : Number(home),
        away: away === "" ? 0 : Number(away),
        status,
        lock: true,
      });
      toast("Placar definido e travado contra a API.", "success");
      setEditing(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Não deu pra salvar agora. Tenta de novo?", "error");
    }
  }

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-900">
          {match.home_team_name} <span className="text-ink-400">x</span> {match.away_team_name}
        </span>
        <span className="shrink-0 text-xs text-ink-400">{formatTime(match.kickoff_at)}</span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className="rounded bg-ink-100 px-2 py-0.5 text-sm font-bold tabular-nums text-ink-900">
          final {finalLabel}
        </span>
        {match.score_conflict && (
          <Badge tone="flame" className="gap-1">
            <AlertTriangle className="size-3" /> divergente
          </Badge>
        )}
        {match.frozen && (
          <Badge tone="neutral" className="gap-1">
            <Snowflake className="size-3" /> congelado
          </Badge>
        )}
        {match.manual_lock && (
          <Badge tone="gold" className="gap-1">
            <Lock className="size-3" /> travado
          </Badge>
        )}
        <span className="text-[11px] text-ink-400">{match.score_sources_count} fonte(s)</span>
      </div>

      {/* fontes lado a lado (scroll horizontal = swipe no mobile) */}
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {match.sources.length === 0 ? (
          <span className="text-xs text-ink-400">Nenhuma fonte reportou ainda.</span>
        ) : (
          match.sources.map((s) => {
            // fonte sem placar é IGNORADA (não conta como divergência) — pedido do João
            const hasScore = s.home != null && s.away != null;
            const diverges = finalHas && hasScore && (s.home !== match.home_score || s.away !== match.away_score);
            return (
              <div
                key={s.provider}
                className={cn(
                  "min-w-[116px] shrink-0 rounded-md border p-2",
                  diverges ? "border-flame-400 bg-flame-50" : "border-border",
                )}
              >
                <p className="truncate text-[11px] font-semibold text-ink-600">{cmpProv(s.provider)}</p>
                <p className={cn("text-sm font-bold tabular-nums", diverges ? "text-flame-700" : "text-ink-900")}>
                  {s.home != null && s.away != null ? `${s.home} – ${s.away}` : "—"}
                </p>
                <p className="truncate text-[11px] text-ink-400">
                  {s.status ?? "—"}
                  {s.fetched_at ? ` · ${fromNow(s.fetched_at)}` : ""}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* ações */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant={editing ? "secondary" : "ghost"} onClick={() => setEditing((v) => !v)}>
          <Pencil className="size-4" /> {editing ? "Fechar" : "Definir placar"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          loading={lock.isPending}
          onClick={() =>
            lock.mutate(
              { matchId: match.id, locked: !match.manual_lock },
              {
                onSuccess: () =>
                  toast(match.manual_lock ? "Destravado (a API volta a atualizar)." : "Travado contra a API.", "info"),
              },
            )
          }
        >
          {match.manual_lock ? <Unlock className="size-4" /> : <Lock className="size-4" />}
          {match.manual_lock ? "Destravar" : "Travar"}
        </Button>
        {match.frozen && (
          <Button
            size="sm"
            variant="ghost"
            loading={unfreeze.isPending}
            onClick={() => unfreeze.mutate(match.id, { onSuccess: () => toast("Descongelado.", "info") })}
          >
            <Snowflake className="size-4" /> Descongelar
          </Button>
        )}
      </div>

      {editing && (
        <div className="mt-2 space-y-2 rounded-md bg-ink-50 p-3">
          <div className="flex items-center justify-center gap-2 text-sm font-semibold text-ink-800">
            <span className="flex-1 truncate text-right">{match.home_team_name}</span>
            <input
              type="number"
              inputMode="numeric"
              value={home}
              onChange={(e) => setHome(e.target.value)}
              className="size-11 rounded-md border border-ink-200 bg-surface text-center font-bold outline-none focus:border-brand-500"
            />
            <span className="text-ink-300">×</span>
            <input
              type="number"
              inputMode="numeric"
              value={away}
              onChange={(e) => setAway(e.target.value)}
              className="size-11 rounded-md border border-ink-200 bg-surface text-center font-bold outline-none focus:border-brand-500"
            />
            <span className="flex-1 truncate">{match.away_team_name}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => setStatus(o.value)}
                className={cn(
                  "rounded-pill px-3 py-1.5 text-xs font-semibold transition",
                  status === o.value ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-ink-400">
            Definir aqui <strong>trava</strong> o jogo contra a API (sua decisão vence a fonte).
          </p>
          <Button size="sm" fullWidth loading={override.isPending} onClick={saveOverride}>
            <Check className="size-4" /> Salvar e travar
          </Button>
        </div>
      )}
    </Card>
  );
}
