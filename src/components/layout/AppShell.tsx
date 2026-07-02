import { lazy, Suspense, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { PublicShell } from "./PublicShell";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { NotifPrompt } from "@/features/notifications/NotifPrompt";
import { MaintenanceBanner } from "./MaintenanceBanner";
import { MaintenanceScreen } from "./MaintenanceScreen";
import { useMaintenance } from "./maintenance";
import { AccessGate } from "@/features/access/AccessGate";
import { PresenceTracker } from "@/features/presence/PresenceTracker";
import { ConsentBanner } from "@/features/consent/ConsentBanner";
import { PersonalizationGate } from "@/features/onboarding/PersonalizationGate";
import { NovidadeQuemPassaModal } from "@/features/matches/NovidadeQuemPassaModal";
import { useAuth } from "@/features/auth/AuthProvider";
import { useProductAnalytics } from "@/lib/productAnalytics";

// DevPanel de homologação — SÓ em dev. Lazy + gate garantem que não entra no
// bundle de produção (em prod, import.meta.env.DEV é false → nunca importa).
const DevPanel = import.meta.env.DEV
  ? lazy(() => import("@/features/dev/DevPanel").then((m) => ({ default: m.DevPanel })))
  : null;

export function AppShell() {
  const { session, loading, isAppAdmin } = useAuth();
  const { data: maint } = useMaintenance();
  useProductAnalytics("app", { disabled: loading, signedIn: !!session });

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
  } else if (maint?.maintenance_mode && !isAppAdmin) {
    // Manutenção ligada: logado não-admin não acessa o app — vê a tela cheia.
    // (Visitante deslogado cai no ramo acima e segue na landing pública.)
    content = <MaintenanceScreen message={maint?.maintenance_message} />;
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
            <NotifPrompt />
        </div>
        <PersonalizationGate />
        <NovidadeQuemPassaModal />
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
