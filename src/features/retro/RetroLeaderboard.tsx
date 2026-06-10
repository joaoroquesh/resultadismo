import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { useRetroLeaderboard, type RetroFormat } from "./api";
import { fmtMs } from "./share";

// Ranking da Seleção do Dia (fase alcançada → pontos → tempo). Só entra quem jogou
// logado no ritmo Resultadista — a comparação de tempo precisa ser justa.
export function RetroLeaderboard() {
  const [format, setFormat] = useState<RetroFormat>("copa");
  const [board, setBoard] = useState<"daily" | "treino">("daily");
  // a Seleção do Dia é sempre Copa; o formato só varia no Jogo livre (treino)
  const effFormat: RetroFormat = board === "daily" ? "copa" : format;
  const { data, isLoading } = useRetroLeaderboard(effFormat, board);
  const isPontos = effFormat === "pontos";

  return (
    <Card className="space-y-3 p-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold">Ranking</h3>
          <SegmentedControl<"daily" | "treino">
            className="whitespace-nowrap"
            options={[
              { value: "daily", label: "Seleção do Dia" },
              { value: "treino", label: "Jogo livre" },
            ]}
            value={board}
            onChange={setBoard}
          />
        </div>
        {board === "treino" && (
          <SegmentedControl<RetroFormat>
            className="w-full"
            options={[
              { value: "copa", label: "Copa 🏆" },
              { value: "pontos", label: "Pontos 🎯" },
            ]}
            value={format}
            onChange={setFormat}
          />
        )}
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
          description={
            board === "daily"
              ? "A Seleção do Dia ranqueia quem joga logado. Seja a primeira pessoa!"
              : "O Jogo livre ranqueia a MELHOR campanha de cada um (logado). Bora abrir o placar!"
          }
        />
      ) : (
        <ol className="divide-y divide-border">
          {data.rows.map((r) => (
            <li
              key={r.pos}
              className={cn(
                "flex items-center gap-3 py-2 text-sm",
                r.pos === 1 && "rounded-md bg-gold-50 px-2",
                r.is_me && "rounded-md bg-brand-500/10 px-2 font-semibold",
              )}
            >
              <span className="w-6 text-right font-bold tabular-nums text-ink-500">
                {r.pos === 1 ? "👑" : `${r.pos}º`}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.display_name}</span>
                <span className="block text-[11px] text-ink-400">
                  {isPontos ? fmtMs(r.total_ms) : `${r.points} pts · ${fmtMs(r.total_ms)}`}
                </span>
              </span>
              <span className="shrink-0 text-right text-sm font-bold text-brand-800">
                {isPontos ? `${r.points} pts` : r.stage_reached}
              </span>
            </li>
          ))}
        </ol>
      )}

      {data && data.rows.length > 0 && (
        <p className="text-center text-[11px] leading-snug text-ink-400">
          {isPontos ? (
            <>Lidera quem faz <b>mais pontos</b> nos 7 jogos. Empatou? Decide o <b>tempo</b>.</>
          ) : (
            <>Lidera quem <b>chega mais longe</b>. Empatou na fase? Decidem os <b>pontos</b>; depois, o <b>tempo</b>.</>
          )}
        </p>
      )}
      {data?.me && !data.rows.some((r) => r.is_me) && (
        <p className="text-center text-xs text-ink-500">
          Você: {data.me.pos}º · {data.me.stage_reached} · {data.me.points} pts
        </p>
      )}
    </Card>
  );
}
