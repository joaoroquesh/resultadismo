import { Coachmark, Button } from "resultadismo";

// defaultOpen força o balão aberto (ignora o localStorage), pra vitrine.
export const DicaPrimeiroAcesso = () => (
  <div style={{ padding: "24px 24px 150px" }}>
    <Coachmark
      defaultOpen
      storageKey="preview-coachmark-1"
      title="Crave o placar"
      content="Toque no jogo e escolha o resultado exato. Acertar em cheio vale 3 pontos."
      placement="bottom"
      align="start"
    >
      <Button>Flamengo 2 × 1 Palmeiras</Button>
    </Coachmark>
  </div>
);

export const SemTitulo = () => (
  <div style={{ padding: "24px 24px 150px" }}>
    <Coachmark
      defaultOpen
      storageKey="preview-coachmark-2"
      content="Arraste para ver as outras rodadas."
      placement="bottom"
      align="start"
    >
      <Button variant="outline">Rodada 12</Button>
    </Coachmark>
  </div>
);
