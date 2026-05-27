import { useCallback, useEffect, useState } from "react";

/**
 * Marca "o usuário já viu X" usando localStorage (sem banco de dados).
 *
 * Retorna [aindaNaoViu, marcarComoVisto]:
 *  - `aindaNaoViu` é `false` na 1ª renderização (evita flash em quem já viu)
 *    e vira `true` num efeito caso a chave ainda não exista.
 *  - `marcarComoVisto()` grava a chave e esconde o conteúdo.
 *
 * Útil para onboarding e dicas de primeiro acesso.
 */
export function useFirstSeen(key: string): [boolean, () => void] {
  const [pending, setPending] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(key) == null) setPending(true);
    } catch {
      // localStorage indisponível (modo privado/SSR): não mostra a dica.
    }
  }, [key]);

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
