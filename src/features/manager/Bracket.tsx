// ITEM 17 — VISUALIZAÇÃO DO CHAVEAMENTO (árvore do mata-mata)
// UI pura que renderiza o BracketView de engine.projectBracket(): a árvore inteira
// (Oitavas/Quartas/Semis/Final conforme a edição), reunindo os MEUS confrontos reais
// e os IA×IA simulados deterministicamente até a Final — revelando o campeão mesmo
// depois da eliminação. Reusa o ManagerCrest (item 3). Legível em DARK e LIGHT (só
// tokens do tema), responsivo (lista vertical no mobile, colunas tipo árvore no
// desktop) e respeita prefers-reduced-motion (sem motion essencial).
import { useEffect, useRef } from "react";
import type { BracketMatch, BracketSlot, BracketView, Campaign, Edition, Team } from "./types";
import { projectBracket } from "./engine";
import { ManagerCrest } from "./components";

// ---- Slot de um time dentro de um confronto ----
function SlotRow({ slot, decided }: { slot: BracketSlot; decided: boolean }) {
  // vaga vazia (bye): ainda sem adversário definido.
  if (!slot.team) {
    return (
      <div className="flex min-h-[34px] items-center gap-2 px-2.5 py-1.5 text-[12px] italic text-ink-400">
        <span className="grid size-[18px] shrink-0 place-items-center rounded-[3px] border border-dashed border-border text-[9px] text-ink-400">
          —
        </span>
        <span className="truncate">a definir</span>
      </div>
    );
  }
  const winner = decided && slot.winner;
  const loser = decided && !slot.winner;
  return (
    <div
      className={`flex min-h-[34px] items-center gap-2 px-2.5 py-1.5 ${
        winner ? "bg-grass-500/12" : ""
      } ${loser ? "opacity-55" : ""}`}
    >
      <ManagerCrest slug={slot.team.s} name={slot.team.n} size={18} />
      <span
        className={`min-w-0 flex-1 truncate text-[12.5px] ${
          winner ? "font-extrabold text-ink-950" : loser ? "font-medium text-ink-600" : "font-bold text-ink-800"
        }`}
      >
        {slot.team.n}
        {slot.isMe && (
          <span className="ml-1 align-middle text-[9px] font-black uppercase tracking-wide text-brand-700">
            você
          </span>
        )}
      </span>
      {slot.champion && (
        <span aria-label="campeão" className="shrink-0 text-[13px]">
          🏆
        </span>
      )}
      <span className="shrink-0 tabular-nums">
        {slot.score == null ? (
          <span className="text-[11px] text-ink-300">·</span>
        ) : (
          <span className={`text-[14px] font-black ${winner ? "text-grass-700" : "text-ink-600"}`}>
            {slot.score}
          </span>
        )}
      </span>
    </div>
  );
}

// ---- Um confronto (card com os dois slots) ----
function MatchCard({ match }: { match: BracketMatch }) {
  const decided = !match.bye && (match.a.winner || match.b.winner);
  const ring = match.mine
    ? "border-brand-500 ring-1 ring-brand-500/40"
    : "border-border";
  return (
    <div className={`overflow-hidden rounded-[11px] border bg-surface ${ring}`}>
      <SlotRow slot={match.a} decided={!!decided} />
      <div className="h-px bg-border" />
      <SlotRow slot={match.b} decided={!!decided} />
      {(match.pens || match.bye || match.mine) && (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-2 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wide">
          <span className="text-ink-400">
            {match.bye ? "passou direto" : match.mine ? (match.real ? "seu jogo" : "seria seu jogo") : ""}
          </span>
          {match.pens && <span className="text-gold-700">pênaltis {match.pens}</span>}
        </div>
      )}
    </div>
  );
}

// ---- Coluna de uma rodada ----
function RoundColumn({
  label,
  short,
  matches,
  isExit,
  isFinal,
}: {
  label: string;
  short: string;
  matches: BracketMatch[];
  isExit: boolean;
  isFinal: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2 md:min-w-[176px] md:flex-1">
      <header className="sticky top-0 z-[1] -mx-0.5 flex items-center gap-1.5 bg-surface/95 px-0.5 py-1 backdrop-blur md:static md:bg-transparent md:py-0">
        <span
          className={`text-[11px] font-extrabold uppercase tracking-wide ${
            isFinal ? "text-gold-700" : "text-ink-500"
          }`}
        >
          <span className="md:hidden">{label}</span>
          <span className="hidden md:inline">{short}</span>
        </span>
        {isExit && (
          <span className="rounded-md bg-flame-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-flame-700">
            você caiu aqui
          </span>
        )}
      </header>
      {/* mobile: pares lado a lado pra economizar altura (confronto único ocupa a
          largura toda); desktop: empilhado e centrado verticalmente pra desenhar a
          árvore. */}
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-1 md:flex-col md:justify-around md:gap-3">
        {matches.map((m, i) => (
          <div key={i} className={matches.length === 1 ? "col-span-2 md:col-span-1" : ""}>
            <MatchCard match={m} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- Faixa do campeão (topo) ----
function ChampionBanner({ champion, iAmChampion }: { champion: Team | null; iAmChampion: boolean }) {
  if (!champion) return null;
  return (
    <div
      className="flex items-center gap-3 rounded-[14px] p-3 text-white"
      style={{ background: "linear-gradient(135deg,var(--color-gold-700),var(--color-gold-900))" }}
    >
      <span aria-hidden className="text-[28px] leading-none">
        🏆
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-extrabold uppercase tracking-widest opacity-85">
          {iAmChampion ? "Você é o campeão" : "Campeão da Copa"}
        </div>
        <div className="flex items-center gap-1.5 text-[17px] font-black">
          <ManagerCrest slug={champion.s} name={champion.n} size={22} />
          <span className="truncate">{champion.n}</span>
        </div>
      </div>
    </div>
  );
}

// ---- Corpo do bracket (sem wrapper de modal) ----
export function BracketBody({ view }: { view: BracketView }) {
  return (
    <div className="flex flex-col gap-3">
      <ChampionBanner champion={view.champion} iAmChampion={view.iAmChampion} />
      {/* desktop: colunas tipo árvore (scroll horizontal se faltar largura).
          mobile: rodadas empilhadas verticalmente. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-3 md:overflow-x-auto md:pb-1">
        {view.rounds.map((r, i) => (
          <RoundColumn
            key={`${r.round}-${i}`}
            label={r.label}
            short={r.short}
            matches={r.matches}
            isExit={view.myExitRound === i}
            isFinal={r.round === "FINAL"}
          />
        ))}
      </div>
      <p className="text-[11px] leading-snug text-ink-500">
        Os confrontos que você jogou trazem o placar real; os demais são a simulação
        determinística das seleções da IA até a final.
      </p>
    </div>
  );
}

// ---- Modal acessível com o bracket (aberto pelo hub a qualquer momento) ----
export function BracketModal({
  campaign,
  edition,
  onClose,
}: {
  campaign: Campaign;
  edition: Edition;
  onClose: () => void;
}) {
  const view = projectBracket(campaign);
  const closeRef = useRef<HTMLButtonElement>(null);

  // foco no botão fechar + ESC fecha + trava o scroll do fundo.
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Chaveamento da Copa ${edition.year}`}
      className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Fechar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/60"
      />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col rounded-t-[20px] border border-border bg-surface shadow-xl sm:rounded-[20px]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand-600">
              Copa {edition.year} · {edition.host}
            </div>
            <h2 className="truncate text-[18px] font-black text-ink-950">Chaveamento</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="grid size-11 shrink-0 place-items-center rounded-full text-ink-600 transition-colors hover:bg-surface-2"
          >
            <span aria-hidden className="text-[20px] leading-none">
              ✕
            </span>
            <span className="sr-only">Fechar</span>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {view ? (
            <BracketBody view={view} />
          ) : (
            <div className="py-10 text-center text-[13px] text-ink-500">
              Esta edição não tem fase de mata-mata.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
