import { useMemo } from "react";
import { Swords, ChevronRight, Lock } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useConfrontoStandings, useTieDetail, type ConfrontoTie } from "./api";

/* ---------------- Tabela da Liga (3/1/0) ---------------- */
export function LigaTable({ lcId, currentUserId }: { lcId: string; currentUserId?: string }) {
  const { data: rows, isLoading } = useConfrontoStandings(lcId);
  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (!rows || rows.length === 0)
    return <p className="px-1 py-4 text-center text-sm text-ink-400">Sem classificação ainda.</p>;

  return (
    <div className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
      <div className="flex items-center gap-3 border-b border-ink-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">
        <span className="w-5 text-center">#</span>
        <span className="min-w-0 flex-1">Jogador</span>
        <span className="w-9 text-center" title="Jogos">J</span>
        <span className="w-12 text-center" title="Saldo de pontos no confronto">SG</span>
        <span className="w-10 text-right">Pts</span>
      </div>
      <ul className="divide-y divide-ink-100">
        {rows.map((row) => {
          const isMe = row.user_id === currentUserId;
          const sg = row.gols_pro - row.gols_contra;
          return (
            <li
              key={row.user_id}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5",
                isMe && "bg-brand-500/10 ring-1 ring-inset ring-brand-500/30",
              )}
            >
              <span
                className={cn(
                  "flex w-5 justify-center text-sm font-bold tabular-nums",
                  row.rank === 1 && "text-gold-600",
                  row.rank === 2 && "text-ink-400",
                  row.rank === 3 && "text-[#b08d57]",
                  row.rank > 3 && "text-ink-400",
                )}
              >
                {row.rank}
              </span>
              <Avatar src={row.avatar_url} name={row.display_name} size="sm" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-semibold text-ink-900">
                  {row.display_name}
                  {isMe && <span className="ml-1 text-xs font-medium text-brand-600">(você)</span>}
                </span>
                <span className="whitespace-nowrap text-[11px] text-ink-400">
                  {row.vitorias}V · {row.empates}E · {row.derrotas}D
                </span>
              </div>
              <span className="w-9 text-center text-xs tabular-nums text-ink-500">{row.jogos}</span>
              <span
                className={cn(
                  "w-12 text-center text-xs font-medium tabular-nums",
                  sg > 0 ? "text-grass-600" : sg < 0 ? "text-flame-600" : "text-ink-400",
                )}
              >
                {sg > 0 ? `+${sg}` : sg}
              </span>
              <span className="w-10 text-right text-lg font-extrabold tabular-nums text-ink-950">
                {row.pontos}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ---------------- Linha de confronto (par) ---------------- */
function TieSide({
  name,
  avatar,
  win,
  align = "left",
}: {
  name: string | null;
  avatar: string | null;
  win: boolean;
  align?: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2",
        align === "right" && "flex-row-reverse text-right",
      )}
    >
      <Avatar src={avatar} name={name} size="xs" />
      <span
        className={cn(
          "truncate text-sm",
          win ? "font-bold text-ink-950" : "font-medium text-ink-600",
        )}
      >
        {name ?? "—"}
      </span>
    </div>
  );
}

export function TieRow({
  tie,
  currentUserId,
  onClick,
}: {
  tie: ConfrontoTie;
  currentUserId?: string;
  onClick?: () => void;
}) {
  const mine = tie.member_a === currentUserId || tie.member_b === currentUserId;
  const aWin = tie.resolved && tie.winner === tie.member_a;
  const bWin = tie.resolved && tie.winner === tie.member_b;
  const bye = tie.member_b === null;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors",
        onClick && "hover:bg-ink-50",
        mine && "bg-brand-500/[0.07]",
      )}
    >
      <TieSide name={tie.name_a} avatar={tie.avatar_a} win={aWin} />
      {bye ? (
        <span className="shrink-0 rounded-pill bg-ink-100 px-2 py-0.5 text-[10px] font-semibold text-ink-400">
          passou (bye)
        </span>
      ) : tie.walkover ? (
        <span
          className="shrink-0 rounded-pill bg-flame-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-flame-700"
          title="Vitória por W.O. — o adversário saiu da federação"
        >
          W.O.
        </span>
      ) : (
        <span className="flex shrink-0 items-center gap-1 text-sm font-extrabold tabular-nums">
          <span className={cn(aWin ? "text-brand-700" : "text-ink-500")}>{tie.pa}</span>
          <span className="text-ink-300">×</span>
          <span className={cn(bWin ? "text-brand-700" : "text-ink-500")}>{tie.pb}</span>
        </span>
      )}
      <TieSide name={tie.name_b} avatar={tie.avatar_b} win={bWin} align="right" />
      {onClick && <ChevronRight className="size-4 shrink-0 text-ink-300" />}
    </button>
  );
}

/* ---------------- Rodadas (Liga) ---------------- */
export function ConfrontoRounds({
  ties,
  currentUserId,
  onOpenTie,
}: {
  ties: ConfrontoTie[];
  currentUserId?: string;
  onOpenTie: (t: ConfrontoTie) => void;
}) {
  const rounds = useMemo(() => {
    const map = new Map<number, { label: string; ties: ConfrontoTie[] }>();
    for (const t of ties) {
      if (!map.has(t.round_order)) map.set(t.round_order, { label: t.round_label, ties: [] });
      map.get(t.round_order)!.ties.push(t);
    }
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  }, [ties]);

  return (
    <div className="space-y-3">
      {rounds.map((r, i) => (
        <div key={i}>
          <h4 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
            {r.label}
          </h4>
          <div className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
            <ul className="divide-y divide-ink-100">
              {r.ties.map((t) => (
                <li key={t.id}>
                  <TieRow tie={t} currentUserId={currentUserId} onClick={() => onOpenTie(t)} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Meu confronto (período atual) ---------------- */
export function MyConfrontoCard({
  ties,
  currentUserId,
  onOpen,
}: {
  ties: ConfrontoTie[];
  currentUserId?: string;
  onOpen: (t: ConfrontoTie) => void;
}) {
  const mine = useMemo(() => {
    const mineTies = ties.filter(
      (t) => t.member_a === currentUserId || t.member_b === currentUserId,
    );
    if (mineTies.length === 0) return null;
    // o atual: primeiro não resolvido; senão o último resolvido
    return mineTies.find((t) => !t.resolved && t.member_b) ?? mineTies[mineTies.length - 1]!;
  }, [ties, currentUserId]);

  if (!currentUserId || !mine) return null;
  const iAmA = mine.member_a === currentUserId;
  const meName = iAmA ? mine.name_a : mine.name_b;
  const meAv = iAmA ? mine.avatar_a : mine.avatar_b;
  const mePts = iAmA ? mine.pa : mine.pb;
  const opName = iAmA ? mine.name_b : mine.name_a;
  const opAv = iAmA ? mine.avatar_b : mine.avatar_a;
  const opPts = iAmA ? mine.pb : mine.pa;
  const bye = mine.member_b === null;

  let statusTxt = "Confronto em andamento";
  let statusTone = "text-ink-400";
  if (bye) {
    statusTxt = "Você passou direto (bye)";
  } else if (mine.resolved) {
    if (mine.winner === currentUserId) {
      statusTxt = mine.walkover ? "Você venceu (W.O.)" : "Você venceu!";
      statusTone = "text-grass-600";
    } else if (mine.winner === null) {
      statusTxt = "Empate";
    } else {
      statusTxt = mine.walkover ? "Você perdeu (W.O.)" : "Você perdeu";
      statusTone = "text-flame-600";
    }
  } else if (mePts > opPts) {
    statusTxt = "Você está ganhando";
    statusTone = "text-grass-600";
  } else if (opPts > mePts) {
    statusTxt = "Você está perdendo";
    statusTone = "text-flame-600";
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(mine)}
      className="w-full rounded-lg bg-brand-600 p-4 text-left text-white shadow-[var(--shadow-brand)] transition-transform active:scale-[0.99]"
    >
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-white/80">
        <span className="inline-flex items-center gap-1">
          <Swords className="size-3.5" /> Seu confronto · {mine.round_label}
        </span>
        <span className="inline-flex items-center gap-1">
          {statusTxt} <ChevronRight className="size-3.5" />
        </span>
      </div>
      {bye ? (
        <p className="text-center text-sm font-medium">
          Sem adversário nesta fase. Você avança direto.
        </p>
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <Avatar src={meAv} name={meName} size="md" />
            <span className="truncate text-xs font-semibold">você</span>
          </div>
          <div className="flex shrink-0 items-center gap-2 text-3xl font-extrabold tabular-nums">
            <span>{mePts}</span>
            <span className="text-base font-bold text-white/60">×</span>
            <span>{opPts}</span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <Avatar src={opAv} name={opName} size="md" />
            <span className="truncate text-xs font-medium text-white/90">{opName}</span>
          </div>
        </div>
      )}
    </button>
  );
}

/* ---------------- Detalhe (jogo a jogo) ---------------- */
export function TieDetailModal({
  tie,
  currentUserId,
  onClose,
}: {
  tie: ConfrontoTie | null;
  currentUserId?: string;
  onClose: () => void;
}) {
  const { data: rows, isLoading } = useTieDetail(tie?.id, !!tie);
  if (!tie) return null;
  const iAmA = tie.member_a === currentUserId;

  return (
    <Modal open={!!tie} onClose={onClose} label={tie.round_label}>
      <div className="space-y-3 p-5">
        <h2 className="pr-8 text-lg font-extrabold tracking-tight text-ink-950">{tie.round_label}</h2>
        <div className="flex items-center justify-between gap-2 rounded-md bg-surface-2 p-2.5">
          <span className="flex min-w-0 items-center gap-1.5">
            <Avatar src={tie.avatar_a} name={tie.name_a} size="xs" />
            <span className={cn("truncate text-sm", iAmA ? "font-bold text-brand-700" : "font-medium text-ink-700")}>
              {tie.name_a} {iAmA && "(você)"}
            </span>
          </span>
          <span className="shrink-0 text-base font-extrabold tabular-nums text-ink-950">
            {tie.pa} <span className="text-ink-300">×</span> {tie.pb}
          </span>
          <span className="flex min-w-0 flex-row-reverse items-center gap-1.5">
            <Avatar src={tie.avatar_b} name={tie.name_b} size="xs" />
            <span className={cn("truncate text-sm", !iAmA && currentUserId === tie.member_b ? "font-bold text-brand-700" : "font-medium text-ink-700")}>
              {tie.name_b} {currentUserId === tie.member_b && "(você)"}
            </span>
          </span>
        </div>

        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : !rows || rows.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-400">Sem jogos neste período.</p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md ring-1 ring-border">
            {rows.map((m) => (
              <li key={m.match_id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-3 py-2 text-xs">
                <Palpite home={m.a_home} away={m.a_away} pts={m.a_pts} joker={m.a_joker} palpitou={m.a_palpitou} align="left" />
                <div className="flex flex-col items-center">
                  <span className="whitespace-nowrap font-semibold text-ink-700">
                    {m.home_name} <span className="text-ink-300">x</span> {m.away_name}
                  </span>
                  <span className="text-[11px] tabular-nums text-ink-400">
                    {m.home_score != null ? `${m.home_score} × ${m.away_score}` : "a jogar"}
                  </span>
                </div>
                <Palpite home={m.b_home} away={m.b_away} pts={m.b_pts} joker={m.b_joker} palpitou={m.b_palpitou} align="right" />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function Palpite({
  home,
  away,
  pts,
  joker,
  palpitou,
  align,
}: {
  home: number | null;
  away: number | null;
  pts: number | null;
  joker: boolean;
  palpitou: boolean;
  align: "left" | "right";
}) {
  const revealed = home != null && away != null;

  // Antes do jogo começar o palpite do adversário fica escondido: só dizemos se
  // a pessoa palpitou ou não (sem revelar placar/pontos/joker).
  if (!revealed) {
    return (
      <div className={cn("flex items-center gap-1.5", align === "right" ? "flex-row-reverse" : "")}>
        {palpitou ? (
          <span
            className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5 font-semibold text-ink-400"
            title="Palpite escondido até o jogo começar"
          >
            <Lock className="size-3" /> palpitou
          </span>
        ) : (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium text-ink-300">
            sem palpite
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5", align === "right" ? "flex-row-reverse" : "")}>
      <span className="rounded bg-surface-2 px-1.5 py-0.5 font-bold tabular-nums text-ink-700">
        {home}×{away}
      </span>
      <span
        className={cn(
          "rounded-pill px-1.5 text-[10px] font-bold tabular-nums",
          (pts ?? 0) > 0 ? "bg-grass-100 text-grass-800" : "bg-ink-100 text-ink-400",
        )}
      >
        +{pts ?? 0}
        {joker && "·2×"}
      </span>
    </div>
  );
}

/* ---------------- Chaveamento (Copa) ---------------- */
export function CopaBracket({
  ties,
  currentUserId,
  onOpenTie,
}: {
  ties: ConfrontoTie[];
  currentUserId?: string;
  onOpenTie: (t: ConfrontoTie) => void;
}) {
  const rounds = useMemo(() => {
    const map = new Map<number, { label: string; ties: ConfrontoTie[] }>();
    for (const t of ties) {
      if (!map.has(t.round_order)) map.set(t.round_order, { label: t.round_label, ties: [] });
      map.get(t.round_order)!.ties.push(t);
    }
    return [...map.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => ({ ...v, ties: v.ties.sort((a, b) => a.slot - b.slot) }));
  }, [ties]);

  return (
    <div className="no-scrollbar overflow-x-auto pb-2">
      <div className="flex gap-3" style={{ minWidth: rounds.length * 180 }}>
        {rounds.map((r, i) => (
          <div key={i} className="flex min-w-[168px] flex-1 flex-col justify-around gap-3">
            <h4 className="text-center text-xs font-bold uppercase tracking-wide text-ink-400">
              {r.label}
            </h4>
            <div className="flex flex-1 flex-col justify-around gap-3">
              {r.ties.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onOpenTie(t)}
                  className={cn(
                    "rounded-md bg-surface p-2 text-left shadow-[var(--shadow-soft)] ring-1 ring-border transition-colors hover:ring-brand-400",
                    (t.member_a === currentUserId || t.member_b === currentUserId) &&
                      "ring-brand-500/40",
                  )}
                >
                  <BracketSide
                    name={t.name_a}
                    avatar={t.avatar_a}
                    pts={t.pa}
                    win={t.resolved && t.winner === t.member_a}
                    me={t.member_a === currentUserId}
                  />
                  <div className="my-1 h-px bg-ink-100" />
                  <BracketSide
                    name={t.member_b ? t.name_b : "—"}
                    avatar={t.avatar_b}
                    pts={t.pb}
                    win={t.resolved && t.winner === t.member_b}
                    me={t.member_b === currentUserId}
                  />
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BracketSide({
  name,
  avatar,
  pts,
  win,
  me,
}: {
  name: string | null;
  avatar: string | null;
  pts: number;
  win: boolean;
  me: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Avatar src={avatar} name={name} size="xs" />
      <span
        className={cn("min-w-0 flex-1 truncate text-xs", win ? "font-bold text-ink-950" : "text-ink-500")}
      >
        {name ?? "a definir"}
        {me && <span className="ml-1 text-brand-600">•</span>}
      </span>
      <span className={cn("text-xs font-bold tabular-nums", win ? "text-brand-700" : "text-ink-400")}>
        {pts}
      </span>
    </div>
  );
}
