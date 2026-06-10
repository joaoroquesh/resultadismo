import { useMemo } from "react";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { catalogWcNations } from "@/features/onboarding/teamsCatalog";

export type TeamScopeValue = "all" | "brasil" | "custom";

function cnScope(on: boolean) {
  return [
    "inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1.5 text-xs font-semibold transition",
    on ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-surface text-ink-700 hover:border-ink-300",
  ].join(" ");
}

/** Seletor do recorte de seleções do bolão (Todas / Só o Brasil / Escolher).
 * Apresentacional: estado vive no caller (criação de grupo e edição na aba
 * Competições usam o mesmo seletor — regra 9 do MESTRE). */
export function TeamScopeSelector({
  scope,
  onScopeChange,
  sel,
  onToggle,
}: {
  scope: TeamScopeValue;
  onScopeChange: (s: TeamScopeValue) => void;
  sel: Set<string>;
  onToggle: (slug: string) => void;
}) {
  // Só as 48 classificadas pra Copa 2026 (Itália etc. ficam de fora).
  const nations = useMemo(() => catalogWcNations(), []);
  return (
    <div className="space-y-2">
      <SegmentedControl<TeamScopeValue>
        value={scope}
        onChange={onScopeChange}
        options={[
          { value: "all", label: "Todas" },
          { value: "brasil", label: "Só o Brasil" },
          { value: "custom", label: "Escolher" },
        ]}
      />
      <p className="text-xs leading-snug text-ink-500">
        {scope === "all"
          ? "A Copa inteira vale ponto — a disputa mais completa (recomendado)."
          : scope === "brasil"
            ? "Só os jogos do Brasil valem ponto no ranking do grupo."
            : "Só os jogos das seleções marcadas valem ponto no ranking."}
      </p>
      {scope === "custom" && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {nations.map((n) => {
            const on = sel.has(n.id);
            return (
              <button
                key={n.id}
                type="button"
                onClick={() => onToggle(n.id)}
                aria-pressed={on}
                className={cnScope(on)}
              >
                {n.local_crest && (
                  <img src={n.local_crest} alt="" className="size-4 rounded-[3px] object-contain" />
                )}
                {n.short_name ?? n.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
