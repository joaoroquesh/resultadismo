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
  let payload: { title?: string; body?: string; data?: { url?: string } } = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() };
  }
  const title = payload.title ?? "Resultadismo";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body ?? "",
      icon: "/favicon/android-chrome-192x192.png",
      badge: "/favicon/favicon-32x32.png",
      data: payload.data ?? {},
    }),
  );
});

// Clique na notificação: foca/abre o app
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return (client as WindowClient).focus();
      }
      return self.clients.openWindow(url);
    }),
  );
});
