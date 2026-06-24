// Componentes de apresentação compartilhados do Manager.
import type { Standing, Team } from "./types";
import { sortStandings } from "./engine";
import { flagEmoji, flagSigla, starsFor } from "./ui";

export function Flag({ name }: { name: string }) {
  const emoji = flagEmoji(name);
  if (emoji)
    return (
      <span aria-hidden className="text-sm leading-none">
        {emoji}
      </span>
    );
  return (
    <span
      aria-hidden
      className="inline-grid h-[18px] min-w-[26px] place-items-center rounded-[3px] border border-border bg-surface-2 px-1 text-[11px] font-bold text-ink-700"
    >
      {flagSigla(name)}
    </span>
  );
}

export function TeamName({ team }: { team: Team }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Flag name={team.n} />
      <span>{team.n}</span>
    </span>
  );
}

export function Stars({ o, light = false }: { o: number; light?: boolean }) {
  const { full, half, n } = starsFor(o);
  const cells = Array.from({ length: 5 }, (_, i) => {
    if (i < full) return "★";
    if (i === full && half) return "⯨";
    return "☆";
  });
  return (
    <span
      aria-label={`${n} de 5 estrelas`}
      className={`inline-flex tracking-wider ${light ? "text-white/90" : "text-gold-500"}`}
    >
      {cells.join("")}
    </span>
  );
}

// tabela de classificação (grupo / quadrangular). Marca a minha linha e os classificados.
export function StandingsTable({
  standings,
  advance,
  myKey,
  qualifiedKeys,
}: {
  standings: Standing[];
  advance: number;
  myKey: string;
  qualifiedKeys?: Set<string>;
}) {
  const sorted = sortStandings(standings);
  return (
    <table className="mt-1 w-full border-collapse text-[13.5px]">
      <thead>
        <tr>
          <th className="border-b border-border px-1 py-1.5 text-left text-[10px] font-extrabold uppercase tracking-wide text-ink-500">
            Seleção
          </th>
          <th className="border-b border-border px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-500">
            P
          </th>
          <th className="border-b border-border px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-500">
            J
          </th>
          <th className="border-b border-border px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-500">
            SG
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => {
          const isMe = row.team.s === myKey;
          const qualified = qualifiedKeys ? qualifiedKeys.has(row.team.s) : i < advance;
          return (
            <tr key={row.team.s} className={isMe ? "bg-brand-500/12" : undefined}>
              <td
                className={`flex items-center gap-1.5 border-b border-border px-1 py-1.5 text-left font-bold ${
                  isMe ? "text-brand-700" : "text-ink-900"
                }`}
              >
                <Flag name={row.team.n} />
                <span className="truncate">{row.team.n}</span>
                {qualified && <span className="text-[9px] text-grass-600">▲</span>}
              </td>
              <td className="border-b border-border px-1 py-1.5 text-center font-extrabold tabular-nums">
                {row.P}
              </td>
              <td className="border-b border-border px-1 py-1.5 text-center tabular-nums">{row.J}</td>
              <td className="border-b border-border px-1 py-1.5 text-center tabular-nums">
                {row.SG > 0 ? "+" : ""}
                {row.SG}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// linha de resultado (histórico de jogos)
export function HistoryRow({
  stage,
  opp,
  gf,
  ga,
  pens,
  win,
  draw,
  ko,
}: {
  stage: string;
  opp: Team;
  gf: number;
  ga: number;
  pens: string | null;
  win: boolean;
  draw: boolean;
  ko?: boolean;
}) {
  const cls = ko
    ? win
      ? "win"
      : "lose"
    : win
      ? "win"
      : draw
        ? "neutral"
        : "lose";
  const tone =
    cls === "win"
      ? "bg-grass-500/15 border-l-grass-600"
      : cls === "lose"
        ? "bg-flame-500/12 border-l-flame-600"
        : "bg-surface-2 border-l-transparent";
  return (
    <div
      className={`my-1 flex items-center justify-between gap-2 rounded-[10px] border-l-[3px] px-3 py-2 text-[13px] text-ink-800 ${tone}`}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">{stage} ·</span>
        <Flag name={opp.n} />
        <span className="truncate">{opp.n}</span>
      </span>
      <span className="shrink-0 font-mono font-extrabold tabular-nums">
        {gf}×{ga}
        {pens ? ` (${pens} pen)` : ""}
      </span>
    </div>
  );
}

// controle segmentado manual (estilo/postura/marcação) — escolhas 100% do jogador,
// SEM apontar opção "ideal" (sem ⚠/✓), espelhando o protótipo.
export function SegBlock<T extends string>({
  label,
  opts,
  value,
  onPick,
}: {
  label: string;
  opts: [T, string][];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 mt-3.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className="flex gap-1.5 overflow-x-auto rounded-[13px] border border-border bg-surface-2 p-1">
        {opts.map(([v, lbl]) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(v)}
              className={`min-h-[42px] min-w-max whitespace-nowrap rounded-[10px] px-3 text-[13px] font-bold transition-colors ${
                on ? "bg-brand-600 text-white shadow-sm" : "text-ink-600"
              }`}
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// grid das 8 formações (manual; clicar NÃO mexe nos outros eixos)
export function FormGrid<T extends string>({
  opts,
  value,
  onPick,
}: {
  opts: [T, string][];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {opts.map(([v, lbl]) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(v)}
            className={`min-h-[42px] rounded-[10px] border px-1 text-[12.5px] font-bold transition-colors ${
              on ? "border-transparent bg-brand-600 text-white shadow-sm" : "border-border bg-surface-2 text-ink-600"
            }`}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}
