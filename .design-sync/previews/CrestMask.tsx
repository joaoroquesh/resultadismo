import { CrestMask } from "resultadismo";

const Row = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", padding: 16 }}>
    {children}
  </div>
);

export const EscudoComInicial = () => (
  <Row>
    <CrestMask name="João" px={56} defaultKind="escudo" withLetter />
    <CrestMask name="Ana" px={56} defaultKind="escudo" withLetter />
    <CrestMask name="Rui" px={56} defaultKind="escudo" withLetter />
    <CrestMask name="Bia" px={56} defaultKind="escudo" withLetter />
  </Row>
);

export const Flamula = () => (
  <Row>
    <CrestMask name="Grupo" px={56} defaultKind="flamula" />
    <CrestMask src="crest:flamula:2:stripes:verde-dourado:45:" name="G" px={56} defaultKind="flamula" />
    <CrestMask src="crest:flamula:3:grid:azul-gelo-azul-gelo:0:" name="G" px={56} defaultKind="flamula" />
    <CrestMask src="crest:flamula:1:ball:grafite-dourado:0:" name="G" px={56} defaultKind="flamula" />
  </Row>
);

export const Tamanhos = () => (
  <Row>
    <CrestMask name="Time" px={28} defaultKind="escudo" withLetter />
    <CrestMask name="Time" px={40} defaultKind="escudo" withLetter />
    <CrestMask name="Time" px={64} defaultKind="escudo" withLetter />
    <CrestMask name="Time" px={88} defaultKind="escudo" withLetter />
  </Row>
);
