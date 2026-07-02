import { useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  Activity,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  Eye,
  Gamepad2,
  MousePointerClick,
  Target,
  TimerReset,
  UserRoundX,
  Users2,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { dayjs } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  useAdminMetrics,
  type MetricsDaily,
  type MetricsPage,
  type MetricsPageDaily,
  type MetricsProduct,
  type MetricsProductRow,
  type MetricsSummary,
} from "./metrics";

const PRODUCT_OPTIONS: { value: MetricsProduct; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "app", label: "Resultadismo" },
  { value: "retro", label: "Retrô" },
  { value: "manager", label: "Manager" },
];

const PRESET_DAYS = [1, 3, 7, 30] as const;
const FALLBACK_WINDOW_DAYS = 30;
const FALLBACK_MAX_DAY_OFFSET = FALLBACK_WINDOW_DAYS - 1;

const PRODUCT_LABEL: Record<string, string> = {
  all: "Todos",
  app: "Resultadismo",
  retro: "Retrô",
  manager: "Manager",
};

const nf = new Intl.NumberFormat("pt-BR");
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

function int(v: number | null | undefined): string {
  return nf.format(Number(v ?? 0));
}

function dec(v: number | null | undefined, digits: 1 | 2 = 1): string {
  return (digits === 2 ? nf2 : nf1).format(Number(v ?? 0));
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

function shortDay(day: string): string {
  return dayjs(day).format("DD/MM");
}

function safeMax(values: number[]): number {
  return Math.max(1, ...values.map((v) => Number(v || 0)));
}

function periodLabel(startDay: string, endDay: string, days: number, recentOffset: number): string {
  if (days === 1 && recentOffset === 0) return "Hoje";
  if (days === 1 && recentOffset === 1) return "Ontem";
  if (startDay === endDay) return shortDay(startDay);
  return `${shortDay(startDay)} - ${shortDay(endDay)}`;
}

function offsetLabel(offset: number): string {
  if (offset === 0) return "Hoje";
  if (offset === 1) return "Ontem";
  return `${offset}d atrás`;
}

function dayText(offset: number): string {
  return dayjs().subtract(offset, "day").format("DD/MM");
}

function clampOffset(value: number, maxOffset = FALLBACK_MAX_DAY_OFFSET): number {
  return Math.max(0, Math.min(maxOffset, Math.round(value)));
}

function offsetFromDay(day: string | null | undefined): number {
  if (!day) return FALLBACK_MAX_DAY_OFFSET;
  const diff = dayjs().startOf("day").diff(dayjs(day).startOf("day"), "day");
  return Math.max(0, Number.isFinite(diff) ? diff : FALLBACK_MAX_DAY_OFFSET);
}

function sliderViewport(recentOffset: number, oldestOffset: number, maxOffset: number) {
  if (maxOffset <= 0) return { start: 0, end: 0 };

  const span = Math.max(0, oldestOffset - recentOffset);
  const minWindow = Math.min(maxOffset, span <= 1 ? 6 : span <= 3 ? 8 : span <= 7 ? 12 : maxOffset);
  const pad = span <= 1 ? 3 : span <= 3 ? 4 : span <= 7 ? 5 : Math.ceil(span * 0.2);
  let start = Math.max(0, recentOffset - pad);
  let end = Math.min(maxOffset, oldestOffset + pad);

  if (end - start < minWindow) {
    const center = (recentOffset + oldestOffset) / 2;
    start = Math.max(0, Math.round(center - minWindow / 2));
    end = Math.min(maxOffset, start + minWindow);
    start = Math.max(0, end - minWindow);
  }

  return { start, end };
}

function pageLabel(page: MetricsPage): string {
  if (page.product === "app" && page.route === "/home-publica") return "Home pública";
  if (page.product === "app" && page.route === "/jogos") return "Jogos";
  if (page.product === "manager" && page.route === "/manager/partida") return "Partidas concluídas";
  if (page.route === "/") return "Raiz";
  return page.route;
}

function productRowsByKey(rows: MetricsProductRow[]) {
  const zero = (product: "app" | "retro" | "manager"): MetricsProductRow => ({
    product,
    active_total: 0,
    active_logged: 0,
    active_anon: 0,
    page_views: 0,
    screen_seconds: 0,
    sessions: 0,
    matches: 0,
  });
  return {
    app: rows.find((r) => r.product === "app") ?? zero("app"),
    retro: rows.find((r) => r.product === "retro") ?? zero("retro"),
    manager: rows.find((r) => r.product === "manager") ?? zero("manager"),
  };
}

export function MetricsAdmin() {
  const [product, setProduct] = useState<MetricsProduct>("all");
  const [includeAdmins, setIncludeAdmins] = useState(false);
  const [recentOffset, setRecentOffset] = useState<number>(0);
  const [oldestOffset, setOldestOffset] = useState<number>(FALLBACK_MAX_DAY_OFFSET);
  const queryMaxOffset = Math.max(FALLBACK_MAX_DAY_OFFSET, recentOffset, oldestOffset);
  const safeRecentOffset = clampOffset(Math.min(recentOffset, oldestOffset), queryMaxOffset);
  const safeOldestOffset = clampOffset(Math.max(recentOffset, oldestOffset), queryMaxOffset);
  const endDay = dayjs().subtract(safeRecentOffset, "day").format("YYYY-MM-DD");
  const startDay = dayjs().subtract(safeOldestOffset, "day").format("YYYY-MM-DD");
  const { data, isLoading, isFetching, error } = useAdminMetrics(startDay, endDay, product, includeAdmins);
  const maxAvailableOffset = data ? offsetFromDay(data.summary.oldest_day_available) : queryMaxOffset;

  function setPreset(days: number) {
    setRecentOffset(0);
    setOldestOffset(Math.min(maxAvailableOffset, days - 1));
  }

  function setFullPeriod() {
    setRecentOffset(0);
    setOldestOffset(maxAvailableOffset);
  }

  function setPeriodRange(nextRecentOffset: number, nextOldestOffset: number) {
    const nextRecent = clampOffset(nextRecentOffset, maxAvailableOffset);
    const nextOldest = clampOffset(nextOldestOffset, maxAvailableOffset);
    setRecentOffset(Math.min(nextRecent, nextOldest));
    setOldestOffset(Math.max(nextRecent, nextOldest));
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-36 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <EmptyState
        icon={<BarChart3 className="size-7" />}
        title="Não deu para carregar as métricas"
        description={error instanceof Error ? error.message : "Tente atualizar a página."}
      />
    );
  }

  const displayRecentOffset = offsetFromDay(data.summary.end_day);
  const displayOldestOffset = offsetFromDay(data.summary.start_day);
  const displaySelectedDays = data.summary.days;
  const displayPeriodLabel = periodLabel(
    data.summary.start_day,
    data.summary.end_day,
    displaySelectedDays,
    displayRecentOffset,
  );

  return (
    <div className={cn("space-y-5 transition-opacity duration-200 ease-out", isFetching && "opacity-80")}>
      <div className="space-y-3">
        <div className="grid gap-3">
          <ProductScopeControl value={product} onChange={setProduct} />
          <PeriodPicker
            recentOffset={displayRecentOffset}
            oldestOffset={displayOldestOffset}
            maxOffset={maxAvailableOffset}
            selectedDays={displaySelectedDays}
            startDay={data.summary.start_day}
            endDay={data.summary.end_day}
            label={displayPeriodLabel}
            includeAdmins={includeAdmins}
            collectionStartedDay={data.summary.collection_started_day}
            onPreset={setPreset}
            onFullPeriod={setFullPeriod}
            onIncludeAdminsChange={setIncludeAdmins}
            onRangeChange={setPeriodRange}
          />
        </div>
        <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs leading-relaxed text-ink-600">
          Admins ficam fora por padrão. Ao ligar o filtro, entram apenas os acessos gravados daqui em diante; a rota /admin segue fora da coleta.
        </div>
      </div>

      <ExecutiveStrip summary={data.summary} />

      <DailyPanel daily={data.daily} />
      <ProductPanel rows={data.products} selected={product} />
      <PagesPanel pages={data.pages} />
      <RetentionPanel summary={data.summary} />

      <GamePanel summary={data.summary} rows={data.products} selected={product} />
    </div>
  );
}

function ProductScopeControl({
  value,
  onChange,
}: {
  value: MetricsProduct;
  onChange: (value: MetricsProduct) => void;
}) {
  return (
    <div className="grid w-full grid-cols-4 gap-1 rounded-pill bg-ink-100 p-1">
      {PRODUCT_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "min-w-0 rounded-pill px-1 py-2 text-center text-[10px] font-extrabold transition min-[380px]:text-[11px] sm:px-3 sm:text-sm",
            value === option.value
              ? "bg-surface text-ink-950 shadow-[var(--shadow-soft)]"
              : "text-ink-500 hover:text-ink-800",
          )}
        >
          <span className="block">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function PeriodPicker({
  recentOffset,
  oldestOffset,
  maxOffset,
  selectedDays,
  startDay,
  endDay,
  label,
  includeAdmins,
  collectionStartedDay,
  onPreset,
  onFullPeriod,
  onIncludeAdminsChange,
  onRangeChange,
}: {
  recentOffset: number;
  oldestOffset: number;
  maxOffset: number;
  selectedDays: number;
  startDay: string;
  endDay: string;
  label: string;
  includeAdmins: boolean;
  collectionStartedDay: string | null;
  onPreset: (days: number) => void;
  onFullPeriod: () => void;
  onIncludeAdminsChange: (include: boolean) => void;
  onRangeChange: (recentOffset: number, oldestOffset: number) => void;
}) {
  const isFullPeriod = recentOffset === 0 && oldestOffset === maxOffset;
  const collectionLabel = collectionStartedDay ? `coleta desde ${shortDay(collectionStartedDay)}` : "coleta sem evento";

  return (
    <Card className="p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex min-w-0 items-center gap-2">
          <CalendarDays className="size-4 shrink-0 text-brand-700" />
          <div className="min-w-0">
            <p className="truncate text-base font-extrabold text-ink-950">{label}</p>
            <p className="text-[11px] text-ink-500">
              {shortDay(startDay)} até {shortDay(endDay)} · {selectedDays} {selectedDays === 1 ? "dia" : "dias"} · {collectionLabel}
            </p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-[auto_auto] sm:items-center lg:justify-end">
          <div className="grid grid-cols-5 gap-1 rounded-pill bg-surface-2 p-1">
            {PRESET_DAYS.map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => onPreset(days)}
                className={cn(
                  "rounded-pill px-2.5 py-1.5 text-xs font-bold transition",
                  selectedDays === days && recentOffset === 0
                    ? "bg-brand-600 text-white"
                    : "text-ink-500 hover:bg-surface hover:text-ink-900",
                )}
              >
                {days}d
              </button>
            ))}
            <button
              type="button"
              onClick={onFullPeriod}
              className={cn(
                "rounded-pill px-2.5 py-1.5 text-xs font-bold transition",
                isFullPeriod ? "bg-brand-600 text-white" : "text-ink-500 hover:bg-surface hover:text-ink-900",
              )}
            >
              Tudo
            </button>
          </div>
          <div className="flex items-center justify-between gap-2 rounded-pill bg-background px-3 py-2 text-xs font-bold text-ink-600 sm:justify-start">
            <span>Admins</span>
            <Switch checked={includeAdmins} onChange={onIncludeAdminsChange} label="Incluir admins nas métricas" />
          </div>
        </div>
      </div>

      <PeriodRangeSlider
        recentOffset={recentOffset}
        oldestOffset={oldestOffset}
        maxOffset={maxOffset}
        onChange={onRangeChange}
      />
    </Card>
  );
}

function PeriodRangeSlider({
  recentOffset,
  oldestOffset,
  maxOffset,
  onChange,
}: {
  recentOffset: number;
  oldestOffset: number;
  maxOffset: number;
  onChange: (recentOffset: number, oldestOffset: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"recent" | "oldest" | null>(null);
  const viewport = sliderViewport(recentOffset, oldestOffset, maxOffset);
  const viewportSpan = Math.max(1, viewport.end - viewport.start);
  const recentPct = ((recentOffset - viewport.start) / viewportSpan) * 100;
  const oldestPct = ((oldestOffset - viewport.start) / viewportSpan) * 100;
  const handlesOverlap = recentOffset === oldestOffset;

  function offsetFromClientX(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return recentOffset;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return clampOffset(viewport.start + ratio * viewportSpan, maxOffset);
  }

  function moveHandle(handle: "recent" | "oldest", nextOffset: number) {
    if (handle === "recent") {
      onChange(Math.min(nextOffset, oldestOffset), oldestOffset);
    } else {
      onChange(recentOffset, Math.max(nextOffset, recentOffset));
    }
  }

  function startTrackDrag(event: PointerEvent<HTMLDivElement>) {
    const nextOffset = offsetFromClientX(event.clientX);
    const handle =
      Math.abs(nextOffset - recentOffset) <= Math.abs(nextOffset - oldestOffset) ? "recent" : "oldest";
    setDragging(handle);
    event.currentTarget.setPointerCapture(event.pointerId);
    moveHandle(handle, nextOffset);
  }

  function moveTrackDrag(event: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    moveHandle(dragging, offsetFromClientX(event.clientX));
  }

  function startHandleDrag(handle: "recent" | "oldest", event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(handle);
    event.currentTarget.setPointerCapture(event.pointerId);
    moveHandle(handle, offsetFromClientX(event.clientX));
  }

  function moveHandleDrag(handle: "recent" | "oldest", event: PointerEvent<HTMLButtonElement>) {
    if (dragging !== handle) return;
    moveHandle(handle, offsetFromClientX(event.clientX));
  }

  function moveByKey(handle: "recent" | "oldest", event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 7 : 1;
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? step
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -step
          : 0;
    if (!direction) return;
    event.preventDefault();
    moveHandle(handle, clampOffset((handle === "recent" ? recentOffset : oldestOffset) + direction, maxOffset));
  }

  return (
    <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3">
      <div className="flex items-center justify-between gap-3 text-xs font-semibold text-ink-500">
        <span>Mais recente: <strong className="text-ink-900">{offsetLabel(recentOffset)}</strong></span>
        <span className="text-right">Mais antigo: <strong className="text-ink-900">{offsetLabel(oldestOffset)}</strong></span>
      </div>

      <div
        ref={trackRef}
        className="relative mt-4 h-10 cursor-pointer touch-none"
        onPointerDown={startTrackDrag}
        onPointerMove={moveTrackDrag}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded-pill bg-ink-100" />
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-pill bg-brand-600 transition-[left,width] duration-200 ease-out"
          style={{
            left: `${Math.min(recentPct, oldestPct)}%`,
            width: `${Math.max(3, Math.abs(oldestPct - recentPct))}%`,
          }}
        />
        <SliderHandle
          kind="recent"
          offset={recentOffset}
          maxOffset={maxOffset}
          left={recentPct}
          shifted={handlesOverlap ? -12 : 0}
          active={dragging === "recent"}
          onPointerDown={startHandleDrag}
          onPointerMove={moveHandleDrag}
          onPointerUp={() => setDragging(null)}
          onKeyDown={moveByKey}
        />
        <SliderHandle
          kind="oldest"
          offset={oldestOffset}
          maxOffset={maxOffset}
          left={oldestPct}
          shifted={handlesOverlap ? 12 : 0}
          active={dragging === "oldest"}
          onPointerDown={startHandleDrag}
          onPointerMove={moveHandleDrag}
          onPointerUp={() => setDragging(null)}
          onKeyDown={moveByKey}
        />
      </div>

      <div className="mt-1 flex items-center justify-between text-[11px] text-ink-500">
        <span>{viewport.start === 0 ? "Hoje" : dayText(viewport.start)}</span>
        <span>{dayText(Math.round((viewport.start + viewport.end) / 2))}</span>
        <span>{dayText(viewport.end)}</span>
      </div>
    </div>
  );
}

function SliderHandle({
  kind,
  offset,
  maxOffset,
  left,
  shifted,
  active,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onKeyDown,
}: {
  kind: "recent" | "oldest";
  offset: number;
  maxOffset: number;
  left: number;
  shifted: number;
  active: boolean;
  onPointerDown: (handle: "recent" | "oldest", event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (handle: "recent" | "oldest", event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: () => void;
  onKeyDown: (handle: "recent" | "oldest", event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      role="slider"
      aria-label={kind === "recent" ? "Dia mais recente do período" : "Dia mais antigo do período"}
      aria-valuemin={0}
      aria-valuemax={maxOffset}
      aria-valuenow={offset}
      aria-valuetext={offsetLabel(offset)}
      onPointerDown={(event) => onPointerDown(kind, event)}
      onPointerMove={(event) => onPointerMove(kind, event)}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={(event) => onKeyDown(kind, event)}
      className={cn(
        "absolute top-1/2 z-10 grid size-7 place-items-center rounded-full border-2 border-background bg-brand-600 shadow-[var(--shadow-soft)] outline-none transition-[left,box-shadow,transform] duration-200 ease-out focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2",
        active && "shadow-[var(--shadow-brand)]",
      )}
      style={{ left: `${left}%`, transform: `translate(calc(-50% + ${shifted}px), -50%) scale(${active ? 1.08 : 1})` }}
    >
      <span className="size-2 rounded-full bg-white/90" />
    </button>
  );
}

function ExecutiveStrip({ summary }: { summary: MetricsSummary }) {
  const cards = [
    {
      icon: <Users2 className="size-4" />,
      label: "Usuários totais",
      value: int(summary.total_accounts),
      hint: `${int(summary.active_logged)} logados ativos · ${int(summary.inactive_in_period)} sem uso no período`,
    },
    {
      icon: <Activity className="size-4" />,
      label: "Ativos no período",
      value: int(summary.active_total),
      hint: `${int(summary.active_logged)} logados · ${int(summary.active_anon)} anônimos · ${int(summary.days_with_activity)} dias com uso`,
    },
    {
      icon: <MousePointerClick className="size-4" />,
      label: "Sessões / usuário-dia",
      value: dec(summary.avg_sessions_per_active_user_day, 2),
      hint: `${int(summary.sessions_total)} sessões · ${dec(summary.avg_sessions_per_active_user, 2)} por ativo no período`,
    },
    {
      icon: <Clock3 className="size-4" />,
      label: "Tempo / usuário-dia",
      value: duration(summary.avg_seconds_per_active_user_day),
      hint: `${duration(summary.avg_seconds_per_active_user)} por ativo · ${duration(summary.screen_seconds_total)} total`,
    },
    {
      icon: <Target className="size-4" />,
      label: "Palpites",
      value: int(summary.predictions_total),
      hint:
        summary.product === "retro" || summary.product === "manager"
          ? "fora deste produto"
          : `${dec(summary.avg_daily_predictions, 1)} por dia com palpite · ${int(summary.prediction_days)} dias`,
    },
    {
      icon: <UserRoundX className="size-4" />,
      label: "Inativos há 2+ dias",
      value: int(summary.inactive_2d),
      hint: `${int(summary.inactive_7d)} há 7+ · ${int(summary.inactive_30d)} há 30+`,
      tone: summary.inactive_2d > 0 ? "warn" : "normal",
    },
  ];

  return (
    <section className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
      {cards.map((card) => (
        <Card
          key={card.label}
          className={cn("min-h-28 p-3", card.tone === "warn" && "ring-gold-500/70")}
        >
          <div className="flex items-center gap-2 text-xs font-semibold text-ink-500">
            <span className={cn("text-brand-700", card.tone === "warn" && "text-gold-700")}>{card.icon}</span>
            <span className="min-w-0 leading-tight">{card.label}</span>
          </div>
          <p className="mt-2 text-2xl font-extrabold tabular-nums text-ink-950">{card.value}</p>
          <p className="mt-1 min-h-8 text-[11px] leading-snug text-ink-500">{card.hint}</p>
        </Card>
      ))}
    </section>
  );
}

function DailyPanel({ daily }: { daily: MetricsDaily[] }) {
  const [zoomDays, setZoomDays] = useState<number | "all">("all");
  const [startIndex, setStartIndex] = useState(0);
  const visibleCount = zoomDays === "all" ? daily.length : Math.min(zoomDays, daily.length);
  const maxStartIndex = Math.max(0, daily.length - Math.max(visibleCount, 1));
  const safeStartIndex = Math.min(startIndex, maxStartIndex);
  const visibleDaily = daily.slice(safeStartIndex, safeStartIndex + visibleCount);

  function setZoom(next: number | "all") {
    setZoomDays(next);
    setStartIndex(0);
  }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink-950">Crescimento diário</h2>
          <p className="text-xs text-ink-500">Ativos, novas contas, acessos e palpites por dia.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-[auto_auto] sm:items-center">
          <span className="rounded-pill bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-700">
            {visibleDaily.length
              ? `${shortDay(visibleDaily[0]!.day)} - ${shortDay(visibleDaily[visibleDaily.length - 1]!.day)}`
              : "sem dados"}
          </span>
          <div className="grid grid-cols-4 gap-1 rounded-pill bg-surface-2 p-1">
            {[
              { label: "Tudo", value: "all" as const },
              { label: "7d", value: 7 },
              { label: "14d", value: 14 },
              { label: "30d", value: 30 },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                onClick={() => setZoom(option.value)}
                disabled={option.value !== "all" && daily.length <= option.value}
                className={cn(
                  "rounded-pill px-2 py-1 text-[11px] font-bold transition disabled:opacity-40",
                  zoomDays === option.value
                    ? "bg-brand-600 text-white"
                    : "text-ink-500 hover:bg-surface hover:text-ink-900",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {maxStartIndex > 0 && (
        <div className="mt-4 rounded-lg border border-border bg-background px-3 py-2">
          <input
            type="range"
            min={0}
            max={maxStartIndex}
            value={safeStartIndex}
            onChange={(event) => setStartIndex(Number(event.target.value))}
            className="h-2 w-full accent-brand-600"
            aria-label="Mover janela do gráfico diário"
          />
          <div className="mt-1 flex justify-between text-[11px] text-ink-500">
            <span>{shortDay(daily[0]!.day)}</span>
            <span>{shortDay(daily[daily.length - 1]!.day)}</span>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <LineChart
          data={visibleDaily}
          primaryKey="active_total"
          secondaryKey="new_accounts"
          primaryLabel="Ativos"
          secondaryLabel="Novos"
        />
        <BarChart data={visibleDaily} />
      </div>
    </Card>
  );
}

function LineChart({
  data,
  primaryKey,
  secondaryKey,
  primaryLabel,
  secondaryLabel,
}: {
  data: MetricsDaily[];
  primaryKey: keyof MetricsDaily;
  secondaryKey: keyof MetricsDaily;
  primaryLabel: string;
  secondaryLabel: string;
}) {
  const points = useMemo(() => {
    const max = safeMax(data.flatMap((d) => [Number(d[primaryKey] ?? 0), Number(d[secondaryKey] ?? 0)]));
    const w = 520;
    const h = 190;
    const pad = 18;
    const xStep = data.length > 1 ? (w - pad * 2) / (data.length - 1) : 0;
    const toPoint = (key: keyof MetricsDaily) =>
      data.map((d, i) => {
        const x = pad + i * xStep;
        const y = h - pad - (Number(d[key] ?? 0) / max) * (h - pad * 2);
        return `${x},${y}`;
      });
    return { primary: toPoint(primaryKey), secondary: toPoint(secondaryKey), w, h };
  }, [data, primaryKey, secondaryKey]);

  if (!data.length) {
    return <EmptyState title="Sem série ainda" description="A coleta começa a aparecer depois dos primeiros acessos." />;
  }

  const tickDays = Array.from(new Set([
    data[0]?.day,
    data[Math.floor(data.length / 2)]?.day,
    data[data.length - 1]?.day,
  ].filter(Boolean) as string[]));

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex flex-wrap gap-3 text-xs font-semibold">
        <span className="inline-flex items-center gap-1.5 text-brand-700"><span className="size-2 rounded-full bg-brand-600" /> {primaryLabel}</span>
        <span className="inline-flex items-center gap-1.5 text-gold-700"><span className="size-2 rounded-full bg-gold-500" /> {secondaryLabel}</span>
      </div>
      <svg viewBox={`0 0 ${points.w} ${points.h}`} role="img" aria-label="Gráfico diário de ativos e novos usuários" className="h-48 w-full">
        <polyline fill="none" stroke="var(--color-border)" strokeWidth="1" points={`18,172 ${points.w - 18},172`} />
        <polyline fill="none" stroke="var(--color-gold-500)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points.secondary.join(" ")} />
        <polyline fill="none" stroke="var(--color-brand-600)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" points={points.primary.join(" ")} />
      </svg>
      <div className="grid gap-2 text-[11px] text-ink-500" style={{ gridTemplateColumns: `repeat(${tickDays.length}, minmax(0, 1fr))` }}>
        {tickDays.map((day) => (
          <span key={day} className="tabular-nums">{shortDay(day)}</span>
        ))}
      </div>
    </div>
  );
}

function BarChart({ data }: { data: MetricsDaily[] }) {
  const max = safeMax(data.flatMap((d) => [d.sessions, d.predictions]));
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs font-semibold text-ink-600">
        <span className="inline-flex items-center gap-1.5">
          <MousePointerClick className="size-4 text-brand-700" />
          Acessos
        </span>
        <span className="inline-flex items-center gap-1.5 text-gold-700">
          <span className="size-2 rounded-full bg-gold-500" />
          Palpites
        </span>
      </div>
      <div className="flex h-48 items-end gap-1.5">
        {data.map((d) => {
          const sessionsHeight = Math.max(3, Math.round((d.sessions / max) * 100));
          const predictionsHeight = Math.max(3, Math.round((d.predictions / max) * 100));
          return (
            <div key={d.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <div className="flex min-h-0 w-full flex-1 items-end gap-0.5">
                <div
                  title={`${shortDay(d.day)} · ${int(d.sessions)} acessos`}
                  className="min-w-0 flex-1 rounded-t-sm bg-brand-600/80 transition hover:bg-brand-700"
                  style={{ height: `${sessionsHeight}%` }}
                />
                <div
                  title={`${shortDay(d.day)} · ${int(d.predictions)} palpites`}
                  className="min-w-0 flex-1 rounded-t-sm bg-gold-500/85 transition hover:bg-gold-600"
                  style={{ height: `${predictionsHeight}%` }}
                />
              </div>
              {data.length <= 10 && <span className="text-[10px] tabular-nums text-ink-400">{dayjs(d.day).format("DD")}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-ink-500 sm:grid-cols-4">
        <span>Total: <strong className="text-ink-800">{int(data.reduce((sum, d) => sum + d.sessions, 0))}</strong></span>
        <span>Páginas: <strong className="text-ink-800">{int(data.reduce((sum, d) => sum + d.page_views, 0))}</strong></span>
        <span>Palpites: <strong className="text-ink-800">{int(data.reduce((sum, d) => sum + d.predictions, 0))}</strong></span>
        <span className="sm:text-right">Tempo: <strong className="text-ink-800">{duration(data.reduce((sum, d) => sum + d.screen_seconds, 0))}</strong></span>
      </div>
    </div>
  );
}

function ProductPanel({ rows, selected }: { rows: MetricsProductRow[]; selected: MetricsProduct }) {
  const normalized = Object.values(productRowsByKey(rows));

  return (
    <Card className="p-4">
      <div>
        <h2 className="text-base font-bold text-ink-950">Produtos</h2>
        <p className="text-xs text-ink-500">Separado por casca, com anônimos quando existem.</p>
      </div>
      <div className="mt-3 space-y-2">
        {normalized.map((row) => (
          <ProductRow key={row.product} row={row} active={selected === "all" || selected === row.product} />
        ))}
      </div>
    </Card>
  );
}

function ProductRow({ row, active }: { row: MetricsProductRow; active: boolean }) {
  return (
    <div className={cn("border-t border-border py-3 first:border-t-0", !active && "opacity-70")}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-bold text-ink-900">{PRODUCT_LABEL[row.product]}</span>
        <span className="rounded-pill bg-surface px-2 py-0.5 text-xs font-bold tabular-nums text-brand-700">
          {int(row.active_total)} ativos
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-ink-500">
        <span><strong className="block text-sm text-ink-900">{int(row.sessions)}</strong> acessos</span>
        <span><strong className="block text-sm text-ink-900">{int(row.page_views)}</strong> páginas</span>
        <span><strong className="block text-sm text-ink-900">{duration(row.screen_seconds)}</strong> tempo</span>
      </div>
      <p className="mt-2 text-[11px] text-ink-500">
        {int(row.active_logged)} logados · {int(row.active_anon)} anônimos
        {row.matches > 0 ? ` · ${int(row.matches)} partidas` : ""}
      </p>
    </div>
  );
}

function PagesPanel({ pages }: { pages: MetricsPage[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink-950">Páginas e rotas</h2>
          <p className="text-xs text-ink-500">Abra uma rota para ver quais dias puxaram o acesso.</p>
        </div>
        <Eye className="size-5 text-brand-700" />
      </div>

      {pages.length === 0 ? (
        <EmptyState title="Sem páginas medidas ainda" description="Os acessos novos começam a popular esta tabela." />
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <div className="hidden grid-cols-[minmax(0,1fr)_76px_76px_96px] gap-3 bg-surface-2 px-4 py-2 text-[11px] font-bold uppercase text-ink-500 md:grid">
            <span>Rota</span>
            <span className="text-right">views</span>
            <span className="text-right">pessoas</span>
            <span className="text-right">tempo</span>
          </div>
          {pages.map((page) => {
            const key = `${page.product}:${page.route}`;
            const open = expanded === key;
            return (
              <div key={key} className="border-t border-border">
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : key)}
                  className="w-full px-4 py-3 text-left text-sm transition hover:bg-surface-2"
                >
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_76px_76px_96px] md:items-center">
                    <div className="flex min-w-0 items-start gap-2">
                      {open ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-ink-400" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-ink-400" />}
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink-900">{pageLabel(page)}</p>
                        <p className="break-words text-[11px] leading-snug text-ink-500">
                          {PRODUCT_LABEL[page.product]} · {page.route}
                          {page.best_day ? ` · melhor ${shortDay(page.best_day)}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 md:contents">
                      <MetricCell label="Views" value={int(page.views)} />
                      <MetricCell label="Pessoas" value={int(page.visitors)} />
                      <MetricCell label="Tempo" value={duration(page.screen_seconds)} />
                    </div>
                  </div>
                </button>
                {open && <RouteDailyDetails daily={page.daily} />}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function MetricCell({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded-lg bg-surface-2 px-2 py-1 text-right tabular-nums text-ink-800 md:bg-transparent md:px-0 md:py-0">
      <span className="block text-[10px] font-semibold uppercase text-ink-400 md:hidden">{label}</span>
      {value}
    </span>
  );
}

function RouteDailyDetails({ daily }: { daily: MetricsPageDaily[] }) {
  const max = safeMax(daily.map((d) => d.views));
  return (
    <div className="border-t border-border bg-background px-3 py-3">
      <div className="flex h-24 items-end gap-1.5">
        {daily.map((day) => {
          const h = Math.max(4, Math.round((day.views / max) * 100));
          return (
            <div key={day.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div
                title={`${shortDay(day.day)} · ${int(day.views)} views · ${int(day.visitors)} pessoas`}
                className="w-full rounded-t-sm bg-brand-600/75"
                style={{ height: `${h}%` }}
              />
              {daily.length <= 10 && <span className="text-[10px] tabular-nums text-ink-400">{dayjs(day.day).format("DD")}</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-ink-500">
        <span>Views: <strong className="text-ink-800">{int(daily.reduce((sum, d) => sum + d.views, 0))}</strong></span>
        <span className="text-center">Sessões: <strong className="text-ink-800">{int(daily.reduce((sum, d) => sum + d.sessions, 0))}</strong></span>
        <span className="text-right">Tempo: <strong className="text-ink-800">{duration(daily.reduce((sum, d) => sum + d.screen_seconds, 0))}</strong></span>
      </div>
    </div>
  );
}

function RetentionPanel({ summary }: { summary: MetricsSummary }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-ink-950">Retenção</h2>
          <p className="text-xs text-ink-500">Sinais gerais para acionar usuários fora desta tela.</p>
        </div>
        <TimerReset className="size-5 text-gold-700" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricMini label="Sem uso no período" value={int(summary.inactive_in_period)} />
        <MetricMini label="2+ dias" value={int(summary.inactive_2d)} />
        <MetricMini label="7+ dias" value={int(summary.inactive_7d)} />
        <MetricMini label="30+ dias" value={int(summary.inactive_30d)} />
      </div>
      <div className="mt-4 rounded-lg border border-border bg-background p-3">
        <p className="text-xs font-semibold text-ink-500">Ritmo médio</p>
        <p className="mt-1 text-2xl font-extrabold text-ink-950">{dec(summary.avg_daily_active, 1)}</p>
        <p className="text-xs text-ink-500">ativos por dia com movimento no período selecionado</p>
      </div>
    </Card>
  );
}

function GamePanel({ summary, rows, selected }: { summary: MetricsSummary; rows: MetricsProductRow[]; selected: MetricsProduct }) {
  const byProduct = productRowsByKey(rows);
  const appVisible = selected === "all" || selected === "app";
  const retroVisible = selected === "all" || selected === "retro";
  const managerVisible = selected === "all" || selected === "manager";

  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <Card className={cn("p-4", !appVisible && "opacity-60")}>
        <div className="flex items-center gap-2 text-sm font-bold text-ink-950">
          <Target className="size-4 text-brand-700" /> Resultadismo
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <MetricMini label="Palpites" value={int(summary.predictions_total)} />
          <MetricMini label="Grupos ativos" value={int(summary.active_groups_total)} />
          <MetricMini label="Grupos com palpite" value={int(summary.groups_with_predictions)} />
          <MetricMini label="Bolões pagos" value={int(summary.paid_leagues)} />
        </div>
      </Card>

      <Card className={cn("p-4", !retroVisible && "opacity-60")}>
        <div className="flex items-center gap-2 text-sm font-bold text-ink-950">
          <Gamepad2 className="size-4 text-gold-700" /> Retrô
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <MetricMini label="Partidas" value={int(summary.retro_runs_total)} />
          <MetricMini label="Jogadores logados" value={int(summary.retro_logged_players)} />
          <MetricMini label="Ativos anônimos" value={int(byProduct.retro.active_anon)} />
          <MetricMini label="Tempo total" value={duration(byProduct.retro.screen_seconds)} />
        </div>
      </Card>

      <Card className={cn("p-4", !managerVisible && "opacity-60")}>
        <div className="flex items-center gap-2 text-sm font-bold text-ink-950">
          <Gamepad2 className="size-4 text-grass-700" /> Manager
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <MetricMini label="Partidas" value={int(summary.manager_matches_total)} />
          <MetricMini label="Jogadores logados" value={int(summary.manager_logged_players)} />
          <MetricMini label="Ativos anônimos" value={int(byProduct.manager.active_anon)} />
          <MetricMini label="Tempo total" value={duration(byProduct.manager.screen_seconds)} />
        </div>
      </Card>
    </section>
  );
}

function MetricMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-border pt-2">
      <p className="text-[11px] font-semibold text-ink-500">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums text-ink-950">{value}</p>
    </div>
  );
}
