import { NavLink } from "react-router-dom";
import { Goal, Trophy, User, LogIn, Gamepad2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { useLoginModal } from "@/features/auth/LoginModalProvider";

export function BottomNav() {
  const { session } = useAuth();
  const { open: openLogin } = useLoginModal();

  const items = [
    { to: "/", label: "Jogos", icon: Goal, end: true },
    { to: "/retro", label: "Retrô", icon: Gamepad2, end: false },
    ...(session
      ? [
          { to: "/grupos", label: "Grupos", icon: Trophy, end: false },
          { to: "/perfil", label: "Perfil", icon: User, end: false },
        ]
      : []),
  ];

  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/90 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-2xl items-stretch justify-around">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
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
