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

      <Bloco emoji="🏆" titulo="A sua Copa">
        <p>Eliminatório. Nos grupos, pontue em <b>2 dos 3</b> jogos pra avançar.</p>
        <p>No mata-mata, errou o jogo, tá <b>fora</b>. Sobreviveu aos 7? <b>Campeão</b>! 🏆</p>
        {enforce && (
          <p className="rounded-md bg-gold-100 px-2 py-1 text-xs font-semibold text-gold-800">
            Nesta temporada, a semifinal exige no mínimo <b>{cfg.data?.semi_min}</b> e a final,{" "}
            <b>{cfg.data?.final_min}</b>.
          </p>
        )}
        <p className="text-xs text-ink-400">Máximo possível: 21 pontos (7 cravadas).</p>
      </Bloco>

      <Bloco emoji="🎚️" titulo="Modos do Jogo livre">
        <p><b>Amistoso 🤝</b> — placares famosos, pra aquecer sem pressão.</p>
        <p><b>Clássico ⚽</b> — o desafio de sempre, equilibrado.</p>
        <p><b>Lenda 🐐</b> — só placar cabeludo, pros raiz de verdade.</p>
        <p className="rounded-md bg-gold-100 px-2 py-1 text-xs font-semibold text-gold-800">
          Na Lenda: mais de <b>15 pts</b> = campanha <b>HISTÓRICA</b> 📜 · <b>21 pts</b> ={" "}
          <b>ZEROU O GAME</b> 👾
        </p>
        <p className="text-xs text-ink-400">
          Em todos os modos a dificuldade sobe dos grupos até a final.
        </p>
      </Bloco>

      <Bloco emoji="🎲" titulo="Ficha de troca">
        <p>Cada <b>cravada</b> te dá uma ficha 🎲. Com ela, você troca o jogo atual por outro sorteado.</p>
      </Bloco>

      <Bloco emoji="📅" titulo="Seleção do Dia & Jogo livre">
        <p><b>Seleção do Dia</b>: a Copa de uma seleção, igual pra todo mundo, 1 vez por dia. Vale ranking 🔥.</p>
        <p><b>Jogo livre</b>: o jogo do dia a dia — jogue quantas vezes quiser. Logado, entra no ranking.</p>
        <p className="text-xs text-ink-400">Todo jogo tem tempo: poucos segundos por placar.</p>
      </Bloco>

      <Bloco emoji="🥇" titulo="Ranking">
        <p>Lidera quem <b>chega mais longe</b>; pontos e tempo são desempate.</p>
        <p>O Jogo livre tem <b>um ranking por modo</b> (Amistoso, Clássico e Lenda) — sem misturar.</p>
        <p className="text-xs text-ink-400">Só entra no ranking quem joga logado.</p>
      </Bloco>

      <Button variant="secondary" className="w-full" onClick={() => navigate("/retro")}>
        Bora jogar →
      </Button>
    </div>
  );
}
