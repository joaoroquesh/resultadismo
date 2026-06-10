import { NavLink } from "react-router-dom";
import { Goal, Trophy, User, LogIn, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";

export function BottomNav() {
  const { session } = useAuth();
  const { open: openLogin } = useLoginModal();

  const items: { to: string; label: string; icon: LucideIcon; end: boolean; tour?: string }[] = [
    { to: "/", label: "Jogos", icon: Goal, end: true },
    ...(session
      ? [
          { to: "/grupos", label: "Grupos", icon: Trophy, end: false, tour: "nav-grupos" },
          { to: "/perfil", label: "Perfil", icon: User, end: false, tour: "nav-perfil" },
        ]
      : []),
  ];

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {items.map(({ to, label, icon: Icon, end, tour }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            data-tour={tour}
            className={({ isActive }) =>
              cn(
                "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                isActive ? "text-brand-600" : "text-ink-400 hover:text-ink-600",
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn("size-6", isActive && "fill-brand-100")} strokeWidth={2.2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
        {!session && (
          <button
            type="button"
            onClick={openLogin}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-ink-400 transition-colors hover:text-ink-600"
          >
            <LogIn className="size-6" strokeWidth={2.2} />
            Entrar
          </button>
        )}
      </div>
    </nav>
  );
}
