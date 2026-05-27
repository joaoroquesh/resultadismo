import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";

/**
 * Diálogo de confirmação em DOIS passos (anti-engano): "Continuar" e depois a
 * confirmação final. Controlado por `open`.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  step2Message = "Confirme novamente para concluir. Esta ação é importante.",
  confirmLabel = "Confirmar",
  loading = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  step2Message?: string;
  confirmLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState(1);

  useEffect(() => {
    if (!open) setStep(1);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-ink-950/50 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onCancel}
    >
      <div
        className="animate-rise w-full max-w-sm rounded-lg bg-surface p-5 shadow-[var(--shadow-pop)] ring-1 ring-border"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-flame-500/10 text-flame-600">
            <AlertTriangle className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-ink-900">{title}</h3>
            <p className="mt-1 text-sm text-ink-500">{step === 1 ? message : step2Message}</p>
          </div>
        </div>

        <div className="mt-1 flex items-center justify-end gap-2">
          {step === 1 ? (
            <>
              <Button variant="ghost" size="sm" onClick={onCancel}>
                Cancelar
              </Button>
              <Button variant="danger" size="sm" onClick={() => setStep(2)}>
                Continuar
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)} disabled={loading}>
                Voltar
              </Button>
              <Button variant="danger" size="sm" loading={loading} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </>
          )}
        </div>

        <p className="mt-3 text-center text-[11px] text-ink-400">
          {step === 1 ? "Passo 1 de 2" : "Passo 2 de 2 · confirmação final"}
        </p>
      </div>
    </div>
  );
}
