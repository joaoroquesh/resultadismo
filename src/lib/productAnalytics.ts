import { useEffect, useMemo, useRef } from "react";
import { useLocation } from "react-router-dom";
import { rpcCall } from "@/lib/rpc";

export type AnalyticsProduct = "app" | "retro" | "manager";
export type AnalyticsEventType = "page_view" | "heartbeat" | "manager_match_complete";

const VISITOR_KEY = "resultadismo:analytics:visitor:v1";
const SESSION_PREFIX = "resultadismo:analytics:session";
const LAST_SEEN_PREFIX = "resultadismo:analytics:last-seen";
const SESSION_TIMEOUT_MS = 30 * 60_000;
const HEARTBEAT_MS = 30_000;

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* analytics best-effort */
  }
}

function getVisitorKey(): string {
  const current = safeGet(VISITOR_KEY);
  if (current) return current;
  const next = randomId();
  safeSet(VISITOR_KEY, next);
  return next;
}

function getSessionKey(product: AnalyticsProduct): string {
  const sessionKey = `${SESSION_PREFIX}:${product}`;
  const lastSeenKey = `${LAST_SEEN_PREFIX}:${product}`;
  const now = Date.now();
  const current = safeGet(sessionKey);
  const lastSeen = Number(safeGet(lastSeenKey) ?? 0);
  if (current && Number.isFinite(lastSeen) && now - lastSeen < SESSION_TIMEOUT_MS) {
    safeSet(lastSeenKey, String(now));
    return current;
  }
  const next = `${product}:${randomId()}`;
  safeSet(sessionKey, next);
  safeSet(lastSeenKey, String(now));
  return next;
}

function normalizeRoute(product: AnalyticsProduct, pathname: string, signedIn = false): string {
  if (product === "retro") {
    if (/^\/retro\/r\/[^/]+/.test(pathname)) return "/retro/r/:code";
    if (pathname === "/retro/eu") return "/retro/eu";
    if (pathname === "/retro/regras") return "/retro/regras";
    if (pathname === "/retro/feedback") return "/retro/feedback";
    return "/retro";
  }

  if (product === "manager") {
    if (pathname.startsWith("/manager-v2")) return "/manager-v2";
    return "/manager";
  }

  if (pathname === "/") return signedIn ? "/jogos" : "/home-publica";
  if (pathname.startsWith("/admin")) return "/admin";
  if (/^\/grupos\/nova/.test(pathname)) return "/grupos/nova";
  if (/^\/grupos\/[^/]+\/confrontos/.test(pathname)) return "/grupos/:slug/confrontos";
  if (/^\/grupos\/[^/]+/.test(pathname)) return "/grupos/:slug";
  if (/^\/jogador\/[^/]+/.test(pathname)) return "/jogador/:id";
  if (/^\/perfil\/personalizar/.test(pathname)) return "/perfil/personalizar";
  if (/^\/perfil\/editar/.test(pathname)) return "/perfil/editar";
  return pathname || "/";
}

async function sendUsage(input: {
  product: AnalyticsProduct;
  route: string;
  eventType: AnalyticsEventType;
  seconds?: number;
  meta?: Record<string, unknown>;
}) {
  const visitorKey = getVisitorKey();
  const sessionKey = getSessionKey(input.product);
  await rpcCall("track_app_usage", {
    p_session_key: sessionKey,
    p_visitor_key: visitorKey,
    p_product: input.product,
    p_route: input.route,
    p_event_type: input.eventType,
    p_seconds: input.seconds ?? 0,
    p_meta: input.meta ?? {},
  });
}

export async function trackProductEvent(input: {
  product: AnalyticsProduct;
  route: string;
  eventType: Exclude<AnalyticsEventType, "page_view" | "heartbeat">;
  meta?: Record<string, unknown>;
}) {
  await sendUsage(input);
}

export function useProductAnalytics(
  product: AnalyticsProduct,
  options: { disabled?: boolean; signedIn?: boolean } = {},
) {
  const location = useLocation();
  const route = useMemo(
    () => normalizeRoute(product, location.pathname, !!options.signedIn),
    [location.pathname, options.signedIn, product],
  );
  const routeRef = useRef(route);
  const lastBeatRef = useRef(0);
  const disabled = options.disabled || (product === "app" && route === "/admin");

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    if (disabled) return;
    void sendUsage({ product, route, eventType: "page_view" }).catch(() => {});
  }, [disabled, product, route]);

  useEffect(() => {
    if (disabled) return;
    let alive = true;
    lastBeatRef.current = Date.now();

    const beat = () => {
      if (!alive || document.visibilityState !== "visible") return;
      const now = Date.now();
      const seconds = Math.max(0, Math.min(Math.round((now - lastBeatRef.current) / 1000), 90));
      lastBeatRef.current = now;
      if (seconds <= 0) return;
      void sendUsage({
        product,
        route: routeRef.current,
        eventType: "heartbeat",
        seconds,
      }).catch(() => {});
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        lastBeatRef.current = Date.now();
        void sendUsage({ product, route: routeRef.current, eventType: "page_view" }).catch(() => {});
      } else {
        beat();
      }
    };

    const timer = window.setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", beat);

    return () => {
      beat();
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", beat);
    };
  }, [disabled, product]);
}
