import { useState } from "react";
import { Swords, Trophy, ListOrdered, Dices, RotateCcw, Check, TriangleAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { simulate } from "./simulator";
import {
  useConfrontoTies,
  useDrawConfronto,
  useUndoDraw,
  type ConfrontoFormato,
  type ConfrontoTie,
} from "./api";
import { LigaTable, ConfrontoRounds, CopaBracket, MyConfrontoCard, TieDetailModal } from "./ConfrontoViews";

export function ConfrontoSection({
  lcId,
  leagueId,
  competitionId,
  mode,
  state,
  memberCount,
  isAdmin,
  currentUserId,
}: {
  lcId: string;
  leagueId: string;
  competitionId: string;
  mode: string; // 'liga' | 'cup'
  state: string; // 'draft' | 'drawn' | 'finished'
  memberCount: number;
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const formato: ConfrontoFormato = mode === "cup" ? "cup" : "liga";

  if (state !== "drawn" && state !== "finished") {
    return (
      <SorteioPanel
        lcId={lcId}
        leagueId={leagueId}
        competitionId={competitionId}
        formato={formato}
        memberCount={memberCount}
        isAdmin={isAdmin}
      />
    );
  }
  return (
    <DrawnView
      lcId={lcId}
      leagueId={leagueId}
      formato={formato}
      isAdmin={isAdmin}
      currentUserId={currentUserId}
    />
  );
}

/* -------------------- Rascunho: simular + sortear -------------------- */
function SorteioPanel({
  lcId,
  leagueId,
  competitionId,
  formato,
  memberCount,
  isAdmin,
}: {
  lcId: string;
  leagueId: string;
  competitionId: string;
  formato: ConfrontoFormato;
  memberCount: number;
  isAdmin: boolean;
}) {
  const { toast } = useToast();
  const draw = useDrawConfronto();
  const [confirm, setConfirm] = useState(false);

  const sim = simulate(formato === "cup" ? "copa" : "liga", Math.max(2, memberCount), "bloco");
  const Icon = formato === "cup" ? Trophy : ListOrdered;

  const doDraw = () =>
    draw.mutate(
      { lcId, leagueId, competitionId, formato },
      {
        onSuccess: (r) => {
          toast(`Sorteado! ${r.ties} confrontos entre ${r.participants} jogadores.`, "success");
          setConfirm(false);
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Erro ao sortear.", "error"),
      },
    );

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-600">
            <Icon className="size-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink-950">
              {formato === "cup" ? "Copa (mata-mata)" : "Liga (todos contra todos)"}
            </p>
            <p className="text-sm text-ink-500">
              {memberCount} {memberCount === 1 ? "jogador" : "jogadores"} · {sim.formato} ·{" "}
              {sim.rounds.length} rodadas
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold",
              sim.viavel ? "bg-grass-100 text-grass-800" : "bg-flame-100 text-flame-700",
            )}
          >
            {sim.viavel ? <Check className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
            {sim.viavel ? "Cabe na Copa" : "Não cabe"}
          </span>
        </div>
        {sim.aviso && (
          <p className="mt-3 rounded-md bg-brand-500/10 px-3 py-2 text-xs leading-relaxed text-brand-700">
            {sim.aviso}
          </p>
        )}
      </div>

      {isAdmin ? (
        <>
          <Button fullWidth disabled={memberCount < 2} onClick={() => setConfirm(true)}>
            <Dices className="size-4" /> Sortear confrontos
          </Button>
          {memberCount < 2 && (
            <p className="px-1 text-center text-xs text-ink-400">
              Você precisa de pelo menos 2 participantes para sortear.
            </p>
          )}
        </>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-md bg-surface-2 px-3 py-3 text-sm text-ink-500">
          <Clock className="size-4" /> Aguardando o administrador sortear os confrontos.
        </div>
      )}

      <Modal open={confirm} onClose={() => setConfirm(false)} label="Sortear confrontos?">
        <div className="space-y-4 p-5">
          <h2 className="pr-8 text-lg font-extrabold tracking-tight text-ink-950">
            Sortear confrontos?
          </h2>
          <p className="text-sm leading-relaxed text-ink-600">
            O sorteio vai <span className="font-bold text-ink-900">travar os {memberCount} participantes</span>{" "}
            atuais e montar os confrontos. Quem entrar na federação depois{" "}
            <span className="font-semibold">não joga</span> esta {formato === "cup" ? "Copa" : "Liga"}.
          </p>
          <p className="rounded-md bg-brand-500/10 px-3 py-2 text-xs text-brand-700">
            Tranquilo: você pode <span className="font-semibold">refazer ou desfazer</span> o sorteio
            enquanto nenhuma rodada começar.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" fullWidth onClick={() => setConfirm(false)}>
              Cancelar
            </Button>
            <Button fullWidth loading={draw.isPending} onClick={doDraw}>
              <Dices className="size-4" /> Sortear
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* -------------------- Sorteada: visões -------------------- */
function DrawnView({
  lcId,
  leagueId,
  formato,
  isAdmin,
  currentUserId,
}: {
  lcId: string;
  leagueId: string;
  formato: ConfrontoFormato;
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const { toast } = useToast();
  const { data: ties, isLoading } = useConfrontoTies(lcId);
  const undo = useUndoDraw();
  const [openTie, setOpenTie] = useState<ConfrontoTie | null>(null);
  const [tab, setTab] = useState<"tabela" | "rodadas">("tabela");

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  const list = ties ?? [];
  const started = list.some((t) => t.resolved);

  return (
    <div className="space-y-4">
      <MyConfrontoCard ties={list} currentUserId={currentUserId} onOpen={setOpenTie} />

      {formato === "cup" ? (
        <div>
          <h4 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
            Chaveamento
          </h4>
          <CopaBracket ties={list} currentUserId={currentUserId} onOpenTie={setOpenTie} />
        </div>
      ) : (
        <>
          <div className="inline-flex rounded-pill bg-ink-100 p-0.5 text-sm font-semibold">
            {(["tabela", "rodadas"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-pill px-3 py-1 transition-colors",
                  tab === t ? "bg-surface text-brand-700 shadow-[var(--shadow-soft)]" : "text-ink-500",
                )}
              >
                {t === "tabela" ? "Classificação" : "Rodadas"}
              </button>
            ))}
          </div>
          {tab === "tabela" ? (
            <LigaTable lcId={lcId} currentUserId={currentUserId} />
          ) : (
            <ConfrontoRounds ties={list} currentUserId={currentUserId} onOpenTie={setOpenTie} />
          )}
        </>
      )}

      {isAdmin && !started && (
        <button
          type="button"
          onClick={() =>
            undo.mutate(
              { lcId, leagueId },
              {
                onSuccess: () => toast("Sorteio desfeito. Você pode ajustar e sortear de novo.", "info"),
                onError: (e) => toast(e instanceof Error ? e.message : "Erro ao desfazer.", "error"),
              },
            )
          }
          disabled={undo.isPending}
          className="inline-flex items-center gap-1.5 px-1 py-1 text-[11px] font-semibold text-ink-400 transition-colors hover:text-flame-600 disabled:opacity-50"
        >
          <RotateCcw className={cn("size-3.5", undo.isPending && "animate-spin")} /> Desfazer sorteio
        </button>
      )}

      <TieDetailModal tie={openTie} currentUserId={currentUserId} onClose={() => setOpenTie(null)} />
    </div>
  );
}
