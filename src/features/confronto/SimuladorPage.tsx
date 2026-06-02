import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Minus, Plus, Trophy, Swords, Check, TriangleAlert } from "lucide-react";
import { Page } from "@/components/layout/Page";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/utils";
import {
  simulate,
  MIN_JOGADORES,
  MAX_JOGADORES,
  GRANULARIDADE_LABEL,
  JOGOS_POR_RODADA,
  type ConfrontoMode,
  type Granularidade,
} from "./simulator";

const J = (i: number) => `J${i + 1}`;

export function SimuladorPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<ConfrontoMode>("liga");
  const [players, setPlayers] = useState(8);
  const [gran, setGran] = useState<Granularidade>("bloco");

  const result = useMemo(() => simulate(mode, players, gran), [mode, players, gran]);
  const dec = (d: number) =>
    setPlayers((p) => Math.max(MIN_JOGADORES, Math.min(MAX_JOGADORES, p + d)));

  return (
    <Page
      title="Simulador de confrontos"
      action={
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
          <ArrowLeft className="size-5" />
        </Button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-ink-500">
          Veja como ficaria a disputa <span className="font-semibold text-ink-800">antes de
          iniciar</span>. Nada é salvo aqui. As rodadas disponíveis são estimadas pelo calendário da
          Copa do Mundo.
        </p>

        {/* Controles */}
        <Card className="space-y-4 p-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink-800">Modo</label>
            <SegmentedControl<ConfrontoMode>
              value={mode}
              onChange={setMode}
              options={[
                { value: "liga", label: "Liga" },
                { value: "copa", label: "Copa" },
              ]}
            />
            <p className="text-xs leading-snug text-ink-500">
              {mode === "liga"
                ? "Todos se enfrentam ao longo das rodadas, formando uma tabela (3/1/0)."
                : "Mata-mata: quem perde o confronto está fora; o último de pé leva a taça."}
            </p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink-800">Jogadores</label>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                onClick={() => dec(-1)}
                disabled={players <= MIN_JOGADORES}
                aria-label="Menos um jogador"
              >
                <Minus className="size-4" />
              </Button>
              <div className="flex min-w-20 flex-col items-center">
                <span className="text-2xl font-extrabold tabular-nums text-ink-950">{players}</span>
                <span className="text-[11px] font-medium text-ink-400">de {MIN_JOGADORES} a {MAX_JOGADORES}</span>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => dec(1)}
                disabled={players >= MAX_JOGADORES}
                aria-label="Mais um jogador"
              >
                <Plus className="size-4" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-sm font-medium text-ink-800">Frequência dos confrontos</label>
            <SegmentedControl<Granularidade>
              value={gran}
              onChange={setGran}
              options={[
                { value: "bloco", label: "Por fase" },
                { value: "semanal", label: GRANULARIDADE_LABEL.semanal },
              ]}
            />
            <p className="text-xs leading-snug text-ink-500">
              Na Copa, cada confronto vale por uma <span className="font-medium text-ink-700">fase</span> (rodada
              de grupos ou fase do mata-mata): {JOGOS_POR_RODADA[gran]} por rodada. Mais jogos por
              rodada = duelo mais justo.
            </p>
          </div>
        </Card>

        {/* Resultado */}
        <Card className="space-y-4 p-4">
          <div className="flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-brand-500/10 text-brand-600">
              {mode === "liga" ? (
                <Swords className="size-5" strokeWidth={2.2} />
              ) : (
                <Trophy className="size-5" strokeWidth={2.2} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-ink-950">{result.formato}</p>
              <p className="text-sm text-ink-500">
                {result.jogadores} jogadores · {result.rounds.length} rodadas
              </p>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold",
                result.viavel
                  ? "bg-grass-100 text-grass-800"
                  : "bg-flame-100 text-flame-700",
              )}
            >
              {result.viavel ? <Check className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
              {result.viavel ? "Cabe na Copa" : "Não cabe"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md bg-surface-2 p-3">
              <p className="text-xl font-extrabold tabular-nums text-ink-950">
                {result.rodadasNecessarias}
              </p>
              <p className="text-[11px] font-medium text-ink-500">rodadas necessárias</p>
            </div>
            <div className="rounded-md bg-surface-2 p-3">
              <p className="text-xl font-extrabold tabular-nums text-ink-950">
                {result.rodadasDisponiveis}
              </p>
              <p className="text-[11px] font-medium text-ink-500">rodadas disponíveis</p>
            </div>
          </div>

          {result.aviso && (
            <p
              className={cn(
                "rounded-md px-3 py-2 text-xs leading-relaxed",
                result.viavel ? "bg-brand-500/10 text-brand-700" : "bg-flame-100 text-flame-700",
              )}
            >
              {result.aviso}
            </p>
          )}
          {mode === "copa" && result.byes ? (
            <p className="text-xs text-ink-400">
              {result.byes} {result.byes === 1 ? "jogador passa" : "jogadores passam"} direto na 1ª
              rodada (bye), por não fechar uma potência de 2.
            </p>
          ) : null}
        </Card>

        {/* Estrutura */}
        <div>
          <h3 className="mb-2 px-1 text-xs font-bold uppercase tracking-wide text-ink-400">
            {mode === "copa" ? "Chaveamento" : "Rodadas"}
          </h3>
          <Card className="divide-y divide-border">
            {result.rounds.map((round, i) => (
              <div key={i} className="p-3.5">
                <p className="mb-1.5 flex items-center gap-2 text-sm font-bold text-ink-900">
                  <span className="grid size-5 shrink-0 place-items-center rounded bg-ink-100 text-[11px] tabular-nums text-ink-500">
                    {i + 1}
                  </span>
                  {round.label}
                </p>
                {round.pairings.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pl-7">
                    {round.pairings.map((p, j) => (
                      <span
                        key={j}
                        className="rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-600 ring-1 ring-border"
                      >
                        {p.b === null ? (
                          <>{J(p.a)} · folga</>
                        ) : (
                          <>
                            {J(p.a)} <span className="text-ink-300">×</span> {J(p.b)}
                          </>
                        )}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="pl-7 text-[11px] text-ink-400">
                    {mode === "copa"
                      ? "Vencedores das rodadas anteriores se enfrentam."
                      : "Emparelhado por desempenho (quem está perto na tabela se enfrenta)."}
                  </p>
                )}
              </div>
            ))}
          </Card>
        </div>

        <p className="px-1 pb-2 text-center text-[11px] text-ink-400">
          Prévia ilustrativa. Ao iniciar a disputa de verdade, o app usa o calendário real e gera os
          confrontos.
        </p>
      </div>
    </Page>
  );
}
