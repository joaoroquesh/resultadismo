import { useState } from "react";
import { Check, Clock, Copy, HandCoins, Info, Lock, LockOpen, QrCode, Trophy } from "lucide-react";
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
  useDeclarePaid,
  useLeagueMembers,
  type MemberWithProfile,
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
  pot_pix_key?: string | null;
};

function Disclaimer() {
  return (
    <p className="flex items-start gap-2 rounded-md bg-surface-2 p-3 text-xs leading-relaxed text-ink-600">
      <Info className="mt-0.5 size-4 shrink-0 text-brand-600" />
      <span>
        O pagamento do bolão <strong>não passa pelo Resultadismo</strong>: é combinado e organizado
        pelo próprio grupo (Pix entre amigos, dinheiro, como preferirem). Aqui a gente só ajuda no
        registro de quem pagou e na conta do rateio.
      </span>
    </p>
  );
}

/** Pote total + prêmio por colocação (só entre pagantes CONFIRMADOS). */
function PrizesCard({
  entryCents,
  payersCount,
  split,
}: {
  entryCents: number;
  payersCount: number;
  split: Partial<PotSplit>;
}) {
  const pot = computePot(entryCents, payersCount, split);
  return (
    <Card className="space-y-2 p-4">
      <p className="text-sm font-semibold text-ink-800">Premiação</p>
      <p className="text-2xl font-extrabold tabular-nums text-ink-950">
        {formatBRL(pot.totalCents)}
        <span className="ml-2 text-xs font-medium text-ink-400">
          ({payersCount} {payersCount === 1 ? "pagante" : "pagantes"} × {formatBRL(entryCents)})
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
        O prêmio é disputado só entre os pagantes, pela classificação oficial do grupo (empates
        seguem o desempate do app). Veja quem está levando na aba Classificação.
      </p>
    </Card>
  );
}

/** Gestão do Bolão (ADR 0009): a caixinha que o grupo organiza POR FORA. O app
 * não recebe, não guarda e não repassa dinheiro — só registra o combinado e faz
 * a conta. Visão de DONO/admin = painel pra ajustar; visão de MEMBRO = informação
 * final + copiar a chave Pix + sinalizar que pagou (o dono confirma). */
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
  const { data: members } = useLeagueMembers(leagueId);
  const payers = usePotPayers(lc.id);
  const enabled = lc.pot_enabled === true;
  const confirmed = payers.data?.confirmed ?? new Set<string>();
  const pending = payers.data?.pending ?? new Set<string>();
  const activeMembers = (members ?? []).filter((m) => m.status === "active");

  if (!enabled && !isAdmin) {
    return (
      <div className="space-y-3">
        <p className="rounded-md bg-surface-2 px-3 py-4 text-center text-sm text-ink-500">
          O grupo ainda não ativou a Gestão do Bolão. Fala com o admin!
        </p>
        <Disclaimer />
      </div>
    );
  }

  if (isAdmin) {
    return (
      <OwnerView
        leagueId={leagueId}
        lc={lc}
        isOwner={isOwner}
        currentUserId={currentUserId}
        members={activeMembers}
        confirmed={confirmed}
        pending={pending}
      />
    );
  }

  return (
    <MemberView
      lc={lc}
      currentUserId={currentUserId}
      members={activeMembers}
      confirmed={confirmed}
      pending={pending}
    />
  );
}

// ── Visão DONO/admin: painel pra ajustar ───────────────────────────────────
function OwnerView({
  leagueId,
  lc,
  isOwner,
  currentUserId,
  members,
  confirmed,
  pending,
}: {
  leagueId: string;
  lc: PotLc;
  isOwner: boolean;
  currentUserId?: string;
  members: MemberWithProfile[];
  confirmed: Set<string>;
  pending: Set<string>;
}) {
  const { toast } = useToast();
  const updatePot = useUpdatePotSettings();
  const togglePayer = useTogglePotPayer();
  const toggleLock = useTogglePotLock();
  const onError = (e: unknown) => toast(e instanceof Error ? e.message : "Erro.", "error");

  const enabled = lc.pot_enabled === true;
  const locked = lc.pot_locked === true;
  const canEdit = !locked;
  const savedSplit = (lc.pot_split ?? {}) as Partial<PotSplit>;

  const [entryStr, setEntryStr] = useState(lc.pot_entry_cents ? String(lc.pot_entry_cents / 100) : "");
  const [pixStr, setPixStr] = useState(lc.pot_pix_key ?? "");
  const [split, setSplit] = useState<PotSplit>({
    1: Number(savedSplit[1] ?? 0),
    2: Number(savedSplit[2] ?? 0),
    3: Number(savedSplit[3] ?? 0),
  });

  const entryCents = Math.round((parseFloat(entryStr.replace(",", ".")) || 0) * 100);
  const pctTotal = splitTotal(split);

  function saveSettings(patch: { entryCents?: number | null; split?: PotSplit; pixKey?: string | null }) {
    updatePot.mutate({ leagueId, lcId: lc.id, ...patch }, { onSuccess: () => toast("Salvo!", "success"), onError });
  }
  const setPayer = (uid: string, paid: boolean) =>
    togglePayer.mutate({ lcId: lc.id, userId: uid, paid, markedBy: currentUserId ?? uid }, { onError });

  return (
    <div className="space-y-3">
      {/* Ativar */}
      <Card className="flex items-center gap-3 p-4">
        <HandCoins className="size-5 shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">Gestão do Bolão</p>
          <p className="text-xs text-ink-500">
            Registre o valor, a chave Pix e marque quem pagou — o app calcula o rateio.
          </p>
        </div>
        <Switch
          checked={enabled}
          onChange={(v) => updatePot.mutate({ leagueId, lcId: lc.id, enabled: v }, { onError })}
          disabled={locked}
          label="Ativar Gestão do Bolão"
        />
      </Card>

      {enabled && (
        <>
          {/* Definições: valor + divisão + chave Pix */}
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

            <div className="flex flex-col gap-1.5">
              <label htmlFor="pot-pix" className="flex items-center gap-1.5 text-xs font-medium text-ink-700">
                <QrCode className="size-3.5 text-brand-600" /> Chave Pix (pra galera pagar)
              </label>
              <input
                id="pot-pix"
                value={pixStr}
                disabled={!canEdit}
                onChange={(e) => setPixStr(e.target.value)}
                onBlur={() => canEdit && saveSettings({ pixKey: pixStr.trim() || null })}
                placeholder="CPF, e-mail, telefone ou chave aleatória"
                className="h-11 w-full rounded-md border border-ink-200 bg-surface px-3 text-ink-950 outline-none focus:border-brand-500 disabled:opacity-50"
              />
              <p className="text-[11px] leading-snug text-ink-400">
                Os membros veem e copiam essa chave pra fazer o Pix. O app não recebe nada — é só o
                contato do recebedor.
              </p>
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
                <p className="text-xs text-ink-400">Sobram {100 - pctTotal}% no caixa do grupo (churrasco?).</p>
              ) : null}
            </div>
          </Card>

          {/* Quem pagou — confirmado × sinalizado (pendente) */}
          <Card className="space-y-2 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink-800">Quem pagou</p>
              <span className="text-xs text-ink-400">
                {confirmed.size} de {members.length}
                {pending.size > 0 && ` · ${pending.size} sinalizou`}
              </span>
            </div>
            <ul className="space-y-1">
              {members.map((m) => {
                const uid = m.profile?.id as string;
                const isC = confirmed.has(uid);
                const isP = pending.has(uid);
                return (
                  <li key={m.id} className="flex items-center gap-2.5">
                    <Avatar src={m.profile?.avatar_url} name={m.profile?.display_name} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                      {m.profile?.display_name}
                    </span>
                    {canEdit ? (
                      isC ? (
                        <button
                          type="button"
                          onClick={() => setPayer(uid, false)}
                          className="inline-flex items-center gap-1 rounded-pill bg-grass-600 px-2.5 py-1 text-xs font-bold text-white"
                        >
                          <Check className="size-3" /> pagou
                        </button>
                      ) : isP ? (
                        <span className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPayer(uid, true)}
                            className="rounded-pill bg-grass-600 px-2.5 py-1 text-xs font-bold text-white"
                          >
                            confirmar
                          </button>
                          <button
                            type="button"
                            aria-label="Remover sinalização"
                            onClick={() => setPayer(uid, false)}
                            className="rounded-pill bg-ink-100 px-2 py-1 text-xs font-bold text-ink-500 hover:bg-ink-200"
                          >
                            ✕
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPayer(uid, true)}
                          className="rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-500 hover:bg-ink-200"
                        >
                          marcar
                        </button>
                      )
                    ) : isC ? (
                      <span className="rounded-pill bg-grass-600 px-2.5 py-1 text-xs font-bold text-white">pagou</span>
                    ) : isP ? (
                      <span className="rounded-pill bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-700">
                        sinalizou
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {pending.size > 0 && canEdit && (
              <p className="text-[11px] leading-snug text-ink-400">
                <strong>{pending.size}</strong> {pending.size === 1 ? "pessoa sinalizou" : "pessoas sinalizaram"} que
                pagou. Confira o Pix e toque em <strong>confirmar</strong> — só então conta no rateio.
              </p>
            )}
          </Card>

          <PrizesCard entryCents={entryCents} payersCount={confirmed.size} split={split} />

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
                    onSuccess: () => toast(locked ? "Gestão destravada." : "Gestão travada!", "success"),
                    onError,
                  },
                )
              }
            >
              {locked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
              {locked ? "Destravar definições" : "Travar definições"}
            </Button>
          )}

          <Disclaimer />
        </>
      )}

      {!enabled && <Disclaimer />}
    </div>
  );
}

// ── Visão MEMBRO: informação final + copiar Pix + sinalizar pago ────────────
function MemberView({
  lc,
  currentUserId,
  members,
  confirmed,
  pending,
}: {
  lc: PotLc;
  currentUserId?: string;
  members: MemberWithProfile[];
  confirmed: Set<string>;
  pending: Set<string>;
}) {
  const { toast } = useToast();
  const declare = useDeclarePaid();
  const onError = (e: unknown) => toast(e instanceof Error ? e.message : "Erro.", "error");

  const entryCents = lc.pot_entry_cents ?? 0;
  const split = (lc.pot_split ?? {}) as Partial<PotSplit>;
  const pix = (lc.pot_pix_key ?? "").trim();
  const locked = lc.pot_locked === true;
  const myId = currentUserId ?? "";
  const myState = confirmed.has(myId) ? "confirmed" : pending.has(myId) ? "pending" : "none";

  function copyPix() {
    navigator.clipboard.writeText(pix);
    toast("Chave Pix copiada!", "success");
  }
  const setMine = (d: boolean) =>
    declare.mutate(
      { lcId: lc.id, userId: myId, declare: d },
      { onSuccess: () => toast(d ? "Pagamento sinalizado!" : "Sinalização desfeita.", "success"), onError },
    );

  return (
    <div className="space-y-3">
      {/* Resumo: valor + divisão */}
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <HandCoins className="size-5 shrink-0 text-brand-600" />
          <p className="text-sm font-semibold text-ink-900">Bolão do grupo</p>
        </div>
        <p className="text-2xl font-extrabold tabular-nums text-ink-950">
          {formatBRL(entryCents)}
          <span className="ml-2 text-xs font-medium text-ink-400">por pessoa</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {([1, 2, 3] as const).map((rank) => (
            <span key={rank} className="rounded-pill bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600">
              {rank}º · {Math.max(0, Number(split[rank] ?? 0))}%
            </span>
          ))}
        </div>
      </Card>

      {/* Chave Pix (copiar) */}
      <Card className="space-y-2 p-4">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-800">
          <QrCode className="size-4 text-brand-600" /> Chave Pix do grupo
        </p>
        {pix ? (
          <>
            <button
              type="button"
              onClick={copyPix}
              className="flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-ink-200 px-3 py-2.5 text-left transition hover:bg-ink-50"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-sm font-semibold text-ink-900">
                {pix}
              </span>
              <Copy className="size-4 shrink-0 text-brand-600" />
            </button>
            <p className="text-[11px] leading-snug text-ink-400">
              Toque pra copiar e pague pelo seu banco. O dinheiro vai direto pro organizador — o app
              não recebe nada.
            </p>
          </>
        ) : (
          <p className="rounded-md bg-surface-2 px-3 py-2.5 text-sm text-ink-500">
            O dono ainda não cadastrou a chave Pix do grupo.
          </p>
        )}
      </Card>

      {/* Meu pagamento */}
      <Card className="space-y-2 p-4">
        <p className="text-sm font-semibold text-ink-800">Seu pagamento</p>
        {myState === "confirmed" ? (
          <p className="flex items-center gap-2 rounded-md bg-grass-50 px-3 py-2.5 text-sm font-medium text-grass-700">
            <Check className="size-4 shrink-0" /> Pagamento confirmado pelo dono.
          </p>
        ) : myState === "pending" ? (
          <>
            <p className="flex items-center gap-2 rounded-md bg-gold-100 px-3 py-2.5 text-sm font-medium text-gold-700">
              <Clock className="size-4 shrink-0" /> Você sinalizou que pagou. Aguardando o dono confirmar.
            </p>
            <Button variant="ghost" size="sm" loading={declare.isPending} onClick={() => setMine(false)}>
              Desfazer
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-600">
              Já fez o Pix? Avise o grupo — o dono confirma depois e você entra no rateio.
            </p>
            <Button fullWidth disabled={locked} loading={declare.isPending} onClick={() => setMine(true)}>
              <Check className="size-4" /> Já paguei
            </Button>
            {locked && (
              <p className="text-[11px] text-ink-400">A gestão está travada pelo dono no momento.</p>
            )}
          </>
        )}
      </Card>

      <PrizesCard entryCents={entryCents} payersCount={confirmed.size} split={split} />

      {/* Quem pagou (leitura) */}
      <Card className="space-y-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-ink-800">Quem pagou</p>
          <span className="text-xs text-ink-400">
            {confirmed.size} de {members.length}
          </span>
        </div>
        <ul className="space-y-1">
          {members.map((m) => {
            const uid = m.profile?.id as string;
            const isC = confirmed.has(uid);
            const isP = pending.has(uid);
            return (
              <li key={m.id} className="flex items-center gap-2.5">
                <Avatar src={m.profile?.avatar_url} name={m.profile?.display_name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-800">
                  {m.profile?.display_name}
                </span>
                {isC ? (
                  <span className="rounded-pill bg-grass-600 px-2.5 py-1 text-xs font-bold text-white">pagou</span>
                ) : isP ? (
                  <span className="rounded-pill bg-gold-100 px-2.5 py-1 text-xs font-bold text-gold-700">
                    sinalizou
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>

      <Disclaimer />
    </div>
  );
}
