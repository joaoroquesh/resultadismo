import { Outlet } from "react-router-dom";
import { BottomNav } from "./BottomNav";

export function AppShell() {
  return (
    <div className="relative mx-auto min-h-dvh max-w-md bg-background shadow-sm sm:my-0">
      <Outlet />
      <BottomNav />
    </div>
  );
}
