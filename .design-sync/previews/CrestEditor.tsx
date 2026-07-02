import { useState } from "react";
import { CrestEditor } from "resultadismo";

// Editor completo de escudo/flâmula: estilo (sólido/listras/grade/bola), forma,
// paleta de cores e rotação. Emite a string crest: via onChange.
export const Escudo = () => {
  const [crest, setCrest] = useState<string>("");
  return (
    <div style={{ padding: 16, maxWidth: 360 }}>
      <CrestEditor
        kind="escudo"
        name="Amigos FC"
        initial={crest || "crest:escudo:3:stripes:verde-dourado:45:"}
        shapes={["padrao", "1", "2", "3", "4", "5", "6", "7"]}
        allowBall
        onChange={setCrest}
      />
    </div>
  );
};

export const Flamula = () => {
  const [crest, setCrest] = useState<string>("");
  return (
    <div style={{ padding: 16, maxWidth: 360 }}>
      <CrestEditor
        kind="flamula"
        name="Zona Norte"
        initial={crest || "crest:flamula:2:grid:azul-gelo-azul-gelo:0:"}
        shapes={["1", "2", "3"]}
        allowBall
        onChange={setCrest}
      />
    </div>
  );
};
