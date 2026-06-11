// Resultadismo · Edge Function · send-push
// Envia Web Push para todas as inscrições de um usuário.
// Chamado por trigger no banco (pg_net) ao criar notificação, ou manualmente.
// Requer secrets: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

import webpush from "npm:web-push@3";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, timingSafeEqual } from "../_shared/security.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const authed =
    (!!token && timingSafeEqual(token, serviceKey)) ||
    (!!cronSecret && !!token && timingSafeEqual(token, cronSecret));
  if (!authed) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 403, headers: cors });
  }

  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:contato@resultadismo.com";
  if (!publicKey || !privateKey) {
    return new Response(JSON.stringify({ error: "VAPID não configurado" }), { status: 200, headers: cors });
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);

  const { user_id, title, body, url } = await req.json();
  if (!user_id) {
    return new Response(JSON.stringify({ error: "user_id ausente" }), { status: 400, headers: cors });
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
    auth: { persistSession: false },
  });

  const { data: subs } = await admin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", user_id);

  const payload = JSON.stringify({ title: title ?? "Resultadismo", body: body ?? "", data: { url: url ?? "/" } });
  let sent = 0;
  // Falha NUNCA é engolida em silêncio: cada erro vira log (dashboard) e entra
  // na resposta — que fica consultável em net._http_response pro diagnóstico.
  const failed: Array<{ status: number | null; reason: string }> = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      sent++;
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode ?? null;
      const reason =
        ((e as { body?: string }).body || (e as Error).message || "erro desconhecido")
          .replace(/\s+/g, " ")
          .slice(0, 140);
      failed.push({ status, reason });
      // endpoint é capability URL — loga só o sufixo, suficiente pra distinguir aparelhos
      console.error("send-push: falha de entrega", {
        user_id,
        status,
        reason,
        endpoint_fim: s.endpoint.slice(-12),
      });
      if (status === 404 || status === 410) {
        await admin.from("push_subscriptions").delete().eq("id", s.id);
      }
    }
  }

  const total = (subs ?? []).length;
  return new Response(
    JSON.stringify(failed.length ? { sent, total, failed } : { sent, total }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
