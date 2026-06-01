// Resultadismo · Edge Function · create-league-checkout
// Cria a preferência de checkout no Mercado Pago para a taxa única de criação de
// uma liga. Não cria a liga (o frontend já criou em 'pending') — apenas valida o
// dono/estado e devolve a URL de pagamento (Pix/cartão).
//
// Chamada (app, autenticado): supabase.functions.invoke("create-league-checkout", { body: { leagueId } })
//
// Secrets necessários:
//   MERCADOPAGO_ACCESS_TOKEN  — Access Token do Mercado Pago
//   LEAGUE_PRICE_CENTS        — preço em centavos de BRL (default 990 = R$ 9,90)
//   APP_URL                   — URL pública do app (back_urls do checkout)

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
  const priceCents = Math.round(Number(Deno.env.get("LEAGUE_PRICE_CENTS") ?? "990"));
  const appUrl = (Deno.env.get("APP_URL") ?? "https://resultadismo.com").replace(/\/+$/, "");

  if (!mpToken) {
    return json({ error: "Pagamento indisponível: token do Mercado Pago não configurado." }, 503);
  }
  if (!Number.isFinite(priceCents) || priceCents <= 0) {
    return json({ error: "Preço da liga inválido." }, 500);
  }

  // Usuário autenticado (JWT do app)
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return json({ error: "Não autorizado" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData.user;
  if (!user) return json({ error: "Não autorizado" }, 401);

  let body: { leagueId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // sem body
  }
  if (!body.leagueId) return json({ error: "leagueId é obrigatório" }, 400);

  const { data: league, error } = await admin
    .from("leagues")
    .select("id, name, slug, owner_id, status, payment_status")
    .eq("id", body.leagueId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!league) return json({ error: "Liga não encontrada" }, 404);
  if (league.owner_id !== user.id) return json({ error: "Você não é o dono desta liga" }, 403);
  if (league.payment_status === "paid" || league.status === "active") {
    return json({ error: "Esta liga já está ativa." }, 409);
  }

  const unitPrice = priceCents / 100;
  const notificationUrl = `${supabaseUrl}/functions/v1/mercadopago-webhook`;

  const preference = {
    items: [
      {
        id: league.id,
        title: `Criação de liga: ${league.name}`,
        description: "Resultadismo — taxa única de criação de liga",
        quantity: 1,
        currency_id: "BRL",
        unit_price: unitPrice,
      },
    ],
    external_reference: league.id,
    metadata: { league_id: league.id, user_id: user.id },
    payment_methods: { installments: 1 },
    back_urls: {
      success: `${appUrl}/ligas/${league.slug}?pagamento=sucesso`,
      pending: `${appUrl}/ligas/${league.slug}?pagamento=processando`,
      failure: `${appUrl}/ligas/${league.slug}?pagamento=falhou`,
    },
    auto_return: "approved",
    notification_url: notificationUrl,
    statement_descriptor: "RESULTADISMO",
  };

  const res = await fetch("https://api.mercadopago.com/checkout/preferences", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${mpToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preference),
  });
  if (!res.ok) {
    return json({ error: `Mercado Pago ${res.status}: ${await res.text()}` }, 502);
  }
  const pref = await res.json();
  const url = pref.init_point ?? pref.sandbox_init_point;
  if (!url) return json({ error: "Mercado Pago não retornou a URL de pagamento." }, 502);

  return json({ url, preferenceId: pref.id });
});
