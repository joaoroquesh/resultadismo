import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthProvider";
import { getPushState, subscribePush } from "@/features/notifications/push";

// Banner discreto pra ativar notificações nos primeiros acessos (2x) de quem
// ainda não ativou. O 1º acesso já é coberto pela tela final do onboarding;
// a opção permanente fica no Perfil. Não aparece em /perfil*.
const COUNT_KEY = "rsd:notif-prompt-count";
const MAX_SHOWS = 2;

export function NotifPrompt() {
  const { user } = useAuth();
  const onProfile = useLocation().pathname.startsWith("/perfil");
  const { data: push } = useQuery({
    queryKey: ["notif-prompt-state"],
    queryFn: getPushState,
    enabled: !!user && !onProfile,
    staleTime: 60_000,
  });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const eligible = !!user && !onProfile && !!push?.supported && !push.subscribed;

  useEffect(() => {
    if (!eligible) return;
    let count = 0;
    try {
      count = Number(localStorage.getItem(COUNT_KEY) ?? "0");
    } catch {
      /* ignore */
    }
    if (count >= MAX_SHOWS) return;
    const t = window.setTimeout(() => {
      setShow(true);
      try {
        localStorage.setItem(COUNT_KEY, String(count + 1));
      } catch {
        /* ignore */
      }
    }, 1500);
    return () => clearTimeout(t);
  }, [eligible]);

  if (!show || !eligible) return null;

  const activate = async () => {
    if (!user) return;
    setBusy(true);
    await subscribePush(user.id);
    setBusy(false);
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Ativar notificações"
      className={cn(
        "animate-rise fixed inset-x-3 z-50 mx-auto max-w-sm rounded-lg bg-surface p-4 ring-1 ring-border",
        "shadow-[var(--shadow-pop)]",
        "bottom-[calc(5rem+env(safe-area-inset-bottom))] lg:inset-x-auto lg:right-6 lg:bottom-6 lg:mx-0",
      )}
    >
      <button
        type="button"
        onClick={() => setShow(false)}
        aria-label="Fechar"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-full text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-600"
      >
        <X className="size-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <div className="grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 text-brand-600">
          <Bell className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-900">Não perca nenhum palpite</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Ative as notificações pra ser lembrado antes dos jogos.
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={() => setShow(false)}>
          Agora não
        </Button>
        <Button size="sm" onClick={activate} loading={busy}>
          <Bell className="size-4" /> Ativar
        </Button>
      </div>
    </div>
  );
}
