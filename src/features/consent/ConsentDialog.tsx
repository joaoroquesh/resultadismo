import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, X as XIcon } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { setConsent, useConsent, type ConsentChoice } from "./consent";

/**
 * Modal de gerenciamento do consentimento. Atende ao direito de revogação
 * (LGPD art. 18, IX) e ao princípio reitor do projeto: clareza máxima.
 *
 * Decisões de design (impeccable / DESIGN.md):
 * - Estado visual com cor semântica (grass = positivo / surface-2 = neutro /
 *   brand = aguardando decisão). Sem cards idênticos.
 * - Apenas UMA ação principal quando o usuário já decidiu (não usa botões
 *   "disabled" — eles pareciam quebrados em vez de informativos).
 * - Header com `pr-10` pra reservar espaço pro botão `X` de fechar do Modal.
 */
export function ConsentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const choice = useConsent();
  const granted = choice === "granted";
  const denied = choice === "denied";
  const undecided = choice === null;

  function change(c: ConsentChoice) {
    setConsent(c);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} label="Compartilhamento de dados" className="max-w-sm">
      <div className="space-y-5 p-5 sm:p-6">
        <h2 className="pr-10 text-xl font-extrabold tracking-tight text-ink-900">
          Compartilhamento de dados
        </h2>

        {/* Status — cor semântica, ícone em círculo */}
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl p-3.5 ring-1",
            granted && "bg-surface-2 ring-grass-600",
            denied && "bg-surface-2 ring-border",
            undecided && "bg-surface-2 ring-brand-600",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-white",
              granted && "bg-grass-600",
              denied && "bg-ink-300",
              undecided && "bg-brand-600",
            )}
          >
            {granted && <Check className="size-3" strokeWidth={3.5} />}
            {denied && <XIcon className="size-3" strokeWidth={3.5} />}
            {undecided && <span className="text-[10px] font-bold leading-none">?</span>}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm font-bold leading-snug",
                granted && "text-grass-800",
                denied && "text-ink-800",
                undecided && "text-brand-800",
              )}
            >
              {granted && "Você tá ajudando a melhorar o app"}
              {denied && "Você não tá compartilhando dados"}
              {undecided && "A gente ainda não tem sua resposta"}
            </p>
            <p className="mt-0.5 text-xs leading-snug text-ink-500">
              {granted && "Métricas de uso anônimas, IP anonimizado pelo Google."}
              {denied && "Nenhum dado de uso é enviado pra gente."}
              {undecided && "Topa nos ajudar com métricas anônimas?"}
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-ink-500">
          A gente usa <strong className="font-semibold text-ink-700">Google Analytics</strong> pra
          saber quais telas a galera curte e melhorar o que importa.{" "}
          <strong className="font-semibold text-ink-700">
            IP anonimizado, sem rastreio publicitário.
          </strong>
        </p>

        {/* Ação contextual: 2 botões quando indeciso, 1 quando já decidiu */}
        {undecided ? (
          <div className="flex gap-2">
            <Button variant="outline" fullWidth onClick={() => change("denied")}>
              Recusar
            </Button>
            <Button fullWidth onClick={() => change("granted")}>
              Compartilhar
            </Button>
          </div>
        ) : granted ? (
          <Button variant="outline" fullWidth onClick={() => change("denied")}>
            Parar de compartilhar
          </Button>
        ) : (
          <Button fullWidth onClick={() => change("granted")}>
            Compartilhar dados
          </Button>
        )}

        <Link
          to="/privacidade"
          onClick={onClose}
          className="block text-center text-xs font-medium text-ink-400 underline-offset-2 transition-colors hover:text-ink-600 hover:underline"
        >
          Mais detalhes na Política de Privacidade
        </Link>
      </div>
    </Modal>
  );
}

/**
 * Acionador reusável: botão estilizado como link de rodapé que abre o
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
        className={cn("transition-colors hover:text-ink-900", className)}
      >
        Compartilhamento de dados
      </button>
      <ConsentDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}
