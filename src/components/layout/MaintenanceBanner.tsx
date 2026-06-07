import { Wrench } from "lucide-react";
import { useAuth } from "@/features/auth/AuthProvider";
import { useMaintenance } from "./maintenance";

/**
 * Faixa de manutenção — agora SÓ para o admin (lembrete de que a manutenção está
 * ligada, já que ele continua usando o app normalmente). Os demais logados veem a
 * tela cheia (MaintenanceScreen), então pra eles a faixa seria redundante.
 */
export function MaintenanceBanner() {
  const { isAppAdmin } = useAuth();
  const { data } = useMaintenance();

  if (!isAppAdmin || !data?.maintenance_mode) return null;

  return (
    <div className="sticky top-0 z-[60] flex items-center justify-center gap-2 bg-gold-500 px-4 py-2 text-center text-sm font-semibold text-ink-950">
      <Wrench className="size-4 shrink-0" />
      <span>
        Manutenção LIGADA — só você (admin) vê o app.{" "}
        {data.maintenance_message
          ? `Mensagem: "${data.maintenance_message}"`
          : "Sem mensagem custom."}
      </span>
    </div>
  );
}
