import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

// Cronômetro da rodada: barra encolhendo; nos 3s finais mostra MILÉSIMOS e muda de
// cor (pedido do PO, D5). Âncora = montagem do componente (o pai remonta por jogo
// via key); o servidor revalida a janela de qualquer forma.
export function RetroTimer({
  totalSeconds,
  onExpire,
}: {
  totalSeconds: number | null;
  onExpire: () => void;
}) {
  const [leftMs, setLeftMs] = useState(() => (totalSeconds ?? 0) * 1000);
  const expireRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (totalSeconds == null) return;
    const startedAt = performance.now();
    let fired = false;
    let raf = 0;
    const tick = () => {
      const left = totalSeconds * 1000 - (performance.now() - startedAt);
      setLeftMs(Math.max(0, left));
      if (left <= 0) {
        if (!fired) {
          fired = true;
          expireRef.current?.();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [totalSeconds]);

  if (totalSeconds == null) {
    return <p className="text-center text-xs font-medium text-ink-500">Modo Sem Pressa — sem cronômetro</p>;
  }

  const pct = Math.max(0, Math.min(100, (leftMs / (totalSeconds * 1000)) * 100));
  const tense = leftMs <= 3000;
  const secs = Math.floor(leftMs / 1000);
  const ms = Math.floor(leftMs % 1000);

  return (
    <div aria-label={`Tempo restante: ${secs} segundos`}>
      <div className="h-2 overflow-hidden rounded-pill bg-ink-100">
        <div
          className={cn("h-full rounded-pill", tense ? "bg-flame-500" : "bg-brand-500")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p
        className={cn(
          "mt-1 text-center font-bold tabular-nums",
          tense ? "animate-retro-tense text-lg text-flame-600" : "text-sm text-ink-500",
        )}
      >
        {tense ? `${secs}.${String(ms).padStart(3, "0")}` : `${secs}s`}
      </p>
    </div>
  );
}
