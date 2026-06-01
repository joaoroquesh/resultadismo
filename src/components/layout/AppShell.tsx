import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { PublicShell } from "./PublicShell";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { AccessGate } from "@/features/access/AccessGate";
import { useAuth } from "@/features/auth/AuthProvider";

export function AppShell() {
  const { session } = useAuth();

  // Visitante deslogado: landing page pública (sem sidebar, sem fila de acesso).
  if (!session) {
    return (
      <PublicShell>
        <Outlet />
      </PublicShell>
    );
  }

  return (
    <AccessGate>
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
