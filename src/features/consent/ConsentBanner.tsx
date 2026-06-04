import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { setConsent, useConsent, type ConsentChoice } from "./consent";

/**
 * Banner sutil no rodapé que aparece **apenas na primeira visita** (até o
 * usuário decidir) ou quando ele limpou a escolha pelo centro de privacidade.
 *
 * Enquanto não escolher, o GA fica em modo "denied" (default no index.html).
 * Aceitar libera analytics_storage; Recusar mantém negado. "Recusar" é link
 * discreto pra não competir com o CTA.
 */
export function ConsentBanner() {
  const choice = useConsent();
  if (choice !== null) return null;

  function choose(c: ConsentChoice) {
    setConsent(c);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookies e privacidade"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3 pb-3 sm:px-4 sm:pb-4"
    >
      <div className="pointer-events-auto mx-auto flex max-w-2xl flex-col gap-3 rounded-2xl border border-border bg-surface-2 p-4 shadow-[var(--shadow-soft)] sm:flex-row sm:items-center">
        <p className="flex-1 text-sm text-ink-700">
          Topa nos ajudar a melhorar o app? A gente usa Google Analytics pra saber quais telas a
          galera curte mais. <strong>IP anonimizado</strong>, sem rastreio publicitário e dá pra
          desativar quando quiser nas configurações.{" "}
          <Link
            to="/privacidade"
            className="font-semibold text-brand-600 underline-offset-2 hover:underline"
          >
            Saiba mais
          </Link>
          .
        </p>
        <div className="flex w-full shrink-0 items-center justify-between gap-4 sm:w-auto sm:justify-start">
          {/* Recusar fica como link discreto pra não competir com o CTA. No
              mobile o pai empilha vertical e este container abre os dois nas
              extremidades (Recusar à esquerda, Aceitar à direita). */}
          <button
            type="button"
            onClick={() => choose("denied")}
            className="text-xs font-medium text-ink-400 underline-offset-2 transition-colors hover:text-ink-600 hover:underline"
          >
            Recusar
          </button>
          <Button size="sm" onClick={() => choose("granted")}>
            Aceitar
          </Button>
        </div>
      </div>
    </div>
  );
}
