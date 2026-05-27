import { supabase } from "./supabase";

type RpcResult<T> = { data: T | null; error: { message: string } | null };

/**
 * Chama uma RPC do Postgres sem depender dos tipos gerados em `database.ts`.
 * Útil para funções novas enquanto o arquivo de tipos é regenerado por outra
 * frente do projeto — evita conflito de edição no database.ts compartilhado.
 */
export function rpcCall<T = unknown>(
  fn: string,
  args?: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const call = supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<RpcResult<T>>;
  return call(fn, args);
}
