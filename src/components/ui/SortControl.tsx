import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";

export type SortFieldDef<K extends string> = {
  key: K;
  label: string;
  /** Direção aplicada ao selecionar o campo pela 1ª vez (default "asc"). */
  defaultDir?: SortDir;
  /** Rótulo contextual da direção, p/ ficar claro o que cada uma faz. */
  ascLabel?: string; // ex.: "A→Z", "Mais antigos", "Menos uso"
  descLabel?: string; // ex.: "Z→A", "Mais recentes", "Mais uso"
};

/**
 * Ordenação clara: escolha o CAMPO (chips) e a DIREÇÃO (botão à direita, sempre
 * visível, com rótulo que muda conforme o campo). Reaproveitado por Usuários e
 * Grupos no admin. Clicar no campo ativo também inverte a direção.
 */
export function SortControl<K extends string>({
  fields,
  value,
  dir,
  onChange,
  className,
}: {
  fields: readonly SortFieldDef<K>[];
  value: K;
  dir: SortDir;
  onChange: (key: K, dir: SortDir) => void;
  className?: string;
}) {
  const active = fields.find((f) => f.key === value) ?? fields[0];
  const dirLabel = dir === "asc" ? (active.ascLabel ?? "Crescente") : (active.descLabel ?? "Decrescente");
  const flip = (): SortDir => (dir === "asc" ? "desc" : "asc");

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <span className="text-[11px] font-bold uppercase tracking-wide text-ink-400">Ordenar</span>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {fields.map((f) => {
          const isActive = f.key === value;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(f.key, isActive ? flip() : (f.defaultDir ?? "asc"))}
              className={cn(
                "shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold transition",
                isActive ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
              )}
            >
              {f.label}
            </button>
          );
        })}
      </div>
      {/* Direção — sempre visível; o rótulo deixa claro o que crescente/decrescente
          significa para o campo escolhido. */}
      <button
        type="button"
        onClick={() => onChange(value, flip())}
        title="Inverter ordem"
        className="inline-flex shrink-0 items-center gap-1 rounded-pill border border-ink-200 bg-surface px-2.5 py-1 text-xs font-semibold text-ink-700 transition hover:bg-ink-100"
      >
        {dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
        {dirLabel}
      </button>
    </div>
  );
}
