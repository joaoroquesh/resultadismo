import { useEffect, useState } from "react";
import {
  Trophy,
  ListOrdered,
  Dices,
  RotateCcw,
  Check,
  TriangleAlert,
  Clock,
  Minus,
  Plus,
  Users,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { MAX_JOGADORES } from "./simulator";
import { roundsNeeded } from "./build";
import {
  useConfrontoTies,
  useConfrontoPeriods,
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

/* -------------------- Rascunho: simular, configurar e sortear -------------------- */
function ligaRoundLabel(rounds: number, fullTurno: number): string {
  if (rounds < fullTurno) return "turno parcial — nem todos se enfrentam";
  if (rounds === fullTurno) return "turno completo — todos contra todos";
  return "turno e returno — todos se enfrentam mais de uma vez";
}

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
  const { data: periods, isLoading: loadingPeriods } = useConfrontoPeriods(competitionId);
  const [confirm, setConfirm] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testN, setTestN] = useState(Math.max(2, memberCount));

  const isLiga = formato === "liga";
  const n = Math.max(2, memberCount);
  const P = periods?.length ?? 0;
  const fullTurno = Math.max(1, n - 1);
  const defaultRounds = Math.min(fullTurno, P || fullTurno);
  const [rounds, setRounds] = useState(defaultRounds);

  // Mantém o nº de rodadas dentro de [1, P] quando períodos/membros chegam.
  useEffect(() => {
    if (!P) return;
    setRounds((r) => Math.min(Math.max(1, r || defaultRounds), P));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [P, fullTurno]);

  // Estrutura real (com os participantes atuais).
  const realRounds = isLiga ? rounds : roundsNeeded("cup", n);
  const viavel = P > 0 && realRounds <= P;
  const confrontosPorRodada = Math.floor(n / 2);
  const Icon = formato === "cup" ? Trophy : ListOrdered;

  // Preview de teste (hipotético — só simulação, não altera o sorteio real).
  const testRounds = roundsNeeded(isLiga ? "liga" : "cup", testN);
  const testViavel = P > 0 && (isLiga ? Math.min(testRounds, P) : testRounds) <= P;

  const doDraw = () =>
    draw.mutate(
      { lcId, leagueId, competitionId, formato, rounds: isLiga ? rounds : undefined },
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
      {/* Formato + viabilidade */}
      <div className="rounded-lg bg-surface p-4 shadow-[var(--shadow-soft)] ring-1 ring-border">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-600">
            <Icon className="size-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-ink-950">
              {isLiga ? "Liga (todos contra todos)" : "Copa (mata-mata)"}
            </p>
            <p className="text-sm text-ink-500">
              {n} {n === 1 ? "jogador" : "jogadores"} · {realRounds}{" "}
              {realRounds === 1 ? "rodada" : "rodadas"}
              {!isLiga && " · mata-mata"}
            </p>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold",
              viavel ? "bg-grass-100 text-grass-800" : "bg-flame-100 text-flame-700",
            )}
          >
            {viavel ? <Check className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
            {viavel ? "Cabe na competição" : "Não cabe"}
          </span>
        </div>

        {/* Configurar rodadas (só Liga) */}
        {isLiga && P > 0 && (
          <div className="mt-4 border-t border-ink-100 pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-800">Rodadas</p>
                <p className="text-xs text-ink-500">{ligaRoundLabel(rounds, fullTurno)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Menos rodadas"
                  onClick={() => setRounds((r) => Math.max(1, r - 1))}
                  disabled={rounds <= 1}
                  className="grid size-8 place-items-center rounded-md text-ink-600 ring-1 ring-border transition-colors hover:bg-ink-100 disabled:opacity-40"
                >
                  <Minus className="size-4" />
                </button>
                <span className="w-7 text-center text-lg font-extrabold tabular-nums text-ink-950">
                  {rounds}
                </span>
                <button
                  type="button"
                  aria-label="Mais rodadas"
                  onClick={() => setRounds((r) => Math.min(P, r + 1))}
                  disabled={rounds >= P}
                  className="grid size-8 place-items-center rounded-md text-ink-600 ring-1 ring-border transition-colors hover:bg-ink-100 disabled:opacity-40"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-ink-400">
              {confrontosPorRodada} {confrontosPorRodada === 1 ? "confronto" : "confrontos"} por rodada
              {" · "}máx. {P} {P === 1 ? "rodada" : "rodadas"} (períodos da competição)
            </p>
          </div>
        )}

        {!viavel && P > 0 && (
          <p className="mt-3 rounded-md bg-flame-50 px-3 py-2 text-xs leading-relaxed text-flame-700">
            {isLiga
              ? `Reduza as rodadas — a competição só tem ${P} períodos.`
              : `A Copa precisa de ${realRounds} fases e a competição só tem ${P} períodos. Use uma competição com mais rodadas.`}
          </p>
        )}
        {P === 0 && !loadingPeriods && (
          <p className="mt-3 rounded-md bg-brand-500/10 px-3 py-2 text-xs text-brand-700">
            A competição ainda não tem rodadas (matchdays) para o sorteio.
          </p>
        )}
      </div>

      {/* Testar com mais jogadores (só simulação) */}
      <div className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
        <button
          type="button"
          onClick={() => setTestOpen((v) => !v)}
          aria-expanded={testOpen}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-ink-700"
        >
          <span className="inline-flex items-center gap-2">
            <Users className="size-4 text-brand-600" /> Testar com mais jogadores
          </span>
          <ChevronDown className={cn("size-4 transition-transform", testOpen && "rotate-180")} />
        </button>
        {testOpen && (
          <div className="space-y-2 border-t border-ink-100 px-4 py-3">
            <p className="text-xs text-ink-500">Só simulação — não altera o sorteio real.</p>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={2}
                max={MAX_JOGADORES}
                value={testN}
                onChange={(e) => setTestN(Number(e.target.value))}
                className="h-1.5 flex-1 accent-brand-600"
                aria-label="Jogadores no teste"
              />
              <span className="w-16 text-right text-sm font-bold tabular-nums text-ink-900">
                {testN} jog.
              </span>
            </div>
            <p className="text-xs leading-relaxed text-ink-600">
              {isLiga
                ? `Turno completo: ${Math.max(1, testN - 1)} rodadas · ${Math.floor(testN / 2)} confrontos por rodada.`
                : `Mata-mata: ${testRounds} fases (chave de ${1 << testRounds}).`}{" "}
              <span className={testViavel ? "text-grass-700" : "text-flame-600"}>
                {P === 0 ? "" : testViavel ? "Cabe na competição." : `Não cabe nos ${P} períodos.`}
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Ação */}
      {isAdmin ? (
        <>
          <Button fullWidth disabled={memberCount < 2 || !viavel} onClick={() => setConfirm(true)}>
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
            Vou travar os <span className="font-bold text-ink-900">{memberCount} participantes</span>{" "}
            atuais e montar{" "}
            {isLiga ? (
              <>
                <span className="font-bold text-ink-900">{rounds} rodadas</span> de Liga
              </>
            ) : (
              "o chaveamento da Copa"
            )}
            . Quem entrar na federação depois <span className="font-semibold">não joga</span> esta{" "}
            {isLiga ? "Liga" : "Copa"}.
          </p>
          <p className="rounded-md bg-brand-500/10 px-3 py-2 text-xs text-brand-700">
            Tranquilo: dá pra <span className="font-semibold">refazer ou desfazer</span> o sorteio
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
