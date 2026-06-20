import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Lock, ChevronRight, Check, Pencil, Database } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { fromNow } from "@/lib/format";
import {
  useMatchConflicts, useOverrideMatch, useUnmappedTeams, type MatchConflict,
} from "./dataSources";

const PROVIDER_LABEL: Record<string, string> = {
  espn: "ESPN", football_data: "football-data", thesportsdb: "TheSportsDB", fifawc: "FIFA WC", manual: "Manual",
};
const provLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

// Aba "Qualidade": curta. Em destaque, os conflitos que precisam de você (com
// resolução rápida); embaixo, resumos com "ver todos" pra subpáginas (travados
// por você + times fora do registro). As listas grandes vivem nas subpáginas.
export function DadosAdmin() {
  return (
    <div className="space-y-6">
      <ConflictsHighlight />
      <div className="grid gap-3 sm:grid-cols-2">
        <TravadosSummary />
        <UnmappedSummary />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conflitos pra resolver — destaque + resolução em 1 toque
// ---------------------------------------------------------------------------
function ConflictsHighlight() {
  const { data, isLoading } = useMatchConflicts();
  const actionable = (data ?? [])
    .filter((m) => m.score_conflict && !m.manual_lock)
    .sort((a, b) => Number(b.status === "finished") - Number(a.status === "finished"));

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-flame-600" />
        <h2 className="text-base font-bold text-ink-950">Conflitos pra resolver</h2>
        {actionable.length > 0 && (
          <span className="rounded-pill bg-flame-600 px-2 py-0.5 text-xs font-bold text-white">{actionable.length}</span>
        )}
      </div>
      <p className="text-xs text-ink-500">
        Jogos onde as fontes divergem no placar. Toque na fonte certa pra resolver na hora (trava contra a API).
      </p>
      {isLoading ? (
        <Card className="h-24 animate-pulse" />
      ) : actionable.length === 0 ? (
        <EmptyState
          icon={<Check className="size-7" />}
          title="Nenhum conflito agora"
          description="Quando as fontes discordarem do placar de um jogo encerrado, ele aparece aqui pra você decidir."
        />
      ) : (
        <div className="space-y-3">
          {actionable.map((m) => (
            <ConflictResolveCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function ConflictResolveCard({ m }: { m: MatchConflict }) {
  const { toast } = useToast();
  const override = useOverrideMatch();
  const [manual, setManual] = useState(false);
  const [home, setHome] = useState(String(m.home_score ?? 0));
  const [away, setAway] = useState(String(m.away_score ?? 0));

  function resolve(h: number, a: number, label: string) {
    override.mutate(
      { matchId: m.id, home: h, away: a, status: m.status, lock: true },
      {
        onSuccess: () => toast(`Resolvido: ${label}. Travado contra a API.`, "success"),
        onError: (e) => toast(e instanceof Error ? e.message : "Não deu agora. Tenta de novo?", "error"),
      },
    );
  }

  const opts = m.sources.filter((s) => s.home != null && s.away != null);

  return (
    <Card className="space-y-3 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">
            {m.home_team_name} <span className="text-ink-400">x</span> {m.away_team_name}
          </p>
          <p className="text-[11px] text-ink-500">
            {m.competition} · {m.status === "finished" ? "encerrado" : m.status}
            {m.kickoff_at ? ` · ${fromNow(m.kickoff_at)}` : ""}
          </p>
        </div>
        <span className="rounded-pill bg-flame-50 px-2 py-0.5 text-[11px] font-semibold text-flame-700">divergente</span>
      </div>

      {/* resolução em 1 toque: cada fonte vira um botão */}
      <div className="flex flex-wrap gap-2">
        {opts.map((s) => (
          <button
            key={s.provider}
            type="button"
            disabled={override.isPending}
            onClick={() => resolve(s.home as number, s.away as number, `${provLabel(s.provider)} ${s.home}–${s.away}`)}
            className="flex flex-col items-start rounded-md border border-ink-200 px-3 py-2 text-left transition hover:border-brand-500 hover:bg-ink-50 disabled:opacity-50"
          >
            <span className="text-[11px] font-medium text-ink-500">{provLabel(s.provider)}</span>
            <span className="text-base font-extrabold tabular-nums text-ink-900">{s.home} – {s.away}</span>
            <span className="text-[10px] font-semibold text-brand-600">tocar pra valer</span>
          </button>
        ))}
      </div>

      {/* placar manual (recolhido) */}
      {manual ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
          <Input type="number" value={home} onChange={(e) => setHome(e.target.value)} className="h-10 w-16 text-center" aria-label="Mandante" />
          <span className="pb-2 text-ink-300">×</span>
          <Input type="number" value={away} onChange={(e) => setAway(e.target.value)} className="h-10 w-16 text-center" aria-label="Visitante" />
          <Button size="sm" loading={override.isPending} onClick={() => resolve(Number(home) || 0, Number(away) || 0, `${home}–${away}`)}>
            <Check className="size-4" /> Salvar e travar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setManual(false)}>cancelar</Button>
        </div>
      ) : (
        <button type="button" onClick={() => setManual(true)} className="text-xs font-semibold text-ink-500 hover:text-ink-700">
          <Pencil className="mr-1 inline size-3.5" /> definir outro placar na mão
        </button>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Resumos com "ver todos" → subpáginas
// ---------------------------------------------------------------------------
function SummaryCard({
  to, icon, tone, title, sub,
}: {
  to: string;
  icon: React.ReactNode;
  tone: "brand" | "gold";
  title: string;
  sub: string;
}) {
  return (
    <Link to={to} className="block">
      <Card className="flex items-center gap-3 p-4 transition hover:bg-ink-50">
        <span className={`grid size-10 shrink-0 place-items-center rounded-md bg-surface-2 ${tone === "brand" ? "text-brand-600" : "text-gold-600"}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">{title}</p>
          <p className="text-xs text-ink-500">{sub}</p>
        </div>
        <ChevronRight className="size-4 shrink-0 text-ink-400" />
      </Card>
    </Link>
  );
}

function TravadosSummary() {
  const { data } = useMatchConflicts();
  const n = (data ?? []).filter((m) => m.manual_lock).length;
  return (
    <SummaryCard
      to="/admin/qualidade/travados"
      icon={<Lock className="size-5" />}
      tone="brand"
      title="Travados por você"
      sub={`${n} jogo${n === 1 ? "" : "s"} resolvido${n === 1 ? "" : "s"} na mão · ver todos`}
    />
  );
}

function UnmappedSummary() {
  const { data } = useUnmappedTeams();
  const n = data?.length ?? 0;
  return (
    <SummaryCard
      to="/admin/qualidade/times-fora"
      icon={<Database className="size-5" />}
      tone="gold"
      title="Times fora do registro"
      sub={`${n} time${n === 1 ? "" : "s"} pra revisar · ver todos`}
    />
  );
}
