import { useEffect } from "react";
import { Link, Outlet } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { ConsentBanner } from "@/features/consent/ConsentBanner";
import { track } from "@/lib/analytics";
import { RetroStripes } from "./RetroFx";

// Casca própria do Retrô — produto separado do app-mãe (rumo ao subdomínio próprio):
// sem Sidebar/BottomNav/header do Resultadismo e SEM link de saída no topo. As
// referências ao bolão ficam nos CTAs do conteúdo, não numa porta no cabeçalho.
export function RetroShell() {
  // funil: marca a abertura do Retrô (origem inferida pelo referrer) uma vez por sessão
  useEffect(() => {
    const ref = document.referrer || "";
    const origem = !ref ? "direto" : /\/retro\/r\//.test(ref) ? "share" : ref.includes(window.location.host) ? "interno" : "externo";
    track("retro_open", { origem });
  }, []);

  // tempo de tela SÓ do Retrô (anon + logado), separado do app-mãe — bate a cada 30s
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
    <div className="min-h-dvh bg-background text-ink-900">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <RetroStripes />
        <div className="mx-auto flex h-11 w-full max-w-md items-center justify-center px-4">
          <Link to="/retro" className="text-sm font-bold tracking-tight">
            🕹️ Resultadismo <span className="text-brand-700">Retrô</span>
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md px-4 py-4">
        <Outlet />
      </main>
      <ConsentBanner />
    </div>
  );
}
