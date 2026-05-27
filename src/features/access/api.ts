import { supabase } from "@/lib/supabase";

// Portão de acesso (sala de espera). Usa SÓ RPC (HTTP) + polling — nunca Realtime —
// porque precisa funcionar exatamente quando o Realtime está saturado.

const TOKEN_KEY = "rd_access_token";

export type AccessResult = {
  admitted: boolean;
  token?: string;
  position?: number;
  active?: number;
  max_active?: number;
  poll_seconds?: number;
  enabled?: boolean;
};

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | undefined): void {
  if (!token) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage indisponível — segue sem persistir o token */
  }
}

export async function requestAccess(): Promise<AccessResult> {
  const token = getToken();
  const { data, error } = await supabase.rpc(
    "request_access",
    token ? { p_token: token } : {},
  );
  if (error) throw error;
  const res = (data ?? { admitted: true }) as AccessResult;
  setToken(res.token);
  return res;
}

/** true = continua dentro; false = perdeu a vaga, deve voltar a pedir acesso. */
export async function heartbeatAccess(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  const { data, error } = await supabase.rpc("heartbeat_access", { p_token: token });
  // Fail-open: um erro de heartbeat não pode derrubar quem já está dentro.
  if (error) return true;
  return ((data as { ok?: boolean } | null)?.ok ?? true) === true;
}

/** Libera a vaga ao fechar a aba/sair. Best-effort. */
export function releaseAccess(): void {
  const token = getToken();
  if (!token) return;
  void supabase.rpc("release_access", { p_token: token });
}
