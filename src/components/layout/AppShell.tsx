import { lazy, Suspense, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { PublicShell } from "./PublicShell";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { AccessGate } from "@/features/access/AccessGate";
import { PresenceTracker } from "@/features/presence/PresenceTracker";
import { ConsentBanner } from "@/features/consent/ConsentBanner";
import { useAuth } from "@/features/auth/AuthProvider";

// DevPanel de homologação — SÓ em dev. Lazy + gate garantem que não entra no
// bundle de produção (em prod, import.meta.env.DEV é false → nunca importa).
const DevPanel = import.meta.env.DEV
  ? lazy(() => import("@/features/dev/DevPanel").then((m) => ({ default: m.DevPanel })))
  : null;

export function AppShell() {
  const { session, loading } = useAuth();

  let content: ReactNode;

  // Auth ainda resolvendo: loading sutil (não decide entre landing e app ainda,
  // evitando flash da landing para quem está logado).
  if (loading) {
    content = (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <img src="/brand/Resultadismo-anime.svg" alt="Carregando" className="size-20" />
      </div>
    );
  } else if (!session) {
    // Visitante deslogado: landing page pública (sem sidebar, sem fila de acesso).
    content = (
      <PublicShell>
        <Outlet />
      </PublicShell>
    );
  } else {
    content = (
      <AccessGate>
        <PresenceTracker />
        <div className="min-h-dvh lg:flex">
          <Sidebar />
          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
          <BottomNav />
          <InstallPrompt />
        </div>
      </AccessGate>
    );
  }

  return (
    <>
      <MaintenanceBanner />
      {content}
      <ConsentBanner />
      {DevPanel && (
        <Suspense fallback={null}>
          <DevPanel />
        </Suspense>
      )}
    </>
  );
}
