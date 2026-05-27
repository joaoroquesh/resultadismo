import { supabase } from "./supabase";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

/**
 * Chama uma RPC do Postgres sem depender dos tipos gerados em `database.ts`
 * (regenerado por outra frente do projeto).
 *
 * IMPORTANTE: chamamos `.rpc` COMO MÉTODO de `supabase` (não desestruturamos em
 * uma variável) para preservar o binding de `this` do client. Detachar o método
 * (`const call = supabase.rpc; call(...)`) faz o `this` virar undefined e a
 * chamada lança erro síncrono em runtime — a requisição nunca é enviada.
 */
export function rpcCall<T = unknown>(
  fn: string,
  args?: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const client = supabase as unknown as {
    rpc: (f: string, a?: Record<string, unknown>) => Promise<RpcResult<T>>;
  };
  return client.rpc(fn, args);
}
