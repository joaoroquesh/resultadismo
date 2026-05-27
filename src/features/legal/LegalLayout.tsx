import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/** Layout simples e público para documentos legais (sem shell/fila de acesso). */
export function LegalLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition-colors hover:text-brand-700"
          >
            <ArrowLeft className="size-4" /> Resultadismo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-ink-950 sm:text-3xl">{title}</h1>
        <p className="mt-1 text-sm text-ink-400">Última atualização: {updatedAt}</p>

        <div className="legal mt-6 space-y-6 text-[15px] leading-relaxed text-ink-700">
          {children}
        </div>

        <footer className="mt-12 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-6 text-sm text-ink-500">
          <Link to="/privacidade" className="font-medium text-brand-600 hover:text-brand-700">
            Política de Privacidade
          </Link>
          <Link to="/termos" className="font-medium text-brand-600 hover:text-brand-700">
            Termos de Serviço
          </Link>
          <Link to="/" className="font-medium text-brand-600 hover:text-brand-700">
            Voltar ao app
          </Link>
        </footer>
      </main>
    </div>
  );
}

/** Bloco de seção: título + corpo. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold text-ink-900">{title}</h2>
      {children}
    </section>
  );
}
