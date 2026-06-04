// Resultadismo · features/consent — Consent Mode v2 (LGPD)
//
// O index.html define todo o consent como 'denied' por padrão (Google Consent
// Mode v2). Aqui o app:
//   - lê a escolha persistida do usuário (localStorage),
//   - reaplica essa escolha no boot (para retornantes que já decidiram),
//   - expõe um setter que o banner usa para gravar a escolha e propagar
//     imediatamente ao gtag.
//
// Enquanto não houver escolha, o GA roda em "consent-denied" (sem cookies, com
// pings sem ID). Recusar mantém esse estado; aceitar libera analytics_storage.
// Nunca liberamos ad_*: o Resultadismo não faz tracking publicitário.

const STORAGE_KEY = "rd_consent_v1";

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

function writeStored(choice: ConsentChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
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

/** Retorna a escolha do usuário, ou null se ainda não decidiu. */
export function getConsent(): ConsentChoice | null {
  return readStored();
}

/** Aplica a escolha persistida no boot do app — chamado uma vez no main.tsx. */
export function applyStoredConsent(): void {
  const c = readStored();
  if (c) pushConsentUpdate(c);
}

/** Persiste e propaga a escolha (usado pelo banner). */
export function setConsent(choice: ConsentChoice): void {
  writeStored(choice);
  pushConsentUpdate(choice);
}
