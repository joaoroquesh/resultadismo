import { useState } from "react";
import { BellOff, Lock, Settings, Share, SquarePlus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { isIOS, isStandalone } from "@/lib/pwa";

function isAndroid(): boolean {
  return typeof navigator !== "undefined" && /android/i.test(navigator.userAgent);
}

/**
 * Guia pra quando a permissão de notificação está BLOQUEADA no navegador/celular.
 * O site não consegue abrir as configurações pela pessoa — então mostra o passo
 * a passo certo da plataforma + um "tentar de novo" pra quando ela liberar.
 */
export function NotifDeniedHelp({
  onRetry,
  compact = false,
}: {
  /** tenta ativar de novo; retorna true se conseguiu. */
  onRetry: () => Promise<boolean>;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const ios = isIOS();
  const android = isAndroid();
  const installed = isStandalone();

  async function retry() {
    setBusy(true);
    await onRetry();
    setBusy(false);
  }

  return (
    <div className="rounded-md bg-surface-2 p-3.5 text-sm leading-relaxed text-ink-700">
      <p className="flex items-center gap-2 font-bold text-ink-900">
        <BellOff className="size-4 shrink-0 text-flame-600" />
        As notificações estão bloqueadas
      </p>
      <p className="mt-1 text-xs text-ink-500">
        O bloqueio foi feito no {ios || android ? "celular/navegador" : "navegador"}, e só você
        consegue liberar. É rápido:
      </p>

      <ol className="mt-2 space-y-1.5 text-xs text-ink-700">
        {ios && !installed && (
          <>
            <li className="flex gap-1.5">
              <span className="font-bold text-brand-700">1.</span>
              <span>
                No iPhone, as notificações só funcionam com o app instalado: toque em{" "}
                <Share className="inline size-3.5 -translate-y-px text-brand-600" aria-label="Compartilhar" />{" "}
                <strong>Compartilhar</strong> e em{" "}
                <span className="inline-flex translate-y-px items-center gap-0.5 font-semibold">
                  <SquarePlus className="size-3.5" /> Adicionar à Tela de Início
                </span>
                .
              </span>
            </li>
            <li className="flex gap-1.5">
              <span className="font-bold text-brand-700">2.</span>
              <span>Abra o app instalado e ative as notificações por lá.</span>
            </li>
          </>
        )}
        {ios && installed && (
          <li className="flex gap-1.5">
            <span className="font-bold text-brand-700">1.</span>
            <span>
              Abra os <strong>Ajustes</strong> do iPhone → <strong>Notificações</strong> →{" "}
              <strong>Resultadismo</strong> → <strong>Permitir notificações</strong>.
            </span>
          </li>
        )}
        {android && installed && (
          <li className="flex gap-1.5">
            <Settings className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
            <span>
              <strong>Configurações</strong> do celular → <strong>Aplicativos</strong> →{" "}
              <strong>Resultadismo</strong> → <strong>Notificações</strong> →{" "}
              <strong>Permitir</strong>.
            </span>
          </li>
        )}
        {android && !installed && (
          <li className="flex gap-1.5">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
            <span>
              No Chrome, toque no <strong>cadeado</strong> (ou ⋮) ao lado do endereço →{" "}
              <strong>Permissões</strong> → <strong>Notificações</strong> → <strong>Permitir</strong>.
            </span>
          </li>
        )}
        {!ios && !android && (
          <li className="flex gap-1.5">
            <Lock className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
            <span>
              Clique no <strong>cadeado</strong> na barra de endereço →{" "}
              <strong>Notificações</strong> → <strong>Permitir</strong>.
            </span>
          </li>
        )}
      </ol>

      {!compact && (
        <Button variant="outline" size="sm" className="mt-3" loading={busy} onClick={retry}>
          <RefreshCw className="size-4" /> Já liberei, tentar de novo
        </Button>
      )}
    </div>
  );
}
