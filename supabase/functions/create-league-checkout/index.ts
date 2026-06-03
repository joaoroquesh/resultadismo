// Resultadismo · Edge Function · create-league-checkout
// Caminho de pagamento REAL (modo 'live'): cria a preferência no Mercado Pago.
// Preço e modo vêm do banco (app_settings). Aplica código de desconto se houver.
// Em modo 'test'/'disabled' o frontend NÃO chama isto (usa simulate_league_payment).
//
// Chamada (app, autenticado):
//   supabase.functions.invoke("create-league-checkout", { body: { leagueId, discountCode? } })
//
// Secrets: MERCADOPAGO_ACCESS_TOKEN, APP_URL

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";
  const appUrl = (Deno.env.get("APP_URL") ?? "https://resultadismo.com").replace(/\/+$/, "");

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return json({ error: "Não autorizado" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData.user;
  if (!user) return json({ error: "Não autorizado" }, 401);

  let body: { leagueId?: string; discountCode?: string } = {};
  try {
    body = await req.json();
  } catch {
    // sem body
  }
  if (!body.leagueId) return json({ error: "leagueId é obrigatório" }, 400);

  // Configurações de pagamento (modo + preço base + promoção opcional)
  const { data: settings } = await admin
    .from("app_settings")
    .select("payment_mode, league_price_cents, promo_price_cents, promo_until")
    .eq("id", 1)
    .maybeSingle();
  const mode = settings?.payment_mode ?? "disabled";
  const baseCents = Number(settings?.league_price_cents ?? 990);
  // Preço promocional vale enquanto now() < promo_until (autoritativo no servidor).
  const promoCents = settings?.promo_price_cents;
  const promoUntil = settings?.promo_until;
  const promoActive =
    promoCents != null && promoUntil != null && new Date(promoUntil).getTime() > Date.now();
  const priceCents = promoActive ? Number(promoCents) : baseCents;

  if (mode !== "live") {
    return json({ error: "Pagamento não está no modo Mercado Pago." }, 409);
  }
  if (!mpToken) {
    return json({ error: "Pagamento indisponível: token do Mercado Pago não configurado." }, 503);
  }

  // Federação (tabela leagues por baixo)
  const { data: league, error } = await admin
    .from("leagues")
    .select("id, name, slug, owner_id, status, payment_status")
    .eq("id", body.leagueId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!league) return json({ error: "Federação não encontrada" }, 404);
  if (league.owner_id !== user.id) return json({ error: "Você não é o dono desta federação" }, 403);
  // Só bloqueia se já estiver PAGA. status 'active' sozinho pode ser aprovação do admin
  // sem pagamento (estado em que ainda faz sentido pagar).
  if (league.payment_status === "paid") {
    return json({ error: "Esta federação já está paga." }, 409);
  }

  // Desconto (opcional)
  let finalCents = priceCents;
  let discountCode: string | null = null;
  if (body.discountCode && body.discountCode.trim()) {
    const { data: disc } = await admin.rpc("validate_discount_code", { p_code: body.discountCode });
    if (disc?.valid) {
      discountCode = disc.code;
      if (disc.percent_off) finalCents = Math.round(priceCents * (1 - disc.percent_off / 100));
      else if (disc.amount_off_cents) finalCents = priceCents - disc.amount_off_cents;
      finalCents = Math.max(0, finalCents);
    }
  }

  // Desconto de 100% → ativa de graça (sem MP)
  if (finalCents <= 0) {
    await admin.from("league_payments").insert({
      league_id: league.id,
      user_id: user.id,
      provider: "discount-free",
      payment_id: `free-${league.id}`,
      status: "paid",
      amount_cents: 0,
      discount_code: discountCode,
    });
    await admin
      .from("leagues")
      .update({
        payment_status: "paid",
        status: "active",
        approved_at: new Date().toISOString(),
        name_approved: false,
      })
      .eq("id", league.id);
    return json({ free: true });
  }

  const unitPrice = finalCents / 100;
  const notificationUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

  const preference = {
    items: [
      {
        id: league.id,
        title: `Criação de federação: ${league.name}`,
        description: "Resultadismo — taxa única de criação de federação",
        quantity: 1,
        currency_id: "BRL",
        unit_price: unitPrice,
      },
    ],
    external_reference: league.id,
    metadata: { league_id: league.id, user_id: user.id, discount_code: discountCode },
    // Sem boleto (R$ 3,49 fixo não faz sentido p/ R$ 9,90) — Pix/cartão/débito.
    payment_methods: { installments: 1, excluded_payment_types: [{ id: "ticket" }] },
    back_urls: {
      success: `${appUrl}/federacoes/${league.slug}?pagamento=sucesso`,
      pending: `${appUrl}/federacoes/${league.slug}?pagamento=processando`,
      failure: `${appUrl}/federacoes/${league.slug}?pagamento=falhou`,
    },
    auto_return: "approved",
    notification_url: notificationUrl,
    statement_descriptor: "RESULTADISMO",
  };

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: { Authorization: `Bearer ${mpToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(preference),
  });
  if (!res.ok) return json({ error: `Mercado Pago ${res.status}: ${await res.text()}` }, 502);
  const pref = await res.json();
  const url = pref.init_point ?? pref.sandbox_init_point;
  if (!url) return json({ error: "Mercado Pago não retornou a URL de pagamento." }, 502);

  return json({ url, preferenceId: pref.id });
});
