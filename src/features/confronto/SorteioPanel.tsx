import { useMemo, useState } from "react";
import { Trophy, ListOrdered, Dices, Clock } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { supabase } from "@/lib/supabase";
import { useLeagueMembers } from "@/features/leagues/api";
import {
  confrontoViability,
  testViability,
  buildLigaFixtures,
  buildCopaFixtures,
  shuffleSeeded,
  type Period,
  type DrawTie,
  type LigaFmt,
} from "./build";
import {
  useConfrontoPeriods,
  useConfrontoOptins,
  useToggleOptin,
  useDrawConfronto,
  type ConfrontoFormato,
  type PeriodKind,
} from "./api";
import { ParticipantsCard } from "./sorteio/ParticipantsCard";
import { RoundsShapeCard } from "./sorteio/RoundsShapeCard";
import { FormatViabilityCard } from "./sorteio/FormatViabilityCard";
import { DrawPreviewCard } from "./sorteio/DrawPreviewCard";
import { TestPlayersCard } from "./sorteio/TestPlayersCard";
import { DrawConfirmModal } from "./sorteio/DrawConfirmModal";

/* -------------------- Rascunho: simular, configurar e sortear --------------------
 * Orquestrador: detém o estado e a derivação (participantes, viabilidade, prévia)
 * e compõe os cards de UI em ./sorteio. A matemática do sorteio vive em build.ts. */
export function SorteioPanel({
  lcId,
  leagueId,
  competitionId,
  formato,
  memberCount,
  isAdmin,
  participantMode = "admin",
  currentUserId,
}: {
  lcId: string;
  leagueId: string;
  competitionId: string;
  formato: ConfrontoFormato;
  memberCount: number;
  isAdmin: boolean;
  participantMode?: string;
  currentUserId?: string;
}) {
  const { toast } = useToast();
  const draw = useDrawConfronto();
  const isOptin = participantMode === "optin";
  const { data: optins } = useConfrontoOptins(lcId, isOptin);
  const toggleOptin = useToggleOptin();
  const [kind, setKind] = useState<PeriodKind>("phase");
  const { data: periods, isLoading: loadingPeriods } = useConfrontoPeriods(competitionId, kind);
  const [confirm, setConfirm] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testN, setTestN] = useState(Math.max(2, memberCount));
  const [drawWhen, setDrawWhen] = useState<"now" | "datetime" | "first">("now");
  const [drawAt, setDrawAt] = useState("");

  const isLiga = formato === "liga";
  const Icon = formato === "cup" ? Trophy : ListOrdered;

  // Membros ativos na ordem de entrada (= seed do sorteio).
  const { data: members } = useLeagueMembers(leagueId);
  const allPlayers = useMemo(() => {
    const active = (members ?? []).filter((m) => m.status === "active");
    const mapped = active
      .map((m) => ({ id: m.profile?.id as string, name: m.profile?.display_name ?? "—" }))
      .filter((p) => p.id);
    // "sorteio" da ordem: embaralha de forma estável (seed = id da disputa).
    return shuffleSeeded(mapped, lcId);
  }, [members, lcId]);
  const nameOf = (id: string | null) =>
    id ? (allPlayers.find((p) => p.id === id)?.name ?? "—") : "—";

  // Seleção (modo admin): todos marcados por padrão. Opt-in: usa as inscrições.
  const [selected, setSelected] = useState<Record<string, boolean> | null>(null);
  const sel = selected ?? Object.fromEntries(allPlayers.map((p) => [p.id, true]));
  const optedSet = useMemo(() => new Set(optins ?? []), [optins]);
  const [cap, setCap] = useState<number | null>(null);

  // Participantes resolvidos (ordem de entrada) + limite opcional de vagas.
  const players = useMemo(() => {
    const base = isOptin
      ? allPlayers.filter((p) => optedSet.has(p.id))
      : allPlayers.filter((p) => sel[p.id]);
    return cap && cap > 0 ? base.slice(0, cap) : base;
  }, [allPlayers, isOptin, optedSet, sel, cap]);

  const P = periods?.length ?? 0;

  // Formato da Liga, escolhido aqui no simulador (mesmo cabendo turno, pode optar suíço).
  const [ligaFmt, setLigaFmt] = useState<LigaFmt>("turno");
  const isSwiss = isLiga && ligaFmt === "swiss";

  // Viabilidade/rodadas do sorteio — matemática pura e testável (ver build.ts).
  const { n, fullTurno, rounds, realRounds, turnoCabe, returnoCabe, viavel, confrontosPorRodada } =
    confrontoViability(formato, players.length, P, ligaFmt);

  // Preview de teste (hipotético — só simulação, não altera o sorteio real).
  const { rounds: testRounds, viavel: testViavel } = testViability(formato, testN, P);
  const periodList: Period[] = useMemo(
    () => (periods ?? []).map((p) => ({ kind: p.kind, value: p.value, label: p.label, games: p.games })),
    [periods],
  );
  const previewTies = useMemo<DrawTie[]>(() => {
    const ids = players.map((p) => p.id);
    if (ids.length < 2 || periodList.length === 0) return [];
    return isLiga
      ? buildLigaFixtures(ids, periodList, isSwiss ? 1 : rounds)
      : buildCopaFixtures(ids, periodList);
  }, [players, periodList, rounds, isLiga, isSwiss]);
  const previewRound1 = previewTies.filter((t) => t.round_order === 1);
  const previewByes = previewRound1.filter((t) => t.member_b === null).length;
  const previewRoundsCount = previewTies.length
    ? Math.max(...previewTies.map((t) => t.round_order))
    : 0;
  const bracketFases = [...new Set(previewTies.map((t) => t.round_label))];

  const doDraw = async () => {
    let scheduledDrawAt: string | null = null;
    if (drawWhen === "datetime" && drawAt) {
      scheduledDrawAt = new Date(drawAt).toISOString();
    } else if (drawWhen === "first") {
      const { data } = await supabase
        .from("matches")
        .select("kickoff_at")
        .eq("competition_id", competitionId)
        .not("kickoff_at", "is", null)
        .order("kickoff_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      scheduledDrawAt = (data?.kickoff_at as string | undefined) ?? null;
    }
    draw.mutate(
      {
        lcId,
        leagueId,
        competitionId,
        formato,
        kind,
        rounds: isLiga ? (isSwiss ? 1 : rounds) : undefined,
        memberIds: players.map((p) => p.id),
        ligaFormat: isSwiss ? "swiss" : "partial",
        scheduledDrawAt,
      },
      {
        onSuccess: (r) => {
          toast(
            r.scheduled
              ? "Sorteio agendado! A disputa será revelada no horário."
              : `Sorteado! ${r.ties} confrontos entre ${r.participants} jogadores.`,
            "success",
          );
          setConfirm(false);
        },
        onError: (e) => toast(e instanceof Error ? e.message : "Não consegui sortear agora. Confere e tenta de novo.", "error"),
      },
    );
  };

  return (
    <div className="space-y-3">
      <ParticipantsCard
        isOptin={isOptin}
        optedSet={optedSet}
        allPlayers={allPlayers}
        isAdmin={isAdmin}
        sel={sel}
        setSelected={setSelected}
        playersLen={players.length}
        isLiga={isLiga}
        cap={cap}
        setCap={setCap}
      />

      <RoundsShapeCard
        kind={kind}
        setKind={setKind}
        loadingPeriods={loadingPeriods}
        periods={periods}
        P={P}
      />

      <FormatViabilityCard
        Icon={Icon}
        isLiga={isLiga}
        n={n}
        realRounds={realRounds}
        viavel={viavel}
        P={P}
        loadingPeriods={loadingPeriods}
        turnoCabe={turnoCabe}
        returnoCabe={returnoCabe}
        ligaFmt={ligaFmt}
        setLigaFmt={setLigaFmt}
        fullTurno={fullTurno}
        confrontosPorRodada={confrontosPorRodada}
      />

      <DrawPreviewCard
        previewRound1={previewRound1}
        isLiga={isLiga}
        previewRoundsCount={previewRoundsCount}
        previewByes={previewByes}
        nameOf={nameOf}
        isSwiss={isSwiss}
        P={P}
        fullTurno={fullTurno}
        bracketFases={bracketFases}
      />

      <TestPlayersCard
        testOpen={testOpen}
        setTestOpen={setTestOpen}
        testN={testN}
        setTestN={setTestN}
        isLiga={isLiga}
        testRounds={testRounds}
        testViavel={testViavel}
        P={P}
      />

      {/* Ação */}
      {isAdmin ? (
        <>
          <Button fullWidth disabled={players.length < 2 || !viavel} onClick={() => setConfirm(true)}>
            <Dices className="size-4" /> Sortear confrontos
          </Button>
          {players.length < 2 && (
            <p className="px-1 text-center text-xs text-ink-400">
              {isOptin
                ? "Aguarde pelo menos 2 inscritos para sortear."
                : "Selecione pelo menos 2 participantes."}
            </p>
          )}
        </>
      ) : isOptin ? (
        <Button
          fullWidth
          variant={currentUserId && optedSet.has(currentUserId) ? "outline" : undefined}
          loading={toggleOptin.isPending}
          onClick={() =>
            toggleOptin.mutate(lcId, {
              onSuccess: (joined) =>
                toast(joined ? "Você está dentro! Boa sorte." : "Inscrição cancelada.", joined ? "success" : "info"),
              onError: (e) => toast(e instanceof Error ? e.message : "Não deu pra atualizar agora. Tenta de novo?", "error"),
            })
          }
        >
          {currentUserId && optedSet.has(currentUserId) ? "Sair da disputa" : "Quero jogar"}
        </Button>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-md bg-surface-2 px-3 py-3 text-sm text-ink-500">
          <Clock className="size-4" /> Aguardando o administrador sortear os confrontos.
        </div>
      )}

      <DrawConfirmModal
        open={confirm}
        onClose={() => setConfirm(false)}
        playersLen={players.length}
        isLiga={isLiga}
        rounds={rounds}
        drawWhen={drawWhen}
        setDrawWhen={setDrawWhen}
        drawAt={drawAt}
        setDrawAt={setDrawAt}
        drawPending={draw.isPending}
        onConfirm={doDraw}
      />
    </div>
  );
}
