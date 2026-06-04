import { useEffect, useState } from "react";
import { Dices, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  useConfrontoTies,
  useUndoDraw,
  useAdvanceSwiss,
  useAdvanceCup,
  type ConfrontoFormato,
  type ConfrontoTie,
} from "./api";
import { LigaTable, ConfrontoRounds, CopaBracket, MyConfrontoCard, TieDetailModal } from "./ConfrontoViews";

/* -------------------- Sorteada: visões -------------------- */
export function DrawnView({
  lcId,
  leagueId,
  competitionId,
  formato,
  ligaFormat = "partial",
  isAdmin,
  currentUserId,
}: {
  lcId: string;
  leagueId: string;
  competitionId: string;
  formato: ConfrontoFormato;
  ligaFormat?: string;
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const { toast } = useToast();
  const { data: ties, isLoading } = useConfrontoTies(lcId);
  const undo = useUndoDraw();
  const advance = useAdvanceSwiss();
  const advanceCup = useAdvanceCup();
  const [openTie, setOpenTie] = useState<ConfrontoTie | null>(null);
  const [tab, setTab] = useState<"tabela" | "rodadas">("tabela");

  // Copa: ao abrir o chaveamento (e quando os resultados mudam), promove os
  // vencedores p/ a próxima fase. Idempotente — converge (só invalida se mexeu).
  useEffect(() => {
    if (formato === "cup" && (ties?.length ?? 0) > 0) {
      advanceCup.mutate({ lcId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formato, lcId, ties]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const list = ties ?? [];
  const started = list.some((t) => t.resolved);
  const isSwiss = formato === "liga" && ligaFormat === "swiss";
  const maxRound = list.length ? Math.max(...list.map((t) => t.round_order)) : 0;
  const latestResolved =
    maxRound > 0 && list.filter((t) => t.round_order === maxRound).every((t) => t.resolved);
  const canAdvance = isSwiss && isAdmin && latestResolved;

  return (
    <div className="space-y-4">
      <MyConfrontoCard ties={list} currentUserId={currentUserId} onOpen={setOpenTie} />

      {canAdvance && (
        <Button
          variant="outline"
          fullWidth
          loading={advance.isPending}
          onClick={() =>
            advance.mutate(
              { lcId, competitionId },
              {
                onSuccess: (r) =>
                  toast(
                    r.created > 0
                      ? `Rodada ${r.round} gerada por classificação!`
                      : "Sem próxima rodada agora (suíço completo ou rodada em andamento).",
                    r.created > 0 ? "success" : "info",
                  ),
                onError: (e) => toast(e instanceof Error ? e.message : "Erro ao gerar rodada.", "error"),
              },
            )
          }
        >
          <Dices className="size-4" /> Gerar próxima rodada (suíço)
        </Button>
      )}

      {formato === "cup" ? (
        <div>
          <h4 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
            Chaveamento
          </h4>
          <CopaBracket ties={list} currentUserId={currentUserId} onOpenTie={setOpenTie} />
        </div>
      ) : (
        <>
          <div className="inline-flex rounded-pill bg-ink-100 p-0.5 text-sm font-semibold">
            {(["tabela", "rodadas"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-pill px-3 py-1 transition-colors",
                  tab === t ? "bg-surface text-brand-700 shadow-[var(--shadow-soft)]" : "text-ink-500",
                )}
              >
                {t === "tabela" ? "Classificação" : "Rodadas"}
              </button>
            ))}
          </div>
          {tab === "tabela" ? (
            <LigaTable lcId={lcId} currentUserId={currentUserId} />
          ) : (
            <ConfrontoRounds ties={list} currentUserId={currentUserId} onOpenTie={setOpenTie} />
          )}
        </>
      )}

      {isAdmin && !started && (
        <button
          type="button"
          onClick={() =>
            undo.mutate(
              { lcId, leagueId },
              {
                onSuccess: () => toast("Sorteio desfeito. Você pode ajustar e sortear de novo.", "info"),
                onError: (e) => toast(e instanceof Error ? e.message : "Erro ao desfazer.", "error"),
              },
            )
          }
          disabled={undo.isPending}
          className="inline-flex items-center gap-1.5 px-1 py-1 text-[11px] font-semibold text-ink-400 transition-colors hover:text-flame-600 disabled:opacity-50"
        >
          <RotateCcw className={cn("size-3.5", undo.isPending && "animate-spin")} /> Desfazer sorteio
        </button>
      )}

      <TieDetailModal tie={openTie} currentUserId={currentUserId} onClose={() => setOpenTie(null)} />
    </div>
  );
}
