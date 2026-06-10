import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { RetroCrest } from "./RetroCrest";
import { CampaignTrail, type TrailSlot } from "./CampaignTrail";
import { RetroTimer } from "./RetroTimer";
import { ScoreWheels } from "./ScoreWheels";
import type { RetroCurrent } from "./api";

function TeamSide({ slug, name }: { slug: string; name: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
      <RetroCrest slug={slug} name={name} size={52} />
      <span className="max-w-full truncate text-center text-sm font-bold">{name}</span>
    </div>
  );
}

// A tela da rodada: 1 jogo histórico por vez, cronômetro em cima, roletas de placar
// bem grandes embaixo (dois polegares — pedido do PO).
export function RunView({
  current,
  points,
  rerolls,
  slots,
  answering,
  rerolling,
  onSubmit,
  onReroll,
  onExit,
}: {
  current: RetroCurrent;
  points: number;
  rerolls: number;
  slots: TrailSlot[];
  answering: boolean;
  rerolling: boolean;
  onSubmit: (home: number, away: number) => void;
  onReroll: () => void;
  onExit: () => void;
}) {
  // o pai remonta este componente por jogo (key=match_id): nasce 0×0 (palpite válido)
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  // respiro de leitura: ~1,2s vendo o confronto antes do cronômetro visual nascer
  // (o servidor compensa com +1,5s no deadline; bandeiras vêm pré-aquecidas da home)
  const [valendo, setValendo] = useState(current.timer_seconds == null);
  useEffect(() => {
    if (current.timer_seconds == null) return;
    const t = window.setTimeout(() => setValendo(true), 1200);
    return () => window.clearTimeout(t);
  }, [current.timer_seconds]);
  const m = current.match;
  const decisao = current.slot >= 6; // semi e final ganham clima de decisão

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-2 overflow-hidden px-1">
      {/* topo fixo: trilha + pontos + sair (tudo numa linha — tela limpa) */}
      <div className="flex items-center justify-between gap-2">
        <CampaignTrail slots={slots} currentSlot={current.slot} />
        <span className="rounded-pill bg-ink-100 px-2.5 py-0.5 text-xs font-bold tabular-nums">{points} pts</span>
        <button type="button" onClick={onExit} className="text-[11px] font-semibold text-ink-400">
          sair ✕
        </button>
      </div>

      {/* bloco do jogo CENTRADO no espaço restante (sem vãos esticados em telas altas) */}
      <div className="flex flex-1 flex-col justify-center gap-3">

      <Card className={decisao ? "space-y-2 border-2 border-gold-500 p-3 shadow-brand" : "space-y-2 p-3"}>
        <div className="text-center">
          <p
            className={
              decisao
                ? "animate-retro-tense text-sm font-bold uppercase tracking-widest text-gold-600"
                : "text-xs font-bold uppercase tracking-wide text-brand-700"
            }
          >
            {decisao ? `⚡ ${current.slot_label} ⚡` : current.slot_label}
          </p>
          {/* leitura rápida do jogo (feedback dos amigos): ANO gigante + fase em selo */}
          <p className="mt-0.5 text-2xl font-bold leading-none tracking-tight">
            Copa de {m.wc_year}
          </p>
          <p className="mt-1 flex items-center justify-center gap-1.5 text-[11px] text-ink-500">
            <span>{m.wc_host}</span>
            <span aria-hidden>·</span>
            <span className="rounded-pill bg-brand-500/10 px-2 py-0.5 font-bold text-brand-700">
              {m.stage_label_pt}
            </span>
            <span aria-hidden>·</span>
            <span>nível {m.difficulty}/7</span>
          </p>
        </div>

        <div className="flex items-start justify-center gap-2">
          <TeamSide slug={m.home_slug} name={m.home_name_pt} />
          <span className="pt-4 text-xl font-bold text-ink-300">×</span>
          <TeamSide slug={m.away_slug} name={m.away_name_pt} />
        </div>

        {rerolls > 0 && (
          <button
            type="button"
            disabled={rerolling}
            onClick={onReroll}
            className="mx-auto block rounded-pill bg-gold-100 px-3 py-1 text-xs font-bold text-gold-800 ring-1 ring-gold-400 active:scale-95"
          >
            🎲 Trocar este jogo ({rerolls} ficha{rerolls > 1 ? "s" : ""})
          </button>
        )}

        {valendo ? (
          <RetroTimer totalSeconds={current.timer_seconds} onExpire={() => onSubmit(home, away)} />
        ) : (
          <p className="animate-retro-tense text-center text-sm font-bold uppercase tracking-widest text-brand-700">
            Valendo…
          </p>
        )}
      </Card>

      <div className="space-y-2">
        <ScoreWheels
          home={home}
          away={away}
          homeLabel={m.home_name_pt}
          awayLabel={m.away_name_pt}
          onHome={setHome}
          onAway={setAway}
        />
        <Button
          size="md"
          className="w-full text-base font-bold tracking-wide"
          disabled={answering}
          loading={answering}
          onClick={() => onSubmit(home, away)}
        >
          CRAVAR ⚽
        </Button>
        <p className="text-center text-[10px] leading-tight text-ink-500">
          {m.is_knockout ? "Vale o placar final, sem pênaltis — pode dar empate!" : "Vale o placar final."}
          {current.timer_seconds != null && " Tempo esgotado? Vale o que estiver marcado."}
        </p>
      </div>
      </div>
    </div>
  );
}
