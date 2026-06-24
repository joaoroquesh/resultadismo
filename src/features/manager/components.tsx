// Componentes de apresentação compartilhados do Manager.
import { useState } from "react";
import type { Estilo, MatchStats, Standing, Tactic, Team } from "./types";
import { matchupHints, sortStandings, styleMatchup } from "./engine";
import { ESTILO_NM, flagEmoji, flagSigla, starsFor } from "./ui";
import { teamCrestPath } from "@/lib/teamCrests";

// ITEM 3: alias de slug — alguns ratings usam um slug e o asset do app vive em
// outro. Resolvemos os dois lados antes de cair no fallback (emoji → sigla).
const CREST_ALIAS: Record<string, string> = {
  capeverde: "caboverde",
  estadosunidos: "eua",
  iran: "ira",
  republicatcheca: "tchequia",
};

/** Caminho do escudo do app (com alias) para o slug do rating, senão null. */
function managerCrestPath(slug?: string | null, name?: string | null): string | null {
  const alias = slug ? CREST_ALIAS[slug] : undefined;
  return teamCrestPath(slug, alias, name);
}

// ITEM 3: escudo real do app ao lado do nome. Mesmo pipeline do TeamCrest do app
// (teamCrestPath casa por slug em /teams). Cadeia de fallback: escudo → emoji de
// bandeira → sigla de 3 letras. Cobertura validada 100% nas seleções do Manager.
export function ManagerCrest({
  slug,
  name,
  size = 18,
  className = "",
}: {
  slug?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const src = managerCrestPath(slug, name);
  const [broken, setBroken] = useState(false);
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        aria-hidden
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`inline-block shrink-0 object-contain ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <Flag name={name} className={className} />;
}

export function Flag({ name, className = "" }: { name: string; className?: string }) {
  const emoji = flagEmoji(name);
  if (emoji)
    return (
      <span aria-hidden className={`text-sm leading-none ${className}`}>
        {emoji}
      </span>
    );
  return (
    <span
      aria-hidden
      className={`inline-grid h-[18px] min-w-[26px] place-items-center rounded-[3px] border border-border bg-surface-2 px-1 text-[11px] font-bold text-ink-700 ${className}`}
    >
      {flagSigla(name)}
    </span>
  );
}

export function TeamName({ team }: { team: Team }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ManagerCrest slug={team.s} name={team.n} />
      <span>{team.n}</span>
    </span>
  );
}

// ITEM 13: estrelas com preenchimento FRACIONÁRIO (não só meia). Camada de ★
// douradas mascarada por width = (o/99)*100%, sobre ★ vazias — render consistente
// em qualquer device (abandona o glifo ⯨, que renderiza mal). Mantém a precisão
// interna (o motor segue lendo o overall cru; aqui é só apresentação).
export function Stars({ o, light = false }: { o: number; light?: boolean }) {
  const { n } = starsFor(o);
  const pct = Math.max(0, Math.min(100, (o / 99) * 100));
  const base = light ? "text-white/30" : "text-ink-300";
  const fill = light ? "text-white" : "text-gold-500";
  return (
    <span
      aria-label={`${n} de 5 estrelas`}
      className="relative inline-block select-none align-middle leading-none tracking-[0.06em]"
    >
      <span aria-hidden className={base}>
        ★★★★★
      </span>
      <span
        aria-hidden
        className={`absolute inset-0 overflow-hidden whitespace-nowrap ${fill}`}
        style={{ width: `${pct}%` }}
      >
        ★★★★★
      </span>
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
                <ManagerCrest slug={row.team.s} name={row.team.n} />
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
        <ManagerCrest slug={opp.s} name={opp.n} />
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

// ITEM 12 — painel de estatísticas. Uma linha por métrica, com barra comparativa
// (proporção entre os dois lados) e os números nas pontas. Tokens do tema (sem hex
// hardcoded) — legível em claro e escuro. `dense` reduz pro intervalo.
export function MatchStatsPanel({
  stats,
  myName,
  oppName,
  title = "Estatísticas da partida",
  dense = false,
}: {
  stats: MatchStats;
  myName: string;
  oppName: string;
  title?: string;
  dense?: boolean;
}) {
  const rows: { label: string; a: number; b: number; suffix?: string }[] = [
    { label: "Posse de bola", a: stats.poss.a, b: stats.poss.b, suffix: "%" },
    { label: "Finalizações", a: stats.fin.a, b: stats.fin.b },
    { label: "Chutes ao gol", a: stats.sot.a, b: stats.sot.b },
    ...(dense
      ? []
      : [
          { label: "Passes certos", a: stats.passAcc.a, b: stats.passAcc.b, suffix: "%" },
          { label: "Faltas", a: stats.fouls.a, b: stats.fouls.b },
          { label: "Desarmes", a: stats.tackles.a, b: stats.tackles.b },
        ]),
  ];
  return (
    <div className="rounded-[14px] border border-border bg-surface p-3.5">
      <div className="mb-1 flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">
        <span className="truncate text-brand-700">{myName}</span>
        <span className="shrink-0 px-2">{title}</span>
        <span className="truncate text-right text-ink-700">{oppName}</span>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {rows.map((r) => {
          const total = r.a + r.b || 1;
          const pa = Math.round((r.a / total) * 100);
          const aWins = r.a >= r.b;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-[12.5px] font-bold tabular-nums text-ink-800">
                <span className={aWins ? "text-brand-700" : undefined}>
                  {r.a}
                  {r.suffix ?? ""}
                </span>
                <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">
                  {r.label}
                </span>
                <span className={!aWins ? "text-ink-900" : undefined}>
                  {r.b}
                  {r.suffix ?? ""}
                </span>
              </div>
              <div
                className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`${r.label}: ${myName} ${r.a}${r.suffix ?? ""}, ${oppName} ${r.b}${r.suffix ?? ""}`}
              >
                <span className="block h-full rounded-l-full bg-brand-500" style={{ width: `${pa}%` }} />
                <span className="block h-full rounded-r-full bg-ink-400" style={{ width: `${100 - pa}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ITEM 8 (transparência) — "O QUE VENCE O QUE", às cegas, na seleção de tática.
// Mostra o anel pedra-papel-tesoura do MEU estilo: quem ele supera e por quem é
// superado. SEM número cru (mantém o tom boleiro), só a regra existente revelada.
export function StyleRing({ estilo }: { estilo: Estilo }) {
  const m = styleMatchup(estilo);
  return (
    <div className="mt-2.5 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        O que vence o que
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="rounded-md bg-brand-600 px-2 py-1 font-bold text-white">
          {ESTILO_NM[estilo]}
        </span>
        <span className="font-bold text-grass-600">vence ›</span>
        <span className="rounded-md bg-grass-500/15 px-2 py-1 font-bold text-grass-700">
          {m.beatsLabel}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="rounded-md bg-flame-500/12 px-2 py-1 font-bold text-flame-700">
          {m.losesToLabel}
        </span>
        <span className="font-bold text-flame-600">› supera o seu</span>
      </div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-ink-600">
        Estilo certo pode virar o jogo, mas a força base ainda pesa muito. Formação,
        postura e marcação somam ao plano.
      </div>
    </div>
  );
}

// ITEM 8 (transparência) — vantagens CONCRETAS do meu plano contra o do rival, no
// intervalo (tática da IA já revelada). Badges legíveis, derivados das MESMAS regras
// do motor (matchupHints), sem expor o edge numérico.
export function MatchupBadges({ my, opp }: { my: Tactic; opp: Tactic }) {
  const hints = matchupHints(my, opp);
  if (hints.length === 0)
    return (
      <div className="mt-2 text-[12px] text-ink-600">
        Confronto parelho de planos — o detalhe (e a força) decide.
      </div>
    );
  const tone = (k: "good" | "bad" | "neutral") =>
    k === "good"
      ? "border-l-grass-600 bg-grass-500/12 text-grass-700"
      : k === "bad"
        ? "border-l-flame-600 bg-flame-500/10 text-flame-700"
        : "border-l-ink-300 bg-surface-2 text-ink-700";
  const mark = (k: "good" | "bad" | "neutral") => (k === "good" ? "▲" : k === "bad" ? "▼" : "•");
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {hints.map((h, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 rounded-[10px] border-l-[3px] px-2.5 py-1.5 text-[12.5px] font-semibold ${tone(h.kind)}`}
        >
          <span aria-hidden className="mt-px shrink-0 text-[11px] font-black">
            {mark(h.kind)}
          </span>
          <span className="min-w-0">{h.text}</span>
        </div>
      ))}
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
