// Conjunto de ícones inline (SVG) do Maneiger reformulado. Regra dura: nada de
// emoji em lugar nenhum, então tudo que parece ícone vem daqui. currentColor por
// padrão (herda a cor do texto); a bola aceita uma cor explícita (marcador de gol
// na cor da seleção). Traço fino, cantos arredondados, sem dependência externa.
import { useId, type CSSProperties } from "react";

interface IconProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
  title?: string;
}

function base(size: number, title?: string) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    xmlns: "http://www.w3.org/2000/svg",
    role: title ? ("img" as const) : ("presentation" as const),
    "aria-hidden": title ? undefined : true,
    "aria-label": title,
    focusable: false,
  };
}

// Bola de futebol preenchida na cor passada (marcador de gol). Usa fill, não traço,
// pra ficar nítida em tamanho pequeno sobre o board escuro.
export function BallIcon({ size = 16, className = "", style, color }: IconProps & { color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden focusable="false">
      <circle cx="12" cy="12" r="9.25" fill={color ?? "currentColor"} />
      <path
        d="M12 6.4l3.2 2.3-1.2 3.8h-4l-1.2-3.8L12 6.4z"
        fill="rgba(0,0,0,0.55)"
      />
      <path
        d="M12 6.4V3.2M15.2 8.7l3-1M13.8 12.5l1.9 2.6M10.2 12.5l-1.9 2.6M8.8 8.7l-3-1"
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function WhistleIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10h9l5-2.5v6a4.5 4.5 0 1 1-9 0H3a1 1 0 0 1-1-1v-1.5a1 1 0 0 1 1-1Z" />
      <circle cx="8.5" cy="14" r="1.6" />
      <path d="M17 7.5l3-3" />
    </svg>
  );
}

export function GoalNetIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="0.5" />
      <path d="M3 10h18M3 14h18M9 6v12M15 6v12" opacity="0.55" />
    </svg>
  );
}

export function ShieldIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l7 2.5v6c0 4-3 7-7 9.5-4-2.5-7-5.5-7-9.5v-6L12 3Z" />
    </svg>
  );
}

export function ChartIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V4M4 20h16" />
      <rect x="7" y="11" width="3" height="6" rx="0.6" fill="currentColor" stroke="none" />
      <rect x="12.5" y="7" width="3" height="10" rx="0.6" fill="currentColor" stroke="none" />
      <rect x="18" y="13" width="3" height="4" rx="0.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function BroadcastIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="9" width="18" height="11" rx="2" />
      <path d="M7 9 4 5M13 9l3-4" />
      <circle cx="9" cy="14.5" r="2.2" />
      <path d="M16 13h3M16 16h3" />
    </svg>
  );
}

export function PlayIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style}>
      <path d="M7 5.5v13l11-6.5-11-6.5Z" fill="currentColor" />
    </svg>
  );
}

export function PauseIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style}>
      <rect x="6.5" y="5" width="3.6" height="14" rx="1.1" fill="currentColor" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1.1" fill="currentColor" />
    </svg>
  );
}

export function SkipIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style}>
      <path d="M5 5.5v13l9-6.5-9-6.5Z" fill="currentColor" />
      <rect x="16" y="5" width="3" height="14" rx="1" fill="currentColor" />
    </svg>
  );
}

export function ArrowLeftIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function ArrowRightIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5l7 7-7 7" />
    </svg>
  );
}

export function CheckIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function ArrowUpIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V6M6 11l6-6 6 6" />
    </svg>
  );
}

export function ArrowDownIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5v13M6 13l6 6 6-6" />
    </svg>
  );
}

export function DotIcon({ size = 12, className = "", style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" className={className} style={style} aria-hidden focusable="false">
      <circle cx="6" cy="6" r="4" fill="currentColor" />
    </svg>
  );
}

export function EqualIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 9.5h14M5 14.5h14" />
    </svg>
  );
}

export function CompassIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-1.8 5-5 1.8 1.8-5 5-1.8Z" fill="currentColor" stroke="none" opacity="0.85" />
    </svg>
  );
}

export function BookIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 5.5A2 2 0 0 1 6 4h6v15H6a2 2 0 0 0-2 1.5V5.5Z" />
      <path d="M20 5.5A2 2 0 0 0 18 4h-6v15h6a2 2 0 0 1 2 1.5V5.5Z" />
    </svg>
  );
}

export function TrophyIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5a2.5 2.5 0 0 0 2.5 2.5M17 6h2.5A2.5 2.5 0 0 1 17 8.5M9.5 17h5M10 20h4M12 13v4" />
    </svg>
  );
}

export function FlagIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 21V4M5 5h11l-1.5 3L16 11H5" />
    </svg>
  );
}

export function CardIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style}>
      <rect x="6" y="4" width="12" height="16" rx="2" fill="currentColor" />
    </svg>
  );
}

// Dado (sorteio). Contorno arredondado + 5 pontos, na cor do texto.
export function DiceIcon({ size = 16, className = "", style, title }: IconProps) {
  return (
    <svg {...base(size, title)} className={className} style={style} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

// Estrela do overall. filled = cheia (gold), half = meia (metade gold), senão vazia.
// Usa gold cravado do sistema de pontuação (o overall é celebratório, como a nota).
export function StarIcon({
  size = 12,
  className = "",
  style,
  filled = false,
  half = false,
}: IconProps & { filled?: boolean; half?: boolean }) {
  const gold = "var(--color-gold-500)";
  const empty = "var(--color-ink-300, rgba(0,0,0,0.14))";
  const d = "M12 3.2l2.6 5.27 5.82.85-4.21 4.1.99 5.8L12 16.9l-5.2 2.72.99-5.8-4.21-4.1 5.82-.85L12 3.2z";
  // id estável do gradiente da meia-estrela (useId evita colisão E impureza de render).
  const gid = `star-half-${useId()}`;
  if (half) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden focusable="false">
        <defs>
          <linearGradient id={gid} x1="0" x2="1" y1="0" y2="0">
            <stop offset="50%" stopColor={gold} />
            <stop offset="50%" stopColor={empty} />
          </linearGradient>
        </defs>
        <path d={d} fill={`url(#${gid})`} />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden focusable="false">
      <path d={d} fill={filled ? gold : empty} />
    </svg>
  );
}
