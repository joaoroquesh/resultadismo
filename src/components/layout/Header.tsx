import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthProvider";
import { NotificationsBell } from "@/features/notifications/NotificationsBell";

export function Header({ title, action }: { title?: string; action?: ReactNode }) {
  const { session } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/Resultadismo.svg" alt="Resultadismo" className="size-7" />
          <span className="text-base font-extrabold tracking-tight text-ink-950">
            {title ?? "Resultadismo"}
          </span>
        </Link>
        <div className="flex items-center gap-1">
          {action}
          {session && <NotificationsBell />}
        </div>
      </div>
    </header>
  );
}
