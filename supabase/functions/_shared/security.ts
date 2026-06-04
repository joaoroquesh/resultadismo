// Helpers compartilhados pelas Edge Functions: CORS com allow-list e comparação
// de tempo constante. (Pasta _shared/ não é deployada como função — só bundlada.)

const APP_ORIGINS = (Deno.env.get("APP_URL") ?? "https://resultadismo.com")
  .split(",")
  .map((s) => s.trim().replace(/\/+$/, ""))
  .filter(Boolean);

function originAllowed(origin: string): boolean {
  if (!origin) return false;
  const o = origin.replace(/\/+$/, "");
  if (APP_ORIGINS.includes(o)) return true;
  // dev local
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) return true;
  // previews da Vercel
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(o)) return true;
  return false;
}

/**
 * Cabeçalhos CORS restritos: reflete a Origin só se estiver na allow-list
 * (APP_URL, localhost, *.vercel.app). Caso contrário cai na origem principal.
 * Substitui o antigo "Access-Control-Allow-Origin: *".
 */
export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allow = originAllowed(origin) ? origin : APP_ORIGINS[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

/** Comparação de tempo constante p/ checagem de tokens (evita timing attacks). */
export function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ba = enc.encode(a);
  const bb = enc.encode(b);
  if (ba.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ba.length; i++) diff |= (ba[i] ?? 0) ^ (bb[i] ?? 0);
  return diff === 0;
}
