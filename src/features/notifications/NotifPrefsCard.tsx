import { CalendarClock, Hand, Megaphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import {
  useNotificationPrefs,
  useSetNotificationPref,
  type NotifPrefKey,
} from "./prefs";

const ITEMS: { key: NotifPrefKey; label: string; help: string; icon: typeof CalendarClock }[] = [
  {
    key: "deadline",
    label: "Lembretes",
    help: "Quando o prazo de palpitar tá acabando.",
    icon: CalendarClock,
  },
  {
    key: "nudge",
    label: "Cutucadas",
    help: "Quando alguém te cutuca pra você não esquecer.",
    icon: Hand,
  },
  {
    key: "broadcast",
    label: "Avisos",
    help: "Novidades e recados do Resultadismo.",
    icon: Megaphone,
  },
];

function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-pill transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        "disabled:opacity-50",
        checked ? "bg-brand-600" : "bg-ink-200",
      )}
    >
      <span
        className={cn(
          "inline-block size-5 rounded-full bg-white shadow-sm transition-transform",
          checked ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      />
    </button>
  );
}

/**
 * Toggles de tipo de notificação. Só aparece quando o push já está inscrito
 * (entra no card de Notificações do Perfil). As preferências valem pra conta
 * toda, em qualquer dispositivo, não só neste navegador.
 */
export function NotifPrefsCard() {
  const { data: prefs, isPending } = useNotificationPrefs();
  const setPref = useSetNotificationPref();

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border px-4 py-3">
        <p className="text-xs font-semibold text-ink-900">O que você quer receber</p>
        <p className="mt-0.5 text-[11px] text-ink-500">Vale pra sua conta, em qualquer aparelho.</p>
      </div>
      <ul className="divide-y divide-border">
        {ITEMS.map(({ key, label, help, icon: Icon }) => {
          const checked = prefs?.[key] ?? true;
          return (
            <li key={key} className="flex items-center gap-3 px-4 py-3">
              <Icon className="size-5 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900">{label}</p>
                <p className="text-xs text-ink-500">{help}</p>
              </div>
              <Toggle
                checked={checked}
                disabled={isPending || setPref.isPending}
                label={label}
                onChange={(v) => setPref.mutate({ type: key, enabled: v })}
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
