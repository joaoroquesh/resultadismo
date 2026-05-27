import { NavLink, Link } from "react-router-dom";
import { Goal, Shield, User, ShieldCheck, LogIn, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { NotificationsBell } from "@/features/notifications/NotificationsBell";

export function Sidebar() {
  const { profile, user, isAppAdmin, session } = useAuth();

  const items = [
    { to: "/", label: "Jogos", icon: Goal, end: true },
    ...(session
      ? [
          { to: "/ligas", label: "Ligas", icon: Shield, end: false },
          { to: "/perfil", label: "Perfil", icon: User, end: false },
          ...(isAppAdmin ? [{ to: "/admin", label: "Admin", icon: ShieldCheck, end: false }] : []),
        ]
      : []),
    { to: "/como-funciona", label: "Como funciona", icon: HelpCircle, end: false },
  ];

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface-2 px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center justify-between px-2">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/brand/Resultadismo.svg" alt="" className="size-8" />
          <span className="text-lg font-extrabold tracking-tight text-ink-950">Resultadismo</span>
        </Link>
        {session && <NotificationsBell />}
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors",
                isActive
                  ? "bg-brand-600 text-white shadow-[var(--shadow-brand)]"
                  : "text-ink-600 hover:bg-ink-100 hover:text-ink-900",
              )
            }
          >
            <Icon className="size-5" strokeWidth={2.2} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-4 space-y-4">
        <ThemeToggle />
        {session ? (
          <Link
            to="/perfil"
            className="flex items-center gap-3 rounded-md p-2 transition-colors hover:bg-ink-100"
          >
            <Avatar src={profile?.avatar_url} name={profile?.display_name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">
                {profile?.display_name ?? "Jogador"}
              </p>
              <p className="truncate text-xs text-ink-400">{user?.email}</p>
            </div>
          </Link>
        ) : (
          <Link to="/login">
            <Button fullWidth>
              <LogIn className="size-4" /> Entrar
            </Button>
          </Link>
        )}
      </div>
    </aside>
  );
}
