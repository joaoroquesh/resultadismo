// Resultadismo · Edge Function · mercadopago-webhook
// Recebe as notificações do Mercado Pago, confirma o pagamento na fonte
// (consultando a API do MP — autoritativo) e ativa a liga via confirm_league_payment.
//
// Público (verify_jwt = false em config.toml) — o Mercado Pago não envia JWT do app.
//
// Secrets necessários:
//   MERCADOPAGO_ACCESS_TOKEN — Access Token do Mercado Pago
//   MP_WEBHOOK_SECRET        — (opcional, recomendado) segredo p/ validar a assinatura

import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Valida a assinatura x-signature do Mercado Pago (só roda se MP_WEBHOOK_SECRET existir).
// Manifesto: id:<data.id>;request-id:<x-request-id>;ts:<ts>;  → HMAC-SHA256 (hex) == v1
async function validSignature(req: Request, dataId: string, secret: string): Promise<boolean> {
  const sig = req.headers.get("x-signature") ?? "";
  const reqId = req.headers.get("x-request-id") ?? "";
  const parts: Record<string, string> = {};
  for (const p of sig.split(",")) {
    const [k, v] = p.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return hex === v1;
}

function mapStatus(s: string): "paid" | "pending" | "failed" | "refunded" {
  switch (s) {
    case "approved":
      return "paid";
    case "pending":
    case "in_process":
    case "authorized":
      return "pending";
    case "refunded":
    case "charged_back":
      return "refunded";
    default:
      return "failed"; // rejected, cancelled, etc.
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ ok: true });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
  const webhookSecret = Deno.env.get("MP_WEBHOOK_SECRET") ?? "";
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // A notificação pode vir no body (JSON) e/ou na query string.
  const u = new URL(req.url);
  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    // pode vir só por query
  }
  const data = (payload.data ?? {}) as { id?: string | number };
  const type =
    (payload.type as string) ??
    (payload.topic as string) ??
    u.searchParams.get("type") ??
    u.searchParams.get("topic") ??
    "";
  const dataId = String(
    data.id ?? u.searchParams.get("data.id") ?? u.searchParams.get("id") ?? "",
  );

  // Só tratamos eventos de pagamento.
  if (type !== "payment" || !dataId) return json({ ok: true, ignored: true });

  // Rate limit por IP (endpoint público): freia abuso/amplificação.
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || "unknown";
  const { data: rlOk } = await admin.rpc("rate_limit_hit", {
    p_bucket: `mpwh:${ip}`,
    p_max: 120,
    p_window_seconds: 60,
  });
  if (rlOk === false) return json({ error: "rate limited" }, 429);

  if (webhookSecret) {
    const ok = await validSignature(req, dataId, webhookSecret);
    if (!ok) return json({ error: "assinatura inválida" }, 401);
    // Anti-replay: rejeita assinaturas com ts muito antigo (> 10 min).
    const sigTs = Number((req.headers.get("x-signature") ?? "").match(/ts=([0-9]+)/)?.[1] ?? 0);
    if (sigTs && Math.abs(Date.now() / 1000 - sigTs) > 600) {
      return json({ error: "assinatura expirada" }, 401);
    }
  }
  if (!mpToken) return json({ error: "token MP ausente" }, 503);

  // Busca o pagamento na fonte (autoritativo — não confiamos só no corpo da webhook).
  const payRes = await fetch(`https://api.mercadopago.com/v1/payments/${dataId}`, {
    headers: { Authorization: `Bearer ${mpToken}` },
  });
  if (!payRes.ok) return json({ error: `MP ${payRes.status}` }, 502);
  const pay = await payRes.json();

  const meta = (pay.metadata ?? {}) as { league_id?: string; user_id?: string; discount_code?: string };
  const leagueId: string | undefined = pay.external_reference ?? meta.league_id;
  if (!leagueId) return json({ ok: true, ignored: "sem external_reference" });

  const status = mapStatus(String(pay.status));
  const amountCents = Math.round(Number(pay.transaction_amount ?? 0) * 100);
  const preferenceId = pay.order?.id ? String(pay.order.id) : null;

  // Só ativa se o PAGADOR for o dono da federação (fecha cross-league /
  // external_reference forjado / pagamento de terceiro p/ liga alheia).
  const { data: lg } = await admin
    .from("leagues")
    .select("owner_id")
    .eq("id", leagueId)
    .maybeSingle();
  if (!lg) return json({ ok: true, ignored: "liga inexistente" });
  if (status === "paid" && meta.user_id && meta.user_id !== lg.owner_id) {
    console.error("webhook: payer != owner", { leagueId });
    return json({ ok: true, ignored: "payer mismatch" });
  }

  // Sanidade de valor (sem cupom): rejeita ativação por valor muito abaixo do esperado.
  if (status === "paid" && !meta.discount_code) {
    const { data: st } = await admin
      .from("app_settings")
      .select("league_price_cents, promo_price_cents, promo_until")
      .eq("id", 1)
      .maybeSingle();
    const baseCents = Number(st?.league_price_cents ?? 0);
    const promoActive =
      st?.promo_price_cents != null &&
      st?.promo_until != null &&
      new Date(st.promo_until).getTime() > Date.now();
    const expected = promoActive ? Number(st?.promo_price_cents) : baseCents;
    if (expected > 0 && amountCents + 50 < expected) {
      console.error("webhook: valor abaixo do esperado", { leagueId, amountCents, expected });
      return json({ ok: true, ignored: "amount below expected" });
    }
  }

  const { error } = await admin.rpc("confirm_league_payment", {
    p_league_id: leagueId,
    p_payment_id: String(pay.id),
    p_status: status,
    p_amount_cents: amountCents,
    p_preference_id: preferenceId,
    p_raw: pay,
  });
  if (error) return json({ error: error.message }, 500);

  // Registra o cupom usado (dispara a contagem de uso) — só quando aprovado.
  if (meta.discount_code && status === "paid") {
    await admin
      .from("league_payments")
      .update({ discount_code: meta.discount_code })
      .eq("payment_id", String(pay.id));
  }

  return json({ ok: true, leagueId, status });
});
