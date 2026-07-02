import { useState } from "react";
import { SortControl } from "resultadismo";

type Key = "pontos" | "nome" | "rodada";
const FIELDS = [
  { key: "pontos" as Key, label: "Pontos", ascLabel: "Menos", descLabel: "Mais" },
  { key: "nome" as Key, label: "Nome", ascLabel: "A→Z", descLabel: "Z→A" },
  { key: "rodada" as Key, label: "Rodada", ascLabel: "Antigas", descLabel: "Recentes" },
];

export const Ranking = () => {
  const [value, setValue] = useState<Key>("pontos");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  return (
    <div style={{ padding: 16, maxWidth: 420 }}>
      <SortControl
        fields={FIELDS}
        value={value}
        dir={dir}
        onChange={(k, d) => {
          setValue(k);
          setDir(d);
        }}
      />
    </div>
  );
};

export const PorNome = () => {
  const [value, setValue] = useState<Key>("nome");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  return (
    <div style={{ padding: 16, maxWidth: 420 }}>
      <SortControl fields={FIELDS} value={value} dir={dir} onChange={(k, d) => { setValue(k); setDir(d); }} />
    </div>
  );
};
