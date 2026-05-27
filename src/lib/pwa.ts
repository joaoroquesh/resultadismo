import { useSyncExternalStore } from "react";

// Evento não-padrão do Chromium (Android/desktop) para instalar PWA.
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __bipEvent?: BeforeInstallPromptEvent | null;
  }
}

export type InstallState = "installed" | "installable" | "ios" | "unsupported";

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  // o index.html pode ter capturado o evento antes do bundle carregar
  if (window.__bipEvent) deferred = window.__bipEvent;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    window.__bipEvent = deferred;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    window.__bipEvent = null;
    emit();
  });
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPadOS 13+ se apresenta como "Macintosh"; detecta pelo toque.
  return /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && "ontouchend" in document);
}

function snapshot(): InstallState {
  if (installed || isStandalone()) return "installed";
  if (deferred) return "installable";
  if (isIOS()) return "ios";
  return "unsupported";
}

export function getInstallState(): InstallState {
  return snapshot();
}

/** Dispara o instalador nativo (Android/desktop). */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  if (!deferred) return "unavailable";
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  if (outcome === "accepted") installed = true;
  deferred = null;
  window.__bipEvent = null;
  emit();
  return outcome;
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Estado reativo de instalação do PWA. */
export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => "unsupported");
}
