import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { clearConsent, setConsent, useConsent } from "./consent";

/**
 * Modal de gerenciamento do consentimento.
 * Mostra o estado atual e permite alternar a qualquer momento — atende ao
 * direito de revogação (LGPD art. 18, IX). Quem ainda não decidiu vê os mesmos
 * dois botões e pode resolver direto por aqui (sem precisar voltar pro banner).
 */
export function ConsentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const choice = useConsent();

  const granted = choice === "granted";
  const denied = choice === "denied";

  return (
    <Modal open={open} onClose={onClose} label="Compartilhamento de dados" className="max-w-md">
      <div className="space-y-4">
        <header>
          <h2 className="text-lg font-bold text-ink-900">Compartilhamento de dados</h2>
          <p className="mt-1 text-sm text-ink-500">
            A gente usa <strong>Google Analytics</strong> para entender quais telas a galera usa
            mais e melhorar o app. IP anonimizado, sem rastreio publicitário.
          </p>
        </header>

        <div className="rounded-xl border border-border bg-surface-2 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">Agora está</p>
          <p
            className={cn(
              "mt-1 inline-flex items-center gap-1.5 text-sm font-bold",
              granted && "text-grass-600",
              denied && "text-flame-600",
              choice === null && "text-ink-700",
            )}
          >
            {granted && (
              <>
                <Check className="size-4" /> Compartilhando dados
              </>
            )}
            {denied && (
              <>
                <X className="size-4" /> Sem compartilhar dados
              </>
            )}
            {choice === null && "Você ainda não escolheu"}
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            fullWidth
            disabled={denied}
            onClick={() => {
              setConsent("denied");
              onClose();
            }}
          >
            Parar de compartilhar
          </Button>
          <Button
            fullWidth
            disabled={granted}
            onClick={() => {
              setConsent("granted");
              onClose();
            }}
          >
            Compartilhar
          </Button>
        </div>

        {choice !== null && (
          <button
            type="button"
            onClick={() => {
              clearConsent();
              onClose();
            }}
            className="block w-full text-center text-xs font-medium text-ink-400 underline-offset-2 hover:text-ink-600 hover:underline"
          >
            Resetar minha escolha
          </button>
        )}

        <p className="text-center text-xs text-ink-400">
          Detalhes na{" "}
          <Link
            to="/privacidade"
            onClick={onClose}
            className="font-semibold text-brand-600 underline-offset-2 hover:underline"
          >
            Política de Privacidade
          </Link>
          .
        </p>
      </div>
    </Modal>
  );
}

/**
 * Acionador reusável: um botão estilizado como link de rodapé que abre o
 * `ConsentDialog`. Usado no `PublicShell` (rodapé deslogado) e na
 * `PerfilPage` (rodapé do perfil logado).
 */
export function ConsentLink({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "transition-colors hover:text-ink-900",
          className,
        )}
      >
        Compartilhamento de dados
      </button>
      <ConsentDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
