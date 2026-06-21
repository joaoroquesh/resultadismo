import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { LEVEL_EMOJI, LEVEL_LABEL, useRetroLeaderboard, type RetroLevel, type RetroScope } from "./api";
import { fmtMs } from "./share";

// Ranking da Seleção do Dia (fase alcançada → pontos → tempo). Só entra quem jogou
// logado no ritmo Resultadista — a comparação de tempo precisa ser justa.
// No Jogo livre, o ranking é POR MODO (Amistoso/Clássico/Lenda) — sem misturar.
// Logado pode ver SÓ os amigos (grafo dos grupos) + a própria vizinhança.
export function RetroLeaderboard() {
  const { user } = useAuth();
  const [level, setLevel] = useState<RetroLevel>("classico");
  const [board, setBoard] = useState<"daily" | "treino">("daily");
  const [scope, setScope] = useState<RetroScope>("global");
  const { data, isLoading } = useRetroLeaderboard(level, board, scope);
  // só mostra a vizinhança quando o jogador está FORA do top exibido
  const meOutsideTop = data?.me && !data.rows.some((r) => r.is_me);

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
          <SegmentedControl<RetroLevel>
            className="w-full"
            options={(["amistoso", "classico", "lenda"] as const).map((l) => ({
              value: l,
              label: `${LEVEL_LABEL[l]} ${LEVEL_EMOJI[l]}`,
            }))}
            value={level}
            onChange={setLevel}
          />
        )}
        {user && (
          <SegmentedControl<RetroScope>
            className="w-full"
            options={[
              { value: "global", label: "🌎 Todos" },
              { value: "amigos", label: "👥 Meus grupos" },
            ]}
            value={scope}
            onChange={setScope}
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
              : `O modo ${LEVEL_LABEL[level]} ranqueia a MELHOR campanha de cada um (logado). Bora abrir o placar!`
          }
        />
      ) : (
        <ol className="divide-y divide-border">
          {data.rows.map((r) => (
            <li
              key={r.pos}
              className={cn(
                "flex items-center gap-3 py-2 text-sm",
                // 1º lugar = destaque inversível (ink-950/ink-50 viram o par tema↔escuro):
                // no tema claro → faixa escura + texto claro; no escuro → faixa clara + texto escuro.
                r.pos === 1
                  ? "rounded-md bg-ink-950 px-2 text-ink-50"
                  : r.is_me
                    ? "rounded-md bg-brand-500/10 px-2 font-semibold"
                    : "",
              )}
            >
              <span className="w-6 text-right font-bold tabular-nums text-ink-500">
                {r.pos === 1 ? "👑" : `${r.pos}º`}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{r.display_name}</span>
                <span className={cn("block text-[11px]", r.pos === 1 ? "text-ink-300" : "text-ink-400")}>
                  {r.points} pts · {fmtMs(r.total_ms)}
                </span>
              </span>
              <span className={cn("shrink-0 text-right text-sm font-bold", r.pos === 1 ? "text-ink-50" : "text-brand-800")}>
                {r.stage_reached}
              </span>
            </li>
          ))}
        </ol>
      )}

      {data && data.rows.length > 0 && (
        <p className="text-center text-[11px] leading-snug text-ink-400">
          Lidera quem <b>chega mais longe</b>. Empatou na fase? Decidem os <b>pontos</b>; depois, o <b>tempo</b>.
        </p>
      )}
      {/* sua vizinhança: 2 acima / 2 abaixo + quantos pts faltam pro de cima */}
      {meOutsideTop && data?.me_window && data.me_window.length > 0 && (
        <div className="space-y-1 border-t border-border pt-2">
          <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-ink-400">
            Você por aqui
          </p>
          <ol className="divide-y divide-border">
            {data.me_window.map((r, i) => {
              const above = data.me_window![i - 1];
              const gap = r.is_me && above ? above.points - r.points : null;
              return (
                <li
                  key={r.pos}
                  className={cn(
                    "flex items-center gap-3 py-1.5 text-sm",
                    r.is_me && "rounded-md bg-brand-500/10 px-2 font-semibold",
                  )}
                >
                  <span className="w-6 text-right font-bold tabular-nums text-ink-500">{r.pos}º</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.display_name}
                    {gap != null && gap > 0 && (
                      <span className="ml-1 text-[11px] font-normal text-flame-600">
                        (faltam {gap} pt{gap > 1 ? "s" : ""} pro {r.pos - 1}º)
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-xs font-bold text-brand-800">{r.stage_reached}</span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Card>
  );
}
