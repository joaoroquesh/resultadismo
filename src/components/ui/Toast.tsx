import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "error" | "info";
interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const icons: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="size-5 text-grass-600" />,
  error: <AlertCircle className="size-5 text-flame-600" />,
  info: <Info className="size-5 text-brand-600" />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = Date.now() + Math.random();
      setToasts((t) => [...t, { id, message, tone }]);
      setTimeout(() => remove(id), 3800);
    },
    [remove],
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[100] flex flex-col items-center gap-2 px-4">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            aria-live={t.tone === "error" ? "assertive" : "polite"}
            aria-atomic="true"
            className={cn(
              "animate-pop-in pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-md bg-surface p-3 shadow-[var(--shadow-pop)] ring-1 ring-border",
            )}
          >
            {icons[t.tone]}
            <p className="flex-1 text-sm font-medium text-ink-900">{t.message}</p>
            <button
              onClick={() => remove(t.id)}
              aria-label="Fechar"
              className="text-ink-400 hover:text-ink-700"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast deve ser usado dentro de <ToastProvider>");
  return ctx;
}
