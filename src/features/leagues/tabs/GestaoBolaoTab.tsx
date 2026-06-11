import { useState } from "react";
import { HandCoins, Info, Lock, LockOpen, Trophy } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/pricing";
import { computePot, splitTotal, type PotSplit } from "../potMath";
import {
  usePotPayers,
  useTogglePotPayer,
  useUpdatePotSettings,
  useTogglePotLock,
  useLeagueMembers,
} from "../api";

const PRESETS: { label: string; split: PotSplit }[] = [
  { label: "100 · 0 · 0", split: { 1: 100, 2: 0, 3: 0 } },
  { label: "70 · 20 · 10", split: { 1: 70, 2: 20, 3: 10 } },
  { label: "60 · 30 · 10", split: { 1: 60, 2: 30, 3: 10 } },
  { label: "50 · 30 · 20", split: { 1: 50, 2: 30, 3: 20 } },
];

type PotLc = {
  id: string;
  pot_enabled?: boolean | null;
  pot_entry_cents?: number | null;
  pot_split?: Record<string, number> | null;
  pot_locked?: boolean | null;
};

/** Gestão do Bolão (ADR 0008): a caixinha que o grupo organiza POR FORA.
 * O app não recebe, não guarda e não repassa dinheiro — só registra o combinado
 * (valor, pagantes, rateio) e faz a conta. Admin edita; dono trava/destrava. */
export function GestaoBolaoTab({
  leagueId,
  lc,
  isAdmin,
  isOwner,
  currentUserId,
}: {
  leagueId: string;
  lc: PotLc;
  isAdmin: boolean;
  isOwner: boolean;
  currentUserId?: string;
}) {
  const { toast } = useToast();
  const { data: members } = useLeagueMembers(leagueId);
  const payers = usePotPayers(lc.id);
  const togglePayer = useTogglePotPayer();
  const updatePot = useUpdatePotSettings();
  const toggleLock = useTogglePotLock();

  const enabled = lc.pot_enabled === true;
  const locked = lc.pot_locked === true;
  const savedSplit = (lc.pot_split ?? {}) as Partial<PotSplit>;
  const paidSet = payers.data ?? new Set<string>();

  // edição local (espelho do salvo; salva no blur/ação)
  const [entryStr, setEntryStr] = useState(
    lc.pot_entry_cents ? String(lc.pot_entry_cents / 100) : "",
  );
  const [split, setSplit] = useState<PotSplit>({
    1: Number(savedSplit[1] ?? 0),
    2: Number(savedSplit[2] ?? 0),
    3: Number(savedSplit[3] ?? 0),
  });

  const activeMembers = (members ?? []).filter((m) => m.status === "active");
  const entryCents = Math.round((parseFloat(entryStr.replace(",", ".")) || 0) * 100);
  const pot = computePot(entryCents, paidSet.size, split);
  const pctTotal = splitTotal(split);
  const canEdit = isAdmin && !locked;

  const onError = (e: unknown) => toast(e instanceof Error ? e.message : "Erro.", "error");

  function saveSettings(patch: { entryCents?: number | null; split?: PotSplit }) {
    updatePot.mutate(
      { leagueId, lcId: lc.id, ...patch },
      { onSuccess: () => toast("Salvo!", "success"), onError },
    );
  }

  const disclaimer = (
    <p className="flex items-start gap-2 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-ink-600">
      <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
      <span>
        O pagamento do bolão <strong>não passa pelo Resultadismo</strong>: ele é combinado e
        organizado pelo próprio grupo (Pix entre amigos, dinheiro, como preferirem). Aqui a gente só
        ajuda no registro de quem pagou e na conta do rateio.
      </span>
    </p>
  );

  if (!enabled && !isAdmin) {
    return (
      <div className="space-y-3">
        <p className="rounded-md bg-surface-2 px-3 py-4 text-center text-sm text-ink-500">
          O grupo ainda não ativou a Gestão do Bolão. Fala com o admin!
        </p>
        {disclaimer}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Ativar (admin) */}
      {isAdmin && (
        <Card className="flex items-center gap-3 p-4">
          <HandCoins className="size-5 shrink-0 text-brand-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">Gestão do Bolão</p>
            <p className="text-xs text-ink-500">
              Registre o valor combinado, marque quem pagou e o app calcula a divisão.
            </p>
          </div>
          <Switch
            checked={enabled}
            onChange={(v) =>
              updatePot.mutate({ leagueId, lcId: lc.id, enabled: v }, { onError })
            }
            disabled={locked}
            label="Ativar Gestão do Bolão"
          />
        </Card>
      )}

      {enabled && (
        <>
          {/* Definições */}
          <Card className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink-800">Definições</p>
              {locked && (
                <span className="inline-flex items-center gap-1 rounded-pill bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-500">
                  <Lock className="size-3" /> travado pelo dono
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pot-entry" className="text-xs font-medium text-ink-700">
                Valor por pessoa (R$)
              </label>
              <input
                id="pot-entry"
                inputMode="decimal"
                value={entryStr}
                disabled={!canEdit}
                onChange={(e) => setEntryStr(e.target.value)}
                onBlur={() => canEdit && saveSettings({ entryCents: entryCents > 0 ? entryCents : null })}
                placeholder="Ex.: 20"
                className="h-11 w-32 rounded-md border border-ink-200 bg-surface px-3 text-ink-950 outline-none focus:border-brand-500 disabled:opacity-50"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-700">Divisão do prêmio (1º · 2º · 3º)</p>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => {
                  const on = split[1] === p.split[1] && split[2] === p.split[2] && split[3] === p.split[3];
                  return (
                    <button
                      key={p.label}
                      type="button"
                      disabled={!canEdit}
                      onClick={() => {
                        setSplit(p.split);
                        saveSettings({ split: p.split });
                      }}
                      className={cn(
                        "rounded-pill px-2.5 py-1 text-xs font-semibold transition-colors disabled:opacity-50",
                        on ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200",
                      )}
                    >
                      {p.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                {([1, 2, 3] as const).map((rank) => (
                  <label key={rank} className="flex flex-col gap-1 text-[11px] font-medium text-ink-600">
                    {rank}º (%)
                    <input
                      inputMode="numeric"
                      value={split[rank] || ""}
                      disabled={!canEdit}
                      onChange={(e) =>
                        setSplit((s) => ({ ...s, [rank]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))
                      }
                      onBlur={() => canEdit && pctTotal <= 100 && saveSettings({ split })}
                      className="h-10 w-16 rounded-md border border-ink-200 bg-surface px-2 text-center text-ink-950 outline-none focus:border-brand-500 disabled:opacity-50"
                    />
                  </label>
                ))}
              </div>
              {pctTotal > 100 ? (
                <p className="text-xs font-medium text-flame-600">
                  A soma passou de 100% ({pctTotal}%). Ajuste antes de salvar.
                </p>
              ) : pctTotal < 100 ? (
                <p className="text-xs text-ink-400">
                  Sobram {100 - pctTotal}% no caixa do grupo (churrasco?).
                </p>
              ) : null}
            </div>
          </Card>

          {/* Pagantes (admin marca; todos veem) */}
          <Card className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink-800">Quem pagou</p>
              <span className="text-xs text-ink-400">
                {paidSet.size} de {activeMembers.length}
              </span>
            </div>
            <ul className="space-y-1">
              {activeMembers.map((m) => {
                const uid = m.profile?.id as string;
                const paid = paidSet.has(uid);
                return (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <Avatar src={m.profile?.avatar_url} name={m.profile?.display_name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                      {m.profile?.display_name}
                    </span>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() =>
                          togglePayer.mutate(
                            { lcId: lc.id, userId: uid, paid: !paid, markedBy: currentUserId ?? uid },
                            { onError },
                          )
                        }
                        aria-pressed={paid}
                        className={cn(
                          "rounded-pill px-2.5 py-1 text-xs font-bold transition-colors",
                          paid ? "bg-grass-600 text-white" : "bg-ink-100 text-ink-500 hover:bg-ink-200",
                        )}
                      >
                        {paid ? "pagou" : "marcar"}
                      </button>
                    ) : (
                      paid && (
                        <span className="rounded-pill bg-grass-600 px-2.5 py-1 text-xs font-bold text-white">
                          pagou
                        </span>
                      )
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Pote + prêmios */}
          <Card className="space-y-2 p-4">
            <p className="text-sm font-semibold text-ink-800">Premiação</p>
            <p className="text-2xl font-extrabold tabular-nums text-ink-950">
              {formatBRL(pot.totalCents)}
              <span className="ml-2 text-xs font-medium text-ink-400">
                ({paidSet.size} {paidSet.size === 1 ? "pagante" : "pagantes"} × {formatBRL(entryCents)})
              </span>
            </p>
            <ul className="space-y-1 text-sm">
              {pot.prizes.map((p) => (
                <li key={p.rank} className="flex items-center gap-2">
                  <Trophy
                    className={cn(
                      "size-4",
                      p.rank === 1 && "text-gold-600",
                      p.rank === 2 && "text-ink-400",
                      p.rank === 3 && "text-[#b08d57]",
                    )}
                  />
                  <span className="flex-1 text-ink-700">
                    {p.rank}º lugar ({p.pct}%)
                  </span>
                  <span className="font-bold tabular-nums text-ink-950">{formatBRL(p.cents)}</span>
                </li>
              ))}
              {pot.leftoverCents > 0 && (
                <li className="flex items-center gap-2 text-xs text-ink-400">
                  <span className="flex-1">Sobra no caixa do grupo</span>
                  <span className="tabular-nums">{formatBRL(pot.leftoverCents)}</span>
                </li>
              )}
            </ul>
            <p className="text-[11px] leading-relaxed text-ink-400">
              O prêmio é disputado só entre os pagantes, pela classificação oficial do grupo
              (empates seguem o desempate do app). Veja quem está levando na aba Classificação.
            </p>
          </Card>

          {/* Trava do dono */}
          {isOwner && (
            <Button
              variant="outline"
              fullWidth
              loading={toggleLock.isPending}
              onClick={() =>
                toggleLock.mutate(
                  { leagueId, lcId: lc.id, locked: !locked },
                  {
                    onSuccess: () =>
                      toast(locked ? "Gestão destravada." : "Gestão travada!", "success"),
                    onError,
                  },
                )
              }
            >
              {locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
              {locked ? "Destravar definições" : "Travar definições"}
            </Button>
          )}
          {isOwner && !locked && (
            <p className="px-1 text-center text-xs text-ink-400">
              Dica: trave antes de a Copa começar, pra ninguém mudar a regra no meio.
            </p>
          )}

          {disclaimer}
        </>
      )}

      {!enabled && isAdmin && disclaimer}
    </div>
  );
}
