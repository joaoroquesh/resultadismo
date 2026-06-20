import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useRefundLeague, usePaymentSettings } from "@/features/payments/api";

const REFUND_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Reembolso self-service (direito de arrependimento — CDC art. 49).
 * Aparece só para o DONO, com grupo pago e dentro de 7 dias do pagamento.
 * Cancela o grupo e devolve o valor (Pix na conta / estorno no cartão).
 *
 * Componente isolado de propósito: o `LigaDetailPage` só o importa e renderiza
 * (footprint mínimo, evita colisão com outras sessões que editam aquela tela).
 */
export function RefundFederationButton({
  leagueId,
  paymentStatus,
  approvedAt,
}: {
  leagueId: string;
  paymentStatus?: string | null;
  approvedAt?: string | null;
}) {
  const refund = useRefundLeague();
  const { data: settings } = usePaymentSettings();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  // Captura o "agora" na montagem (a janela de reembolso é de DIAS — não precisa
  // ticar). Evita Date.now() no corpo do render (regra react-hooks/purity).
  const [now] = useState(() => Date.now());

  // Pagamento desligado (ADR 0002): a infra de reembolso fica DORMENTE — não aparece.
  // (Volta sozinha se a cobrança for reativada — modo 'test'/'live'.)
  if ((settings?.payment_mode ?? "disabled") === "disabled") return null;
  // Só grupo pago e dentro da janela de 7 dias.
  if (paymentStatus !== "paid" || !approvedAt) return null;
  const daysSince = (now - new Date(approvedAt).getTime()) / DAY_MS;
  if (!(daysSince >= 0 && daysSince <= REFUND_WINDOW_DAYS)) return null;
  const daysLeft = Math.max(1, Math.ceil(REFUND_WINDOW_DAYS - daysSince));

  function handleRefund() {
    refund.mutate(leagueId, {
      onSuccess: () => {
        toast(
          "Reembolso solicitado. O grupo foi cancelado e o valor será devolvido.",
          "success",
        );
        navigate("/grupos");
      },
      onError: (e) => {
        toast(e instanceof Error ? e.message : "Não foi possível processar o reembolso.", "error");
        setOpen(false);
      },
    });
  }

  return (
    <>
      <div className="mt-6 rounded-md border border-border bg-surface p-3">
        <p className="text-xs leading-relaxed text-ink-500">
          Criou sem querer ou se arrependeu? Você tem{" "}
          <strong className="text-ink-700">
            {daysLeft} {daysLeft === 1 ? "dia" : "dias"}
          </strong>{" "}
          (7 dias a partir do pagamento) para cancelar o grupo e receber o valor de volta.
        </p>
        <Button variant="ghost" className="mt-1.5 text-flame-600" onClick={() => setOpen(true)}>
          <RotateCcw className="size-4" /> Cancelar e reembolsar
        </Button>
      </div>

      <ConfirmDialog
        open={open}
        title="Cancelar grupo e reembolsar?"
        message="Você vai cancelar este grupo e receber o valor pago de volta: no Pix, cai na sua conta; no cartão, é estornado na fatura em alguns dias. O grupo será arquivado e os membros perdem o acesso."
        step2Message="Confirmação final: cancelar o grupo e pedir o reembolso?"
        confirmLabel="Cancelar e reembolsar"
        loading={refund.isPending}
        onConfirm={handleRefund}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
