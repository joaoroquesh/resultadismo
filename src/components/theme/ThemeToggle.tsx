import { Sun, Moon, Monitor } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { cn } from "@/lib/utils";

const options = [
  { value: "light", icon: Sun, label: "Claro" },
  { value: "dark", icon: Moon, label: "Escuro" },
  { value: "system", icon: Monitor, label: "Sistema" },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="inline-flex items-center gap-0.5 rounded-pill bg-ink-100 p-0.5">
      {options.map((o) => {
        const Icon = o.icon;
        const active = theme === o.value;
        return (
          <button
            key={o.value}
            onClick={() => setTheme(o.value)}
            aria-label={o.label}
            aria-pressed={active}
            className={cn(
              "flex size-8 items-center justify-center rounded-pill transition-colors",
              active ? "bg-surface text-brand-600 shadow-[var(--shadow-soft)]" : "text-ink-400 hover:text-ink-600",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
