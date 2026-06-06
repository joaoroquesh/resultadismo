import { useCallback, useState } from "react";

/**
 * Marca "o usuário já viu X" usando localStorage (sem banco de dados).
 *
 * Retorna [aindaNaoViu, marcarComoVisto]:
 *  - `aindaNaoViu` já vem certo na 1ª renderização (lazy init): `true` se a chave
 *    ainda não existe, `false` se já existe (evita flash em quem já viu).
 *  - `marcarComoVisto()` grava a chave e esconde o conteúdo.
 *
 * Útil para onboarding e dicas de primeiro acesso.
 */
export function useFirstSeen(key: string): [boolean, () => void] {
  const [pending, setPending] = useState(() => {
    try {
      return localStorage.getItem(key) == null;
    } catch {
      // localStorage indisponível (modo privado/SSR): não mostra a dica.
      return false;
    }
  });

  const markSeen = useCallback(() => {
    setPending(false);
    try {
      localStorage.setItem(key, "1");
    } catch {
      // ignora falha de escrita
    }
  }, [key]);

  return [pending, markSeen];
}
