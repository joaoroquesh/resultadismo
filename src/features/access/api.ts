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
  // Precisa de `fetch` com keepalive: no `pagehide` a página está morrendo, e um
  // `supabase.rpc(...)` (builder lazy, não-awaited) nem chega a disparar — a vaga
  // só sairia pelo TTL de 45s. keepalive deixa o POST sobreviver ao unload.
  // `release_access` é grant `anon` (deleta a sessão pelo token-capacidade), então
  // basta a apikey — não depende do token de sessão do usuário.
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  try {
    void fetch(`${url}/rest/v1/rpc/release_access`, {
      method: "POST",
      keepalive: true,
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ p_token: token }),
    }).catch(() => {
      /* best-effort: o TTL de 45s é a rede de segurança */
    });
  } catch {
    /* best-effort */
  }
}
