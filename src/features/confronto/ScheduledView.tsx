import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Clock } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";
import { useUndoDraw, type ConfrontoFormato } from "./api";

/* -------------------- Agendado: revela no horário -------------------- */
export function ScheduledView({
  lcId,
  leagueId,
  scheduledDrawAt,
  formato,
  isAdmin,
}: {
  lcId: string;
  leagueId: string;
  scheduledDrawAt: string | null;
  formato: ConfrontoFormato;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const undo = useUndoDraw();
  const qc = useQueryClient();
  const when = scheduledDrawAt ? new Date(scheduledDrawAt) : null;

  // Gatilho lazy: se o horário já passou, revela ao abrir (o cron é o backstop).
  useEffect(() => {
    if (!when || when > new Date()) return;
    supabase.rpc("release_confronto_if_due", { p_lc_id: lcId }).then(({ data }) => {
      if (data) {
        qc.invalidateQueries({ queryKey: ["confronto-ties", lcId] });
        qc.invalidateQueries({ queryKey: ["league-competitions", leagueId] });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lcId, scheduledDrawAt]);

  return (
    <div className="rounded-lg bg-surface p-5 text-center shadow-[var(--shadow-soft)] ring-1 ring-border">
      <span className="mx-auto mb-3 grid size-12 place-items-center rounded-full bg-surface-2 text-brand-600">
        <Clock className="size-6" />
      </span>
      <p className="font-bold text-ink-950">Sorteio agendado</p>
      <p className="mx-auto mt-1 max-w-xs text-sm leading-relaxed text-ink-500">
        Os confrontos da {formato === "cup" ? "Copa" : "Liga"} serão revelados{" "}
        {when ? (
          <span className="font-semibold text-ink-700">
            {when.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </span>
        ) : (
          "em breve"
        )}
        . Os participantes já estão travados.
      </p>
      {isAdmin && (
        <button
          type="button"
          onClick={() =>
            undo.mutate(
              { lcId, leagueId },
              {
                onSuccess: () => toast("Agendamento desfeito. Você pode reconfigurar.", "info"),
                onError: (e) => toast(e instanceof Error ? e.message : "Não deu pra desfazer agora. Tenta de novo daqui a pouco.", "error"),
              },
            )
          }
          disabled={undo.isPending}
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-400 transition-colors hover:text-flame-600 disabled:opacity-50"
        >
          <RotateCcw className="size-3.5" /> Desfazer agendamento
        </button>
      )}
    </div>
  );
}
