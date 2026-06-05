import { Share, SquarePlus } from "lucide-react";
import { isIOS, isStandalone } from "@/lib/pwa";

/**
 * Dica pro iPhone: o Safari só libera notificação quando o app está na tela
 * inicial. Aparece apenas em iOS, fora do PWA instalado e sem inscrição ainda.
 * Some assim que a pessoa instala (vira standalone) ou ativa as notificações.
 */
export function IosPushHint({ subscribed }: { subscribed: boolean }) {
  if (!isIOS() || isStandalone() || subscribed) return null;

  return (
    <div className="rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-ink-500">
      <p>
        No iPhone, pra receber notificação, instale o app na tela inicial: no Safari, toque em
        <Share
          className="mx-1 inline size-3.5 -translate-y-px text-brand-600"
          aria-label="Compartilhar"
        />
        <span className="font-semibold text-ink-700">Compartilhar</span> e depois em{" "}
        <span className="inline-flex translate-y-px items-center gap-0.5 font-semibold text-ink-700">
          <SquarePlus className="size-3.5" /> Adicionar à Tela de Início
        </span>
        .
      </p>
    </div>
  );
}
