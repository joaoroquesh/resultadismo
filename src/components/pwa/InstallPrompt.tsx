import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { promptInstall, useInstallState } from "@/lib/pwa";

// Aparece uma única vez por dispositivo. Depois, a instalação fica disponível no Perfil.
const SEEN_KEY = "rsd:pwa-prompt-seen";

export function InstallPrompt() {
  const state = useInstallState();
  const [show, setShow] = useState(false);
  // No Perfil já existe o card "Instalar o app"; não duplicamos com o banner flutuante.
  const onProfile = useLocation().pathname.startsWith("/perfil");

  // Auto-exibe uma vez, assim que dá pra instalar (Android) ou no iOS.
  useEffect(() => {
    if (onProfile) return;
    if (state !== "installable" && state !== "ios") return;
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (seen) return;
    const t = window.setTimeout(() => {
      setShow(true);
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
    }, 1000);
    return () => clearTimeout(t);
  }, [state, onProfile]);

  // Some se instalar enquanto estiver aberto.
  useEffect(() => {
    if (state === "installed") setShow(false);
  }, [state]);

  if (!show || onProfile || (state !== "installable" && state !== "ios")) return null;

  const onInstall = async () => {
    await promptInstall();
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Instalar o Resultadismo"
      className={cn(
        "animate-rise fixed inset-x-3 z-50 mx-auto max-w-sm rounded-lg bg-surface p-4 ring-1 ring-border",
        "shadow-[var(--shadow-pop)]",
        "bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:mx-0",
      )}
    >
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Fechar"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-brand-50 text-brand-600">
          <Download className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-900">Tenha o Resultadismo na tela inicial</p>
          {state === "installable" ? (
            <p className="mt-0.5 text-xs text-ink-500">
              Instale o app pra abrir num toque e receber os lembretes dos seus palpites.
            </p>
          ) : (
            <p className="mt-1 text-xs leading-relaxed text-ink-500">
              Toque em
              <Share className="mx-1 inline size-3.5 -translate-y-px text-brand-600" aria-label="Compartilhar" />
              <span className="font-semibold text-ink-700">Compartilhar</span> e depois em{" "}
              <span className="inline-flex translate-y-px items-center gap-0.5 font-semibold text-ink-700">
                <SquarePlus className="size-3.5" /> Adicionar à Tela de Início
              </span>
              .
            </p>
          )}
        </div>
      </div>

      {state === "installable" && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShow(false)}>
            Agora não
          </Button>
          <Button size="sm" onClick={onInstall}>
            <Download className="size-4" /> Instalar app
          </Button>
        </div>
      )}
    </div>
  );
}
