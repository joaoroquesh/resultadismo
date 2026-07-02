import { Badge } from "resultadismo";

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: 16 }}>
    {children}
  </div>
);

export const Tones = () => (
  <Row>
    <Badge tone="neutral">Rascunho</Badge>
    <Badge tone="brand">Sua vez</Badge>
    <Badge tone="gold">Cravada</Badge>
    <Badge tone="grass">Saldo</Badge>
    <Badge tone="aqua">Acerto</Badge>
    <Badge tone="flame">Ao vivo</Badge>
    <Badge tone="outline">Encerrado</Badge>
  </Row>
);

export const EmContexto = () => (
  <Row>
    <Badge tone="brand">3º lugar</Badge>
    <Badge tone="grass">+12 pts</Badge>
    <Badge tone="flame">Últimos 5 min</Badge>
  </Row>
);
