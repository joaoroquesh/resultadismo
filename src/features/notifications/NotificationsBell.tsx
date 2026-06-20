import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromNow, dayjs } from "@/lib/format";
import {
  useNotifications,
  useUnreadCount,
  useMarkAllRead,
  useNotificationsRealtime,
} from "./api";
import { setBadge } from "./badge";
import type { Notification } from "./api";

// Destino de cada notificação: o backend manda data.url; sem ele, cai no
// destino natural do tipo (onde dá pra RESOLVER a notificação).
function notificationUrl(n: Notification): string {
  const fromData = typeof n.data?.url === "string" ? (n.data.url as string) : null;
  if (fromData) return fromData;
  switch (n.type) {
    case "feedback_reply":
      return "/construa";
    case "admin_alert":
      return "/admin?t=alertas";
    default:
      return "/"; // nudge/deadline/broadcast → palpitar nos Jogos
  }
}

// Cutucada: tempo que falta pro jogo, calculado AGORA (na leitura), não no envio.
function kickoffHint(n: Notification): string | null {
  if (n.type !== "nudge") return null;
  const iso = typeof n.data?.kickoff_at === "string" ? (n.data.kickoff_at as string) : null;
  if (!iso) return null;
  const ko = dayjs(iso);
  if (!ko.isValid()) return null;
  const mins = ko.diff(dayjs(), "minute");
  if (mins <= 0) return null; // jogo já começou
  if (mins < 60) return `começa em ${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `começa em ${hours}h`;
  const days = Math.round(hours / 24);
  return `começa em ${days} ${days === 1 ? "dia" : "dias"}`;
}

export function NotificationsBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const { data: notifications } = useNotifications();
  const { data: unreadTotal } = useUnreadCount();
  const markRead = useMarkAllRead();
  useNotificationsRealtime();
  const [open, setOpen] = useState(false);

  // Pra exibir, conta na lista local (capada em 30); pro badge do app, usa o
  // total real do banco (get_unread_count) quando já carregou.
  const unread = (notifications ?? []).filter((n) => !n.read_at).length;
  const badgeCount = unreadTotal ?? unread;

  // Badge do ícone do app (só PWA instalado; no-op no navegador).
  useEffect(() => {
    setBadge(badgeCount);
  }, [badgeCount]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markRead.mutate();
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        aria-label="Notificações"
        className={cn(
          "relative flex size-9 items-center justify-center rounded-pill text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-800",
          className,
        )}
      >
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-flame-600 text-[9px] font-bold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Fechar"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          {/* Mobile (sino à direita no header) abre p/ esquerda; desktop (sino no
              sidebar à esquerda) abre p/ direita — senão sai da tela. */}
          <div className="animate-pop-in absolute right-0 top-11 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-pop)] ring-1 ring-border lg:left-0 lg:right-auto">
            <div className="border-b border-border px-4 py-2.5 text-sm font-bold text-ink-900">
              Notificações
            </div>
            <div className="max-h-96 overflow-y-auto">
              {!notifications || notifications.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-ink-400">Nada por aqui ainda.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          navigate(notificationUrl(n));
                        }}
                        className="w-full px-4 py-3 text-left transition hover:bg-ink-50 active:bg-ink-100"
                      >
                        <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                        {(() => {
                          const hint = kickoffHint(n); // "começa em 6h" | null
                          const text = n.body
                            ? hint
                              ? `${n.body} que ${hint}`
                              : n.body
                            : null;
                          return text ? (
                            <p className="mt-0.5 text-xs text-ink-500">{text}</p>
                          ) : null;
                        })()}
                        <p className="mt-1 text-[10px] text-ink-400">{fromNow(n.created_at)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
