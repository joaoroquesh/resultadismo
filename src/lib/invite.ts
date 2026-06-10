// Captura e persistência do código de convite vindo por link.
// Ex.: https://www.resultadismo.com/?convite=CRAQUE  → guarda em localStorage
// pra preencher sozinho o campo na personalização / na página de Grupos.
const INVITE_KEY = "rsd:invite-code";
// Sinaliza que o código chegou NESTA visita (link clicado agora) — sessionStorage
// sobrevive ao redirect do OAuth na mesma aba e morre ao fechar.
const FRESH_KEY = "rsd:invite-fresh";

// Formato real dos códigos de grupo (ex.: CRAQUE): curto e alfanumérico.
// IMPORTANTE: nunca ler ?code= — é o parâmetro do callback OAuth do Google
// (um UUID), que já chegou a vazar pro campo de convite.
const CODE_RE = /^[A-Z0-9]{3,12}$/;

/** Lê ?convite= da URL atual e guarda em localStorage (roda no boot). */
export function captureInviteFromUrl(): void {
  try {
    const p = new URLSearchParams(window.location.search);
    const c = (p.get("convite") ?? "").trim().toUpperCase();
    if (CODE_RE.test(c)) {
      localStorage.setItem(INVITE_KEY, c);
      sessionStorage.setItem(FRESH_KEY, "1");
    }
  } catch {
    /* localStorage/URL indisponível */
  }
}

export function getStoredInvite(): string {
  try {
    const c = localStorage.getItem(INVITE_KEY) ?? "";
    // auto-limpeza: lixo salvo por versões antigas (ex.: code do OAuth) sai daqui
    if (c && !CODE_RE.test(c)) {
      localStorage.removeItem(INVITE_KEY);
      return "";
    }
    return c;
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

/** true UMA vez quando a visita atual veio de um link de convite (consome o flag). */
export function consumeFreshInvite(): boolean {
  try {
    if (sessionStorage.getItem(FRESH_KEY) !== "1") return false;
    sessionStorage.removeItem(FRESH_KEY);
    return getStoredInvite() !== "";
  } catch {
    return false;
  }
}
