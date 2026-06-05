import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import { useNotifications, useMarkAllRead, useNotificationsRealtime } from "./api";

export function NotificationsBell({ className }: { className?: string }) {
  const { data: notifications } = useNotifications();
  const markRead = useMarkAllRead();
  useNotificationsRealtime();
  const [open, setOpen] = useState(false);

  const unread = (notifications ?? []).filter((n) => !n.read_at).length;

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
                    <li key={n.id} className="px-4 py-3">
                      <p className="text-sm font-semibold text-ink-900">{n.title}</p>
                      {n.body && <p className="mt-0.5 text-xs text-ink-500">{n.body}</p>}
                      <p className="mt-1 text-[10px] text-ink-400">{fromNow(n.created_at)}</p>
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
