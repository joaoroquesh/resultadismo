import { useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, RefreshCw, Eye, EyeOff, Pencil, Check, X, ExternalLink, Clock } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { dayjs, formatDayLabel, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { MatchStatus } from "@/lib/types";
import {
  useAdminCompetitions,
  useAdminMatches,
  useSaveMatchResult,
  useSetMatchHidden,
  useSyncFootball,
  type AdminMatch,
} from "./api";
import { useReopenMatch } from "./sync";

const STATUS_OPTS: { value: MatchStatus; label: string }[] = [
  { value: "scheduled", label: "Agendado" },
  { value: "live", label: "Ao vivo" },
  { value: "finished", label: "Encerrado" },
  { value: "postponed", label: "Adiado" },
  { value: "cancelled", label: "Cancelado" },
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
      toast(e instanceof Error ? e.message : "Erro no sync.", "error");
    }
  }

  return (
    <Page
      title={compName}
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} aria-label="Voltar">
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

      {isLoading ? (
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
        <div className="space-y-5">
          {groups.map(([key, list]) => (
            <section key={key} className="space-y-2">
              <h2 className="px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
                {formatDayLabel(list[0]?.kickoff_at ?? null)}
              </h2>
              <div className="space-y-2">
                {list.map((m) => (
                  <AdminMatchRow key={m.id} match={m} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}

function AdminMatchRow({ match }: { match: AdminMatch }) {
  const save = useSaveMatchResult();
  const setHidden = useSetMatchHidden();
  const reopen = useReopenMatch();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState(match.home_score?.toString() ?? "");
  const [away, setAway] = useState(match.away_score?.toString() ?? "");
  const [status, setStatus] = useState<MatchStatus>(match.status);

  const homeName = match.home_team?.short_name || match.home_team_name || "A definir";
  const awayName = match.away_team?.short_name || match.away_team_name || "A definir";
  const pill = statusPill(match.status);
  const hasScore = match.home_score != null && match.away_score != null;

  async function handleSave() {
    try {
      await save.mutateAsync({
        matchId: match.id,
        home: home === "" ? null : Number(home),
        away: away === "" ? null : Number(away),
        status,
      });
      toast("Resultado salvo.", "success");
      setEditing(false);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao salvar.", "error");
    }
  }

  async function toggleHidden() {
    try {
      await setHidden.mutateAsync({ matchId: match.id, hidden: !match.hidden });
      toast(match.hidden ? "Jogo visível de novo." : "Jogo ocultado do bolão.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro.", "error");
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
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setHome(match.home_score?.toString() ?? "");
                setAway(match.away_score?.toString() ?? "");
                setStatus(match.status);
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
                  onError: (e) => toast(e instanceof Error ? e.message : "Erro.", "error"),
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
