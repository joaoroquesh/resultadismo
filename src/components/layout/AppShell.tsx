import type { ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { PublicShell } from "./PublicShell";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";
import { AccessGate } from "@/features/access/AccessGate";
import { ConsentBanner } from "@/features/consent/ConsentBanner";
import { useAuth } from "@/features/auth/AuthProvider";

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
      {content}
      <ConsentBanner />
    </>
  );
}
