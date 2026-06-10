import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { useRetroLeaderboard, type RetroMode } from "./api";
import { fmtMs } from "./share";

// Ranking da Copa do Dia (fase alcançada → pontos → tempo). Só entra quem jogou
// logado no ritmo Resultadista — a comparação de tempo precisa ser justa.
export function RetroLeaderboard() {
  const [mode, setMode] = useState<RetroMode>("acerto");
  const { data, isLoading } = useRetroLeaderboard(mode);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-bold">Ranking da Copa do Dia</h3>
        <SegmentedControl<RetroMode>
          options={[
            { value: "acerto", label: "Acerto" },
            { value: "cravada", label: "Na Crava" },
          ]}
          value={mode}
          onChange={setMode}
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <EmptyState
          title="Ninguém no ranking ainda"
          description="A Copa do Dia ranqueia quem joga logado no ritmo Resultadista. Seja a primeira pessoa!"
        />
      ) : (
        <ol className="divide-y divide-border">
          {data.rows.map((r) => (
            <li
              key={r.pos}
              className={cn(
                "flex items-center gap-3 py-2 text-sm",
                r.is_me && "rounded-md bg-brand-500/10 px-2 font-semibold",
              )}
            >
              <span className="w-6 text-right font-bold tabular-nums text-ink-500">{r.pos}º</span>
              <span className="min-w-0 flex-1 truncate">{r.display_name}</span>
              <span className="hidden text-xs text-ink-500 sm:block">{r.stage_reached}</span>
              <span className="font-bold tabular-nums">{r.points} pts</span>
              <span className="w-12 text-right text-xs tabular-nums text-ink-500">{fmtMs(r.total_ms)}</span>
            </li>
          ))}
        </ol>
      )}

      {data?.me && !data.rows.some((r) => r.is_me) && (
        <p className="text-center text-xs text-ink-500">
          Você: {data.me.pos}º · {data.me.stage_reached} · {data.me.points} pts
        </p>
      )}
    </Card>
  );
}
