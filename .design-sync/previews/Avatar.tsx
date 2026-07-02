import { Avatar } from "resultadismo";

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: 16 }}>
    {children}
  </div>
);

export const Tamanhos = () => (
  <Row>
    <Avatar name="João Roque" size="xs" />
    <Avatar name="João Roque" size="sm" />
    <Avatar name="João Roque" size="md" />
    <Avatar name="João Roque" size="lg" />
    <Avatar name="João Roque" size="xl" />
  </Row>
);

export const Pessoas = () => (
  <Row>
    <Avatar name="Ana Prado" size="lg" />
    <Avatar name="Bruno Lima" size="lg" />
    <Avatar name="Carla Souza" size="lg" />
    <Avatar name="Diego Alves" size="lg" />
    <Avatar name="Elis Nunes" size="lg" />
  </Row>
);

export const EscudosCustom = () => (
  <Row>
    <Avatar name="Verdão" src="crest:escudo:3:stripes:verde-dourado:45:" size="lg" />
    <Avatar name="Rubro" src="crest:escudo:7:stripes:vermelho-grafite:0:" size="lg" />
    <Avatar name="Tricolor" src="crest:escudo:5:grid:vermelho-gelo-verde-gelo:0:" size="lg" />
    <Avatar name="Turco" src="crest:escudo:padrao:solid:turquesa:0:" size="lg" />
  </Row>
);
