import { Link, Outlet } from "react-router-dom";
import { ConsentBanner } from "@/features/consent/ConsentBanner";

// Faixa de listras (motivo visual do mini-jogo). Inline aqui pra não acoplar o
// Manager ao slice do Retrô (cada mini-jogo é isolado).
function ManagerStripes({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-1.5 ${className}`}
      style={{
        background:
          "linear-gradient(90deg, var(--color-grass-600) 0 25%, var(--color-gold-500) 0 50%, var(--color-brand-500) 0 75%, var(--color-aqua-700) 0)",
      }}
    />
  );
}

// Casca própria do Manager — separação total do app-mãe: sem Sidebar, sem
// BottomNav, sem header do Resultadismo, sem PresenceTracker. Mini-header com
// a volta explícita pro Resultadismo. Espelha o RetroShell.
export function ManagerShell() {
  return (
    <div className="min-h-dvh bg-background text-ink-900">
      <header className="sticky top-0 z-30 border-b border-border bg-surface/90 backdrop-blur-md">
        <ManagerStripes />
        <div className="mx-auto flex h-11 w-full max-w-[480px] items-center justify-between px-4">
          <Link to="/manager" className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
            <span>⚽ Resultadismo <span className="text-brand-700">Manager</span></span>
            <span
              className="rounded border border-gold-500/45 bg-gold-500/20 px-1.5 py-px text-[10px] font-black uppercase leading-none tracking-wider text-gold-700"
              title="Em fase de testes"
            >
              beta
            </span>
          </Link>
          <Link
            to="/"
            className="text-xs font-semibold text-ink-500 underline-offset-2 hover:underline"
          >
            ir pro Resultadismo →
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[480px] px-4 py-4">
        <Outlet />
      </main>
      <ConsentBanner />
    </div>
  );
}
