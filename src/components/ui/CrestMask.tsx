import { cn } from "@/lib/utils";
import {
  type CrestKind,
  crestBackground,
  crestShapeUrl,
  crestTextColor,
  defaultCrestFromName,
  parseCrest,
} from "@/lib/crest";

// Renderiza um escudo/flâmula recortando um fundo (cor/listras/grade/bola/foto)
// pela máscara do SVG. A inicial (perfil) entra por cima, sem ser recortada.

export type CrestMaskProps = {
  /** string crest:... (ou null → usa o default do nome) */
  src?: string | null;
  name?: string | null;
  /** dimensão em px (lado do quadrado) */
  px: number;
  /** tipo padrão quando src é nulo (escudo p/ perfil, flamula p/ federação) */
  defaultKind?: CrestKind;
  /** mostra a inicial do nome (perfil sim, federação não) */
  withLetter?: boolean;
  className?: string;
};

export function CrestMask({
  src,
  name,
  px,
  defaultKind = "escudo",
  withLetter = false,
  className,
}: CrestMaskProps) {
  const cfg = parseCrest(src) ?? defaultCrestFromName(name, defaultKind);
  const maskUrl = crestShapeUrl(cfg.kind, cfg.shape);
  const bg = crestBackground(cfg);

  // letra só aparece quando NÃO há foto de verdade exibida
  const hasPhoto = cfg.fill === "photo" && !!cfg.photo;
  const showLetter = withLetter && !hasPhoto;
  const initial = (name?.trim()?.[0] ?? "?").toUpperCase();

  // Inicial proporcional ao escudo: ~30px no preview grande (80px) e escala
  // junto nos tamanhos menores. Peso 800. Centralizada.
  const fontSize = Math.round(px * 0.375);

  // mask-mode: alpha → usa o canal alfa do SVG (área pintada = opaca = mostra o
  // fundo; fora do desenho = transparente). Assim a cor do traço no SVG não
  // importa, só a silhueta. WebKit já usa alpha por padrão.
  const maskStyle = {
    background: bg,
    WebkitMaskImage: `url("${maskUrl}")`,
    maskImage: `url("${maskUrl}")`,
    maskMode: "alpha",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
    WebkitMaskPosition: "center",
    maskPosition: "center",
    WebkitMaskSize: "contain",
    maskSize: "contain",
    // drop-shadow segue o recorte do SVG: dá uma borda fina + leve elevação,
    // pra um escudo claro (gelo/branco) não sumir no fundo claro.
    filter:
      "drop-shadow(0 0 0.5px rgba(12,22,22,0.35)) drop-shadow(0 1px 1.5px rgba(12,22,22,0.18))",
  } as const;

  return (
    <span
      className={cn("relative inline-block shrink-0 align-middle", className)}
      style={{ width: px, height: px }}
      aria-label={name ?? undefined}
    >
      <span className="absolute inset-0" style={maskStyle} />
      {showLetter && (
        <span
          className="absolute inset-0 grid place-items-center leading-none"
          style={{
            color: crestTextColor(cfg),
            fontWeight: 800,
            fontSize,
            textShadow: cfg.fill === "solid" ? undefined : "0 1px 3px rgba(0,0,0,0.4)",
          }}
        >
          {initial}
        </span>
      )}
    </span>
  );
}
