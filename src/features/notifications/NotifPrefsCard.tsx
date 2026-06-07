import { CalendarClock, Hand, Megaphone } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
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
              <Switch
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
