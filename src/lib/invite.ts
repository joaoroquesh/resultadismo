// Captura e persistência do código de convite vindo por link.
// Ex.: https://www.resultadismo.com/?convite=CRAQUE  → guarda em localStorage
// pra preencher sozinho o campo na personalização / na página de Grupos.
const INVITE_KEY = "rsd:invite-code";

/** Lê ?convite=/?code= da URL atual e guarda em localStorage (roda no boot). */
export function captureInviteFromUrl(): void {
  try {
    const p = new URLSearchParams(window.location.search);
    const c = (p.get("convite") || p.get("code") || "").trim().toUpperCase();
    if (c) localStorage.setItem(INVITE_KEY, c);
  } catch {
    /* localStorage/URL indisponível */
  }
}

export function getStoredInvite(): string {
  try {
    return localStorage.getItem(INVITE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearStoredInvite(): void {
  try {
    localStorage.removeItem(INVITE_KEY);
  } catch {
    /* ignore */
  }
}
