import { Link, Outlet } from "react-router-dom";
import { ConsentBanner } from "@/features/consent/ConsentBanner";
import { RetroStripes } from "./RetroFx";

// Casca própria do Retrô (rodada 6: separação total do app-mãe — sem Sidebar,
// sem BottomNav, sem header do Resultadismo). Mini-header com a volta explícita.
export function RetroShell() {
  return (
    <div className="min-h-dvh bg-background text-ink-900">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <RetroStripes />
        <div className="mx-auto flex h-11 w-full max-w-md items-center justify-between px-4">
          <Link to="/retro" className="text-sm font-bold tracking-tight">
            🕹️ Resultadismo <span className="text-brand-700">Retrô</span>
          </Link>
          <Link to="/" className="text-xs font-semibold text-ink-500 underline-offset-2 hover:underline">
            ir pro Resultadismo →
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
