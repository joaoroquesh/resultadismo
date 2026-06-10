import { type ReactNode } from "react";
import { track } from "@/lib/analytics";
import { Link } from "react-router-dom";
import { LogIn } from "lucide-react";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { ConsentLink } from "@/features/consent/ConsentDialog";
import { Button } from "@/components/ui/Button";

/**
 * Casca pública (visitante deslogado): vira uma landing page.
 * Desktop ganha uma barra de marca própria no lugar da sidebar; no mobile
 * o cabeçalho de marca vem do <Header> do <Page> (que mostra "Resultadismo"
 * quando a página não passa título). Rodapé em todos os tamanhos.
 */
export function PublicShell({ children }: { children: ReactNode }) {
  const { open: openLogin } = useLoginModal();

  return (
    <div className="flex min-h-dvh flex-col">
      {/* barra de marca — só desktop (no mobile o Header do Page assume) */}
      <header className="sticky top-0 z-30 hidden border-b border-border bg-surface-2/85 backdrop-blur-md lg:block">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/brand/Resultadismo.svg" alt="" className="size-8" />
            <span className="text-lg font-extrabold tracking-tight text-ink-950">Resultadismo</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/retro"
              className="rounded-pill px-3 py-2 text-sm font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              Retrô 🕹️
            </Link>
            <Link
              to="/como-funciona"
              className="rounded-pill px-3 py-2 text-sm font-semibold text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              Como funciona
            </Link>
            <ThemeToggle />
            <Button onClick={openLogin} className="ml-1">
              <LogIn className="size-4" /> Entrar
            </Button>
          </nav>
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <PublicFooter onLogin={openLogin} />
    </div>
  );
}

function PublicFooter({ onLogin }: { onLogin: () => void }) {
  return (
    <footer className="mt-16 border-t border-border bg-surface-2">
      <div className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
        {/* faixa de fechamento: convida a entrar */}
        <div className="flex flex-col items-center gap-3 border-b border-border pb-8 text-center">
          <img src="/brand/Resultadismo.svg" alt="" className="size-10" />
          <p className="max-w-sm text-balance text-lg font-bold tracking-tight text-ink-950">
            Palpite nos jogos e dispute com os amigos.
          </p>
          <Button
            size="lg"
            onClick={() => {
              track("cta_click", { location: "footer" });
              onLogin();
            }}
          >
            Criar conta grátis
          </Button>
        </div>

        {/* navegação do rodapé + tema */}
        <div className="flex flex-col items-center justify-between gap-5 pt-6 sm:flex-row">
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm font-medium text-ink-500">
            <Link to="/como-funciona" className="transition-colors hover:text-ink-900">
              Como funciona
            </Link>
            <Link to="/termos" className="transition-colors hover:text-ink-900">
              Termos
            </Link>
            <Link to="/privacidade" className="transition-colors hover:text-ink-900">
              Privacidade
            </Link>
            <ConsentLink />
          </nav>
          <ThemeToggle />
        </div>

        <p className="mt-6 text-center text-xs text-ink-400">
          © 2026 Resultadismo. Feito pra torcedor. ⚽
        </p>
      </div>
    </footer>
  );
}
