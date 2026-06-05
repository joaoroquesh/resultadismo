// Resultadismo · features/consent — Consent Mode v2 (LGPD)
//
// O index.html define todo o consent como 'denied' por padrão (Google Consent
// Mode v2). Aqui o app:
//   - lê a escolha persistida do usuário (localStorage),
//   - reaplica essa escolha no boot (para retornantes que já decidiram),
//   - expõe setters (setConsent / clearConsent) e um hook React (useConsent)
//     que faz o banner e o centro de privacidade reagirem em tempo real à
//     escolha — inclusive em outras abas (via evento "storage").
//
// Enquanto não houver escolha, o GA roda em "consent-denied" (sem cookies, com
// pings sem ID). Recusar mantém esse estado; aceitar libera analytics_storage.
// Nunca liberamos ad_*: o Resultadismo não faz tracking publicitário.

import { useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";

const STORAGE_KEY = "rd_consent_v1";
const EVENT_NAME = "rd:consent-change";

export type ConsentChoice = "granted" | "denied";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function readStored(): ConsentChoice | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "granted" || v === "denied" ? v : null;
  } catch {
    return null;
  }
}

function writeStored(choice: ConsentChoice | null): void {
  try {
    if (choice === null) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* storage indisponível — escolha não persiste, banner volta a aparecer */
  }
}

function pushConsentUpdate(choice: ConsentChoice): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("consent", "update", {
    analytics_storage: choice === "granted" ? "granted" : "denied",
  });
}

function emitChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(EVENT_NAME));
}

/** Retorna a escolha do usuário, ou null se ainda não decidiu. */
export function getConsent(): ConsentChoice | null {
  return readStored();
}

/** Aplica a escolha persistida no boot do app — chamado uma vez no main.tsx. */
export function applyStoredConsent(): void {
  const c = readStored();
  if (c) pushConsentUpdate(c);
}

/** Persiste e propaga a escolha (usado pelo banner e pelo centro de privacidade). */
export function setConsent(choice: ConsentChoice): void {
  writeStored(choice);
  pushConsentUpdate(choice);
  // Depois do pushConsentUpdate: se concedeu, o evento já sai com
  // analytics_storage liberado (medição completa).
  track("consent_set", { choice });
  emitChange();
}

/**
 * Reset total: limpa a escolha persistida e volta o gtag pra "denied" (modo
 * conservador). O banner reaparece, dando ao usuário a chance de decidir
 * novamente sem assumir nada.
 */
export function clearConsent(): void {
  writeStored(null);
  pushConsentUpdate("denied");
  emitChange();
}

// ---------------------------------------------------------------------------
// Hook React — observa mudanças (mesma aba via evento custom; outras abas via
// "storage"), com SSR safe (useSyncExternalStore garante hidratação consistente).
// ---------------------------------------------------------------------------
function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb();
  };
  window.addEventListener(EVENT_NAME, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT_NAME, cb);
    window.removeEventListener("storage", onStorage);
  };
}

const getSnapshot = (): ConsentChoice | null => readStored();
const getServerSnapshot = (): ConsentChoice | null => null;

/** Hook que retorna a escolha atual de consent e reage a mudanças. */
export function useConsent(): ConsentChoice | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
