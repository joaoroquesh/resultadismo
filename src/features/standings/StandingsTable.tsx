import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { StandingRow } from "@/lib/types";

export function StandingsTable({
  rows,
  currentUserId,
}: {
  rows: StandingRow[];
  currentUserId?: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
      <div className="flex items-center gap-3 border-b border-ink-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">
        <span className="w-6 text-center">#</span>
        <span className="flex-1">Jogador</span>
        <span className="w-10 text-center" title="Cravadas">CRA</span>
        <span className="w-10 text-center" title="Aproveitamento">%</span>
        <span className="w-12 text-right">Pts</span>
      </div>
      <ul className="divide-y divide-ink-100">
        {rows.map((row) => {
          const isMe = row.user_id === currentUserId;
          return (
            <li
              key={row.user_id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                isMe && "bg-brand-50",
              )}
            >
              <span
                className={cn(
                  "flex w-6 justify-center text-sm font-bold tabular-nums",
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
                <span className="text-[11px] text-ink-400">
                  {row.jogos} jogos · {row.cravadas}C · {row.saldos}S · {row.acertos}A
                </span>
              </div>
              <span className="w-10 text-center text-sm font-semibold tabular-nums text-gold-700">
                {row.cravadas}
              </span>
              <span className="w-10 text-center text-xs tabular-nums text-ink-500">
                {row.aproveitamento}%
              </span>
              <span className="w-12 text-right text-lg font-extrabold tabular-nums text-ink-950">
                {row.pontos}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
