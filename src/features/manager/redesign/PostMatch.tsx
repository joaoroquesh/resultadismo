// Pós-jogo: leitura HONESTA derivada de sinais e placar reais (nunca aleatória).
// Três lentes: a seleção (placar x força), o rival (encaixe revelado) e o arquétipo
// do técnico (se houver). Sem número de tática cru, só leitura.
import { useMemo } from "react";
import type { Team } from "../types";
import type { Tactic, SignalLevel } from "./tactics.ts";
import { matchupSignals, coherenceSignals } from "./tactics.ts";
import type { ArchetypeKey } from "./archetypes.ts";
import { ARCHETYPES, archetypeBonus } from "./archetypes.ts";
import { MatchupList } from "./Signals";
import { Scoreboard } from "./Scoreboard";
import { TrophyIcon, ShieldIcon, CompassIcon } from "./icons";
import type { ScoreboardGoal } from "./Scoreboard";

const SCORE: Record<SignalLevel, number> = { pp: 2, p: 1, z: 0, m: -1, mm: -2 };
function fit(signals: { level: SignalLevel }[]): number {
  return signals.reduce((a, s) => a + SCORE[s.level], 0);
}

// leitura da seleção: placar x diferença de força (honesta, sem aleatório).
function selecaoRead(gf: number, ga: number, myO: number, oppO: number, name: string): string {
  const diff = myO - oppO;
  const gd = gf - ga;
  const favorito = diff >= 8;
  const azarao = diff <= -8;
  if (gf > ga) {
    if (azarao && gd >= 2) return `Zebra das grandes: ${name} entrou sem favoritismo e derrubou um adversário mais forte.`;
    if (azarao) return `${name} surpreendeu o favorito. Vitória de quem acreditou no plano.`;
    if (favorito && gd >= 3) return `Era pra ser superioridade e foi: ${name} controlou e goleou.`;
    return `Vitória de ${name}, construída com mais qualidade na hora de decidir.`;
  }
  if (gf === ga) return `Empate equilibrado. ${name} dividiu o jogo e leva um ponto.`;
  if (favorito && gd <= -2) return `Tropeço pesado: ${name} tinha a folga no papel e deixou escapar.`;
  if (gd <= -3) return `${name} apanhou no placar. O rival foi superior do início ao fim.`;
  return `Derrota apertada de ${name}. Faltou capricho no detalhe que decide.`;
}

// leitura do rival: o que o encaixe mostrou (qual lado ganhou o duelo tático).
function rivalRead(attackFit: number, defenseFit: number, oppName: string): string {
  if (attackFit > 0 && defenseFit > 0) return `Você ganhou os dois duelos: seu ataque furou e sua marcação segurou ${oppName}.`;
  if (attackFit > 0 && defenseFit <= 0) return `Seu ataque encaixou contra ${oppName}, mas a sua marcação sofreu. Jogo aberto.`;
  if (attackFit <= 0 && defenseFit > 0) return `Sua marcação dominou ${oppName}, faltou o seu ataque encontrar a brecha.`;
  if (attackFit < 0 && defenseFit < 0) return `${oppName} levou a melhor nos dois lados do confronto tático. Plano não encaixou.`;
  return `Duelo tático parelho com ${oppName}: o detalhe e a sorte pesaram mais que o desenho.`;
}

// leitura do arquétipo: o bônus de coerência confirma ou não a identidade do técnico.
function arquetipoRead(arch: ArchetypeKey, tac: Tactic): string {
  const a = ARCHETYPES[arch];
  const bonus = archetypeBonus(arch, tac);
  if (bonus >= 1) return `Time com a sua cara: o plano respeitou a lente ${a.nome.toLowerCase()} e isso somou em campo.`;
  if (bonus <= -0.5) return `O plano fugiu da sua escola ${a.nome.toLowerCase()}. Deu pra competir, mas sem o seu tempero.`;
  return `Plano dentro do razoável pra um técnico ${a.nome.toLowerCase()}, sem forçar contra a sua identidade.`;
}

export function PostMatch({
  myTeam,
  oppTeam,
  score,
  goals,
  tac,
  oppTac,
  archetype,
  onPlayAgain,
  onHome,
}: {
  myTeam: Team;
  oppTeam: Team;
  score: [number, number];
  goals: ScoreboardGoal[];
  tac: Tactic;
  oppTac: Tactic;
  archetype: ArchetypeKey | null;
  onPlayAgain: () => void;
  onHome: () => void;
}) {
  const matchups = useMemo(() => matchupSignals(tac, oppTac), [tac, oppTac]);
  const coherences = useMemo(() => coherenceSignals(tac), [tac]);
  const attackFit = useMemo(() => fit(matchups.filter((m) => m.key === "ataque_vs_defesa" || m.key === "ataque_vs_bloco")), [matchups]);
  const defenseFit = useMemo(() => fit(matchups.filter((m) => m.key === "defesa_vs_ataque" || m.key === "ataque_rival_vs_meu_bloco")), [matchups]);

  const win = score[0] > score[1];
  const draw = score[0] === score[1];
  const resultLabel = win ? "Vitória" : draw ? "Empate" : "Derrota";
  const resultTone = win ? "text-grass-700" : draw ? "text-ink-700" : "text-flame-700";

  const selRead = selecaoRead(score[0], score[1], myTeam.o, oppTeam.o, myTeam.n);
  const rivRead = rivalRead(attackFit, defenseFit, oppTeam.n);
  const arqRead = archetype ? arquetipoRead(archetype, tac) : null;
  const cohScore = fit(coherences);

  return (
    <div className="flex flex-col gap-4">
      <Scoreboard
        teamA={myTeam}
        teamB={oppTeam}
        score={score}
        goals={goals}
        minute={90}
        finished
      />

      <div className={`text-center text-[18px] font-black ${resultTone}`}>{resultLabel}</div>

      {/* leitura da seleção */}
      <section className="rounded-[14px] border border-border bg-surface p-3.5">
        <div className="mb-1.5 flex items-center gap-2">
          <TrophyIcon size={16} className="text-gold-600" />
          <h3 className="text-[12.5px] font-bold text-ink-900">A seleção</h3>
        </div>
        <p className="text-[12.5px] leading-snug text-ink-700">{selRead}</p>
      </section>

      {/* leitura do rival (encaixe) */}
      <section className="rounded-[14px] border border-border bg-surface p-3.5">
        <div className="mb-1.5 flex items-center gap-2">
          <ShieldIcon size={16} className="text-aqua-700" />
          <h3 className="text-[12.5px] font-bold text-ink-900">O confronto com {oppTeam.n}</h3>
        </div>
        <p className="mb-2.5 text-[12.5px] leading-snug text-ink-700">{rivRead}</p>
        <MatchupList signals={matchups} />
      </section>

      {/* leitura do arquétipo (se houver) */}
      {arqRead && (
        <section className="flex items-start gap-2.5 rounded-[14px] border border-border bg-surface p-3.5">
          <CompassIcon size={16} className="mt-0.5 shrink-0 text-brand-600" />
          <div>
            <h3 className="text-[12.5px] font-bold text-ink-900">A sua escola</h3>
            <p className="mt-0.5 text-[12.5px] leading-snug text-ink-700">{arqRead}</p>
          </div>
        </section>
      )}

      <p className="px-1 text-center text-[11px] leading-snug text-ink-500">
        {cohScore >= 1
          ? "Suas escolhas combinaram bem entre si nesta partida."
          : cohScore <= -1
            ? "Algumas escolhas brigaram entre si. Vale revisar a coerência no próximo jogo."
            : "Coerência das escolhas equilibrada."}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onPlayAgain}
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
