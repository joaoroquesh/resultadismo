import { useEffect, useMemo, useState } from "react";
import { Megaphone, Send, Users, Minus, Plus, History } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { fromNow } from "@/lib/format";
import {
  useGroupTargets,
  useBroadcastPreview,
  useSendBroadcast,
  useBroadcasts,
  type SegmentKey,
  type Broadcast,
} from "./sync";

// Rótulos dos segmentos (pills + histórico). A ordem aqui é a ordem na UI.
const SEGMENTS: { key: SegmentKey; label: string; hint: string }[] = [
  { key: "all", label: "Todo mundo", hint: "Todas as contas que aceitam avisos." },
  {
    key: "no_prediction",
    label: "Não palpitou hoje",
    hint: "Quem tem jogo de hoje numa federação e ainda não palpitou.",
  },
  { key: "online", label: "Online agora", hint: "Quem está com o app aberto neste momento." },
  { key: "group", label: "Um grupo", hint: "Os membros de uma federação." },
  { key: "group_top", label: "Topo de um grupo", hint: "Os primeiros da classificação de uma competição." },
];

const SEGMENT_LABEL: Record<string, string> = Object.fromEntries(
  SEGMENTS.map((s) => [s.key, s.label]),
);

export function BroadcastPanel() {
  const { toast } = useToast();
  const targets = useGroupTargets();
  const send = useSendBroadcast();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [segment, setSegment] = useState<SegmentKey>("all");
  const [leagueId, setLeagueId] = useState("");
  const [lcId, setLcId] = useState("");
  const [topN, setTopN] = useState(3);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Argumento do segmento (já no formato que a RPC espera). Vira a query key
  // do preview, então só muda quando o que importa muda.
  const arg = useMemo<Record<string, unknown>>(() => {
    if (segment === "group") return { league_id: leagueId };
    if (segment === "group_top") return { lc_id: lcId, top_n: topN };
    return {};
  }, [segment, leagueId, lcId, topN]);

  // Os segmentos que precisam de alvo só ficam "prontos" quando o select tem valor.
  const argReady =
    segment === "group" ? !!leagueId : segment === "group_top" ? !!lcId : true;

  // Debounce 400ms: evita uma chamada de preview a cada tecla/clique.
  const [debouncedArg, setDebouncedArg] = useState(arg);
  const [debouncedSegment, setDebouncedSegment] = useState(segment);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedArg(arg);
      setDebouncedSegment(segment);
    }, 400);
    return () => clearTimeout(t);
  }, [arg, segment]);

  const preview = useBroadcastPreview(debouncedSegment, debouncedArg, argReady);
  const count = preview.data ?? 0;
  const canSend = title.trim().length > 0 && argReady && count > 0 && !preview.isFetching;

  function reset() {
    setTitle("");
    setBody("");
    setUrl("");
    setSegment("all");
    setLeagueId("");
    setLcId("");
    setTopN(3);
  }

  function doSend() {
    send.mutate(
      { title: title.trim(), body: body.trim(), url: url.trim(), segment, arg },
      {
        onSuccess: (sent) => {
          toast(`Aviso enviado pra ${sent} ${sent === 1 ? "pessoa" : "pessoas"}.`, "success");
          reset();
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Não rolou enviar.", "error"),
      },
    );
  }

  function onSendClick() {
    // Acima de 50 pessoas pede confirmação dupla (anti-engano em disparo grande).
    if (count > 50) setConfirmOpen(true);
    else doSend();
  }

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4">
        <div className="flex items-center gap-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
            <Megaphone className="size-4" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-ink-950">Novo aviso</h2>
            <p className="text-xs text-ink-500">Cai como notificação (in-app e push) pra quem você escolher.</p>
          </div>
        </div>

        <Input
          label="Título"
          placeholder="Ex.: A rodada fecha hoje!"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
        />

        <div className="flex flex-col gap-1.5">
          <label htmlFor="broadcast-body" className="text-sm font-medium text-ink-800">
            Mensagem (opcional)
          </label>
          <textarea
            id="broadcast-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="O que você quer dizer pra galera?"
            className="rounded-md border border-ink-200 bg-surface px-3.5 py-2.5 text-ink-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
          />
        </div>

        <Input
          label="Link ao tocar (opcional)"
          placeholder="/ (abre a Home)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          maxLength={200}
        />

        {/* Segmento — pills, igual à navegação do admin */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-ink-800">Pra quem vai</label>
          <div className="flex flex-wrap gap-2">
            {SEGMENTS.map((s) => {
              const active = segment === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSegment(s.key)}
                  className={cn(
                    "shrink-0 rounded-pill border px-3.5 py-1.5 text-sm font-semibold transition",
                    active
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-border bg-surface text-ink-600 hover:bg-ink-100",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-ink-500">{SEGMENTS.find((s) => s.key === segment)?.hint}</p>
        </div>

        {/* Alvo do segmento 'group' */}
        {segment === "group" && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="broadcast-league" className="text-sm font-medium text-ink-800">
              Federação
            </label>
            <select
              id="broadcast-league"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              disabled={targets.isLoading}
              className="h-11 rounded-md border border-ink-200 bg-surface px-3.5 text-ink-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">Escolha uma federação…</option>
              {dedupeLeagues(targets.data ?? []).map((t) => (
                <option key={t.league_id} value={t.league_id}>
                  {t.league_name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Alvo do segmento 'group_top' */}
        {segment === "group_top" && (
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="broadcast-lc" className="text-sm font-medium text-ink-800">
                Competição
              </label>
              <select
                id="broadcast-lc"
                value={lcId}
                onChange={(e) => setLcId(e.target.value)}
                disabled={targets.isLoading}
                className="h-11 rounded-md border border-ink-200 bg-surface px-3.5 text-ink-950 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
              >
                <option value="">Escolha uma competição…</option>
                {(targets.data ?? []).map((t) => (
                  <option key={t.lc_id} value={t.lc_id}>
                    {t.league_name} · {t.competition_name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-800">Quantos do topo</span>
              <Stepper value={topN} min={1} max={50} onChange={setTopN} />
            </div>
          </div>
        )}

        {/* Preview + envio */}
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2 text-sm">
            <Users className="mt-0.5 size-4 shrink-0 text-ink-400" />
            <div className="min-w-0">
              <p
                className={cn(
                  "font-semibold",
                  preview.isError ? "text-flame-600" : "text-ink-900",
                )}
              >
                {!argReady
                  ? "Escolha o alvo pra ver o alcance."
                  : preview.isLoading || preview.isFetching
                    ? "Calculando alcance…"
                    : preview.isError
                      ? "Não consegui calcular o alcance agora. Tenta de novo."
                      : count === 0
                        ? "Ninguém recebe esse aviso agora."
                        : `Vai pra ${count} ${count === 1 ? "pessoa" : "pessoas"}.`}
              </p>
              <p className="text-xs text-ink-500">
                {argReady && !preview.isError && !preview.isFetching && count > 0 && !title.trim()
                  ? "Falta um título pra liberar o envio."
                  : "Já descontamos quem desativou os avisos."}
              </p>
            </div>
          </div>
          <Button onClick={onSendClick} loading={send.isPending} disabled={!canSend}>
            <Send className="size-4" />
            Enviar aviso
          </Button>
        </div>
      </Card>

      <HistorySection />

      <ConfirmDialog
        open={confirmOpen}
        tone="warn"
        title="Enviar pra bastante gente"
        message={`Esse aviso vai pra ${count} pessoas de uma vez. Confere o título e a mensagem antes.`}
        step2Message="Manda mesmo? Todo mundo recebe a notificação na hora."
        confirmLabel="Enviar agora"
        loading={send.isPending}
        onConfirm={() => {
          setConfirmOpen(false);
          doSend();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

// 'group' usa só a federação — colapsa as linhas (uma por competição) numa por liga.
function dedupeLeagues(targets: { league_id: string; league_name: string }[]) {
  const seen = new Set<string>();
  return targets.filter((t) => {
    if (seen.has(t.league_id)) return false;
    seen.add(t.league_id);
    return true;
  });
}

function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  return (
    <div className="flex items-center gap-1.5">
      <Button
        variant="outline"
        size="icon"
        className="size-9"
        aria-label="Menos"
        disabled={value <= min}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus className="size-4" />
      </Button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value) || min))}
        aria-label="Quantos do topo"
        className="h-9 w-14 rounded-md border border-ink-200 bg-surface px-2 text-center text-sm font-semibold tabular-nums outline-none focus:border-brand-500"
      />
      <Button
        variant="outline"
        size="icon"
        className="size-9"
        aria-label="Mais"
        disabled={value >= max}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

function HistorySection() {
  const { data, isLoading } = useBroadcasts();
  const list = data ?? [];

  return (
    <section className="space-y-2">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-400">Avisos enviados</h2>
      {isLoading ? (
        <Card className="h-24 animate-pulse" />
      ) : list.length === 0 ? (
        <EmptyState
          icon={<History className="size-7" />}
          title="Nada enviado ainda"
          description="Os avisos que você disparar vão aparecer aqui."
        />
      ) : (
        <Card className="divide-y divide-border p-0">
          {list.map((b) => (
            <HistoryRow key={b.id} item={b} />
          ))}
        </Card>
      )}
    </section>
  );
}

function HistoryRow({ item }: { item: Broadcast }) {
  // Para 'group'/'group_top' o banco devolve o rótulo da federação/competição;
  // para os demais, mostramos o nome amigável do segmento.
  const target = item.segment_label ?? SEGMENT_LABEL[item.segment] ?? item.segment;
  return (
    <div className="flex items-start gap-3 px-3.5 py-3">
      <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
        <Megaphone className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-ink-900">{item.title}</p>
          <span className="shrink-0 text-[11px] text-ink-400">{fromNow(item.created_at)}</span>
        </div>
        {item.body && <p className="mt-0.5 line-clamp-2 text-sm text-ink-600">{item.body}</p>}
        <p className="mt-1 text-xs text-ink-400">
          {target} · {item.sent_count ?? 0} {item.sent_count === 1 ? "pessoa" : "pessoas"} · por{" "}
          {item.author_name}
        </p>
      </div>
    </div>
  );
}
