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

// A celebração do ZEROU O GAME (21/21 no modo Lenda — rodada 18): chuva dourada
// densa em loop + brilho pulsante. Visivelmente acima do confete de campeão.
export function ZerouFx() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 36 }, (_, i) => (
        <span
          key={i}
          className="animate-retro-confetti absolute top-0 block rounded-[2px]"
          style={{
            left: `${(i * 2.77) % 100}%`,
            width: i % 4 === 0 ? 10 : 6,
            height: i % 4 === 0 ? 10 : 6,
            animationDelay: `${(i % 12) * 140}ms`,
            animationDuration: `${1.4 + (i % 5) * 0.35}s`,
            animationIterationCount: "infinite",
            backgroundColor:
              i % 4 === 0
                ? "var(--color-gold-400)"
                : i % 4 === 1
                  ? "var(--color-gold-600)"
                  : i % 4 === 2
                    ? "var(--color-brand-400)"
                    : "var(--color-flame-500)",
          }}
        />
      ))}
      {/* brilho dourado pulsando atrás do veredito */}
      <span
        className="animate-retro-tense absolute left-1/2 top-24 size-48 -translate-x-1/2 rounded-full opacity-40 blur-3xl"
        style={{ backgroundColor: "var(--color-gold-400)" }}
      />
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
