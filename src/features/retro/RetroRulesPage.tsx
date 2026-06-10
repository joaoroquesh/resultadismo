import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ScorePill } from "@/components/ScorePill";
import { useRetroConfig } from "./api";

// Regras do Retrô em blocos curtos e escaneáveis (a galera não lê parágrafo).
function Bloco({ emoji, titulo, children }: { emoji: string; titulo: string; children: React.ReactNode }) {
  return (
    <Card className="p-4">
      <h3 className="flex items-center gap-2 text-base font-bold">
        <span>{emoji}</span> {titulo}
      </h3>
      <div className="mt-1.5 space-y-1 text-sm text-ink-600">{children}</div>
    </Card>
  );
}

export function RetroRulesPage() {
  const navigate = useNavigate();
  const cfg = useRetroConfig();
  const enforce = cfg.data?.enforce_knockout_bar ?? false;

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold">Como funciona o Retrô</h1>
        <p className="text-sm text-ink-500">Adivinhe placares de Copas antigas. Rápido e simples.</p>
      </div>

      <Bloco emoji="⚽" titulo="O jogo">
        <p>Aparece um jogo real de alguma Copa do Mundo (1930–2022). Você crava o placar em poucos segundos.</p>
        <p>São 7 jogos: 3 de grupos, depois oitavas, quartas, semi e final.</p>
      </Bloco>

      <Bloco emoji="🎯" titulo="Pontuação">
        <div className="flex flex-wrap items-center gap-2">
          <ScorePill type="cravada" withLabel /> placar exato
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScorePill type="saldo" withLabel /> vencedor certo + diferença de gols (empate certo conta aqui)
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ScorePill type="acerto" withLabel /> só quem venceu
        </div>
        <p className="text-xs text-ink-400">Vale o placar final com prorrogação. Pênaltis não contam.</p>
      </Bloco>

      <Bloco emoji="🏆" titulo="Formato Copa">
        <p>Eliminatório. Nos grupos, pontue em <b>2 dos 3</b> jogos pra avançar.</p>
        <p>No mata-mata, errou o jogo, tá <b>fora</b>. Sobreviveu aos 7? <b>Campeão</b>! 🏆</p>
        {enforce && (
          <p className="rounded-md bg-gold-100 px-2 py-1 text-xs font-semibold text-gold-800">
            Nesta temporada, a semifinal exige no mínimo <b>{cfg.data?.semi_min}</b> e a final,{" "}
            <b>{cfg.data?.final_min}</b>.
          </p>
        )}
      </Bloco>

      <Bloco emoji="🎯" titulo="Formato Pontos">
        <p>Sem eliminação: você joga os <b>7 jogos</b> e soma. Quem faz <b>mais pontos</b> vence.</p>
        <p className="text-xs text-ink-400">Máximo possível: 21 pontos (7 cravadas).</p>
      </Bloco>

      <Bloco emoji="🎲" titulo="Ficha de troca">
        <p>Cada <b>cravada</b> te dá uma ficha 🎲. Com ela, você troca o jogo atual por outro sorteado.</p>
      </Bloco>

      <Bloco emoji="📅" titulo="Copa do Dia & Treino">
        <p><b>Copa do Dia</b>: a Copa de uma seleção, igual pra todo mundo, 1 vez por dia. Vale ranking 🔥.</p>
        <p><b>Treino</b>: jogue à vontade, jogos aleatórios, sem ranking. Escolha Fácil ou Difícil.</p>
        <p className="text-xs text-ink-400">Ritmo Resultadista (com tempo) é o que vale ranking. Sem Pressa é livre.</p>
      </Bloco>

      <Bloco emoji="🥇" titulo="Ranking">
        <p><b>Copa</b>: lidera quem chega mais longe; pontos e tempo são desempate.</p>
        <p><b>Pontos</b>: lidera quem faz mais pontos; o tempo desempata.</p>
        <p className="text-xs text-ark-400">Só entra no ranking quem joga logado, no ritmo Resultadista.</p>
      </Bloco>

      <Button variant="secondary" className="w-full" onClick={() => navigate("/retro")}>
        Bora jogar →
      </Button>
    </div>
  );
}
