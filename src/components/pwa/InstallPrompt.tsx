import { useEffect, useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

// Evento não-padrão do Chromium (Android/desktop) para instalar PWA.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "rsd:pwa-install";
const SNOOZE_DAYS = 14;

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIOS(): boolean {
  const ua = window.navigator.userAgent;
  const iDevice = /iphone|ipad|ipod/i.test(ua);
  // iPadOS 13+ se apresenta como "Macintosh"; detecta pelo toque.
  const iPadOS = /macintosh/i.test(ua) && "ontouchend" in document;
  return iDevice || iPadOS;
}

function snoozed(): boolean {
  try {
    const v = localStorage.getItem(DISMISS_KEY);
    if (!v) return false;
    if (v === "installed") return true;
    const ts = Number(v);
    return !!ts && Date.now() - ts < SNOOZE_DAYS * 864e5;
  } catch {
    return false;
  }
}

function remember(value: "installed" | "snooze") {
  try {
    localStorage.setItem(DISMISS_KEY, value === "installed" ? "installed" : String(Date.now()));
  } catch {
    /* localStorage indisponível (modo privado) — ignora */
  }
}

export function InstallPrompt() {
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone() || snoozed()) return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault(); // impede o mini-infobar nativo; usamos o nosso banner
      setDeferred(e as BeforeInstallPromptEvent);
      setMode("android");
    };
    const onInstalled = () => {
      remember("installed");
      setDeferred(null);
      setMode(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);

    // iOS/Safari não dispara beforeinstallprompt: mostramos instruções.
    let timer: number | undefined;
    if (isIOS()) {
      timer = window.setTimeout(() => setMode((cur) => cur ?? "ios"), 1500);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!mode) return null;

  const dismiss = () => {
    remember("snooze");
    setMode(null);
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    remember(outcome === "accepted" ? "installed" : "snooze");
    setDeferred(null);
    setMode(null);
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
        onClick={dismiss}
        aria-label="Agora não"
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
          {mode === "android" ? (
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

      {mode === "android" && (
        <div className="mt-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={dismiss}>
            Agora não
          </Button>
          <Button size="sm" onClick={install}>
            <Download className="size-4" /> Instalar app
          </Button>
        </div>
      )}
    </div>
  );
}
