// "Sua seleção": sorteio por dificuldade (TASK 3). No lugar da lista chapada, o
// jogador vê 3 seleções sorteadas da Copa escolhida como níveis: Favorita (S/A),
// Média (B) e Zebra (C/D). Cada card mostra escudo, nome, badge de tier, barras
// ATA/MEI/DEF, overall e a frase boleira do tier. "Sortear de novo" (1 uso) e o
// toggle do mundo da campanha (Real / Alternativo). O sorteio + a contagem de reroll
// ficam no localStorage (rd_manager_v2_draft): voltar não re-sorteia.
import { useCallback, useMemo, useState } from "react";
import type { Team, Edition, WorldMode } from "../types";
import { editionsDesc } from "./data";
import { TIER_LABEL, fraseFor } from "../engine";
import { barPct } from "../ui";
import { ManagerCrest } from "../components";
import {
  drawTiers, picksFromSlugs, DRAFT_LEVEL_LABEL, DRAFT_LEVEL_HINT,
  type DraftPick, type DraftLevel,
} from "./draft";
import {
  loadDraft, saveDraft, DRAFT_MAX_REROLLS, type DraftState,
} from "./localState";
import { ArrowLeftIcon, ArrowRightIcon, DiceIcon, StarIcon } from "./icons";

// ---------------------------------------------------------------- barras de força
function ForceBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between text-[9.5px] font-extrabold uppercase tracking-wide text-ink-500">
        <span>{label}</span>
        <span className="tabular-nums text-ink-700">{value}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-surface-2">
        <span className="block h-full rounded-full bg-brand-500" style={{ width: `${barPct(value)}%` }} />
      </div>
    </div>
  );
}

// estrelas do overall (0..5, meia em meia). O overall também aparece em número.
function OverallStars({ o }: { o: number }) {
  const n = Math.round((o / 99) * 10) / 2; // 0..5 em passos de 0.5
  const full = Math.floor(n);
  const hasHalf = n - full >= 0.5;
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <StarIcon key={i} size={11} filled={i < full} half={i === full && hasHalf} />
      ))}
    </span>
  );
}

// cor de acento por nível (semântica de dificuldade, sem inventar cor nova):
// favorita = gold (peso), média = brand, zebra = aqua (surpresa).
const LEVEL_ACCENT: Record<DraftLevel, { chipBg: string; chipText: string; ring: string }> = {
  favorita: { chipBg: "bg-gold-500/18", chipText: "text-gold-700", ring: "ring-gold-500/40" },
  media: { chipBg: "bg-brand-500/15", chipText: "text-brand-700", ring: "ring-brand-500/50" },
  zebra: { chipBg: "bg-aqua-500/18", chipText: "text-aqua-700", ring: "ring-aqua-500/40" },
};

// ---------------------------------------------------------------- card de seleção
function DraftCard({
  pick,
  seedN,
  selected,
  onSelect,
}: {
  pick: DraftPick;
  seedN: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const t = pick.team;
  const acc = LEVEL_ACCENT[pick.level];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`group relative flex w-full flex-col gap-3 rounded-[16px] border bg-surface p-4 text-left transition-[transform,border-color,box-shadow] duration-200 ease-out active:scale-[0.99] ${
        selected ? `border-brand-500 shadow-soft ring-2 ${acc.ring}` : "border-border hover:border-brand-400"
      }`}
    >
      <div className="flex items-center gap-3">
        <ManagerCrest slug={t.s} name={t.n} size={40} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[9.5px] font-black uppercase tracking-wider ${acc.chipBg} ${acc.chipText}`}>
              {DRAFT_LEVEL_LABEL[pick.level]}
            </span>
            <span className="truncate text-[10px] font-semibold text-ink-400">{TIER_LABEL[t.t]}</span>
          </div>
          <div className="mt-0.5 truncate text-[16px] font-black leading-tight text-ink-900">{t.n}</div>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[20px] font-black tabular-nums leading-none text-brand-700">{t.o}</span>
          <span className="mt-1"><OverallStars o={t.o} /></span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-x-3">
        <ForceBar label="ATA" value={t.a} />
        <ForceBar label="MEI" value={t.m} />
        <ForceBar label="DEF" value={t.d} />
      </div>

      <p className="text-[11.5px] leading-snug text-ink-600">{fraseFor(t.t, seedN)}</p>
      <p className={`text-[10.5px] font-semibold leading-snug ${acc.chipText}`}>{DRAFT_LEVEL_HINT[pick.level]}</p>

      <span
        className={`pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center text-brand-600 ${
          selected ? "sm:flex" : ""
        }`}
        aria-hidden
      >
        <ArrowRightIcon size={18} />
      </span>
    </button>
  );
}

// ---------------------------------------------------------------- toggle do mundo
function WorldToggle({ value, onChange }: { value: WorldMode; onChange: (w: WorldMode) => void }) {
  const opts: { id: WorldMode; label: string; hint: string }[] = [
    { id: "real", label: "Seguir a História Real", hint: "Os outros jogos saem como foi na vida real." },
    { id: "alt", label: "Criar Mundo Alternativo", hint: "Tudo pode mudar. Você reescreve a Copa." },
  ];
  return (
    <fieldset>
      <legend className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Mundo da campanha</legend>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {opts.map((o) => {
          const on = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(o.id)}
              className={`flex flex-col items-start gap-0.5 rounded-[13px] border px-3.5 py-3 text-left transition-[transform,border-color,background-color] duration-150 ease-out active:scale-[0.98] ${
                on ? "border-brand-500 bg-brand-50/60" : "border-border bg-surface hover:border-brand-400"
              }`}
            >
              <span className={`text-[13px] font-bold ${on ? "text-brand-700" : "text-ink-900"}`}>{o.label}</span>
              <span className="text-[11px] leading-snug text-ink-500">{o.hint}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

// ---------------------------------------------------------------- seletor de edição
function EditionPicker({ onPick, onBack }: { onPick: (ed: Edition) => void; onBack: () => void }) {
  const editions = useMemo(() => editionsDesc(), []);
  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-[13px] font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeftIcon size={16} /> Voltar
      </button>
      <div>
        <h2 className="text-[20px] font-black text-ink-900">Sua seleção</h2>
        <p className="mt-1 text-[13px] leading-snug text-ink-500">Escolha a Copa. O sorteio te dá 3 seleções, de favorita a zebra.</p>
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

// ---------------------------------------------------------------- tela do sorteio
function DraftBoard({
  edition,
  onPick,
  onBack,
}: {
  edition: Edition;
  onPick: (ed: Edition, team: Team, world: WorldMode) => void;
  onBack: () => void;
}) {
  // hidrata do save (se for da MESMA edição); senão sorteia agora e persiste.
  const [state, setState] = useState<DraftState>(() => {
    const saved = loadDraft();
    if (saved && saved.year === edition.year) {
      const picks = picksFromSlugs(edition.year, saved.slugs);
      if (picks.length === 3) return saved;
    }
    const seed = (edition.year * 2654435761) >>> 0;
    const picks = drawTiers(edition.year, seed);
    const next: DraftState = {
      year: edition.year,
      slugs: [picks[0]?.team.s ?? "", picks[1]?.team.s ?? "", picks[2]?.team.s ?? ""],
      rerolls: 0,
      world: saved?.world ?? "real",
    };
    saveDraft(next);
    return next;
  });

  const picks = useMemo(() => picksFromSlugs(edition.year, state.slugs), [edition.year, state.slugs]);
  const [chosen, setChosen] = useState<string | null>(null);
  const seedN = useMemo(() => (edition.year + state.rerolls * 7) >>> 0, [edition.year, state.rerolls]);
  const canReroll = state.rerolls < DRAFT_MAX_REROLLS;

  const reroll = useCallback(() => {
    setState((prev) => {
      if (prev.rerolls >= DRAFT_MAX_REROLLS) return prev;
      const rerolls = prev.rerolls + 1;
      const seed = ((edition.year * 2654435761) ^ (rerolls * 0x9e3779b9)) >>> 0;
      const np = drawTiers(edition.year, seed);
      const next: DraftState = {
        year: edition.year,
        slugs: [np[0]?.team.s ?? "", np[1]?.team.s ?? "", np[2]?.team.s ?? ""],
        rerolls,
        world: prev.world,
      };
      saveDraft(next);
      return next;
    });
    setChosen(null);
  }, [edition.year]);

  const setWorld = useCallback((world: WorldMode) => {
    setState((prev) => {
      const next = { ...prev, world };
      saveDraft(next);
      return next;
    });
  }, []);

  const chosenTeam = picks.find((p) => p.team.s === chosen)?.team ?? null;

  return (
    <div className="flex flex-col gap-4">
      <button type="button" onClick={onBack} className="flex items-center gap-1 self-start text-[13px] font-semibold text-ink-600 hover:text-ink-900">
        <ArrowLeftIcon size={16} /> Trocar Copa
      </button>

      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="text-[20px] font-black leading-tight text-ink-900">Copa de {edition.year}</h2>
          <p className="mt-1 text-[12.5px] leading-snug text-ink-500">Toque numa seleção pra assumir o comando. {edition.host}.</p>
        </div>
        <button
          type="button"
          onClick={reroll}
          disabled={!canReroll}
          className="flex shrink-0 items-center gap-1.5 rounded-pill border border-border bg-surface px-3 py-2 text-[12px] font-bold text-ink-700 transition-[transform,border-color,color] duration-150 ease-out hover:border-brand-400 hover:text-brand-700 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
        >
          <DiceIcon size={15} />
          {canReroll ? "Sortear de novo" : "Sorteio usado"}
        </button>
      </div>

      <div className="flex flex-col gap-2.5">
        {picks.map((p) => (
          <DraftCard
            key={p.team.s}
            pick={p}
            seedN={seedN}
            selected={chosen === p.team.s}
            onSelect={() => setChosen(p.team.s)}
          />
        ))}
      </div>

      <WorldToggle value={state.world} onChange={setWorld} />

      <button
        type="button"
        disabled={!chosenTeam}
        onClick={() => chosenTeam && onPick(edition, chosenTeam, state.world)}
        className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 text-[15px] font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
      >
        {chosenTeam ? `Comandar ${chosenTeam.n}` : "Escolha uma das três"}
        {chosenTeam && <ArrowRightIcon size={16} />}
      </button>
    </div>
  );
}

export function DraftSelection({
  onPick,
  onBack,
  initialEdition = null,
}: {
  onPick: (edition: Edition, team: Team, world: WorldMode) => void;
  onBack: () => void;
  initialEdition?: Edition | null;
}) {
  const [edition, setEdition] = useState<Edition | null>(initialEdition);
  if (!edition) return <EditionPicker onPick={setEdition} onBack={onBack} />;
  return <DraftBoard edition={edition} onPick={onPick} onBack={() => setEdition(null)} />;
}
