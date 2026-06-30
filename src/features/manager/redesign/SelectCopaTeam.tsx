// Seleciona edição + seleção, a partir dos dados existentes (reaproveita os loaders
// do manager no ar). Números expostos: overall e forças (ATA/MEI/DEF/FIS). Nada de
// dado tático cru.
import { useMemo, useState } from "react";
import type { Team, Edition } from "../types";
import { editionsDesc, teamsForYear, TIER_LABEL, fisFor } from "./data";
import { ManagerCrest } from "../components";
import { ArrowLeftIcon, ArrowRightIcon } from "./icons";

// barrinhas de força (ATA/MEI/DEF/FIS). Escala 30..99 vira 4..100% (igual barPct).
function forcePct(v: number): number {
  return Math.max(6, Math.min(100, ((v - 30) / (99 - 30)) * 100));
}
function ForceBars({ team, light = false }: { team: Team; light?: boolean }) {
  const items: { k: string; v: number }[] = [
    { k: "ATA", v: team.a },
    { k: "MEI", v: team.m },
    { k: "DEF", v: team.d },
    { k: "FIS", v: fisFor(team) },
  ];
  const track = light ? "bg-white/15" : "bg-surface-2";
  const lab = light ? "text-white/70" : "text-ink-500";
  const num = light ? "text-white" : "text-ink-800";
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
      {items.map((it) => (
        <div key={it.k} className="min-w-0">
          <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wide">
            <span className={lab}>{it.k}</span>
            <span className={`tabular-nums ${num}`}>{it.v}</span>
          </div>
          <div className={`mt-0.5 h-1 overflow-hidden rounded-full ${track}`}>
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${forcePct(it.v)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function EditionPicker({ onPick, onBack }: { onPick: (ed: Edition) => void; onBack: () => void }) {
  const editions = useMemo(() => editionsDesc(), []);
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-[13px] font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeftIcon size={16} /> Voltar
      </button>
      <div>
        <h2 className="text-[20px] font-black text-ink-900">Selecionar Copa</h2>
        <p className="mt-1 text-[13px] text-ink-500">Escolha a edição que você quer disputar.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {editions.map((ed) => (
          <button
            key={ed.year}
            type="button"
            onClick={() => onPick(ed)}
            className="flex flex-col items-start gap-0.5 rounded-[14px] border border-border bg-surface px-3.5 py-3 text-left transition-[transform,border-color,background-color] duration-150 ease-out hover:border-brand-400 hover:bg-surface-2 active:scale-[0.97]"
          >
            <span className="text-[18px] font-black tabular-nums text-ink-900">{ed.year}</span>
            <span className="truncate text-[11.5px] font-semibold text-ink-500">{ed.host}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamPicker({
  edition,
  onPick,
  onBack,
}: {
  edition: Edition;
  onPick: (t: Team) => void;
  onBack: () => void;
}) {
  const teams = useMemo(() => teamsForYear(edition.year), [edition.year]);
  const [selected, setSelected] = useState<Team | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-[13px] font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeftIcon size={16} /> Trocar edição
      </button>
      <div>
        <h2 className="text-[20px] font-black text-ink-900">Copa de {edition.year}</h2>
        <p className="mt-1 text-[13px] text-ink-500">Escolha a sua seleção. {edition.host}.</p>
      </div>

      <div className="flex flex-col gap-2">
        {teams.map((t) => {
          const on = selected?.s === t.s;
          return (
            <button
              key={t.s}
              type="button"
              aria-pressed={on}
              onClick={() => setSelected(t)}
              className={`flex items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[0.99] ${
                on ? "border-brand-500 bg-brand-50/60" : "border-border bg-surface hover:border-brand-400"
              }`}
            >
              <ManagerCrest slug={t.s} name={t.n} size={34} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[14.5px] font-bold text-ink-900">{t.n}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-600">
                      {TIER_LABEL[t.t]}
                    </span>
                    <span className="text-[15px] font-black tabular-nums text-brand-700">{t.o}</span>
                  </span>
                </div>
                {on && (
                  <div className="mt-2">
                    <ForceBars team={t} />
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        disabled={!selected}
        onClick={() => selected && onPick(selected)}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 text-[15px] font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {selected ? `Comandar ${selected.n}` : "Escolha uma seleção"}
        {selected && <ArrowRightIcon size={16} />}
      </button>
    </div>
  );
}

export function SelectCopaTeam({
  onPick,
  onBack,
  fixedEdition,
}: {
  onPick: (edition: Edition, team: Team) => void;
  onBack: () => void;
  fixedEdition?: Edition | null;
}) {
  const [edition, setEdition] = useState<Edition | null>(fixedEdition ?? null);
  if (!edition) return <EditionPicker onPick={setEdition} onBack={onBack} />;
  return <TeamPicker edition={edition} onPick={(t) => onPick(edition, t)} onBack={() => (fixedEdition ? onBack() : setEdition(null))} />;
}

export { ForceBars };
