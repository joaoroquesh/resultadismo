import type { ReactNode } from "react";
import { BarChart3, Clock3, Gamepad2, MousePointerClick, Shield, Target } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { dayjs, fromNow } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useAdminPlayerMetrics,
  type AdminPlayerMetrics,
  type AdminPlayerProductRow,
} from "./metrics";

const PRODUCT_LABEL: Record<string, string> = {
  app: "Resultadismo",
  retro: "Retrô",
  manager: "Manager",
};

const nf = new Intl.NumberFormat("pt-BR");
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

function int(v: number | null | undefined): string {
  return nf.format(Number(v ?? 0));
}

function dec(v: number | null | undefined): string {
  return nf1.format(Number(v ?? 0));
}

function duration(seconds: number | null | undefined): string {
  const s = Number(seconds ?? 0);
  if (s < 60) return s > 0 ? `${Math.round(s)}s` : "0min";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}min` : `${h}h`;
}

function shortDate(value: string | null | undefined): string {
  return value ? dayjs(value).format("DD/MM HH:mm") : "sem registro";
}

export function UserAnalyticsPanel({ userId }: { userId: string }) {
  const { data, isLoading, error } = useAdminPlayerMetrics(userId, true);

  return (
    <div>
      <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-brand-700">
        Dados de uso · só admin
      </h3>

      {isLoading ? (
        <Skeleton className="h-56 w-full" />
      ) : error || !data ? (
        <EmptyState
          icon={<BarChart3 className="size-7" />}
          title="Sem dados administrativos"
          description={error instanceof Error ? error.message : "Ainda não há histórico suficiente para este usuário."}
        />
      ) : (
        <Card className="space-y-5 p-4">
          <UserOverview data={data} />
          <ProductUsage rows={data.products} />
          <PredictionUsage data={data} />
          <GroupOrigins data={data} />
        </Card>
      )}
    </div>
  );
}

function UserOverview({ data }: { data: AdminPlayerMetrics }) {
  const playedRetro = data.mini_games.retro_runs_total > 0;
  const playedManager = data.mini_games.manager_matches_30d > 0;
  return (
    <section className="grid gap-3 sm:grid-cols-3">
      <MiniStat
        icon={<MousePointerClick className="size-4" />}
        label="Acessos 30d"
        value={int(data.products.reduce((sum, row) => sum + row.sessions, 0))}
        hint={`${duration(data.products.reduce((sum, row) => sum + row.screen_seconds, 0))} de tela`}
      />
      <MiniStat
        icon={<Target className="size-4" />}
        label="Palpites 30d"
        value={int(data.predictions.total_30d)}
        hint={`${dec(data.predictions.avg_per_active_day)} por dia ativo`}
      />
      <MiniStat
        icon={<Gamepad2 className="size-4" />}
        label="Minigames"
        value={`${playedRetro ? "Retrô" : ""}${playedRetro && playedManager ? " + " : ""}${playedManager ? "Manager" : ""}${!playedRetro && !playedManager ? "não" : ""}`}
        hint={`Retrô ${int(data.mini_games.retro_runs_total)} · Manager ${int(data.mini_games.manager_matches_30d)}`}
      />
    </section>
  );
}

function ProductUsage({ rows }: { rows: AdminPlayerProductRow[] }) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-bold text-ink-950">Produtos acessados</h4>
      <div className="divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => (
          <div key={row.product} className={cn("grid gap-2 p-3 text-sm sm:grid-cols-[1fr_76px_76px_86px]", row.sessions === 0 && "opacity-65")}>
            <div className="min-w-0">
              <p className="font-semibold text-ink-900">{PRODUCT_LABEL[row.product]}</p>
              <p className="text-[11px] text-ink-500">
                último acesso: {row.last_seen_at ? fromNow(row.last_seen_at) : "sem registro"}
              </p>
            </div>
            <span><strong className="block text-ink-950">{int(row.sessions)}</strong><span className="text-xs text-ink-500">acessos</span></span>
            <span><strong className="block text-ink-950">{int(row.page_views)}</strong><span className="text-xs text-ink-500">views</span></span>
            <span><strong className="block text-ink-950">{duration(row.screen_seconds)}</strong><span className="text-xs text-ink-500">tempo</span></span>
          </div>
        ))}
      </div>
    </section>
  );
}

function PredictionUsage({ data }: { data: AdminPlayerMetrics }) {
  const allAtOnce = data.predictions.max_in_10m >= 5 || data.predictions.max_in_1h >= 10;
  const maxDaily = Math.max(1, ...data.predictions.daily.map((d) => d.predictions));

  return (
    <section>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-ink-950">Comportamento de palpites</h4>
        <span className={cn("rounded-pill px-2 py-1 text-xs font-bold", allAtOnce ? "bg-gold-100 text-gold-800" : "bg-surface-2 text-ink-500")}>
          {allAtOnce ? "fez bloco rápido" : "sem bloco forte"}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid grid-cols-2 gap-2">
          <MiniStat icon={<Target className="size-4" />} label="Total" value={int(data.predictions.total_all)} hint="desde a criação" />
          <MiniStat icon={<Clock3 className="size-4" />} label="Pico 10min" value={int(data.predictions.max_in_10m)} hint={`pico 1h: ${int(data.predictions.max_in_1h)}`} />
        </div>
        <div className="rounded-lg border border-border bg-background p-3">
          {data.predictions.daily.length === 0 ? (
            <p className="text-xs text-ink-500">Sem palpites nos últimos 30 dias.</p>
          ) : (
            <div className="flex h-20 items-end gap-1.5">
              {data.predictions.daily.map((day) => (
                <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <div
                    title={`${dayjs(day.day).format("DD/MM")} · ${int(day.predictions)} palpites`}
                    className="w-full rounded-t-sm bg-brand-600"
                    style={{ height: `${Math.max(5, Math.round((day.predictions / maxDaily) * 100))}%` }}
                  />
                  {data.predictions.daily.length <= 10 && <span className="text-[10px] text-ink-400">{dayjs(day.day).format("DD")}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-500">
        Primeiro palpite: {shortDate(data.predictions.first_at)} · último: {shortDate(data.predictions.last_at)}
      </p>
    </section>
  );
}

function GroupOrigins({ data }: { data: AdminPlayerMetrics }) {
  return (
    <section>
      <h4 className="mb-2 text-sm font-bold text-ink-950">Grupos e origem</h4>
      {data.groups.length === 0 ? (
        <div className="rounded-lg border border-border bg-background p-3 text-sm text-ink-500">
          Usuário ainda não está em nenhum grupo ativo.
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.groups.map((group) => (
            <div key={group.id} className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_auto]">
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink-900">{group.name}</p>
                <p className="text-[11px] text-ink-500">
                  criado por {group.owner_name} · entrou {fromNow(group.joined_at)}
                </p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-pill bg-surface-2 px-2 py-1 text-xs font-bold text-ink-600">
                <Shield className="size-3" /> {group.role}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MiniStat({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-500">
        <span className="text-brand-700">{icon}</span>
        {label}
      </div>
      <p className="mt-1 text-xl font-extrabold tabular-nums text-ink-950">{value}</p>
      <p className="mt-0.5 text-[11px] text-ink-500">{hint}</p>
    </div>
  );
}
