// Tática às cegas (sem o rival). Dois modos com toggle:
//  - Rápido: 6 cards de preset + bloco (3) + postura. Linha curta por preset.
//  - Tático: formação (grid 3x3), com bola (5), sem bola (5), bloco (3), postura.
// Mostra a COERÊNCIA individual (coherenceSignals) como chips + frase, mais uma
// indicação de postura. NUNCA mostra dado do adversário e NUNCA um total.
import { useMemo } from "react";
import type { Tactic, Form, ComBola, SemBola, Bloco, PresetKey } from "./tactics.ts";
import { PRESETS, COMBOLA, SEMBOLA, BLOCOS, coherenceSignals, tacticFromPreset } from "./tactics.ts";
import type { ArchetypeKey } from "./archetypes.ts";
import {
  FORM_GRID, FORM_LABEL, COMBOLA_LABEL, COMBOLA_DESC, SEMBOLA_LABEL, SEMBOLA_DESC,
  BLOCO_LABEL, BLOCO_DESC, posturaZone,
} from "./data";
import { CoherenceList, IdentityFitRow } from "./Signals";
import { CompassIcon } from "./icons";

export type PickerMode = "rapido" | "tatico";

// ================================================================ controles base
function ModeToggle({ mode, onChange }: { mode: PickerMode; onChange: (m: PickerMode) => void }) {
  const opts: { id: PickerMode; label: string; hint: string }[] = [
    { id: "rapido", label: "Rápido", hint: "presets prontos" },
    { id: "tatico", label: "Tático", hint: "monte na mão" },
  ];
  return (
    <div role="tablist" aria-label="Modo de montagem da tática" className="flex gap-1 rounded-[13px] border border-border bg-surface-2 p-1">
      {opts.map((o) => {
        const on = mode === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`flex min-h-[44px] flex-1 flex-col items-center justify-center rounded-[10px] leading-tight transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
              on ? "scale-[1.01] bg-brand-600 text-white shadow-sm" : "text-ink-600 hover:text-ink-800"
            }`}
          >
            <span className="text-[13px] font-bold">{o.label}</span>
            <span className={`text-[10px] font-semibold ${on ? "text-white/75" : "text-ink-400"}`}>{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

// chip selecionável (com bola / sem bola / bloco)
function OptionChip({
  label,
  desc,
  on,
  onClick,
}: {
  label: string;
  desc?: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-[12px] border px-1.5 py-1 text-center leading-tight transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-out active:scale-[0.96] ${
        on
          ? "border-transparent bg-brand-600 text-white shadow-sm"
          : "border-border bg-surface-2 text-ink-700 hover:border-brand-400 hover:text-ink-900"
      }`}
    >
      <span className="text-[12.5px] font-bold">{label}</span>
      {desc && <span className={`text-[9.5px] font-medium ${on ? "text-white/75" : "text-ink-400"}`}>{desc}</span>}
    </button>
  );
}

// postura: slider 0..100 com rótulo de zona (único número de intensidade exposto)
export function PosturaSlider({
  value,
  onChange,
  disabled,
  label = "Postura",
  hint = "Quanto da força vai pro ataque em vez da defesa.",
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  const zone = posturaZone(value);
  return (
    <div className={`select-none ${disabled ? "opacity-60" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[12.5px] font-bold text-ink-900">{label}</label>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold text-brand-700">{zone}</span>
          <span className="min-w-[2.6rem] rounded-md bg-surface-2 px-1.5 py-0.5 text-center text-[11px] font-extrabold tabular-nums text-ink-700">
            {value}%
          </span>
        </span>
      </div>
      <div className="relative mt-2 h-5">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-surface-2">
          <span className="block h-full rounded-full bg-brand-500 transition-[width] duration-150 ease-out" style={{ width: `${value}%` }} />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          aria-label={label}
          aria-valuetext={`${value} por cento, ${zone}`}
          className="mgr-range absolute inset-0 h-5 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed"
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10.5px] font-semibold text-ink-500">
        <span>Recuada</span>
        <span>Ofensiva</span>
      </div>
      {hint && <p className="mt-1 text-[11px] leading-snug text-ink-500">{hint}</p>}
    </div>
  );
}

// grid 3x3 de formação (linha = vocação)
function FormGrid({ value, onPick }: { value: Form; onPick: (f: Form) => void }) {
  const tone: Record<string, string> = { ofe: "text-flame-700", equ: "text-gold-700", def: "text-aqua-700" };
  return (
    <div role="radiogroup" aria-label="Formação" className="flex flex-col gap-1.5">
      {FORM_GRID.map((row) => (
        <div key={row.key} className="grid grid-cols-[5rem_1fr] items-stretch gap-2">
          <div className="min-w-0 self-center leading-tight">
            <div className={`text-[10.5px] font-extrabold uppercase tracking-wide ${tone[row.key]}`}>{row.label}</div>
            <div className="truncate text-[9.5px] font-semibold text-ink-400">{row.hint}</div>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {row.forms.map((f) => {
              const on = value === f;
              return (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={`${FORM_LABEL[f]}, ${row.label.toLowerCase()}`}
                  onClick={() => onPick(f)}
                  className={`min-h-[46px] rounded-[11px] border text-[14px] font-extrabold tabular-nums tracking-tight transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-out active:scale-[0.96] ${
                    on
                      ? "border-transparent bg-brand-600 text-white shadow-sm"
                      : "border-border bg-surface-2 text-ink-700 hover:border-brand-400 hover:text-ink-900"
                  }`}
                >
                  {FORM_LABEL[f]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// cards de preset (modo rápido): nome + linha boleira curta
function PresetCards({ tac, onPick }: { tac: Tactic; onPick: (k: PresetKey) => void }) {
  const keys = Object.keys(PRESETS) as PresetKey[];
  // um preset está "ativo" quando os 4 eixos de desenho batem (postura pode ter sido ajustada)
  const activeKey = keys.find(
    (k) =>
      PRESETS[k].t.form === tac.form &&
      PRESETS[k].t.comBola === tac.comBola &&
      PRESETS[k].t.semBola === tac.semBola &&
      PRESETS[k].t.bloco === tac.bloco,
  );
  return (
    <div role="radiogroup" aria-label="Preset de tática" className="grid grid-cols-2 gap-2">
      {keys.map((k) => {
        const p = PRESETS[k];
        const on = activeKey === k;
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(k)}
            className={`flex min-h-[64px] flex-col items-start justify-center gap-0.5 rounded-[14px] border px-3 py-2 text-left transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
              on
                ? "border-transparent bg-brand-600 text-white shadow-sm"
                : "border-border bg-surface-2 text-ink-800 hover:border-brand-400"
            }`}
          >
            <span className="text-[13.5px] font-bold leading-tight">{p.nome}</span>
            <span className={`text-[11px] font-medium leading-snug ${on ? "text-white/80" : "text-ink-500"}`}>{p.linha}</span>
          </button>
        );
      })}
    </div>
  );
}

function BlocoPicker({ value, onPick }: { value: Bloco; onPick: (b: Bloco) => void }) {
  return (
    <section aria-labelledby="picker-bloco-h">
      <h3 id="picker-bloco-h" className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        Altura do bloco
      </h3>
      <div role="radiogroup" aria-label="Altura do bloco" className="grid grid-cols-3 gap-2">
        {BLOCOS.map((b) => (
          <OptionChip key={b} label={BLOCO_LABEL[b]} desc={BLOCO_DESC[b]} on={value === b} onClick={() => onPick(b)} />
        ))}
      </div>
    </section>
  );
}

// ================================================================ componente principal
export function TacticPicker({
  tac,
  onChange,
  mode,
  onModeChange,
  blind = true,
  archetype = null,
}: {
  tac: Tactic;
  onChange: (t: Tactic) => void;
  mode: PickerMode;
  onModeChange: (m: PickerMode) => void;
  blind?: boolean; // true = pré-jogo (sem rival). Aqui é sempre true.
  archetype?: ArchetypeKey | null; // identidade do treinador (mostra o encaixe da escola)
}) {
  const signals = useMemo(() => coherenceSignals(tac), [tac]);
  const patch = (p: Partial<Tactic>) => onChange({ ...tac, ...p });

  return (
    <div className="flex flex-col gap-4">
      <ModeToggle mode={mode} onChange={onModeChange} />

      {mode === "rapido" ? (
        <>
          <section aria-labelledby="picker-preset-h">
            <h3 id="picker-preset-h" className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
              Escolha um plano
            </h3>
            <PresetCards tac={tac} onPick={(k) => onChange({ ...tacticFromPreset(k), postura: tacticFromPreset(k).postura })} />
          </section>
          <BlocoPicker value={tac.bloco} onPick={(b) => patch({ bloco: b })} />
          <PosturaSlider value={tac.postura} onChange={(v) => patch({ postura: v })} />
        </>
      ) : (
        <>
          <section aria-labelledby="picker-form-h">
            <h3 id="picker-form-h" className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
              Formação
            </h3>
            <FormGrid value={tac.form} onPick={(f) => patch({ form: f })} />
          </section>

          <section aria-labelledby="picker-com-h">
            <h3 id="picker-com-h" className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
              Com a bola
            </h3>
            <div role="radiogroup" aria-label="Estilo com a bola" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {COMBOLA.map((c: ComBola) => (
                <OptionChip key={c} label={COMBOLA_LABEL[c]} desc={COMBOLA_DESC[c]} on={tac.comBola === c} onClick={() => patch({ comBola: c })} />
              ))}
            </div>
          </section>

          <section aria-labelledby="picker-sem-h">
            <h3 id="picker-sem-h" className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
              Sem a bola
            </h3>
            <div role="radiogroup" aria-label="Estilo sem a bola" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {SEMBOLA.map((s: SemBola) => (
                <OptionChip key={s} label={SEMBOLA_LABEL[s]} desc={SEMBOLA_DESC[s]} on={tac.semBola === s} onClick={() => patch({ semBola: s })} />
              ))}
            </div>
          </section>

          <BlocoPicker value={tac.bloco} onPick={(b) => patch({ bloco: b })} />
          <PosturaSlider value={tac.postura} onChange={(v) => patch({ postura: v })} />
        </>
      )}

      {/* coerência individual: chips + frase, nunca um total */}
      <section aria-labelledby="picker-coh-h" className="rounded-[14px] border border-border bg-surface p-3.5">
        <div className="mb-2 flex items-center gap-2">
          <CompassIcon size={16} className="text-brand-600" />
          <h3 id="picker-coh-h" className="text-[12.5px] font-bold text-ink-900">
            Como as suas escolhas combinam
          </h3>
        </div>
        <CoherenceList signals={signals} />
        {archetype && (
          <div className="mt-1.5">
            <IdentityFitRow arch={archetype} tac={tac} />
          </div>
        )}
        {blind && (
          <p className="mt-2.5 text-[11px] leading-snug text-ink-500">
            Tática às cegas: você ainda não viu o adversário. O encaixe contra o rival aparece no intervalo.
          </p>
        )}
      </section>
    </div>
  );
}
