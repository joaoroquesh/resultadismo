import { Swords, RefreshCw } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { useConfrontoStandings, useConfrontoCount, useGenerateConfrontos } from "./api";

export function ConfrontoView({
  lcId,
  leagueId,
  competitionId,
  isAdmin,
  currentUserId,
}: {
  lcId: string;
  leagueId: string;
  competitionId: string;
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const { toast } = useToast();
  const { data: rows, isLoading } = useConfrontoStandings(lcId);
  const { data: count } = useConfrontoCount(lcId);
  const generate = useGenerateConfrontos();

  const gerar = () =>
    generate.mutate(
      { lcId, leagueId, competitionId },
      {
        onSuccess: (r) => toast(`Confrontos gerados: ${r.ties} duelos em ${r.rounds} rodadas.`, "success"),
        onError: (e) => toast(e instanceof Error ? e.message : "Erro ao gerar confrontos.", "error"),
      },
    );

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  // Sem confrontos ainda
  if (!count) {
    return (
      <EmptyState
        icon={<Swords className="size-7" />}
        title="Confrontos ainda não gerados"
        description={
          isAdmin
            ? "Gere a tabela de confrontos: cada rodada, quem fizer mais pontos vence (3/1/0)."
            : "Um administrador vai gerar os confrontos desta disputa."
        }
        action={
          isAdmin ? (
            <Button loading={generate.isPending} onClick={gerar}>
              <Swords className="size-4" /> Gerar confrontos
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-2">
      <p className="px-1 text-[11px] leading-snug text-ink-400">
        Cada rodada, quem fizer mais pontos de palpite vence o confronto: vitória vale 3, empate 1.
      </p>

      <div className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
        <div className="flex items-center gap-3 border-b border-ink-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">
          <span className="w-5 text-center">#</span>
          <span className="min-w-0 flex-1">Jogador</span>
          <span className="w-9 text-center" title="Jogos">J</span>
          <span className="w-12 text-center" title="Saldo de gols (pontos a favor − contra)">SG</span>
          <span className="w-10 text-right">Pts</span>
        </div>
        <ul className="divide-y divide-ink-100">
          {(rows ?? []).map((row) => {
            const isMe = row.user_id === currentUserId;
            const sg = row.gols_pro - row.gols_contra;
            return (
              <li
                key={row.user_id}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  isMe && "bg-brand-500/10 ring-1 ring-inset ring-brand-500/30",
                )}
              >
                <span
                  className={cn(
                    "flex w-5 justify-center text-sm font-bold tabular-nums",
                    row.rank === 1 && "text-gold-600",
                    row.rank === 2 && "text-ink-400",
                    row.rank === 3 && "text-[#b08d57]",
                    row.rank > 3 && "text-ink-400",
                  )}
                >
                  {row.rank}
                </span>
                <Avatar src={row.avatar_url} name={row.display_name} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-ink-900">
                    {row.display_name}
                    {isMe && <span className="ml-1 text-xs font-medium text-brand-600">(você)</span>}
                  </span>
                  <span className="whitespace-nowrap text-[11px] text-ink-400">
                    {row.vitorias}V · {row.empates}E · {row.derrotas}D
                  </span>
                </div>
                <span className="w-9 text-center text-xs tabular-nums text-ink-500">{row.jogos}</span>
                <span
                  className={cn(
                    "w-12 text-center text-xs font-medium tabular-nums",
                    sg > 0 ? "text-grass-600" : sg < 0 ? "text-flame-600" : "text-ink-400",
                  )}
                >
                  {sg > 0 ? `+${sg}` : sg}
                </span>
                <span className="w-10 text-right text-lg font-extrabold tabular-nums text-ink-950">
                  {row.pontos}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {isAdmin && (
        <button
          type="button"
          onClick={gerar}
          disabled={generate.isPending}
          className="inline-flex items-center gap-1.5 px-1 py-1 text-[11px] font-semibold text-ink-400 transition-colors hover:text-brand-600 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3.5", generate.isPending && "animate-spin")} /> Regerar confrontos
        </button>
      )}
    </div>
  );
}
