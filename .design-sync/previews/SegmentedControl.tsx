import { useState } from "react";
import { SegmentedControl } from "resultadismo";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: 16, maxWidth: 360 }}>
    {children}
  </div>
);

export const DuasOpcoes = () => {
  const [v, setV] = useState("meus");
  return (
    <Frame>
      <SegmentedControl
        value={v}
        onChange={setV}
        options={[
          { value: "meus", label: "Meus palpites" },
          { value: "todos", label: "Todos os jogos" },
        ]}
      />
    </Frame>
  );
};

export const VariasOpcoes = () => {
  const [v, setV] = useState("rodada");
  return (
    <Frame>
      <SegmentedControl
        value={v}
        onChange={setV}
        options={[
          { value: "rodada", label: "Rodada" },
          { value: "mes", label: "Mês" },
          { value: "geral", label: "Geral" },
        ]}
      />
    </Frame>
  );
};
