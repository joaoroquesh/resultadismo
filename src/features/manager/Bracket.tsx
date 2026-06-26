// ITEM 17 / ITEM B / ITEM #9 — VISUALIZAÇÃO DO CHAVEAMENTO (árvore do mata-mata)
// UI pura que renderiza o BracketView de engine.projectBracket(): a árvore inteira
// (Oitavas/Quartas/Semis/Final conforme a edição), reunindo os MEUS confrontos reais,
// os IA×IA simulados deterministicamente e — ao fim da campanha — a CONTINUAÇÃO real
// do chaveamento (efeito borboleta) até revelar o campeão mesmo depois da eliminação.
//
// A v8 só CONSOME o projectBracket novo (nada é recalculado aqui):
//  - confrontos JÁ DECIDIDOS trazem placar + vencedor realçado;
//  - a RODADA ATUAL EM ANDAMENTO vem como confrontos PENDENTES (sem placar, traço "–"),
//    visualmente distintos de um jogo decidido, com o MEU próximo confronto destacado;
//  - "você caiu aqui" / "seu jogo" seguem do BracketView (myExitRound / match.mine),
//    e nenhum time aparece em rodada que não disputou (a continuação só avança vencedores).
//
// Reusa o ManagerCrest (item 3) e teamColors (item 5). Legível em DARK e LIGHT (só
// tokens do tema), responsivo (lista vertical no mobile, colunas tipo árvore no
// desktop) e respeita prefers-reduced-motion (kill-switch global no index.css).
import { useEffect, useRef } from "react";
import type { BracketMatch, BracketRound, BracketSlot, BracketView, Campaign, Edition, Team } from "./types";
import { projectBracket } from "./engine";
import { ManagerCrest } from "./components";
import { teamColors } from "./teamColors";

// ---- Slot de um time dentro de um confronto ----
// `decided` = o confronto já tem vencedor (placar real/simulado). `pending` = a rodada
// está pareada mas ainda não foi jogada (sem placar) — render neutro, sem realce de
// vitória e com traço "–" no lugar dos gols.
// classe do nome do time conforme o desfecho do slot (vencedor/perdedor/pendente).
function slotNameClass(winner: boolean, loser: boolean, pending: boolean): string {
  if (winner) return "font-extrabold text-ink-950";
  if (loser) return "font-medium text-ink-600";
  return pending ? "font-bold text-ink-700" : "font-bold text-ink-800";
}

// célula de placar do slot: pendente = traço neutro; sem placar = ponto; senão o gol.
function SlotScore({ slot, winner }: { slot: BracketSlot; winner: boolean }) {
  if (slot.pending)
    // a jogar: traço neutro no lugar do placar (não é 0 — é "ainda não houve").
    return (
      <span aria-label="a jogar" className="text-[13px] font-bold text-ink-300">
        –
      </span>
    );
  if (slot.score == null) return <span className="text-[11px] text-ink-300">·</span>;
  return (
    <span className={`text-[14px] font-black ${winner ? "text-grass-700" : "text-ink-600"}`}>
      {slot.score}
    </span>
  );
}

// ITEM #9: `showAdvance` (só na tela de resultado da fase) carimba um selo "avança ›" no
// slot vencedor, deixando explícito quem segue no chaveamento — clareza nível Print 3.
function SlotRow({ slot, decided, showAdvance = false }: { slot: BracketSlot; decided: boolean; showAdvance?: boolean }) {
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
  // pílula de cor do time só no MEU slot pendente, pra ancorar visualmente o "próximo".
  const col = slot.pending && slot.isMe ? teamColors(slot.team.s, slot.team.n) : null;
  return (
    <div
      className={`flex min-h-[34px] items-center gap-2 px-2.5 py-1.5 ${
        winner ? "bg-grass-500/12" : ""
      } ${loser ? "opacity-55" : ""}`}
    >
      <ManagerCrest slug={slot.team.s} name={slot.team.n} size={18} />
      <span className={`min-w-0 flex-1 truncate text-[12.5px] ${slotNameClass(winner, loser, slot.pending)}`}>
        {slot.team.n}
        {slot.isMe && (
          <span
            className="ml-1 inline-block rounded-[4px] px-1 align-middle text-[9px] font-black uppercase tracking-wide"
            style={col ? { background: col.bg, color: col.text } : undefined}
          >
            <span className={col ? "" : "text-brand-700"}>você</span>
          </span>
        )}
      </span>
      {/* ITEM #9: selo "avança" no vencedor (só na tela de resultado da fase) — diz, sem
          ambiguidade, quem segue no chaveamento. No bracket (modal) fica de fora pra não
          poluir a árvore densa; lá o fundo verde + negrito já bastam. */}
      {showAdvance && winner && (
        <span className="shrink-0 rounded-[4px] bg-grass-600 px-1.5 py-0.5 text-[8.5px] font-black uppercase tracking-wide text-white">
          avança ›
        </span>
      )}
      {slot.champion && (
        <span aria-label="campeão" className="shrink-0 text-[13px]">
          🏆
        </span>
      )}
      <span className="shrink-0 tabular-nums">
        <SlotScore slot={slot} winner={winner} />
      </span>
    </div>
  );
}

// realce da borda do card: meu próximo jogo (pendente) ganha o anel brand mais forte;
// meu jogo já decidido mantém o anel brand; pendente IA×IA fica tracejado/neutro;
// decidido IA×IA fica com a borda padrão.
function matchRingClass(match: BracketMatch): string {
  if (match.mine) {
    return match.pending
      ? "border-brand-500 ring-2 ring-brand-500/45"
      : "border-brand-500 ring-1 ring-brand-500/40";
  }
  return match.pending ? "border-dashed border-border" : "border-border";
}

// rótulo de status do rodapé do card (bye / a jogar / meu jogo). "" = sem rótulo.
function matchStatusLabel(match: BracketMatch): string {
  if (match.bye) return "passou direto";
  if (match.pending) return match.mine ? "seu próximo jogo" : "a jogar";
  if (match.mine) return match.real ? "seu jogo" : "seria seu jogo";
  return "";
}

// ---- Um confronto (card com os dois slots) ----
// ITEM #9: `showAdvance` propaga pro SlotRow o selo "avança ›" no vencedor (tela de
// resultado da fase). No bracket-modal fica desligado (default) pra manter a árvore limpa.
function MatchCard({ match, showAdvance = false }: { match: BracketMatch; showAdvance?: boolean }) {
  const decided = !match.bye && !match.pending && (match.a.winner || match.b.winner);
  const label = matchStatusLabel(match);
  const showFooter = !!match.pens || match.bye || match.mine || match.pending;
  return (
    <div className={`overflow-hidden rounded-[11px] border bg-surface ${matchRingClass(match)}`}>
      <SlotRow slot={match.a} decided={!!decided} showAdvance={showAdvance} />
      <div className={`h-px ${match.pending ? "bg-border/60" : "bg-border"}`} />
      <SlotRow slot={match.b} decided={!!decided} showAdvance={showAdvance} />
      {showFooter && (
        <div className="flex items-center justify-between gap-2 border-t border-border bg-surface-2 px-2.5 py-1 text-[9.5px] font-extrabold uppercase tracking-wide">
          <span className={match.pending && match.mine ? "text-brand-700" : "text-ink-400"}>{label}</span>
          {match.pens && !match.pending && <span className="text-gold-700">pênaltis {match.pens}</span>}
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
  isPending,
}: {
  label: string;
  short: string;
  matches: BracketMatch[];
  isExit: boolean;
  isFinal: boolean;
  isPending: boolean;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2 md:min-w-[176px] md:flex-1">
      <header className="sticky top-0 z-[1] -mx-0.5 flex flex-wrap items-center gap-1.5 bg-surface/95 px-0.5 py-1 backdrop-blur md:static md:bg-transparent md:py-0">
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
        {isPending && (
          <span className="rounded-md bg-brand-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide text-brand-700">
            em andamento
          </span>
        )}
      </header>
      {/* mobile (BUG 1.2d): LISTA VERTICAL — um confronto embaixo do outro, legível em
          ~480px. desktop: empilhado e centrado verticalmente pra desenhar a árvore. */}
      <div className="flex flex-col gap-2 md:flex-1 md:justify-around md:gap-3">
        {matches.map((m, i) => (
          <MatchCard key={i} match={m} />
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

// um round é "pendente" quando todos os confrontos dele ainda não foram jogados (rodada
// atual em andamento). Como pendingCurrentRound monta a rodada inteira como pendente,
// basta checar o primeiro confronto não-bye (bye não tem placar mas não é "a jogar").
function roundIsPending(r: BracketRound): boolean {
  return r.matches.length > 0 && r.matches.every((m) => m.pending);
}

// ---- Corpo do bracket (sem wrapper de modal) ----
// `footnote` opcional explica a fonte dos confrontos conforme o contexto (durante a
// campanha vs. fim de campanha). Durante a campanha, as rodadas mostradas são as já
// disputadas + a ATUAL pareada (pendente, sem placar); ao fim, a árvore inteira.
export function BracketBody({ view, footnote }: { view: BracketView; footnote?: string }) {
  const hasPending = view.rounds.some(roundIsPending);
  return (
    <div className="flex flex-col gap-3">
      <ChampionBanner champion={view.champion} iAmChampion={view.iAmChampion} />
      {/* desktop: colunas tipo árvore (scroll horizontal se faltar largura).
          mobile: rodadas empilhadas verticalmente, confrontos em lista vertical. */}
      <div className="flex flex-col gap-4 md:flex-row md:gap-3 md:overflow-x-auto md:pb-1">
        {view.rounds.map((r, i) => (
          <RoundColumn
            key={`${r.round}-${i}`}
            label={r.label}
            short={r.short}
            matches={r.matches}
            isExit={view.myExitRound === i}
            isFinal={r.round === "FINAL"}
            isPending={roundIsPending(r)}
          />
        ))}
      </div>
      <p className="text-[11px] leading-snug text-ink-500">
        {footnote ??
          (hasPending
            ? "A rodada em andamento aparece pareada, ainda sem placar (–). Seus confrontos já disputados trazem o placar real do seu jogo."
            : "Os confrontos que você jogou trazem o placar real do seu jogo; os demais são como o mata-mata desta Copa de fato terminou.")}
      </p>
    </div>
  );
}

// ITEM D / #9 — corpo de UMA rodada de mata-mata (todos os confrontos da fase) PAR A PAR,
// pra a tela "Resultados das [oitavas/quartas/...]" logo após a fase fechar. Reusa o
// MatchCard (escudo + placar de cada lado, vencedor realçado + selo "avança ›"). O MEU
// confronto vem PRIMEIRO e ocupa a largura toda (âncora visual); os demais em grade de 2.
// Lista vertical no mobile, grade fluida em telas maiores. DARK e LIGHT (só tokens).
export function KoRoundBody({ round }: { round: BracketRound }) {
  // meu confronto encabeça a lista (clareza: "o meu jogo" primeiro); o resto na ordem
  // do chaveamento. Não muta o round — só reordena a cópia pra render.
  const ordered = [...round.matches].sort((a, b) => Number(b.mine) - Number(a.mine));
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ordered.map((m, i) => (
        <div key={i} className={m.mine ? "sm:col-span-2" : undefined}>
          <MatchCard match={m} showAdvance />
        </div>
      ))}
    </div>
  );
}

// ITEM #9 — "Próximo confronto" montado (sem placar), no MESMO formato de par do bracket.
// Reusa o MatchCard com um BracketMatch PENDENTE construído de duas seleções (eu × próximo
// adversário), pra o encaminhamento pra próxima fase falar a MESMA língua visual dos
// confrontos decididos acima — em vez de um card solto com layout diferente. Sem score.
export function NextMatchPair({ mine, opp }: { mine: Team; opp: Team }) {
  const slot = (team: Team, isMe: boolean): BracketSlot => ({
    team,
    score: null,
    pens: null,
    winner: false,
    isMe,
    champion: false,
    pending: true,
  });
  const match: BracketMatch = {
    a: slot(mine, true),
    b: slot(opp, false),
    bye: false,
    mine: true,
    real: false,
    pens: null,
    pending: true,
  };
  return <MatchCard match={match} />;
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
            <BracketBody
              view={view}
              footnote="Mostrando as fases já disputadas e a rodada atual pareada (ainda sem placar). As próximas aparecem conforme você as joga; seus confrontos trazem o placar real do seu jogo."
            />
          ) : (
            <div className="py-10 text-center text-[13px] text-ink-500">
              O mata-mata ainda não começou. O chaveamento aparece rodada a rodada,
              conforme as fases eliminatórias são disputadas.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
