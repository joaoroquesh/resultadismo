import { ScorePill } from "resultadismo";

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: 16 }}>
    {children}
  </div>
);

export const Tipos = () => (
  <Row>
    <ScorePill type="cravada" />
    <ScorePill type="saldo" />
    <ScorePill type="acerto" />
    <ScorePill type="erro" />
  </Row>
);

export const ComRotulo = () => (
  <Row>
    <ScorePill type="cravada" withLabel />
    <ScorePill type="saldo" withLabel />
    <ScorePill type="acerto" withLabel />
    <ScorePill type="erro" withLabel />
  </Row>
);

export const Joker = () => (
  <Row>
    <ScorePill type="cravada" doubled />
    <ScorePill type="saldo" doubled withLabel />
    <ScorePill type="acerto" doubled />
  </Row>
);
