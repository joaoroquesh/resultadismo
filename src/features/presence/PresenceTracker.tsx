import { useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";

// Presença ("online") + tempo de uso — desacoplado da sala de espera.
// Antes, "online"/tempo de uso eram parasitas da fila de acesso (só contavam
// com sessão ativa em access_sessions). Como a fila vive DESLIGADA no dia a dia,
// ninguém aparecia online. Agora todo usuário logado bate um heartbeat leve
// (touch_presence) que grava profiles.last_active_at + usage_seconds.
const PRESENCE_MS = 30_000;

/**
 * Marca presença para o usuário logado: bate ao montar (aparece online na hora)
 * e a cada 30s enquanto a aba está VISÍVEL (aba escondida não conta como uso
 * ativo). Falha em silêncio — presença nunca pode derrubar nada.
 * Renderiza null; é só um efeito. Montado no ramo logado do AppShell.
 */
export function PresenceTracker() {
  const { user } = useAuth();
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let alive = true;

    const beat = async () => {
      if (!alive || document.visibilityState !== "visible") return;
      // Precisa de await/then: o builder do supabase-js é "lazy" e só dispara o
      // HTTP quando consumido. Erro de presença é engolido (nunca derruba nada).
      try {
        await supabase.rpc("touch_presence");
      } catch {
        /* presença é best-effort */
      }
    };

    const tick = () => void beat(); // wrapper síncrono p/ timer/listener

    tick(); // online imediato (o admin vê sem esperar o intervalo)
    const timer = setInterval(tick, PRESENCE_MS);
    document.addEventListener("visibilitychange", tick);

    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [userId]);

  return null;
}
