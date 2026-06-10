import { Card } from "@/components/ui/Card";
import { RevealCard } from "./RevealCard";
import { ResultView } from "./ResultView";
import type { RetroAnswerResult } from "./api";
import type { FinishedRun } from "./share";
import type { ScoreType } from "@/lib/types";

// Vitrine de animações p/ homologação (só DEV, rota /retro?demo=1): todos os
// vereditos do reveal + tela de campeão + eliminado. Não fala com o banco.
function fakeAnswer(scoreType: ScoreType, points: number): RetroAnswerResult {
  return {
    result: {
      home_score: 2,
      away_score: 1,
      pens_home: null,
      pens_away: null,
      went_extra_time: scoreType === "saldo",
      score_type: scoreType,
      points,
      timeout: false,
      passed: points > 0,
    },
    run: {
      id: "demo",
      status: "playing",
      points: 12,
      stage_reached: null,
      stage_rank: null,
      total_ms: null,
      share_code: "demo",
      slot: 5,
    },
    next: null,
  };
}

const CHAMPION: FinishedRun = {
  status: "champion",
  stageReached: "Campeão 🏆",
  points: 17,
  totalMs: 83_000,
  shareCode: "demo",
  isDaily: true,
  mode: "acerto",
  pace: "resultadista",
  slots: [
    { slot: 1, scoreType: "cravada" },
    { slot: 2, scoreType: "saldo" },
    { slot: 3, scoreType: "erro" },
    { slot: 4, scoreType: "acerto" },
    { slot: 5, scoreType: "saldo" },
    { slot: 6, scoreType: "cravada" },
    { slot: 7, scoreType: "cravada" },
  ],
};

const ELIMINATED: FinishedRun = {
  ...CHAMPION,
  status: "eliminated",
  stageReached: "Semifinal",
  points: 9,
  totalMs: 61_000,
  slots: CHAMPION.slots.slice(0, 6).map((s, i) => (i === 5 ? { slot: 6, scoreType: "erro" } : s)),
};

const VEREDITOS: { titulo: string; tipo: ScoreType; pontos: number }[] = [
  { titulo: "Cravada (+3, confete)", tipo: "cravada", pontos: 3 },
  { titulo: "Saldo (+2)", tipo: "saldo", pontos: 2 },
  { titulo: "Acerto (+1)", tipo: "acerto", pontos: 1 },
  { titulo: "Erro (shake)", tipo: "erro", pontos: 0 },
];

export function RetroDemo() {
  const noop = () => {};
  return (
    <div className="mx-auto w-full max-w-md space-y-6">
      <p className="text-center text-sm text-ink-500">
        Vitrine de animações (DEV) — recarregue a página para repetir as entradas.
      </p>
      {VEREDITOS.map((v) => (
        <div key={v.tipo}>
          <h3 className="mb-1 text-sm font-bold text-ink-500">{v.titulo}</h3>
          <Card className="p-5">
            <RevealCard answer={fakeAnswer(v.tipo, v.pontos)} guess={{ home: 2, away: 1 }} onNext={noop} />
          </Card>
        </div>
      ))}
      <h3 className="text-sm font-bold text-ink-500">Card de DECISÃO (semi/final — moldura dourada pulsante)</h3>
      <Card className="space-y-2 border-2 border-gold-500 p-4 shadow-brand">
        <p className="animate-retro-tense text-center text-sm font-bold uppercase tracking-widest text-gold-600">
          ⚡ FINAL ⚡
        </p>
        <p className="text-center text-xs text-ink-500">Copa de 1970 (México) · Final · nível 6/7</p>
        <p className="text-center text-2xl font-bold">Brasil × Itália</p>
        <p className="text-center text-xs text-ink-500">
          (é assim que a semi e a final aparecem na run — com o cronômetro mais curto)
        </p>
      </Card>

      <h3 className="text-sm font-bold text-ink-500">Campeão 🏆</h3>
      <ResultView run={CHAMPION} streak={5} onPlayTraining={noop} onBackHome={noop} />
      <h3 className="text-sm font-bold text-ink-500">Eliminado na semi</h3>
      <ResultView run={ELIMINATED} onPlayTraining={noop} onBackHome={noop} />
    </div>
  );
}
