// Efeitos visuais "fliperama" do Retrô (compartilhados entre reveal e campanha).

export function Confetti({ tall = false }: { tall?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 16 }, (_, i) => (
        <span
          key={i}
          className="animate-retro-confetti absolute top-0 block size-2 rounded-[2px]"
          style={{
            left: `${4 + i * 6}%`,
            animationDelay: `${(i % 8) * 110}ms`,
            animationDuration: tall ? "2.1s" : "1.5s",
            backgroundColor:
              i % 3 === 0
                ? "var(--color-gold-400)"
                : i % 3 === 1
                  ? "var(--color-gold-600)"
                  : "var(--color-brand-500)",
          }}
        />
      ))}
    </div>
  );
}

// Faixa de listras retrô (motivo visual do mini-jogo — D15).
export function RetroStripes({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`h-1.5 ${className}`}
      style={{
        background:
          "linear-gradient(90deg, var(--color-gold-500) 0 25%, var(--color-grass-600) 0 50%, var(--color-aqua-700) 0 75%, var(--color-brand-400) 0)",
      }}
    />
  );
}
