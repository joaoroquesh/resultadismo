import { useState } from "react";
import { Combobox, Escudo } from "resultadismo";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ padding: 16, maxWidth: 320, display: "flex", flexDirection: "column", gap: 16 }}>
    {children}
  </div>
);

const TIMES = [
  { value: "fla", label: "Flamengo", leading: <Escudo name="Flamengo" size="sm" />, hint: "RJ" },
  { value: "pal", label: "Palmeiras", leading: <Escudo name="Palmeiras" size="sm" />, hint: "SP" },
  { value: "cru", label: "Cruzeiro", leading: <Escudo name="Cruzeiro" size="sm" />, hint: "MG" },
  { value: "gre", label: "Grêmio", leading: <Escudo name="Grêmio" size="sm" />, hint: "RS" },
];

export const TimeSelecionado = () => {
  const [v, setV] = useState<string | null>("pal");
  return (
    <Frame>
      <Combobox value={v} onChange={setV} options={TIMES} ariaLabel="Time" allowClear />
    </Frame>
  );
};

export const Vazio = () => {
  const [v, setV] = useState<string | null>(null);
  return (
    <Frame>
      <Combobox value={v} onChange={setV} options={TIMES} placeholder="Buscar time…" ariaLabel="Time" />
    </Frame>
  );
};
