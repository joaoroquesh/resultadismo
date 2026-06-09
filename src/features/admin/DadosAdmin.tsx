import { useMemo, useState } from "react";
import { AlertTriangle, Lock, LockOpen, Snowflake, Database, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/Switch";
import { fromNow } from "@/lib/format";
import {
  useMatchConflicts, useOverrideMatch, useSetMatchLock, useUnfreezeMatch,
  useCompetitionsLite, useCompetitionSources, useUpsertCompetitionSource,
  useSetSourceEnabled, useRemoveCompetitionSource,
  type MatchConflict,
} from "./dataSources";

const STATUSES = ["scheduled", "live", "finished", "postponed", "cancelled"];
const PROVIDERS = [
  { v: "espn", label: "ESPN" },
  { v: "football_data", label: "football-data" },
  { v: "thesportsdb", label: "TheSportsDB" },
];
const selectCls =
  "h-10 rounded-md border border-ink-200 bg-surface px-2.5 text-sm text-ink-950 outline-none focus:border-brand-500";

export function DadosAdmin() {
  return (
    <div className="space-y-6">
      <ConflictsSection />
      <SourcesSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Conflitos de placar + override/lock/freeze
// ---------------------------------------------------------------------------
function ConflictsSection() {
  const { data, isLoading } = useMatchConflicts();
  const list = data ?? [];
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-flame-600" />
        <h2 className="text-base font-bold text-ink-950">Conflitos e jogos travados</h2>
      </div>
      <p className="text-xs text-ink-500">
        Jogos onde as fontes divergem no placar, ou que estão sob edição manual. O placar oficial é o
        voto da maioria; aqui você corrige na mão (com trava) quando precisar.
      </p>
      {isLoading ? (
        <Card className="h-24 animate-pulse" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle className="size-7" />}
          title="Nenhum conflito agora"
          description="Quando duas fontes discordarem de um placar, o jogo aparece aqui."
        />
      ) : (
        <div className="space-y-3">
          {list.map((m) => (
            <ConflictRow key={m.id} m={m} />
          ))}
        </div>
      )}
    </section>
  );
}

function ConflictRow({ m }: { m: MatchConflict }) {
  const { toast } = useToast();
  const override = useOverrideMatch();
  const setLock = useSetMatchLock();
  const unfreeze = useUnfreezeMatch();
  const [home, setHome] = useState(String(m.home_score ?? 0));
  const [away, setAway] = useState(String(m.away_score ?? 0));
  const [status, setStatus] = useState(m.status);

  function save() {
    override.mutate(
      { matchId: m.id, home: Number(home) || 0, away: Number(away) || 0, status, lock: true },
      {
        onSuccess: () => toast("Placar salvo e travado contra a API.", "success"),
        onError: (e) => toast(e instanceof Error ? e.message : "Não rolou salvar.", "error"),
      },
    );
  }

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
          {m.score_conflict && (
            <span className="rounded-pill bg-flame-500/10 px-2 py-0.5 text-[11px] font-semibold text-flame-600">
              divergente
            </span>
          )}
          {m.frozen && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-600">
              <Snowflake className="size-3" /> congelado
            </span>
          )}
          {m.manual_lock && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-brand-500/10 px-2 py-0.5 text-[11px] font-semibold text-brand-600">
              <Lock className="size-3" /> manual
            </span>
          )}
          <span className="rounded-pill bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600">
            {m.score_sources_count} fonte{m.score_sources_count === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/* o que cada fonte diz */}
      <div className="flex flex-wrap gap-1.5">
        {m.sources.map((s) => (
          <span
            key={s.provider}
            className="rounded-md bg-ink-50 px-2 py-1 text-[11px] text-ink-600 ring-1 ring-border"
          >
            <span className="font-semibold">{s.provider}</span>:{" "}
            {s.home == null || s.away == null ? "—" : `${s.home}-${s.away}`}
            {s.status ? ` (${s.status})` : ""}
          </span>
        ))}
        {m.sources.length === 0 && <span className="text-[11px] text-ink-400">sem observações</span>}
      </div>

      {/* override manual */}
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
        <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-600">
          Mandante
          <Input
            type="number"
            value={home}
            onChange={(e) => setHome(e.target.value)}
            className="h-10 w-16 text-center"
            aria-label="Placar mandante"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-600">
          Visitante
          <Input
            type="number"
            value={away}
            onChange={(e) => setAway(e.target.value)}
            className="h-10 w-16 text-center"
            aria-label="Placar visitante"
          />
        </label>
        <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-600">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls} aria-label="Status">
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={save} loading={override.isPending}>
          Salvar e travar
        </Button>
        {m.manual_lock ? (
          <Button
            size="sm"
            variant="outline"
            loading={setLock.isPending}
            onClick={() =>
              setLock.mutate(
                { matchId: m.id, locked: false },
                { onSuccess: () => toast("Destravado — a API volta a atualizar.", "success") },
              )
            }
          >
            <LockOpen className="size-4" /> Destravar
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            loading={setLock.isPending}
            onClick={() =>
              setLock.mutate(
                { matchId: m.id, locked: true },
                { onSuccess: () => toast("Travado contra a API.", "success") },
              )
            }
          >
            <Lock className="size-4" /> Travar
          </Button>
        )}
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
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Fontes por competição
// ---------------------------------------------------------------------------
function SourcesSection() {
  const { data: comps } = useCompetitionsLite();
  const [compId, setCompId] = useState<string>("");
  const selected = useMemo(() => (comps ?? []).find((c) => c.id === compId) ?? null, [comps, compId]);
  const { data: sources, isLoading } = useCompetitionSources(compId || null);
  const setEnabled = useSetSourceEnabled(compId || null);
  const upsert = useUpsertCompetitionSource(compId || null);
  const remove = useRemoveCompetitionSource(compId || null);
  const { toast } = useToast();

  const [provider, setProvider] = useState("football_data");
  const [code, setCode] = useState("");

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Database className="size-4 text-brand-600" />
        <h2 className="text-base font-bold text-ink-950">Fontes por competição</h2>
      </div>
      <p className="text-xs text-ink-500">
        A fonte <strong>primária</strong> é dona do calendário; as <strong>secundárias</strong> só
        validam o placar (confirmação por 2+ fontes destrava o congelamento do resultado).
      </p>

      <Card className="space-y-4 p-4">
        <select value={compId} onChange={(e) => setCompId(e.target.value)} className={cn(selectCls, "w-full")}>
          <option value="">Escolha uma competição…</option>
          {(comps ?? []).map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {!compId ? null : isLoading ? (
          <div className="h-16 animate-pulse rounded-md bg-ink-100" />
        ) : (
          <>
            <ul className="divide-y divide-border">
              {(sources ?? []).map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2.5">
                  <span
                    className={cn(
                      "rounded-pill px-2 py-0.5 text-[11px] font-semibold",
                      s.role === "primary" ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600",
                    )}
                  >
                    {s.role === "primary" ? "primária" : "secundária"}
                  </span>
                  <span className="text-sm font-medium text-ink-900">{s.provider}</span>
                  <span className="text-xs text-ink-500">{s.provider_code ?? "—"}</span>
                  {s.last_sync_ok === false && (
                    <span className="rounded-pill bg-flame-500/10 px-2 py-0.5 text-[10px] font-semibold text-flame-600">
                      falhou
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-2">
                    <Switch
                      checked={s.enabled}
                      onChange={(v) => setEnabled.mutate({ id: s.id, enabled: v })}
                      label={s.enabled ? "Desativar fonte" : "Ativar fonte"}
                    />
                    {s.role !== "primary" && (
                      <button
                        type="button"
                        onClick={() => remove.mutate(s.id)}
                        className="text-ink-400 hover:text-flame-600"
                        aria-label="Remover fonte"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </span>
                </li>
              ))}
              {(sources ?? []).length === 0 && (
                <li className="py-3 text-sm text-ink-400">
                  Sem fontes. {selected?.provider === "manual" ? "Competição manual." : ""}
                </li>
              )}
            </ul>

            {/* adicionar secundária */}
            <div className="flex flex-wrap items-end gap-2 border-t border-border pt-3">
              <label className="flex flex-col gap-1 text-[11px] font-medium text-ink-600">
                Provedor
                <select value={provider} onChange={(e) => setProvider(e.target.value)} className={selectCls}>
                  {PROVIDERS.map((p) => (
                    <option key={p.v} value={p.v}>{p.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-[11px] font-medium text-ink-600">
                Código (ex.: BSA, PL, fifa.world)
                <Input value={code} onChange={(e) => setCode(e.target.value)} className="h-10" placeholder="código da liga no provedor" />
              </label>
              <Button
                size="sm"
                disabled={!code.trim()}
                loading={upsert.isPending}
                onClick={() =>
                  upsert.mutate(
                    { provider, providerCode: code.trim(), role: "secondary", priority: 50 },
                    {
                      onSuccess: () => { setCode(""); toast("Fonte secundária adicionada.", "success"); },
                      onError: (e) => toast(e instanceof Error ? e.message : "Não rolou.", "error"),
                    },
                  )
                }
              >
                <Plus className="size-4" /> Adicionar
              </Button>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
