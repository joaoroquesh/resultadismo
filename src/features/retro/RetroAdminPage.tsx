import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import {
  useRetroAdminStats,
  useRetroConfig,
  useRetroFactCoverage,
  useRetroMatchFacts,
  useRetroSetConfig,
  useSetMatchFact,
  type AdminMatchFact,
  type FactFilter,
  type RetroConfig,
} from "./api";
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

        <FactsPanel />

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

const FACT_FILTERS: { value: FactFilter; label: string }[] = [
  { value: "sem_dica", label: "Sem dica" },
  { value: "rascunho", label: "Rascunhos" },
  { value: "publicada", label: "Publicadas" },
  { value: "todos", label: "Todas" },
];

// Curadoria das DICAS por jogo (curiosidade sem spoiler). Modelo híbrido: a IA
// rascunha (fica como rascunho), o admin revisa e publica. Só dica publicada desce
// pro jogador (gate em retro_match_payload). O placar aparece SÓ aqui pra conferência.
function FactsPanel() {
  const [filter, setFilter] = useState<FactFilter>("sem_dica");
  const [search, setSearch] = useState("");
  const coverage = useRetroFactCoverage();
  const list = useRetroMatchFacts(filter, search);

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold uppercase tracking-wide text-ink-500">💡 Curiosidades (dicas)</h2>
        {coverage.data && (
          <span className="text-[11px] font-semibold text-ink-400">
            {coverage.data.publicadas}/{coverage.data.total} publicadas
            {coverage.data.rascunhos > 0 && ` · ${coverage.data.rascunhos} rascunho${coverage.data.rascunhos > 1 ? "s" : ""}`}
          </span>
        )}
      </div>
      <p className="rounded-md bg-gold-100 px-2 py-1 text-[11px] font-semibold text-gold-800">
        💡 Uma <b>pista curta</b> (1 linha) que ajuda a lembrar QUE jogo é esse — apelido ou lance
        marcante. Ex.: <i>“Gol de mão do Maradona”</i>, <i>“Maracanazzo”</i>. Sem dizer o <b>placar</b>.
      </p>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar por seleção ou ano…"
        className="w-full rounded-md border border-ink-200 bg-surface px-3 py-1.5 text-sm outline-none focus:border-brand-500"
      />
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {FACT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={cn(
              "shrink-0 rounded-pill px-2.5 py-1 text-xs font-semibold transition",
              filter === f.value ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {list.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : (list.data ?? []).length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-400">Nenhum jogo neste filtro.</p>
      ) : (
        <div className="space-y-2">
          {list.data!.map((m) => (
            <FactRow key={m.id} m={m} />
          ))}
        </div>
      )}
    </Card>
  );
}

function FactRow({ m }: { m: AdminMatchFact }) {
  const { toast } = useToast();
  const save = useSetMatchFact();
  const [text, setText] = useState(m.fact_pt ?? "");

  function run(reviewed: boolean) {
    save.mutate(
      { matchId: m.id, fact: text.trim() || null, reviewed },
      {
        onSuccess: () => toast(reviewed ? "Publicada! ✅" : "Rascunho salvo.", "success"),
        onError: (e) => toast(e.message, "error"),
      },
    );
  }

  return (
    <div className="rounded-md border border-border p-2.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-semibold text-ink-700">
          {m.home_name_pt} <span className="text-ink-400">×</span> {m.away_name_pt}
        </span>
        <span className="shrink-0 text-ink-400">
          {m.wc_year} · {m.stage_label_pt} · <b className="text-ink-600">{m.score}</b>
        </span>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        maxLength={90}
        placeholder="Pista curta (apelido/lance) — ex.: Gol de mão do Maradona"
        className="mt-1.5 w-full resize-none rounded-md border border-ink-200 bg-surface p-2 text-sm outline-none focus:border-brand-500"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-400">
          {m.fact_reviewed ? "✅ publicada" : m.fact_pt ? "✏️ rascunho" : "—"}
          {text.length > 0 && ` · ${text.length}/90`}
        </span>
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" loading={save.isPending} onClick={() => run(false)}>
            Rascunho
          </Button>
          <Button size="sm" loading={save.isPending} onClick={() => run(true)}>
            Publicar
          </Button>
        </div>
      </div>
    </div>
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
