import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-ink-200 px-6 py-12 text-center",
        className,
      )}
    >
      {icon && (
        <div className="flex size-14 items-center justify-center rounded-full bg-brand-100 text-brand-600">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="font-bold text-ink-900">{title}</h3>
        {description && <p className="mx-auto max-w-xs text-sm text-ink-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
