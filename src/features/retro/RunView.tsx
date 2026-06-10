import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { TeamCrest } from "@/components/TeamCrest";
import { teamCrestPath } from "@/lib/teamCrests";
import { CampaignTrail, type TrailSlot } from "./CampaignTrail";
import { RetroTimer } from "./RetroTimer";
import { ScoreWheels } from "./ScoreWheels";
import type { RetroCurrent } from "./api";

function TeamSide({ slug, name }: { slug: string; name: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-2">
      <TeamCrest src={teamCrestPath(slug)} name={name} size={64} />
      <span className="max-w-full truncate text-center text-base font-bold">{name}</span>
    </div>
  );
}

// A tela da rodada: 1 jogo histórico por vez, cronômetro em cima, roletas de placar
// bem grandes embaixo (dois polegares — pedido do PO).
export function RunView({
  current,
  points,
  slots,
  answering,
  onSubmit,
}: {
  current: RetroCurrent;
  points: number;
  slots: TrailSlot[];
  answering: boolean;
  onSubmit: (home: number | null, away: number | null) => void;
}) {
  // o pai remonta este componente por jogo (key=match_id): estado nasce zerado
  const [home, setHome] = useState<number | null>(null);
  const [away, setAway] = useState<number | null>(null);
  const m = current.match;
  const ready = home != null && away != null;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <CampaignTrail slots={slots} currentSlot={current.slot} />
        <span className="rounded-pill bg-ink-100 px-3 py-1 text-sm font-bold tabular-nums">{points} pts</span>
      </div>

      <Card className="space-y-4 p-4">
        <div className="text-center">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-700">{current.slot_label}</p>
          <p className="mt-0.5 text-xs text-ink-500">
            Copa de {m.wc_year} ({m.wc_host}) · {m.stage_label_pt} · nível {m.difficulty}/7
          </p>
        </div>

        <div className="flex items-start justify-center gap-3">
          <TeamSide slug={m.home_slug} name={m.home_name_pt} />
          <span className="pt-5 text-2xl font-bold text-ink-300">×</span>
          <TeamSide slug={m.away_slug} name={m.away_name_pt} />
        </div>

        <RetroTimer totalSeconds={current.timer_seconds} onExpire={() => onSubmit(home, away)} />
      </Card>

      <div className="space-y-3">
        <ScoreWheels
          home={home}
          away={away}
          homeLabel={m.home_name_pt}
          awayLabel={m.away_name_pt}
          onHome={setHome}
          onAway={setAway}
        />
        <Button
          size="lg"
          className="w-full text-base font-bold"
          disabled={!ready || answering}
          loading={answering}
          onClick={() => onSubmit(home, away)}
        >
          CRAVAR ⚽
        </Button>
        <p className="text-center text-[11px] text-ink-500">
          {m.is_knockout
            ? "Vale o placar final (com prorrogação) — pênaltis não contam. Mata-mata pode terminar empatado!"
            : "Vale o placar final do jogo."}
          {current.timer_seconds != null && " No fim do tempo, vale o que estiver marcado."}
        </p>
      </div>
    </div>
  );
}
