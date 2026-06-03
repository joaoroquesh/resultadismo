import { useEffect, useState } from "react";
import { RotateCw, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
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
  /** preview/thumbs mostram a inicial (perfil sim, federação não) */
  withLetter?: boolean;
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
  withLetter = false,
  onChange,
}: CrestEditorProps) {
  const init = parseCrest(initial) ?? defaultCrestFromName(name, kind);

  const [shape, setShape] = useState(init.shape);
  const [fill, setFill] = useState<CrestFill>(init.fill);
  const [stripeCount, setStripeCount] = useState(
    init.fill === "stripes" ? Math.min(3, Math.max(2, init.colors.length)) : 2,
  );
  const [rotation, setRotation] = useState(init.rotation);
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
    <div className="space-y-4">
      {/* Padrão (fill) + sortear */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-ink-500">Estilo</p>
          <Button size="sm" variant="ghost" onClick={randomize} title="Sortear">
            <Sparkles className="size-4" /> Sortear
          </Button>
        </div>
        <div className="flex flex-wrap gap-1 rounded-pill bg-ink-100 p-1">
          {fills.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFill(f)}
              className={cn(
                "flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-all",
                fill === f
                  ? "bg-surface text-ink-950 shadow-[var(--shadow-soft)]"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              {FILL_LABEL[f]}
            </button>
          ))}
        </div>
        {photoMissing && (
          <p className="text-xs leading-snug text-ink-500">
            Você ainda não tem foto do Google conectada — vamos usar a inicial do seu nome
            recortada no escudo.
          </p>
        )}
      </div>

      {/* nº de listras */}
      {fill === "stripes" && (
        <div className="flex flex-wrap gap-1 rounded-pill bg-ink-100 p-1">
          {[2, 3].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setStripeCount(c)}
              className={cn(
                "flex-1 rounded-pill px-3 py-1.5 text-sm font-semibold transition-all",
                stripeCount === c
                  ? "bg-surface text-ink-950 shadow-[var(--shadow-soft)]"
                  : "text-ink-500 hover:text-ink-700",
              )}
            >
              {c} listras
            </button>
          ))}
        </div>
      )}

      {/* Forma */}
      <div className="space-y-1.5">
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
                onClick={() => setShape(sh)}
                className={cn(
                  "flex items-center justify-center rounded-md p-1.5 ring-2 transition",
                  active ? "ring-brand-600" : "ring-transparent hover:bg-ink-100",
                )}
              >
                <CrestMask src={thumb} name={name} px={36} defaultKind={kind} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Cores por divisão (oculto no modo foto com foto) */}
      {!(fill === "photo" && photoUrl) && (
        <div className="space-y-2.5">
          <p className="text-xs font-medium text-ink-500">
            {fill === "ball" ? "Cores (fundo e bola)" : "Cores"}
          </p>
          {Array.from({ length: Math.max(1, n) }).map((_, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              {Math.max(1, n) > 1 && (
                <span className="w-14 text-xs font-medium text-ink-400">
                  {fill === "ball" ? (i === 0 ? "Fundo" : "Bola") : `Div ${i + 1}`}
                </span>
              )}
              {CREST_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  aria-label={c.key}
                  onClick={() => setColorAt(i, c.key)}
                  className={cn(
                    "size-8 rounded-full ring-2 ring-offset-2 ring-offset-surface transition",
                    colors[i] === c.key ? "ring-ink-900" : "ring-transparent",
                  )}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          ))}
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
