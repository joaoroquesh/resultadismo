// Estatísticas ao vivo: as 7 linhas do LiveStats, VISÍVEIS desde o começo (mesmo
// zeradas). Barra de duas cores por linha: o lado de quem lidera ganha verde-água
// (brand) numa vantagem leve e verde (grass) numa GRANDE vantagem (>= 65% do total),
// pra diferenciar vantagem de grande vantagem. Sem legenda explicativa.
import type { LiveStats } from "./sim.ts";

type Pair = [number, number];

interface Row {
  label: string;
  a: number;
  b: number;
  suffix?: string;
}

function rowsFrom(stats: LiveStats): Row[] {
  const g = (p: Pair) => p;
  const [posA, posB] = g(stats.posse);
  const [finA, finB] = g(stats.finalizacoes);
  const [sotA, sotB] = g(stats.chutesNoGol);
  const [gcA, gcB] = g(stats.grandesChances);
  const [escA, escB] = g(stats.escanteios);
  const [pcA, pcB] = g(stats.passeCerto);
  const [falA, falB] = g(stats.faltas);
  return [
    { label: "Posse de bola", a: posA, b: posB, suffix: "%" },
    { label: "Finalizações", a: finA, b: finB },
    { label: "Chutes no gol", a: sotA, b: sotB },
    { label: "Grandes chances", a: gcA, b: gcB },
    { label: "Escanteios", a: escA, b: escB },
    { label: "Passe certo", a: pcA, b: pcB, suffix: "%" },
    { label: "Faltas", a: falA, b: falB },
  ];
}

// cor de cada metade da barra: lado vencedor vira brand (vantagem) ou grass (grande
// vantagem); o lado perdedor fica neutro (ink). Empate = os dois neutros.
function barClasses(a: number, b: number): { left: string; right: string } {
  const total = a + b;
  const neutral = "bg-ink-300";
  if (total === 0) return { left: neutral, right: neutral };
  if (a === b) return { left: neutral, right: neutral };
  const winner = a > b ? "a" : "b";
  const share = Math.max(a, b) / total;
  const big = share >= 0.65; // grande vantagem
  const winClass = big ? "bg-grass-500" : "bg-brand-500";
  return winner === "a" ? { left: winClass, right: neutral } : { left: neutral, right: winClass };
}

function StatLine({ row }: { row: Row }) {
  const total = row.a + row.b;
  const pa = total === 0 ? 50 : Math.round((row.a / total) * 100);
  const aWins = row.a > row.b;
  const bWins = row.b > row.a;
  const { left, right } = barClasses(row.a, row.b);
  const sfx = row.suffix ?? "";
  return (
    <div>
      <div className="flex items-center justify-between text-[12.5px] font-bold tabular-nums text-ink-800">
        <span className={aWins ? "text-brand-700 dark:text-brand-300" : undefined}>
          {row.a}
          {sfx}
        </span>
        <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">{row.label}</span>
        <span className={bWins ? "text-ink-900" : undefined}>
          {row.b}
          {sfx}
        </span>
      </div>
      <div
        className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2"
        role="img"
        aria-label={`${row.label}: ${row.a}${sfx} contra ${row.b}${sfx}`}
      >
        <span className={`block h-full rounded-l-full transition-[width,background-color] duration-300 ease-out ${left}`} style={{ width: `${pa}%` }} />
        <span className={`block h-full rounded-r-full transition-[width,background-color] duration-300 ease-out ${right}`} style={{ width: `${100 - pa}%` }} />
      </div>
    </div>
  );
}

export function StatsPanel({
  stats,
  myName,
  oppName,
}: {
  stats: LiveStats;
  myName: string;
  oppName: string;
}) {
  const rows = rowsFrom(stats);
  return (
    <div className="rounded-[14px] border border-border bg-surface p-3.5">
      <div className="mb-2 flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">
        <span className="min-w-0 flex-1 truncate text-brand-700 dark:text-brand-300">{myName}</span>
        <span className="shrink-0 px-2">ao vivo</span>
        <span className="min-w-0 flex-1 truncate text-right text-ink-700">{oppName}</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <StatLine key={r.label} row={r} />
        ))}
      </div>
    </div>
  );
}
