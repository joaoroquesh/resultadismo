import { useMemo, useState } from "react";
import { AlertTriangle, Lock, LockOpen, Snowflake, Database, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/Switch";
import { fromNow } from "@/lib/format";
import {
  useMatchConflicts, useOverrideMatch, useSetMatchLock, useUnfreezeMatch,
  useCompetitionsLite, useCompetitionSources, useUpsertCompetitionSource,
  useSetSourceEnabled, useRemoveCompetitionSource, useUnmappedTeams,
  useResolveUnmapped, type MatchConflict,
} from "./dataSources";

const STATUSES = ["scheduled", "live", "finished", "postponed", "cancelled"];
const PROVIDERS = [
  { v: "espn", label: "ESPN" },
  { v: "football_data", label: "football-data" },
  { v: "thesportsdb", label: "TheSportsDB" },
];
export function DadosAdmin() {
  return (
    <div className="space-y-6">
      <UnmappedSection />
      <ConflictsSection />
      <SourcesSection />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Times que a API entregou e NÃO estão no registro canônico (data/teams-registry).
// "Aceitar como veio" para de alertar (fica com nome/escudo da API); "copiar
// JSON" gera o trecho pra colar no registro (e rodar npm run gen:all).
function UnmappedSection() {
  const { data, isLoading } = useUnmappedTeams();
  const resolve = useResolveUnmapped();
  const { toast } = useToast();

  if (isLoading || !data || data.length === 0) return null;

  const slugOf = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const copySnippet = (u: (typeof data)[number]) => {
    const snippet = JSON.stringify(
      {
        slug: slugOf(u.name),
        name_pt: u.name,
        short_pt: u.short_name ?? u.name,
        tla: u.tla,
        country: null,
        kind: "club",
        competitions: [],
        aliases: [u.name, ...(u.short_name && u.short_name !== u.name ? [u.short_name] : [])],
      },
      null,
      2,
    );
    void navigator.clipboard.writeText(snippet);
    toast("JSON copiado — cole no data/teams-registry.json e rode npm run gen:all.", "info");
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-gold-600" />
        <h2 className="text-base font-bold text-ink-950">Times fora do registro</h2>
        <span className="rounded-pill bg-gold-500 px-2 py-0.5 text-xs font-bold text-gold-950">
          {data.length}
        </span>
      </div>
      <p className="text-xs text-ink-500">
        A API entregou estes times e eles não estão no registro canônico. Aceite como veio (fica com
        o nome/escudo da API) ou copie o JSON pra incluir no registro.
      </p>
      <Card className="divide-y divide-border">
        {data.map((u) => (
          <div key={u.id} className="flex items-center gap-3 px-3 py-2.5">
            {u.crest_url ? (
              <img src={u.crest_url} alt="" className="size-6 shrink-0 rounded-sm object-contain" />
            ) : (
              <span className="grid size-6 shrink-0 place-items-center rounded-sm bg-ink-100 text-[10px] font-bold text-ink-500">
                {u.name[0]?.toUpperCase()}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">{u.name}</p>
              <p className="text-[11px] text-ink-500">
                {u.provider} · visto {u.seen_count}× {u.tla ? `· ${u.tla}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => copySnippet(u)}>
              Copiar JSON
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={resolve.isPending}
              onClick={() =>
                resolve.mutate(u.id, {
                  onSuccess: () => toast("Aceito como veio da API.", "success"),
                  onError: (e) => toast(e instanceof Error ? e.message : "Erro", "error"),
                })
              }
            >
              Aceitar como veio
            </Button>
          </div>
        ))}
      </Card>
    </section>
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
            <span className="rounded-pill bg-flame-600 px-2 py-0.5 text-[11px] font-semibold text-white">
              divergente
            </span>
          )}
          {m.frozen && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-aqua-700 px-2 py-0.5 text-[11px] font-semibold text-white">
              <Snowflake className="size-3" /> congelado
            </span>
          )}
          {m.manual_lock && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-brand-600 px-2 py-0.5 text-[11px] font-semibold text-white">
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
        <div className="flex flex-col gap-1 text-[11px] font-medium text-ink-600">
          Status
          <Select
            ariaLabel="Status"
            value={status}
            onChange={setStatus}
            options={STATUSES.map((s) => ({ value: s, label: s }))}
            className="w-36"
          />
        </div>
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
        <Select
          ariaLabel="Competição"
          value={compId}
          onChange={setCompId}
          placeholder="Escolha uma competição…"
          options={(comps ?? []).map((c) => ({ value: c.id, label: c.name }))}
        />

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
                    <span className="rounded-pill bg-flame-600 px-2 py-0.5 text-[10px] font-semibold text-white">
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
              <div className="flex flex-col gap-1 text-[11px] font-medium text-ink-600">
                Provedor
                <Select
                  ariaLabel="Provedor"
                  value={provider}
                  onChange={setProvider}
                  options={PROVIDERS.map((p) => ({ value: p.v, label: p.label }))}
                  className="w-44"
                />
              </div>
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
