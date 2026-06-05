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
          // Perdeu a vaga (expirou/recuperada): re-pede acesso. NÃO pinta a sala
          // de espera de forma otimista — quem decide o status é o check() com a
          // resposta autoritativa do banco (re-admite sem flash; só vai pra
          // "waiting" se de fato re-enfileirado).
          stopHeartbeat();
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
          // Heartbeat de FILA só quando a sala está LIGADA (há sessão a manter
          // viva). Com a sala desligada, request_access admite sem criar sessão:
          // o token é "seco", e bater heartbeat acharia v_state=null e nos jogaria
          // pra "waiting" a cada 20s (o piscar). Presença/online é do PresenceTracker.
          if (res.enabled === false) stopHeartbeat();
          else startHeartbeat();
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
