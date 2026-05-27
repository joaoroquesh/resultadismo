import { type ReactNode } from "react";
import { Link } from "react-router-dom";

export function Header({ title, action }: { title?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-surface/85 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex h-14 max-w-2xl items-center justify-between gap-3 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img src="/brand/Resultadismo.svg" alt="Resultadismo" className="size-7" />
          <span className="text-base font-extrabold tracking-tight text-ink-950">
            {title ?? "Resultadismo"}
          </span>
        </Link>
        {action}
      </div>
    </header>
  );
}
