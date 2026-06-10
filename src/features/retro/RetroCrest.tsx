import { useState } from "react";
import { cn } from "@/lib/utils";
import { teamCrestPath } from "@/lib/teamCrests";

// Bandeira do Retrô: carrega EAGER (é o conteúdo-herói da rodada, com timer rolando)
// e, se a request falhar (abort transitório, troca de service worker etc.), tenta de
// novo UMA vez antes de cair nas iniciais — corrige as logos sumindo em produção.
export function RetroCrest({ slug, name, size = 64 }: { slug: string; name: string; size?: number }) {
  const src = teamCrestPath(slug);
  // o pai (RunView) remonta por jogo via key — attempt nasce zerado a cada confronto
  const [attempt, setAttempt] = useState(0);

  if (!src || attempt >= 2) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-full bg-ink-100 font-bold text-ink-400"
        style={{ width: size, height: size, fontSize: size * 0.3 }}
      >
        {name.slice(0, 3).toUpperCase() || "?"}
      </span>
    );
  }

  return (
    <img
      key={`${slug}-${attempt}`}
      src={attempt === 0 ? src : `${src}?retry=1`}
      alt={name}
      width={size}
      height={size}
      loading="eager"
      decoding="async"
      onError={() => setAttempt((a) => a + 1)}
      className={cn("inline-block rounded-full object-contain shadow-soft")}
      style={{ width: size, height: size }}
    />
  );
}
