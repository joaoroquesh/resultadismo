import { type InputHTMLAttributes, forwardRef, type ReactNode, useId } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: ReactNode;
  error?: string;
  label?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, icon, error, label, id, ...props },
  ref,
) {
  const reactId = useId();
  const inputId = id ?? reactId;
  return (
    <div className="flex w-full flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink-800">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border bg-surface px-3.5 transition-colors",
          "focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20",
          error ? "border-flame-500" : "border-ink-200",
        )}
      >
        {icon && <span className="shrink-0 text-ink-400">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "h-11 w-full bg-transparent text-ink-950 outline-none placeholder:text-ink-400",
            className,
          )}
          {...props}
        />
      </div>
      {error && <span className="text-xs text-flame-600">{error}</span>}
    </div>
  );
});
