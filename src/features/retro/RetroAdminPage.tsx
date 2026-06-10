import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { useRetroAdminStats, useRetroConfig, useRetroSetConfig, type RetroConfig } from "./api";
import { FeedbackAdmin } from "@/features/feedback/FeedbackAdmin";

type Min = "acerto" | "saldo" | "cravada";
const OPTS = [
  { value: "acerto" as Min, label: "Acerto" },
  { value: "saldo" as Min, label: "Saldo" },
  { value: "cravada" as Min, label: "Cravada" },
];

// Admin do Retrô: liga/desliga a exigência de saldo/cravada nas fases finais do
// modo Copa, pra testar com a galera (decisão do PO). Default: desligado.
export function RetroAdminPage() {
  const navigate = useNavigate();
  const cfg = useRetroConfig();
  return (
    <Page title="Admin · Retrô">
      <div className="mx-auto w-full max-w-md space-y-4">
        <StatsPanel />
        {cfg.data ? <ConfigForm initial={cfg.data} /> : <Skeleton className="h-48 w-full" />}

        <div>
          <h2 className="mb-2 mt-2 text-sm font-bold uppercase tracking-wide text-ink-500">
            Sugestões e bugs do Retrô
          </h2>
          <FeedbackAdmin product="retro" />
        </div>

        <Button variant="ghost" className="w-full" onClick={() => navigate("/retro")}>
          ← Voltar ao Retrô
        </Button>
      </div>
    </Page>
  );
}

// estado inicial vem das props (montado só depois do fetch) — sem setState em effect
function ConfigForm({ initial }: { initial: RetroConfig }) {
  const { toast } = useToast();
  const save = useRetroSetConfig();
  const [enforce, setEnforce] = useState(initial.enforce_knockout_bar);
  const [semi, setSemi] = useState<Min>(initial.semi_min as Min);
  const [final, setFinal] = useState<Min>(initial.final_min as Min);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-bold">Exigir saldo/cravada nas fases finais</p>
          <p className="text-xs text-ink-500">
            Modo Copa. Desligado = qualquer ponto avança em todas as fases (mais fácil).
          </p>
        </div>
        <Switch checked={enforce} onChange={setEnforce} label="Exigir barra nas finais" />
      </div>

      {enforce && (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Semifinal — mínimo</span>
            <SegmentedControl<Min> className="w-full" options={OPTS} value={semi} onChange={setSemi} />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wide text-ink-500">Final — mínimo</span>
            <SegmentedControl<Min> className="w-full" options={OPTS} value={final} onChange={setFinal} />
          </div>
        </div>
      )}

      <Button
        className="w-full font-bold"
        loading={save.isPending}
        onClick={() =>
          save.mutate(
            { enforce, semiMin: semi, finalMin: final },
            {
              onSuccess: () => toast("Config salva!", "success"),
              onError: (e) => toast(e.message, "error"),
            },
          )
        }
      >
        Salvar
      </Button>
    </Card>
  );
}

function fmtDur(seconds: number): string {
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}min`;
}

// Acessos online (agora) e tempo de uso, Retrô vs Resultadismo (app-mãe).
function StatsPanel() {
  const { data: s } = useRetroAdminStats();
  if (!s) return <Skeleton className="h-28 w-full" />;
  const rows = [
    { label: "Online agora", retro: String(s.online_retro), main: String(s.online_main) },
    { label: "Tempo total", retro: fmtDur(s.retro_seconds_total), main: fmtDur(s.main_seconds_total) },
  ];
  return (
    <Card className="p-4">
      <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">Acessos & tempo</h2>
      <div className="mt-2 grid grid-cols-3 gap-2 border-b border-border pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-400">
        <span></span>
        <span className="text-right">🕹️ Retrô</span>
        <span className="text-right">⚽ Normal</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-3 items-center gap-2 py-1.5 text-sm">
          <span className="text-ink-500">{r.label}</span>
          <span className="text-right font-bold tabular-nums text-brand-700">{r.retro}</span>
          <span className="text-right font-bold tabular-nums text-ink-700">{r.main}</span>
        </div>
      ))}
      <p className="mt-2 text-[11px] text-ink-400">
        Retrô hoje: {fmtDur(s.retro_seconds_today)} · {s.retro_anon_runs_today} partidas anônimas ·{" "}
        {s.retro_players_total} jogadores logados no total.
      </p>
    </Card>
  );
}
