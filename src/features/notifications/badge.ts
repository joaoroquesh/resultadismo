// Badge do ícone do app (App Badging API). Só funciona em PWA instalado
// (no navegador comum é no-op silencioso). Tudo embrulhado em try/catch porque
// é API recente e alguns browsers expõem o método mas barram a chamada.

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

/** Mostra o número de não lidas no ícone (no-op fora do PWA instalado). */
export function setBadge(count: number): void {
  try {
    const nav = navigator as BadgeNavigator;
    if (typeof nav.setAppBadge !== "function") return;
    if (count > 0) void nav.setAppBadge(count).catch(() => {});
    else void nav.clearAppBadge?.().catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Zera o badge do ícone. */
export function clearBadge(): void {
  try {
    const nav = navigator as BadgeNavigator;
    if (typeof nav.clearAppBadge !== "function") return;
    void nav.clearAppBadge().catch(() => {});
  } catch {
    /* ignore */
  }
}
