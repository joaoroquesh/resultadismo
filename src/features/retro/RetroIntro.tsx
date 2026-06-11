import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ScorePill } from "@/components/ScorePill";
import { useFirstSeen } from "@/lib/useFirstSeen";
import { RetroStripes } from "./RetroFx";

// Modal de 1º acesso do Retrô (rodada 18): explica o jogo em 4 linhas e some pra
// sempre (localStorage). Vale pra anônimo também — por isso vive aqui, não no
// onboarding do app-mãe (que exige login + personalização).
export function RetroIntro({ onRules }: { onRules: () => void }) {
  const [firstTime, markSeen] = useFirstSeen("retro-intro-v1");
  if (!firstTime) return null;

  return (
    <Modal open onClose={markSeen} label="Como funciona o Retrô" hideClose>
      <div className="relative overflow-hidden rounded-t-2xl">
        <RetroStripes />
      </div>
      <div className="space-y-3 p-5">
        <h2 className="text-lg font-bold leading-tight">Bem-vindo ao Retrô! 🕹️</h2>
        <p className="text-sm text-ink-600">
          <b>7 placares históricos de Copa</b>, poucos segundos pra cravar cada um. É a sua própria
          Copa do Mundo:
        </p>
        <ul className="space-y-2 text-sm text-ink-600">
          <li className="flex gap-2">
            <span aria-hidden>🏟️</span>
            <span>
              <b>Fase de grupos (3 jogos):</b> pontue em pelo menos <b>2</b> pra avançar.
            </span>
          </li>
          <li className="flex flex-wrap items-center gap-1.5 pl-7 text-[13px]">
            <ScorePill type="cravada" withLabel /> placar exato ·
            <ScorePill type="saldo" withLabel /> diferença certa ·
            <ScorePill type="acerto" withLabel /> vencedor certo
          </li>
          <li className="flex gap-2">
            <span aria-hidden>☠️</span>
            <span>
              <b>Das oitavas em diante:</b> errou, caiu. Sobreviveu aos 7? <b>Campeão!</b> 🏆
            </span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden>🎲</span>
            <span>
              Cada <b>cravada</b> dá uma ficha pra trocar um jogo.
            </span>
          </li>
        </ul>
        <div className="space-y-2 pt-1">
          <Button size="lg" className="w-full font-bold" onClick={markSeen}>
            Bora jogar →
          </Button>
          <button
            type="button"
            className="block w-full text-center text-xs font-semibold text-ink-500 underline-offset-2 hover:underline"
            onClick={() => {
              markSeen();
              onRules();
            }}
          >
            Ver as regras completas
          </button>
        </div>
      </div>
    </Modal>
  );
}
