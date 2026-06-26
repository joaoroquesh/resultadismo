import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { LogIn } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { ConsentBanner } from "@/features/consent/ConsentBanner";
import { MiniGameFooter } from "@/components/layout/MiniGameFooter";
import { Escudo } from "@/components/ui/Escudo";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";
import { track } from "@/lib/analytics";
import { RetroStripes } from "./RetroFx";

// Casca própria do Retrô — produto separado do app-mãe (rumo ao subdomínio próprio):
// sem Sidebar/BottomNav/header do Resultadismo. No topo à direita: ENTRAR (deslogado)
// ou o escudo do jogador (logado). A ponte pro bolão vive no rodapé, não no topo.
export function RetroShell() {
  const { user, profile } = useAuth();
  const { open: openLogin } = useLoginModal();

  // funil: marca a abertura do Retrô (origem inferida pelo referrer) uma vez por sessão
  useEffect(() => {
    const ref = document.referrer || "";
    const origem = !ref ? "direto" : /\/retro\/r\//.test(ref) ? "share" : ref.includes(window.location.host) ? "interno" : "externo";
    track("retro_open", { origem });
  }, []);

  // tempo de tela SÓ do Retrô (anon + logado), separado do app-mãe — bate a cada 30s
  // com a aba visível. O app-mãe (PresenceTracker) não roda aqui, então não mistura.
  useEffect(() => {
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.rpc("retro_touch", { p_seconds: 30 }).then(undefined, () => {});
    };
    beat();
    const id = window.setInterval(beat, 30_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-background text-ink-900">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <RetroStripes />
        <div className="mx-auto flex h-12 w-full max-w-md items-center justify-between px-4">
          <Link to="/retro" className="text-sm font-bold tracking-tight">
            🕹️ Resultadismo <span className="text-brand-700">Retrô</span>
          </Link>
          {user ? (
            <Link to="/retro/eu" aria-label="Minha Copa Retrô" className="shrink-0">
              <Escudo src={profile?.avatar_url} name={profile?.display_name} size="sm" className="size-7" />
            </Link>
          ) : (
            <Button size="sm" onClick={openLogin}>
              <LogIn className="size-4" /> Entrar
            </Button>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        <Outlet />
      </main>
      <MiniGameFooter gameName="Retrô" comoFuncionaTo="/retro/regras" />
      <ConsentBanner />
    </div>
  );
}
