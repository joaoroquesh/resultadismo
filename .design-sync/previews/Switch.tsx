import { useState } from "react";
import { Switch } from "resultadismo";

const Frame = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 18, padding: 16, maxWidth: 320 }}>
    {children}
  </div>
);

const Linha = ({ text, node }: { text: string; node: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
    <span className="text-sm text-ink-800">{text}</span>
    {node}
  </div>
);

export const LigadoDesligado = () => {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <Frame>
      <Linha text="Notificar novos jogos" node={<Switch checked={a} onChange={setA} label="Notificar novos jogos" />} />
      <Linha text="Resumo semanal por e-mail" node={<Switch checked={b} onChange={setB} label="Resumo semanal" />} />
    </Frame>
  );
};

export const Desabilitado = () => (
  <Frame>
    <Linha text="Modo espectador (em breve)" node={<Switch checked={false} onChange={() => {}} label="Modo espectador" disabled />} />
    <Linha text="Sincronização premium" node={<Switch checked onChange={() => {}} label="Sincronização premium" disabled />} />
  </Frame>
);
