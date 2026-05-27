import { supabase } from "@/lib/supabase";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushConfigured(): boolean {
  return !!import.meta.env.VITE_VAPID_PUBLIC_KEY && "PushManager" in window;
}

export async function subscribePush(userId: string): Promise<{ ok: boolean; error?: string }> {
  const key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) return { ok: false, error: "Notificações ainda não configuradas." };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "Seu navegador não suporta notificações." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, error: "Permissão negada." };

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key) as BufferSource,
  });
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: userId,
      endpoint: json.endpoint!,
      p256dh: json.keys!.p256dh,
      auth: json.keys!.auth,
      user_agent: navigator.userAgent,
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
