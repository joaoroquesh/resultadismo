import { useEffect, useState, type ReactNode } from "react";
import { requestAccess, heartbeatAccess, releaseAccess, type AccessResult } from "./api";
import { WaitingRoom, AccessSplash } from "./WaitingRoom";

type Status = "checking" | "admitted" | "waiting";

const HEARTBEAT_MS = 20_000;
const DEFAULT_POLL_MS = 5_000;

/**
 * Envolve o app. Sob carga normal, admite na hora (1 chamada HTTP) e fica
 * invisível. Perto do teto de simultâneos, segura novos acessos numa fila
 * FIFO e mostra a sala de espera, admitindo conforme abrem vagas — em vez de
 * derrubar a experiência de quem já está dentro. Falha aberto: qualquer erro
 * no portão admite o usuário (a fila nunca pode virar um apagão).
 */
export function AccessGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [info, setInfo] = useState<AccessResult | null>(null);

  useEffect(() => {
    let alive = true;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let hbTimer: ReturnType<typeof setInterval> | undefined;
    let pollMs = DEFAULT_POLL_MS;

    const stopPoll = () => {
      if (pollTimer) clearTimeout(pollTimer);
      pollTimer = undefined;
    };
    const stopHeartbeat = () => {
      if (hbTimer) clearInterval(hbTimer);
      hbTimer = undefined;
    };

    const startHeartbeat = () => {
      stopHeartbeat();
      hbTimer = setInterval(async () => {
        const ok = await heartbeatAccess();
        if (!ok && alive) {
          // Perdeu a vaga (expirou/foi recuperada): volta para a fila.
          stopHeartbeat();
          setStatus("waiting");
          void check();
        }
      }, HEARTBEAT_MS);
    };

    const check = async () => {
      try {
        const res = await requestAccess();
        if (!alive) return;
        setInfo(res);
        if (res.poll_seconds) pollMs = res.poll_seconds * 1000;
        if (res.admitted) {
          setStatus("admitted");
          stopPoll();
          startHeartbeat();
        } else {
          setStatus("waiting");
          stopPoll();
          pollTimer = setTimeout(() => void check(), pollMs);
        }
      } catch {
        // Fail-open: nunca trava o app por erro/fila indisponível.
        if (alive) {
          setStatus("admitted");
          stopPoll();
        }
      }
    };

    void check();

    const onHide = () => releaseAccess();
    window.addEventListener("pagehide", onHide);

    return () => {
      alive = false;
      stopPoll();
      stopHeartbeat();
      window.removeEventListener("pagehide", onHide);
    };
  }, []);

  if (status === "admitted") return <>{children}</>;
  if (status === "waiting") return <WaitingRoom info={info} />;
  return <AccessSplash />;
}
