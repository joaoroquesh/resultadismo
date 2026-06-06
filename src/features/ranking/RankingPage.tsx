import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Trophy, Filter, Globe2 } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useCompetitions } from "@/features/matches/api";
import { useGlobalStandings, useMyGlobalRank, type RTBRow } from "./api";

// "Resultadismo The Best" — classificação global de todos os Resultadistas.
// Default: nenhum filtro (tudo somado). Filtros: competição, ano.
export function RankingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: competitions } = useCompetitions();
  const [competitionId, setCompetitionId] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);

  const filter = useMemo(
    () => ({ competitionId, year, teamId: null }),
    [competitionId, year],
  );
  const { data: rows, isLoading } = useGlobalStandings(filter, 50);
  const { data: myRank } = useMyGlobalRank({ competitionId, year });

  const compName = competitionId
    ? competitions?.find((c) => c.id === competitionId)?.display_name ??
      competitions?.find((c) => c.id === competitionId)?.name ??
      "—"
    : "Tudo somado";

  return (
    <Page
      title="Resultadismo The Best"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      {/* Headline + posição do user (se logado e ranqueado) */}
      <Card className="mb-4 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-600">
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
                pra entrar no ranking.
              </p>
            ) : myRank ? (
              <p className="mt-1 text-sm leading-snug text-ink-700">
                Você é o{" "}
                <span className="font-extrabold text-ink-950 tabular-nums">{myRank.rank}º</span>{" "}
                Resultadista <span className="text-ink-500">·</span>{" "}
                <span className="font-bold tabular-nums">{myRank.pontos} pts</span> em{" "}
                <span className="font-bold tabular-nums">{myRank.jogos}</span>{" "}
                {myRank.jogos === 1 ? "jogo" : "jogos"}{" "}
                <span className="text-ink-400">
                  · de {myRank.total_resultadistas} no recorte
                </span>
              </p>
            ) : (
              <p className="mt-1 text-sm text-ink-600">
                Sem palpites pontuados nesse recorte ainda — faça seu palpite e entre na disputa.
              </p>
            )}
          </div>
        </div>
      </Card>

      {/* Filtros — minimalistas */}
      <Card className="mb-4 space-y-3 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">
          <Filter className="size-3.5" /> Recorte
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-medium text-ink-500">Campeonato</span>
            <select
              value={competitionId ?? ""}
              onChange={(e) => setCompetitionId(e.target.value || null)}
              className="h-10 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Tudo somado</option>
              {competitions?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.display_name ?? c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1.5 block text-xs font-medium text-ink-500">Ano</span>
            <select
              value={year ?? ""}
              onChange={(e) => setYear(e.target.value ? Number(e.target.value) : null)}
              className="h-10 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Todos os anos</option>
              <option value="2026">2026</option>
              <option value="2025">2025</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-ink-400">Mostrando: {compName}{year ? ` · ${year}` : ""}</p>
      </Card>

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
          <p className="mt-2 text-sm text-ink-500">
            Sem Resultadistas pontuados nesse recorte ainda.
          </p>
        </Card>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <RankRow key={r.user_id} row={r} isMe={r.user_id === user?.id} />
          ))}
        </div>
      )}
    </Page>
  );
}

function RankRow({ row, isMe }: { row: RTBRow; isMe: boolean }) {
  const medal =
    row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : null;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg bg-surface p-3 ring-1 ring-border transition-colors",
        isMe && "bg-brand-500/8 ring-brand-300",
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
        <p className="text-xs text-ink-500">
          <span className="font-medium">{row.cravadas}</span> cravadas ·{" "}
          <span className="font-medium">{row.jogos}</span>{" "}
          {row.jogos === 1 ? "jogo" : "jogos"}
        </p>
      </div>
      <div className="text-right tabular-nums">
        <p className="text-base font-extrabold text-ink-950">{row.pontos}</p>
        <p className="text-[10px] uppercase tracking-wide text-ink-400">pts</p>
      </div>
    </div>
  );
}
