import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { PublicShell } from "./PublicShell";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { AccessGate } from "@/features/access/AccessGate";
import { useAuth } from "@/features/auth/AuthProvider";

export function AppShell() {
  const { session, loading } = useAuth();

  // Auth ainda resolvendo: loading sutil (não decide entre landing e app ainda,
  // evitando flash da landing para quem está logado).
  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <img src="/brand/Resultadismo-anime.svg" alt="Carregando" className="size-20" />
      </div>
    );
  }

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
