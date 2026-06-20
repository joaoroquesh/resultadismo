import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Lock, LockOpen, Snowflake, Check, Pencil, X } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { fromNow } from "@/lib/format";
import {
  useMatchConflicts, useOverrideMatch, useSetMatchLock, useUnfreezeMatch, type MatchConflict,
} from "./dataSources";

const PROVIDER_LABEL: Record<string, string> = {
  espn: "ESPN", football_data: "football-data", thesportsdb: "TheSportsDB", fifawc: "FIFA WC", manual: "Manual",
};
const provLabel = (p: string) => PROVIDER_LABEL[p] ?? p;

// Subpágina: tudo que você resolveu travando (manual_lock=true). Destravar
// devolve o jogo pra decisão da API/golden.
export function QualidadeTravadosPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useMatchConflicts();
  const locked = (data ?? []).filter((m) => m.manual_lock);

  return (
    <Page
      title="Travados por você"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin?t=dados")} aria-label="Voltar para Qualidade">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <p className="mb-4 text-sm text-ink-600">
        Jogos com placar que <strong>você</strong> travou na mão. Sua decisão vence a API; destrave se
        quiser que a sincronização volte a decidir.
      </p>
      {isLoading ? (
        <div className="space-y-3">
          <Card className="h-24 animate-pulse" />
          <Card className="h-24 animate-pulse" />
        </div>
      ) : locked.length === 0 ? (
        <EmptyState
          icon={<Lock className="size-7" />}
          title="Nada travado"
          description="Quando você travar o placar de um jogo (resolvendo um conflito), ele aparece aqui."
        />
      ) : (
        <div className="space-y-3">
          {locked.map((m) => (
            <LockedRow key={m.id} m={m} />
          ))}
        </div>
      )}
    </Page>
  );
}

function LockedRow({ m }: { m: MatchConflict }) {
  const { toast } = useToast();
  const override = useOverrideMatch();
  const setLock = useSetMatchLock();
  const unfreeze = useUnfreezeMatch();
  const [editing, setEditing] = useState(false);
  const [home, setHome] = useState(String(m.home_score ?? 0));
  const [away, setAway] = useState(String(m.away_score ?? 0));

  return (
    <Card className="space-y-3 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-900">
            {m.home_team_name} <span className="text-ink-400">x</span> {m.away_team_name}
          </p>
          <p className="text-[11px] text-ink-500">
            {m.competition} · {m.kickoff_at ? fromNow(m.kickoff_at) : "sem data"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-sm font-bold tabular-nums text-ink-900">
            {m.home_score ?? "—"} – {m.away_score ?? "—"}
          </span>
          <span className="inline-flex items-center gap-1 rounded-pill bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            <Lock className="size-3" /> travado
          </span>
          {m.frozen && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-aqua-700 px-2 py-0.5 text-[11px] font-semibold text-white">
              <Snowflake className="size-3" /> congelado
            </span>
          )}
        </div>
      </div>

      {/* o que cada fonte diz (referência) */}
      {m.sources.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {m.sources.map((s) => (
            <span key={s.provider} className="rounded-md bg-ink-50 px-2 py-1 text-[11px] text-ink-600 ring-1 ring-border">
              <span className="font-semibold">{provLabel(s.provider)}</span>:{" "}
              {s.home == null || s.away == null ? "—" : `${s.home}-${s.away}`}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          size="sm"
          variant="outline"
          loading={setLock.isPending}
          onClick={() =>
            setLock.mutate(
              { matchId: m.id, locked: false },
              { onSuccess: () => toast("Destravado: a API volta a decidir.", "success") },
            )
          }
        >
          <LockOpen className="size-4" /> Destravar
        </Button>
        <Button size="sm" variant={editing ? "secondary" : "ghost"} onClick={() => setEditing((v) => !v)}>
          <Pencil className="size-4" /> {editing ? "Fechar" : "Editar placar"}
        </Button>
        {m.frozen && (
          <Button
            size="sm"
            variant="ghost"
            loading={unfreeze.isPending}
            onClick={() => unfreeze.mutate(m.id, { onSuccess: () => toast("Descongelado.", "success") })}
          >
            <Snowflake className="size-4" /> Descongelar
          </Button>
        )}
      </div>

      {editing && (
        <div className="flex flex-wrap items-end gap-2 rounded-md bg-ink-50 p-3">
          <Input type="number" value={home} onChange={(e) => setHome(e.target.value)} className="h-10 w-16 text-center" aria-label="Mandante" />
          <span className="pb-2 text-ink-300">×</span>
          <Input type="number" value={away} onChange={(e) => setAway(e.target.value)} className="h-10 w-16 text-center" aria-label="Visitante" />
          <Button
            size="sm"
            loading={override.isPending}
            onClick={() =>
              override.mutate(
                { matchId: m.id, home: Number(home) || 0, away: Number(away) || 0, status: m.status, lock: true },
                {
                  onSuccess: () => { toast("Placar atualizado e travado.", "success"); setEditing(false); },
                  onError: (e) => toast(e instanceof Error ? e.message : "Não deu pra salvar agora. Tenta de novo?", "error"),
                },
              )
            }
          >
            <Check className="size-4" /> Salvar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            <X className="size-4" />
          </Button>
        </div>
      )}
    </Card>
  );
}
