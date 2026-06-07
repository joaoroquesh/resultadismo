/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Web Push: exibe a notificação recebida
self.addEventListener("push", (event) => {
  let payload: { title?: string; body?: string; data?: { url?: string; tag?: string } } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title ?? "Resultadismo";
  // Nunca exibe uma notificação "vazia": sem corpo, usa um texto da marca. Garante
  // que toda push NOSSA apareça com identidade (escudo + título + corpo) e nunca
  // caia no aviso genérico do navegador ("Toque para copiar o URL…").
  const body =
    payload.body && payload.body.trim() ? payload.body : "Você tem novidades no Resultadismo ⚽";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/favicon/android-chrome-192x192.png",
      badge: "/favicon/favicon-32x32.png",
      lang: "pt-BR",
      // Agrupa por entidade quando o backend enviar data.tag (hoje undefined = sem agrupar).
      tag: payload.data?.tag,
      data: payload.data ?? {},
    }),
  );
});

// Zera o badge do ícone (App Badging API). Feature-detect + try/catch porque
// nem todo browser/SW expõe o método. No-op fora do PWA instalado.
function clearAppBadge(): void {
  try {
    const nav = self.navigator as Navigator & { clearAppBadge?: () => Promise<void> };
    void nav.clearAppBadge?.().catch(() => {});
  } catch {
    /* ignore */
  }
}

// Clique na notificação: foca/abre o app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) return (client as WindowClient).focus();
        }
        return self.clients.openWindow(url);
      })
      .finally(() => clearAppBadge()),
  );
});
