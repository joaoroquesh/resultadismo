/// <reference lib="webworker" />
import { precacheAndRoute } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};

precacheAndRoute(self.__WB_MANIFEST);

// Escudos (repo /teams + CDNs dos provedores): CacheFirst — depois da 1ª vez,
// carregam do cache na hora (some a "demora" das imagens).
registerRoute(
  ({ url }) =>
    url.pathname.startsWith("/teams/") ||
    url.hostname === "a.espncdn.com" ||
    url.hostname === "crests.football-data.org",
  new CacheFirst({
    cacheName: "team-crests",
    plugins: [new ExpirationPlugin({ maxEntries: 600, maxAgeSeconds: 30 * 24 * 3600 })],
  }),
);

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
      // Ícone da barra de status do Android: precisa ser MONOCROMÁTICO (branco +
      // alpha). Bitmap colorido vira um quadrado achatado — era o bug do "quadrado
      // branco". badge-96.png = silhueta sólida do escudo (gerada do 192).
      badge: "/favicon/badge-96.png",
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
