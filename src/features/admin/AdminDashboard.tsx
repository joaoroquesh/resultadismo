import { useState } from "react";
import {
  RefreshCw,
  AlertTriangle,
  BellRing,
  Inbox,
  Radio,
  CalendarClock,
  Users2,
  Wrench,
  History,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import {
  useSystemHealth,
  useSyncNow,
  useSetCompetitionSync,
  useSetMaintenance,
  useSetOnlineThreshold,
  useUpdateAccess,
  useRecentAudit,
  ONLINE_ALERT_THRESHOLD,
  type CompHealth,
  type AuditEntry,
} from "./sync";

function Stat({
  icon,
  value,
  label,
  accent,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  accent: "flame" | "brand" | "ink";
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-0.5 px-2 py-3 text-center">
      <span
        className={cn(
          "flex items-center gap-1 text-2xl font-extrabold tabular-nums",
          accent === "flame" && value > 0 && "text-flame-600",
          accent === "brand" && "text-brand-700",
          accent === "ink" && "text-ink-900",
        )}
      >
        {icon}
        {value}
      </span>
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</span>
    </div>
  );
}

export function AdminDashboard({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const { data: health, isLoading } = useSystemHealth();
  const syncNow = useSyncNow();
  const { toast } = useToast();

  async function syncAll() {
    try {
      const r = await syncNow.mutateAsync({ mode: "catalog" });
      const failed = r.results.filter((x) => !x.ok);
      if (failed.length) toast(`Sincronizado com ${failed.length} problema(s).`, "error");
      else toast(`Sincronizado (${r.synced} competição/ões).`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro ao sincronizar.", "error");
    }
  }

  if (isLoading || !health) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const hasProblem = health.sync_problems > 0;
  const hasPending = health.pending_alerts > 0;
  const hasPendingLeagues = health.pending_leagues > 0;
  const onlineThreshold = health.online_alert_threshold ?? ONLINE_ALERT_THRESHOLD;
  const onlineSpike = health.online_now >= onlineThreshold;

  return (
    <div className="space-y-4">
      {/* Banners de atenção (Nielsen #1: visibilidade do estado do sistema) */}
      {hasProblem && (
        <button
          type="button"
          onClick={() => onNavigate("alertas")}
          className="flex w-full items-center gap-3 rounded-lg bg-surface p-3.5 text-left ring-1 ring-flame-600 transition hover:bg-ink-50"
        >
          <AlertTriangle className="size-5 shrink-0 text-flame-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-flame-700">
              {health.sync_problems} competição(ões) com sincronização falhando
            </p>
            <p className="text-xs text-ink-500">
              A API pode ter mudado ou caído. Toque pra ver os detalhes.
            </p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-flame-500" />
        </button>
      )}

      {hasPending && (
        <button
          type="button"
          onClick={() => onNavigate("alertas")}
          className="flex w-full items-center gap-3 rounded-lg bg-surface p-3.5 text-left ring-1 ring-gold-500 transition hover:bg-ink-50"
        >
          <BellRing className="size-5 shrink-0 text-gold-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-gold-800">
              {health.pending_alerts} alerta(s) esperando sua decisão
            </p>
            <p className="text-xs text-gold-700/80">Jogos novos, cancelamentos e afins.</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-gold-600" />
        </button>
      )}

      {hasPendingLeagues && (
        <button
          type="button"
          onClick={() => onNavigate("grupos")}
          className="flex w-full items-center gap-3 rounded-lg bg-surface p-3.5 text-left ring-1 ring-brand-600 transition hover:bg-ink-50"
        >
          <Inbox className="size-5 shrink-0 text-brand-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-brand-800">
              {health.pending_leagues} grupo(s) aguardando aprovação
            </p>
            <p className="text-xs text-brand-700/80">Toque pra revisar e aprovar/rejeitar.</p>
          </div>
          <ChevronRight className="size-4 shrink-0 text-brand-600" />
        </button>
      )}

      {onlineSpike && (
        <div className="flex w-full items-center gap-3 rounded-lg bg-surface p-3.5 ring-1 ring-flame-600">
          <Users2 className="size-5 shrink-0 text-flame-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-flame-700">
              Pico de acesso: {health.online_now} pessoas online agora
            </p>
            <p className="text-xs text-ink-500">
              Acima de {onlineThreshold}. De olho na fila de acesso e no Realtime.
            </p>
          </div>
        </div>
      )}

      {/* Agora — visão de um glance */}
      <Card className="flex items-stretch divide-x divide-border p-0">
        <Stat icon={<Radio className="size-5" />} value={health.live_now} label="Ao vivo" accent="flame" />
        <Stat icon={<CalendarClock className="size-5" />} value={health.today} label="Hoje" accent="ink" />
        <Stat
          icon={<Users2 className="size-5" />}
          value={health.online_now}
          label="Online"
          accent={onlineSpike ? "flame" : "brand"}
        />
      </Card>

      {/* Sincronização */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Sincronização</h2>
          <Button size="sm" variant="ghost" loading={syncNow.isPending} onClick={syncAll}>
            <RefreshCw className="size-4" /> Sincronizar tudo
          </Button>
        </div>
        <Card className="divide-y divide-border p-0">
          {health.competitions.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-ink-400">Nenhuma competição ativa.</p>
          ) : (
            health.competitions.map((c) => <SyncRow key={c.id} comp={c} />)
          )}
        </Card>
      </section>

      <ConfigCard
        threshold={onlineThreshold}
        accessEnabled={health.access_enabled}
        maxActive={health.access_max_active}
      />

      <MaintenanceCard on={health.maintenance_mode} />

      <AuditCard />
    </div>
  );
}

// Linha de configuração: rótulo + ajuda à esquerda, controle à direita.
function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">{label}</p>
        <p className="text-xs text-ink-400">{hint}</p>
      </div>
      {children}
    </div>
  );
}

// Input numérico com "Salvar" que só habilita quando o valor muda (Nielsen #1:
// estado visível; sem salvar à toa). Confirma com toast.
function NumberSetting({
  value,
  min,
  onSave,
  saving,
  suffix,
}: {
  value: number;
  min: number;
  onSave: (v: number) => void;
  saving: boolean;
  suffix?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const parsed = Number(draft);
  const valid = Number.isFinite(parsed) && parsed >= min;
  const dirty = valid && parsed !== value;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-label={suffix}
        className="h-9 w-20 rounded-md border border-ink-200 bg-surface px-2.5 text-center text-sm font-semibold tabular-nums outline-none focus:border-brand-500"
      />
      <Button
        size="sm"
        variant={dirty ? "primary" : "ghost"}
        disabled={!dirty || saving}
        loading={saving}
        onClick={() => onSave(parsed)}
      >
        Salvar
      </Button>
    </div>
  );
}

function ConfigCard({
  threshold,
  accessEnabled,
  maxActive,
}: {
  threshold: number;
  accessEnabled: boolean;
  maxActive: number;
}) {
  const setThreshold = useSetOnlineThreshold();
  const updateAccess = useUpdateAccess();
  const { toast } = useToast();

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Configurações</h2>
      <Card className="divide-y divide-border px-4 py-1">
        <SettingRow
          label="Alerta de pico de acesso"
          hint="Avisa aqui quando passar desse número de pessoas online ao mesmo tempo."
        >
          <NumberSetting
            value={threshold}
            min={1}
            saving={setThreshold.isPending}
            suffix="Pessoas online para alertar"
            onSave={(v) =>
              setThreshold.mutate(v, { onSuccess: () => toast("Limiar de alerta salvo.", "success") })
            }
          />
        </SettingRow>

        <SettingRow
          label="Sala de espera"
          hint={accessEnabled ? "Ligada: segura novos acessos no pico." : "Desligada: ninguém entra na fila."}
        >
          <Switch
            checked={accessEnabled}
            disabled={updateAccess.isPending}
            label="Sala de espera"
            onChange={(v) =>
              updateAccess.mutate(
                { enabled: v, maxActive },
                { onSuccess: () => toast(v ? "Fila ligada." : "Fila desligada.", "info") },
              )
            }
          />
        </SettingRow>

        <SettingRow
          label="Limite de simultâneos"
          hint="Quantas pessoas entram antes da fila segurar. Deixe abaixo do teto do seu plano."
        >
          <NumberSetting
            value={maxActive}
            min={1}
            saving={updateAccess.isPending}
            suffix="Limite de acessos simultâneos"
            onSave={(v) =>
              updateAccess.mutate(
                { enabled: accessEnabled, maxActive: v },
                { onSuccess: () => toast("Limite de simultâneos salvo.", "success") },
              )
            }
          />
        </SettingRow>
      </Card>
    </section>
  );
}

function SyncRow({ comp }: { comp: CompHealth }) {
  const setSync = useSetCompetitionSync();
  const syncNow = useSyncNow();
  const { toast } = useToast();

  const dot =
    comp.last_sync_ok === true
      ? "bg-grass-500"
      : comp.last_sync_ok === false
        ? "bg-flame-500"
        : "bg-ink-300";

  async function syncOne() {
    try {
      await syncNow.mutateAsync({ competitionId: comp.id, mode: "catalog" });
      toast(`${comp.name} sincronizada.`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Erro.", "error");
    }
  }

  return (
    <div className="flex items-center gap-3 px-3.5 py-3">
      <span className={cn("size-2.5 shrink-0 rounded-full", dot)} title="Status do último sync" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-900">{comp.name}</p>
        <p className="truncate text-xs text-ink-400">
          {comp.provider}
          {comp.last_synced_at ? ` · sync ${fromNow(comp.last_synced_at)}` : " · nunca sincronizou"}
        </p>
        {comp.last_sync_ok === false && comp.last_sync_error && (
          <p className="mt-0.5 line-clamp-2 text-xs font-medium text-flame-600">{comp.last_sync_error}</p>
        )}
      </div>
      <Button
        size="icon"
        variant="ghost"
        aria-label={`Sincronizar ${comp.name}`}
        loading={syncNow.isPending}
        onClick={syncOne}
      >
        <RefreshCw className="size-4" />
      </Button>
      <Switch
        checked={comp.sync_enabled}
        disabled={setSync.isPending}
        label={`Sync automático de ${comp.name}`}
        onChange={(v) =>
          setSync.mutate(
            { id: comp.id, value: v },
            { onSuccess: () => toast(v ? "Sync ligado." : "Sync pausado.", "info") },
          )
        }
      />
    </div>
  );
}

function MaintenanceCard({ on }: { on: boolean }) {
  const setMaint = useSetMaintenance();
  const { toast } = useToast();
  const [msg, setMsg] = useState("");

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Manutenção</h2>
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Wrench className={cn("size-5 shrink-0", on ? "text-flame-600" : "text-ink-400")} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">Modo manutenção</p>
            <p className="text-xs text-ink-400">
              {on ? "Banner de aviso ativo pra todo mundo." : "Mostra um aviso global no app."}
            </p>
          </div>
          <Switch
            checked={on}
            disabled={setMaint.isPending}
            label="Modo manutenção"
            onChange={(v) =>
              setMaint.mutate(
                { on: v, message: v ? msg.trim() || undefined : undefined },
                { onSuccess: () => toast(v ? "Manutenção ligada." : "Manutenção desligada.", "info") },
              )
            }
          />
        </div>
        {!on && (
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            maxLength={140}
            placeholder="Mensagem (opcional): ex.: Voltamos já, atualizando os jogos."
            className="h-10 w-full rounded-md border border-ink-200 bg-surface px-3 text-sm outline-none focus:border-brand-500"
          />
        )}
      </Card>
    </section>
  );
}

// Descreve a ação do audit em linguagem clara, com o nome da entidade quando
// disponível (qual competição / grupo / jogo) — Nielsen #2: linguagem do mundo real.
function describeAudit(e: AuditEntry): string {
  const label = e.entity_label ? ` "${e.entity_label}"` : "";
  switch (e.action) {
    case "alert_approve":
      return `aprovou um alerta${label}`;
    case "alert_reject":
      return `recusou um alerta${label}`;
    case "competition_sync_toggle":
      return `${e.detail?.sync_enabled ? "ligou" : "pausou"} o sync de${label || " uma competição"}`;
    case "maintenance_toggle":
      return e.detail?.on ? "ligou o modo manutenção" : "desligou o modo manutenção";
    case "match_reopen":
      return `reabriu palpites de${label || " um jogo"}`;
    default:
      return label ? `${e.action}${label}` : e.action;
  }
}

function AuditCard() {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useRecentAudit();

  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-xs font-bold uppercase tracking-wide text-ink-400"
      >
        <History className="size-3.5" /> Atividade recente
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
      </button>
      {open && (
        <Card className="divide-y divide-border p-0">
          {isLoading ? (
            <Skeleton className="m-3 h-16" />
          ) : !data || data.length === 0 ? (
            <p className="px-4 py-5 text-center text-sm text-ink-400">Nada por aqui ainda.</p>
          ) : (
            data.slice(0, 20).map((e) => (
              <div key={e.id} className="flex items-baseline justify-between gap-3 px-3.5 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink-700">
                  <span className="font-semibold text-ink-900">{e.actor_name}</span> {describeAudit(e)}
                </span>
                <span className="shrink-0 text-xs text-ink-400">{fromNow(e.created_at)}</span>
              </div>
            ))
          )}
        </Card>
      )}
    </section>
  );
}
