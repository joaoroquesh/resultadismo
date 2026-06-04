// Resultadismo · Edge Function · cancel-league-refund
// Reembolso self-service — direito de arrependimento (CDC art. 49).
// O DONO cancela a federação e recebe o valor de volta, DENTRO de 7 dias do pagamento.
// Chama a API de devoluções do Mercado Pago (reembolso TOTAL) e arquiva a federação.
//
// Chamada (app, autenticado):
//   supabase.functions.invoke("cancel-league-refund", { body: { leagueId } })
//
// Secrets: MERCADOPAGO_ACCESS_TOKEN
//
// Convenção: respostas ESPERADAS voltam 200 com { ok: boolean, error?: string }
// (evita o swallow de mensagem do supabase-js functions.invoke em status != 2xx).

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/security.ts";

const REFUND_WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const mpToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN") ?? "";

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  if (!jwt) return json({ ok: false, error: "Não autorizado." });

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(jwt);
  const user = userData.user;
  if (!user) return json({ ok: false, error: "Não autorizado." });

  let body: { leagueId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // sem body
  }
  if (!body.leagueId) return json({ ok: false, error: "leagueId é obrigatório." });

  // Federação
  const { data: league, error } = await admin
    .from("leagues")
    .select("id, name, slug, owner_id, status, payment_status, approved_at, deleted_at")
    .eq("id", body.leagueId)
    .maybeSingle();
  if (error) return json({ ok: false, error: error.message });
  if (!league) return json({ ok: false, error: "Federação não encontrada." });

  // Validações (dono, paga, não-reembolsada, dentro dos 7 dias)
  if (league.owner_id !== user.id)
    return json({ ok: false, error: "Só o dono da federação pode cancelar e reembolsar." });
  if (league.deleted_at || league.payment_status === "refunded")
    return json({ ok: false, error: "Esta federação já foi cancelada/reembolsada." });
  if (league.payment_status !== "paid")
    return json({ ok: false, error: "Só federações pagas podem ser reembolsadas." });

  // Pagamento PAGO registrado (pega o payment_id real do Mercado Pago)
  const { data: pay } = await admin
    .from("league_payments")
    .select("payment_id, provider, amount_cents, created_at")
    .eq("league_id", league.id)
    .eq("status", "paid")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Janela de arrependimento contada a partir do PAGAMENTO (não do approved_at,
  // que pode ter sido setado na aprovação do admin, antes do pagamento real).
  const paidAt = pay?.created_at
    ? new Date(pay.created_at).getTime()
    : league.approved_at
      ? new Date(league.approved_at).getTime()
      : 0;
  const daysSince = paidAt ? (Date.now() - paidAt) / DAY_MS : Number.POSITIVE_INFINITY;
  if (daysSince > REFUND_WINDOW_DAYS) {
    return json({
      ok: false,
      error: "O prazo de 7 dias para reembolso automático já passou. Fale com o suporte para avaliar.",
    });
  }

  const paymentId = pay?.payment_id ?? null;
  const isRealMpPayment =
    !!paymentId &&
    (pay?.amount_cents ?? 0) > 0 &&
    (pay?.provider ?? "mercadopago") === "mercadopago" &&
    !paymentId.startsWith("test-") &&
    !paymentId.startsWith("free-");

  // 1) Devolução no Mercado Pago (reembolso TOTAL) — só quando há pagamento real.
  //    Idempotência: X-Idempotency-Key evita estorno duplicado em cliques repetidos.
  if (isRealMpPayment) {
    if (!mpToken)
      return json({ ok: false, error: "Reembolso indisponível: token do Mercado Pago não configurado." });
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${mpToken}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `refund-${league.id}-${paymentId}`,
      },
      body: "{}", // corpo vazio = reembolso total
    });
    if (!mpRes.ok) {
      const detail = await mpRes.text();
      console.error("MP refund failed", mpRes.status, detail);
      return json({
        ok: false,
        error: `O Mercado Pago não conseguiu processar o reembolso agora (${mpRes.status}). Tente novamente em instantes ou fale com o suporte.`,
      });
    }
  }
  // Cortesia / 100% off / teste: nada a estornar — apenas cancela a federação.

  // 2) Marca reembolsado + arquiva a federação — atômico (for update), idempotente.
  //    service_role ⇒ can_settle_leagues() = true ⇒ o guard libera status/payment_status.
  const { data: didRefund, error: upErr } = await admin.rpc("refund_league", {
    p_league_id: league.id,
  });
  if (upErr) return json({ ok: false, error: upErr.message });
  if (didRefund === false) {
    return json({ ok: false, error: "Esta federação já foi cancelada/reembolsada." });
  }

  return json({ ok: true, leagueId: league.id, refunded: isRealMpPayment });
});
