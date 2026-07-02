import { useState } from "react";
import { Select } from "resultadismo";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 300, display: "flex", flexDirection: "column", gap: 16 }}>
    {children}
  </div>
);

const OPCOES = [
  { value: "rodada", label: "Esta rodada", hint: "10 jogos" },
  { value: "mes", label: "Este mês", hint: "42 jogos" },
  { value: "temporada", label: "Temporada", hint: "380 jogos" },
];

export const Selecionado = () => {
  const [v, setV] = useState<string | null>("rodada");
  return (
    <Frame>
      <Select value={v} onChange={setV} options={OPCOES} ariaLabel="Período" />
    </Frame>
  );
};

export const Placeholder = () => {
  const [v, setV] = useState<string | null>(null);
  return (
    <Frame>
      <Select value={v} onChange={setV} options={OPCOES} placeholder="Escolha o período…" ariaLabel="Período" />
    </Frame>
  );
};

export const Desabilitado = () => (
  <Frame>
    <Select value="temporada" onChange={() => {}} options={OPCOES} disabled ariaLabel="Período" />
  </Frame>
);
