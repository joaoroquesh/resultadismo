// Placar eletrônico no formato Copa do Mundo 2026:
//   [escudo mandante][SIGLA][gols] (escudo Resultadismo no centro) [gols][SIGLA][escudo visitante]
// O relógio fica PEQUENO logo abaixo do escudo central; os marcadores de gol ficam
// nas laterais, na MESMA altura do relógio, com a bola na cor da seleção (SVG inline,
// nada de emoji). Barra de progresso embaixo. O destaque de posse vai ABAIXO dos nomes,
// fiel ao state.ballSide / posse % ao vivo. Vive sempre sobre o board escuro.
import type { Team } from "../types";
import { ManagerCrest } from "../components";
import { teamColors } from "../teamColors";
import { sigla } from "./data";
import { BallIcon } from "./icons";

const REDUCED =
  typeof window !== "undefined" &&
  window.matchMedia &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export interface ScoreboardGoal {
  side: 0 | 1;
  minute: number;
}

// painel de um lado: escudo + sigla. A cor da seleção tinge a sigla.
function SidePanel({ team, align }: { team: Team; align: "left" | "right" }) {
  const c = teamColors(team.s, team.n);
  return (
    <div className={`flex min-w-0 items-center gap-2 ${align === "right" ? "flex-row-reverse" : ""}`}>
      <ManagerCrest slug={team.s} name={team.n} size={34} className="shrink-0" />
      <span
        className="rounded-md px-1.5 py-0.5 text-[15px] font-black uppercase tracking-wide tabular-nums"
        style={{ background: c.bg, color: c.text }}
      >
        {sigla(team)}
      </span>
    </div>
  );
}

// marcadores de gol de um lado (bola na cor do time + minuto), na altura do relógio.
function GoalMarks({
  goals,
  team,
  align,
}: {
  goals: ScoreboardGoal[];
  team: Team;
  align: "left" | "right";
}) {
  const c = teamColors(team.s, team.n);
  if (goals.length === 0) return <div className="min-h-[14px] flex-1" aria-hidden />;
  return (
    <div
      className={`flex min-h-[14px] flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 ${
        align === "right" ? "justify-start" : "justify-end"
      }`}
      aria-label={`Gols ${team.n}`}
    >
      {goals.map((g, i) => (
        <span key={`${g.minute}-${i}`} className="inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums text-white/65">
          <BallIcon size={11} color={c.bg} />
          {g.minute}'
        </span>
      ))}
    </div>
  );
}

// destaque de posse: pílula abaixo dos nomes mostrando quem está com a bola agora,
// com a divisão fiel ao posse % ao vivo.
function PossessionBar({
  teamA,
  teamB,
  possA,
  ballSide,
}: {
  teamA: Team;
  teamB: Team;
  possA: number; // 0..100
  ballSide: 0 | 1;
}) {
  const ca = teamColors(teamA.s, teamA.n);
  const cb = teamColors(teamB.s, teamB.n);
  const pa = Math.max(6, Math.min(94, possA));
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-wide text-white/70">
        <span className={`flex items-center gap-1 ${ballSide === 0 ? "text-white" : "text-white/45"}`}>
          {ballSide === 0 && <BallIcon size={11} color={ca.bg} className={REDUCED ? "" : "animate-[managerPop_0.4s_ease]"} />}
          com a bola
        </span>
        <span className={`flex items-center gap-1 ${ballSide === 1 ? "text-white" : "text-white/45"}`}>
          com a bola
          {ballSide === 1 && <BallIcon size={11} color={cb.bg} className={REDUCED ? "" : "animate-[managerPop_0.4s_ease]"} />}
        </span>
      </div>
      <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/15" role="img" aria-label={`Posse de bola: ${teamA.n} ${Math.round(possA)}%, ${teamB.n} ${100 - Math.round(possA)}%`}>
        <span className="block h-full transition-[width] duration-500 ease-out" style={{ width: `${pa}%`, background: ca.bg }} />
        <span className="block h-full transition-[width] duration-500 ease-out" style={{ width: `${100 - pa}%`, background: cb.bg }} />
      </div>
    </div>
  );
}

export function Scoreboard({
  teamA,
  teamB,
  score,
  goals,
  minute,
  finished,
  possA,
  ballSide,
  pop,
}: {
  teamA: Team;
  teamB: Team;
  score: [number, number];
  goals: ScoreboardGoal[];
  minute: number;
  finished: boolean;
  possA?: number;
  ballSide?: 0 | 1;
  pop?: 0 | 1 | null;
}) {
  const clock = finished ? "ENC" : minute >= 45 && minute < 46 ? "INT" : `${Math.min(minute, 90)}'`;
  const goalsA = goals.filter((g) => g.side === 0);
  const goalsB = goals.filter((g) => g.side === 1);
  const progress = Math.min(100, (Math.min(minute, 90) / 90) * 100);
  return (
    <div
      className="relative overflow-hidden rounded-[18px] border border-white/10 p-4 text-white"
      style={{ background: "var(--color-board, oklch(0.2 0.025 232))" }}
    >
      {/* linha principal: lado A | gols + escudo central + gols | lado B */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <SidePanel team={teamA} align="left" />
        <div className="flex shrink-0 flex-col items-center px-1">
          <div className="flex items-center gap-2.5 font-black leading-none tabular-nums text-gold-400">
            <span className={`text-[40px] ${pop === 0 && !REDUCED ? "animate-[managerPop_0.4s_ease]" : ""}`}>{score[0]}</span>
            <img src="/brand/Resultadismo.svg" alt="" aria-hidden className="size-6 opacity-90" />
            <span className={`text-[40px] ${pop === 1 && !REDUCED ? "animate-[managerPop_0.4s_ease]" : ""}`}>{score[1]}</span>
          </div>
          <div
            role="timer"
            aria-live="off"
            className={`mt-1.5 font-mono text-[11px] font-bold tracking-[0.16em] ${
              !finished && minute > 80 ? "text-flame-400" : "text-white/55"
            }`}
          >
            {clock}
          </div>
        </div>
        <SidePanel team={teamB} align="right" />
      </div>

      {/* marcadores de gol nas laterais, na altura do relógio */}
      {(goalsA.length > 0 || goalsB.length > 0) && (
        <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-start gap-2">
          <GoalMarks goals={goalsA} team={teamA} align="left" />
          <span className="w-6" aria-hidden />
          <GoalMarks goals={goalsB} team={teamB} align="right" />
        </div>
      )}

      {/* destaque de posse abaixo dos nomes (ao vivo) */}
      {possA != null && ballSide != null && !finished && (
        <PossessionBar teamA={teamA} teamB={teamB} possA={possA} ballSide={ballSide} />
      )}

      {/* barra de progresso do tempo */}
      <div className="mt-3 h-[5px] overflow-hidden rounded-full bg-white/15">
        <span className="block h-full rounded-full bg-grass-500 transition-[width] duration-150" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
