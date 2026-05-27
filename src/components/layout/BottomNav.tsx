import { NavLink } from "react-router-dom";
import { Goal, Shield, User } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { to: "/", label: "Jogos", icon: Goal, end: true },
  { to: "/ligas", label: "Ligas", icon: Shield, end: false },
  { to: "/perfil", label: "Perfil", icon: User, end: false },
];

export function BottomNav() {
  return (
    <nav className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink-200/70 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-stretch justify-around">
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
      </div>
    </nav>
  );
}
