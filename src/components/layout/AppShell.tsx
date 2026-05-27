import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { InstallPrompt } from "@/components/pwa/InstallPrompt";

export function AppShell() {
  return (
    <div className="min-h-dvh lg:flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
      <BottomNav />
      <InstallPrompt />
    </div>
  );
}
