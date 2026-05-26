import { type ReactNode } from "react";
import { Link } from "react-router-dom";

export function Header({ title, action }: { title?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/70 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-md items-center justify-between gap-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/Resultadismo.svg" alt="Resultadismo" className="size-7" />
          {title ? (
            <span className="text-base font-bold tracking-tight text-ink-950">{title}</span>
          ) : (
            <span className="text-base font-bold tracking-tight text-ink-950">
              Resultadismo
            </span>
          )}
        </Link>
        {action}
      </div>
    </header>
  );
}
