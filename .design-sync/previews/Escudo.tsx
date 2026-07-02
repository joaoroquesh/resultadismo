import { Escudo } from "resultadismo";

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: 16 }}>
    {children}
  </div>
);

export const Tamanhos = () => (
  <Row>
    <Escudo name="Grupo A" size="sm" />
    <Escudo name="Grupo A" size="md" />
    <Escudo name="Grupo A" size="lg" />
    <Escudo name="Grupo A" size="xl" />
  </Row>
);

export const Flamulas = () => (
  <Row>
    <Escudo name="Amigos FC" size="lg" />
    <Escudo name="Zona Norte" size="lg" />
    <Escudo name="Baixada" size="lg" />
    <Escudo name="Peladeiros" size="lg" />
  </Row>
);

export const Preenchimentos = () => (
  <Row>
    <Escudo name="Sólido" src="crest:flamula:1:solid:azul:0:" size="lg" />
    <Escudo name="Listras" src="crest:flamula:2:stripes:verde-dourado:45:" size="lg" />
    <Escudo name="Grade" src="crest:flamula:3:grid:vermelho-gelo-vermelho-gelo:0:" size="lg" />
    <Escudo name="Bola" src="crest:flamula:1:ball:grafite-dourado:0:" size="lg" />
  </Row>
);
