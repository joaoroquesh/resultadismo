import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { getConsent, setConsent, type ConsentChoice } from "./consent";

/**
 * Banner sutil no rodapé que aparece **apenas na primeira visita** (até o
 * usuário decidir). Enquanto não escolher, o GA fica em modo "denied" (default
 * no index.html). Aceitar libera analytics_storage; recusar mantém negado.
 *
 * UX: discreto, on-brand (cor de superfície + turquesa), responsivo (empilha
 * no mobile, lado a lado no desktop), link para a Política de Privacidade.
 */
export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsent() === null);
  }, []);

  if (!visible) return null;

  function choose(c: ConsentChoice) {
    setConsent(c);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookies e privacidade"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="pointer-events-auto mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-ink-700">
          Usamos um pouquinho de Google Analytics pra entender como o app é usado e melhorar o que
          importa pra galera. Nada de rastreio publicitário.{" "}
          <Link
            to="/privacidade"
            className="font-semibold text-brand-600 underline-offset-2 hover:underline"
          >
            Saiba mais
          </Link>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" size="sm" onClick={() => choose("denied")}>
            Recusar
          </Button>
          <Button size="sm" onClick={() => choose("granted")}>
            Aceitar
          </Button>
        </div>
      </div>
    </div>
  );
}
