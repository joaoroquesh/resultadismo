import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, Globe2, BarChart3 } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCompetitions } from "@/features/matches/api";
import {
  useGlobalStandings,
  useMyGlobalRank,
  useMyPlayedCompetitionIds,
  type RTBRow,
  type RTBFilter,
} from "./api";

type Metric = "pontos" | "detalhe";

// Resultadismo The Best — recorte SÓ por campeonato (tabs). "Todos" soma tudo.
// Toggle pontos × detalhe (cravadas/saldos/acertos/aproveitamento).
export function RankingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: competitions } = useCompetitions();
  // recorte: "todos" | "mine" (que eu jogo) | <competitionId>
  const [recorte, setRecorte] = useState<string>("todos");
  const [metric, setMetric] = useState<Metric>("pontos");
  const { data: playedIds } = useMyPlayedCompetitionIds();
  const hasPlayed = (playedIds?.length ?? 0) > 0;

  const filter = useMemo<RTBFilter>(() => {
    if (recorte === "mine") return { competitionIds: playedIds ?? [] };
    if (recorte === "todos") return {};
    return { competitionId: recorte };
  }, [recorte, playedIds]);

  const { data: rows, isLoading } = useGlobalStandings(filter, 50);
  const { data: myRank } = useMyGlobalRank(filter);

  return (
    <Page
      title="Resultadismo The Best"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      {/* Tabs de campeonato (recorte) */}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        <Tab active={recorte === "todos"} onClick={() => setRecorte("todos")}>
          Todos
        </Tab>
        {hasPlayed && (
          <Tab active={recorte === "mine"} onClick={() => setRecorte("mine")}>
            Que eu jogo
          </Tab>
        )}
        {competitions?.map((c) => (
          <Tab key={c.id} active={recorte === c.id} onClick={() => setRecorte(c.id)}>
            {c.display_name ?? c.name}
          </Tab>
        ))}
      </div>

      {/* Sua posição */}
      <Card className="mb-4 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-brand-600">
            <Globe2 className="size-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
              Você no ranking
            </p>
            {!user ? (
              <p className="mt-1 text-sm text-ink-600">
                <Link to="/login" className="font-semibold text-brand-700 underline">
                  Entre
                </Link>{" "}
                pra entrar na disputa.
              </p>
            ) : myRank ? (
              <p className="mt-1 text-sm leading-snug text-ink-700">
                Você é o{" "}
                <span className="font-extrabold text-ink-950 tabular-nums">{myRank.rank}º</span>{" "}
                Resultadista <span className="text-ink-300">·</span>{" "}
                <span className="font-bold tabular-nums">{myRank.pontos} pts</span>{" "}
                <span className="text-ink-400">de {myRank.total_resultadistas}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-600">
                Faça seu palpite e entre na disputa.{" "}
                <Link to="/" className="font-semibold text-brand-700 underline">
                  Ver jogos →
                </Link>
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Toggle métrica */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-ink-400">Classificação</h2>
        <button
          type="button"
          onClick={() => setMetric((m) => (m === "pontos" ? "detalhe" : "pontos"))}
          className="flex items-center gap-1.5 rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600 transition hover:bg-ink-200"
        >
          <BarChart3 className="size-3.5" />
          {metric === "pontos" ? "Ver detalhes" : "Ver pontos"}
        </button>
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <Card className="p-8 text-center">
          <Trophy className="mx-auto size-8 text-ink-300" />
          <p className="mt-2 text-sm text-ink-500">Sem Resultadistas pontuados nesse recorte ainda.</p>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <RankRow key={r.user_id} row={r} isMe={r.user_id === user?.id} metric={metric} />
          ))}
        </div>
      )}
    </Page>
  );
}

function Tab({
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
        "shrink-0 rounded-pill border px-3.5 py-1.5 text-sm font-semibold transition",
        active
          ? "border-brand-600 bg-brand-600 text-white"
          : "border-ink-200 bg-surface text-ink-600 hover:border-ink-300",
      )}
    >
      {children}
    </button>
  );
}

function RankRow({ row, isMe, metric }: { row: RTBRow; isMe: boolean; metric: Metric }) {
  const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
  const aproveitamento = row.jogos > 0 ? Math.round((row.pontos / (row.jogos * 3)) * 100) : 0;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg bg-surface p-3 ring-1 ring-border transition-colors",
        isMe && "bg-surface-2 ring-brand-600",
      )}
    >
      <span className="grid size-8 shrink-0 place-items-center text-sm font-bold tabular-nums text-ink-700">
        {medal ?? row.rank}
      </span>
      <Avatar src={row.avatar_url} name={row.display_name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink-900">
          {row.display_name || "Resultadista"}
          {isMe && (
            <Badge tone="brand" className="text-[10px]">
              você
            </Badge>
          )}
        </p>
        {metric === "detalhe" ? (
          <p className="flex flex-wrap gap-x-2.5 text-xs tabular-nums text-ink-500">
            <span><b className="text-gold-700">{row.cravadas}</b> crav</span>
            <span><b className="text-grass-700">{row.saldos}</b> saldo</span>
            <span><b className="text-aqua-700">{row.acertos}</b> acerto</span>
            <span><b className="text-ink-700">{aproveitamento}%</b> aprov</span>
          </p>
        ) : (
          <p className="text-xs text-ink-500">
            <span className="font-medium">{row.cravadas}</span> cravadas ·{" "}
            <span className="font-medium">{row.jogos}</span> {row.jogos === 1 ? "jogo" : "jogos"}
          </p>
        )}
      </div>
      <div className="text-right tabular-nums">
        <p className="text-base font-extrabold text-ink-950">
          {metric === "detalhe" ? `${aproveitamento}%` : row.pontos}
        </p>
        <p className="text-[10px] uppercase tracking-wide text-ink-400">
          {metric === "detalhe" ? "aprov" : "pts"}
        </p>
      </div>
    </div>
  );
}
