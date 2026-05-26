import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-5 animate-spin text-brand-600", className)} />;
}

export function LoadingScreen({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="flex min-h-[50dvh] flex-col items-center justify-center gap-3 text-ink-500">
      <Spinner className="size-7" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
