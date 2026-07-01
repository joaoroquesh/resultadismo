// Hub pré-jogo da CAMPANHA (redesign). Antes de cada partida MINHA, mostra:
//  - o confronto atual (adversário + fase) com forças comparáveis;
//  - o chaveamento até aqui (projectBracket + BracketBody do no ar);
//  - a tabela do meu grupo (quando estou em fase de grupos);
//  - a minha campanha (histórico de jogos).
// Reaproveita os componentes do manager no ar (StandingsTable, HistoryRow, BracketBody,
// NextMatchPair, ManagerCrest) - nada de fork. Só tokens do Design System, sem emoji,
// sem borda lateral, sem em dash. Números só onde o brief permite (overall/forças via os
// componentes reusados, placares, tabela).
import { useMemo, useState } from "react";
import type { Campaign, Edition, Team, MatchKind } from "../types";
import type { GroupsStageState, FinalGroupStageState } from "../types";
import {
  projectBracket,
  campaignProgress,
  stageLong,
  myNextMatch,
} from "../engine";
import { ManagerCrest, StandingsTable, HistoryRow } from "../components";
import { BracketBody, NextMatchPair } from "../Bracket";
import { fisFor } from "./data";
import { ArrowRightIcon, TrophyIcon, ShieldIcon, FlagIcon } from "./icons";

// pílula de estágio (fase de grupos / oitavas / final...), tom por status.
function progressTone(status: "todo" | "done" | "now" | "out"): string {
  if (status === "now") return "bg-brand-600 text-white";
  if (status === "done") return "bg-grass-600/15 text-grass-700 dark:bg-grass-500/22 dark:text-grass-300";
  if (status === "out") return "bg-flame-600/15 text-flame-700 dark:bg-flame-500/22 dark:text-flame-300";
  return "bg-surface-2 text-ink-500";
}

// linha comparativa de força das duas seleções (overall + ATA/MEI/DEF/FIS). Números
// permitidos pelo brief. Sem nota de tática.
function ForceCompare({ mine, opp }: { mine: Team; opp: Team }) {
  const rows: { label: string; a: number; b: number }[] = [
    { label: "Overall", a: mine.o, b: opp.o },
    { label: "ATA", a: mine.a, b: opp.a },
    { label: "MEI", a: mine.m, b: opp.m },
    { label: "DEF", a: mine.d, b: opp.d },
    { label: "FIS", a: fisFor(mine), b: fisFor(opp) },
  ];
  return (
    <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-1.5">
      {rows.map((r) => {
        const aWins = r.a > r.b;
        const bWins = r.b > r.a;
        return (
          <div key={r.label} className="contents">
            <span className={`text-right text-[13px] font-black tabular-nums ${aWins ? "text-brand-700 dark:text-brand-300" : "text-ink-600"}`}>
              {r.a}
            </span>
            <span className="text-center text-[9.5px] font-extrabold uppercase tracking-wide text-ink-500 dark:text-ink-400">
              {r.label}
            </span>
            <span className={`text-left text-[13px] font-black tabular-nums ${bWins ? "text-brand-700 dark:text-brand-300" : "text-ink-600"}`}>
              {r.b}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function CampaignHub({
  campaign,
  edition,
  onPlay,
  onHome,
}: {
  campaign: Campaign;
  edition: Edition;
  onPlay: (opp: Team, kind: MatchKind) => void;
  onHome: () => void;
}) {
  const camp = campaign;
  const mt = camp.myTeam;
  const nm = useMemo(() => myNextMatch(camp), [camp]);
  const steps = useMemo(() => campaignProgress(camp), [camp]);
  const bracket = useMemo(() => projectBracket(camp), [camp]);
  const stage = camp.stages[camp.stageIdx];
  const st = camp.state;
  const [showBracket, setShowBracket] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {/* cabeçalho da campanha */}
      <div>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
          {edition.year} · {edition.host}
        </div>
        <div className="mt-1.5 flex items-center gap-2.5">
          <ManagerCrest slug={mt.s} name={mt.n} size={26} />
          <span className="text-[20px] font-black leading-tight text-ink-950">{mt.n}</span>
        </div>
      </div>

      {/* trilha de progresso pela estrutura real da edição */}
      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
        {steps.map((p, i) => (
          <span key={`${p.label}-${i}`} className="flex items-center gap-1">
            {i > 0 && <span className="text-[10px] text-ink-300">›</span>}
            <span className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-[10.5px] font-extrabold transition-colors duration-200 ease-out ${progressTone(p.status)}`}>
              {p.label}
            </span>
          </span>
        ))}
      </div>

      {/* CONFRONTO ATUAL */}
      {nm ? (
        <section className="rounded-[18px] border border-border bg-surface p-4">
          <div className="text-[10.5px] font-extrabold uppercase tracking-widest text-brand-600 dark:text-brand-300">
            {stageLong(stage)}
            {(st?.kind === "groups" || st?.kind === "final_group") &&
              ` · seu jogo ${(st as GroupsStageState).myMatchIdx + 1}`}
          </div>
          <div className="my-2.5 flex items-center justify-center gap-3">
            <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-[16px] font-black leading-tight [overflow-wrap:anywhere] text-ink-900">
              <ManagerCrest slug={mt.s} name={mt.n} size={34} />
              {mt.n}
            </span>
            <span className="shrink-0 text-[12px] font-extrabold text-ink-400">VS</span>
            <span className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center text-[16px] font-black leading-tight [overflow-wrap:anywhere] text-ink-900">
              <ManagerCrest slug={nm.opp.s} name={nm.opp.n} size={34} />
              {nm.opp.n}
            </span>
          </div>
          <div className="border-t border-border pt-1">
            <ForceCompare mine={mt} opp={nm.opp} />
          </div>
          <button
            type="button"
            onClick={() => onPlay(nm.opp, nm.kind as MatchKind)}
            className="mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 text-[15px] font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98]"
          >
            Montar tática
            <ArrowRightIcon size={16} />
          </button>
        </section>
      ) : (
        <section className="rounded-[16px] border border-border bg-surface p-4 text-center">
          <p className="text-[13px] font-semibold text-ink-700">
            Sua campanha nesta Copa terminou.
          </p>
        </section>
      )}

      {/* próximo confronto no formato chave (quando é mata-mata) + botão do chaveamento */}
      {bracket && nm && (nm.kind === "knockout" || nm.kind === "final" || nm.kind === "third_place") && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <ShieldIcon size={15} className="text-aqua-700 dark:text-aqua-300" />
            <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Seu próximo confronto</h3>
          </div>
          <NextMatchPair mine={mt} opp={nm.opp} />
        </section>
      )}

      {/* tabela do grupo (fase de grupos / quadrangular) */}
      {(st?.kind === "groups" || st?.kind === "final_group") && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <FlagIcon size={15} className="text-brand-600 dark:text-brand-300" />
            <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
              {st.kind === "final_group" ? "Quadrangular final" : "Seu grupo"}
            </h3>
          </div>
          {st.kind === "groups" ? (
            <StandingsTable
              standings={(st as GroupsStageState).standings[(st as GroupsStageState).myG]}
              advance={(st as GroupsStageState).advance}
              myKey={camp.myKey}
              showLegend
            />
          ) : (
            <StandingsTable
              standings={(st as FinalGroupStageState).standings}
              advance={1}
              myKey={camp.myKey}
              showLegend
            />
          )}
        </section>
      )}

      {/* chaveamento até aqui */}
      {bracket && (
        <section>
          <button
            type="button"
            onClick={() => setShowBracket((v) => !v)}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 text-[13px] font-bold text-ink-700 transition-colors duration-150 ease-out hover:bg-surface active:scale-[0.99]"
          >
            <TrophyIcon size={15} className="text-gold-600 dark:text-gold-300" />
            {showBracket ? "Esconder chaveamento" : "Ver chaveamento"}
          </button>
          {showBracket && (
            <div className="mt-3 overflow-x-auto rounded-[16px] border border-border bg-surface p-3">
              <BracketBody view={bracket} />
            </div>
          )}
        </section>
      )}

      {/* minha campanha (histórico) */}
      {camp.history.length > 0 && (
        <section>
          <div className="mb-1 flex items-center gap-2">
            <TrophyIcon size={15} className="text-gold-600 dark:text-gold-300" />
            <h3 className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Sua campanha</h3>
          </div>
          <div>
            {camp.history.map((h, i) => (
              <HistoryRow key={i} {...h} />
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={onHome}
        className="mt-1 flex min-h-[44px] w-full items-center justify-center rounded-pill border border-border bg-surface px-5 text-[13px] font-bold text-ink-700 transition-colors hover:bg-surface-2 active:scale-[0.98]"
      >
        Início
      </button>
    </div>
  );
}

// Tela de FIM de campanha (eliminado / vice / campeão): revela o chaveamento completo
// (projectBracket com reveal) e a colocação. Reusa o BracketBody.
export function CampaignEnd({
  campaign,
  edition,
  onHome,
  onReplay,
}: {
  campaign: Campaign;
  edition: Edition;
  onHome: () => void;
  onReplay: () => void;
}) {
  const camp = campaign;
  const mt = camp.myTeam;
  const bracket = useMemo(() => projectBracket(camp, true), [camp]);
  const champion = camp.champion;
  const placement = camp.placement ?? "Campanha encerrada";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[18px] border border-border bg-surface p-5 text-center">
        <div className="mx-auto mb-2 grid size-12 place-items-center rounded-full bg-gold-500/15">
          <TrophyIcon size={26} className={champion ? "text-gold-600 dark:text-gold-300" : "text-ink-400 dark:text-ink-500"} />
        </div>
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand-600 dark:text-brand-300">
          {edition.year} · {edition.host}
        </div>
        <div className="mt-1.5 flex items-center justify-center gap-2">
          <ManagerCrest slug={mt.s} name={mt.n} size={24} />
          <span className="text-[18px] font-black text-ink-950">{mt.n}</span>
        </div>
        <div className={`mt-2 text-[20px] font-black ${champion ? "text-gold-700 dark:text-gold-300" : "text-ink-800"}`}>
          {placement}
        </div>
      </div>

      {bracket && (
        <section>
          <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
            Chaveamento completo
          </h3>
          <div className="overflow-x-auto rounded-[16px] border border-border bg-surface p-3">
            <BracketBody view={bracket} />
          </div>
        </section>
      )}

      {camp.history.length > 0 && (
        <section>
          <h3 className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">Sua campanha</h3>
          <div>
            {camp.history.map((h, i) => (
              <HistoryRow key={i} {...h} />
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onReplay}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill bg-brand-600 px-5 text-[15px] font-bold text-white shadow-[var(--shadow-brand)] transition-all hover:bg-brand-700 active:scale-[0.98]"
        >
          Jogar de novo
        </button>
        <button
          type="button"
          onClick={onHome}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-pill border border-border bg-surface px-5 text-[15px] font-bold text-ink-900 transition-all hover:bg-surface-2 active:scale-[0.98]"
        >
          Início
        </button>
      </div>
    </div>
  );
}
