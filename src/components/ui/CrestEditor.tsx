import { useEffect, useState } from "react";
import { RotateCw, Sparkles, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { SegmentedControl } from "./SegmentedControl";
import { CrestMask } from "./CrestMask";
import {
  CREST_COLORS,
  CREST_ROTATIONS,
  buildCrest,
  defaultCrestFromName,
  parseCrest,
  type CrestFill,
  type CrestKind,
} from "@/lib/crest";

// Editor compartilhado de escudo (perfil) / flâmula (federação).
// Emite a string `crest:` pronta via onChange a cada mudança.

const FILL_LABEL: Record<CrestFill, string> = {
  solid: "Sólido",
  stripes: "Listras",
  grid: "Grade",
  ball: "Bola",
  photo: "Foto",
};

function colorCount(fill: CrestFill, stripeCount: number): number {
  switch (fill) {
    case "solid":
      return 1;
    case "stripes":
      return stripeCount;
    case "grid":
      return 4;
    case "ball":
      return 2;
    case "photo":
      return 0;
  }
}

function hexOf(key: string): string {
  return CREST_COLORS.find((c) => c.key === key)?.hex ?? CREST_COLORS[0]!.hex;
}
function isDarkKey(key: string): boolean {
  return !!CREST_COLORS.find((c) => c.key === key)?.dark;
}

// Rótulo da divisão por estilo: posicional (sem jargão "Div N").
function divLabel(fill: CrestFill, i: number): string {
  if (fill === "ball") return i === 0 ? "Fundo" : "Bola";
  if (fill === "grid") return ["↖", "↗", "↙", "↘"][i] ?? String(i + 1);
  return String(i + 1); // listras: 1, 2, 3 (de cima p/ baixo)
}

export type CrestEditorProps = {
  kind: CrestKind;
  name?: string | null;
  /** crest salvo atualmente (ou null) */
  initial: string | null;
  /** ids de forma a oferecer (ESCUDO_SHAPES ou FLAMULA_SHAPES) */
  shapes: string[];
  /** perfil: permite usar foto do Google como máscara */
  allowPhoto?: boolean;
  photoUrl?: string | null;
  /** federação: permite o padrão "bola no centro" */
  allowBall?: boolean;
  onChange: (crest: string) => void;
};

export function CrestEditor({
  kind,
  name,
  initial,
  shapes,
  allowPhoto = false,
  photoUrl = null,
  allowBall = false,
  onChange,
}: CrestEditorProps) {
  const init = parseCrest(initial) ?? defaultCrestFromName(name, kind);

  const [shape, setShape] = useState(init.shape);
  const [fill, setFill] = useState<CrestFill>(init.fill);
  const [stripeCount, setStripeCount] = useState(
    init.fill === "stripes" ? Math.min(3, Math.max(2, init.colors.length)) : 2,
  );
  const [rotation, setRotation] = useState(init.rotation);
  const [activeDiv, setActiveDiv] = useState(0);
  // buffer de até 4 cores (preserva escolhas ao trocar de padrão)
  const [colors, setColors] = useState<string[]>([
    init.colors[0] ?? "verde",
    init.colors[1] ?? "dourado",
    init.colors[2] ?? "vermelho",
    init.colors[3] ?? "azul",
  ]);

  const fills: CrestFill[] = [
    "solid",
    "stripes",
    "grid",
    ...(allowBall ? (["ball"] as CrestFill[]) : []),
    ...(allowPhoto ? (["photo"] as CrestFill[]) : []),
  ];

  const n = colorCount(fill, stripeCount);
  const activeColors = n > 0 ? colors.slice(0, n) : colors.slice(0, 1);
  const canRotate = fill === "stripes" || fill === "grid";
  const showColors = fill !== "photo";

  // ao trocar de estilo/nº de faixas, a divisão ativa volta pra primeira
  useEffect(() => {
    setActiveDiv(0);
  }, [fill, stripeCount]);

  // monta a config atual e emite
  const current = buildCrest({
    kind,
    shape,
    fill,
    colors: activeColors,
    rotation,
    photo: fill === "photo" ? photoUrl ?? undefined : undefined,
  });

  useEffect(() => {
    onChange(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  function setColorAt(i: number, key: string) {
    setColors((prev) => prev.map((c, idx) => (idx === i ? key : c)));
  }

  function randomize() {
    const sh = shapes[Math.floor(Math.random() * shapes.length)]!;
    const pool = [...CREST_COLORS].sort(() => Math.random() - 0.5);
    const variableFills = fills.filter((f) => f !== "photo");
    const f = variableFills[Math.floor(Math.random() * variableFills.length)]!;
    setShape(sh);
    setFill(f);
    if (f === "stripes") setStripeCount(Math.random() > 0.5 ? 3 : 2);
    setColors([pool[0]!.key, pool[1]!.key, pool[2]!.key, pool[3]!.key]);
    setRotation(CREST_ROTATIONS[Math.floor(Math.random() * CREST_ROTATIONS.length)]!);
  }

  const photoMissing = fill === "photo" && !photoUrl;

  return (
    <div className="space-y-5">
      {/* Estilo (fill) + sortear */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-ink-500">Estilo</p>
          <Button size="sm" variant="ghost" onClick={randomize} title="Sortear">
            <Sparkles className="size-4" /> Sortear
          </Button>
        </div>
        <SegmentedControl<CrestFill>
          value={fill}
          onChange={setFill}
          options={fills.map((f) => ({ value: f, label: FILL_LABEL[f] }))}
        />
        {photoMissing && (
          <p className="text-xs leading-snug text-ink-500">
            Você ainda não tem foto do Google conectada. Vamos usar a inicial do seu nome,
            recortada no escudo.
          </p>
        )}
      </div>

      {/* nº de listras */}
      {fill === "stripes" && (
        <SegmentedControl<string>
          value={String(stripeCount)}
          onChange={(v) => setStripeCount(Number(v))}
          options={[
            { value: "2", label: "2 faixas" },
            { value: "3", label: "3 faixas" },
          ]}
        />
      )}

      {/* Forma */}
      <div className="space-y-2">
        <p className="text-xs font-medium text-ink-500">Formato</p>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {shapes.map((sh) => {
            const active = shape === sh;
            const thumb = buildCrest({
              kind,
              shape: sh,
              // thumb sempre com cor (mesmo no modo foto) p/ visualizar a forma
              fill: fill === "photo" ? "solid" : fill,
              colors: activeColors,
              rotation,
            });
            return (
              <button
                key={sh}
                type="button"
                aria-label={`Forma ${sh}`}
                aria-pressed={active}
                onClick={() => setShape(sh)}
                className={cn(
                  "flex items-center justify-center rounded-md p-1.5 ring-2 transition",
                  active ? "bg-brand-500/10 ring-brand-600" : "ring-transparent hover:bg-ink-100",
                )}
              >
                <CrestMask src={thumb} name={name} px={36} defaultKind={kind} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Cores: escolhe a divisão (quando há +1) e depois a cor */}
      {showColors && (
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-ink-500">
            {fill === "ball" ? "Cores (fundo e bola)" : "Cores"}
          </p>

          {n > 1 && (
            <div className="flex flex-wrap gap-2.5">
              {Array.from({ length: n }).map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setActiveDiv(i)}
                  aria-label={`Editar ${divLabel(fill, i)}`}
                  aria-pressed={activeDiv === i}
                  className="flex flex-col items-center gap-1"
                >
                  <span
                    className={cn(
                      "size-9 rounded-md ring-2 ring-offset-2 ring-offset-surface transition",
                      activeDiv === i ? "ring-brand-600" : "ring-border",
                    )}
                    style={{ background: hexOf(colors[i]!) }}
                  />
                  <span
                    className={cn(
                      "text-[11px] font-bold leading-none",
                      activeDiv === i ? "text-ink-800" : "text-ink-400",
                    )}
                  >
                    {divLabel(fill, i)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* paleta única — pinta a divisão ativa */}
          <div className="flex flex-wrap gap-2.5">
            {CREST_COLORS.map((c) => {
              const selected = colors[activeDiv] === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-label={c.key}
                  aria-pressed={selected}
                  onClick={() => setColorAt(activeDiv, c.key)}
                  className={cn(
                    "grid size-9 place-items-center rounded-full ring-2 ring-offset-2 ring-offset-surface transition",
                    selected ? "ring-brand-600" : "ring-transparent hover:ring-border",
                  )}
                  style={{ background: c.hex }}
                >
                  {selected && (
                    <Check
                      className="size-4"
                      strokeWidth={3}
                      style={{ color: isDarkKey(c.key) ? "#232323" : "#ffffff" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Rotação */}
      {canRotate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const idx = CREST_ROTATIONS.indexOf(rotation);
            setRotation(CREST_ROTATIONS[(idx + 1) % CREST_ROTATIONS.length]!);
          }}
        >
          <RotateCw className="size-4" /> Girar ({rotation}°)
        </Button>
      )}
    </div>
  );
}
