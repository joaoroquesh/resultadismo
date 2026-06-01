import type { ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import type { AccessResult } from "./api";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-brand-600 px-6 py-10 text-center">
      <div className="w-full max-w-sm rounded-2xl bg-surface p-8 shadow-[var(--shadow-soft)] ring-1 ring-black/5">
        {children}
      </div>
      <p className="text-xs font-medium text-white/80">
        Resultadismo — segurando a fila pra ninguém ficar na mão
      </p>
    </div>
  );
}

/**
 * Loading sutil enquanto o portão decide (quase sempre instantâneo).
 * NÃO usa a tela de fila — só o logo animado no fundo normal do app, para não
 * dar a impressão de "fila cheia" num carregamento comum.
 */
export function AccessSplash() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <img src="/brand/Resultadismo-anime.svg" alt="Carregando" className="size-20" />
    </div>
  );
}

export function WaitingRoom({ info }: { info: AccessResult | null }) {
  const position = info?.position;
  return (
    <Frame>
      <img src="/brand/Resultadismo.svg" alt="Resultadismo" className="mx-auto mb-4 size-14" />
      <Spinner className="mx-auto mb-4 size-7" />
      <h1 className="text-lg font-extrabold text-ink-900">Tem muita gente junto agora! ⚽</h1>
      <p className="mt-2 text-sm text-ink-500">
        Segura aí — assim que abrir uma vaga você entra automaticamente.
        Não precisa atualizar a página.
      </p>
      {position != null && (
        <div className="mt-5 inline-flex items-center gap-2 rounded-pill bg-brand-50 px-4 py-1.5 text-sm font-bold text-brand-700">
          Sua posição na fila: {position}
        </div>
      )}
    </Frame>
  );
}
