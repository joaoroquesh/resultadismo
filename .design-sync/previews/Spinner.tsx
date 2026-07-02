import { Spinner } from "resultadismo";

export const Tamanhos = () => (
  <div style={{ display: "flex", gap: 20, alignItems: "center", padding: 24 }}>
    <Spinner className="size-4" />
    <Spinner className="size-5" />
    <Spinner className="size-7" />
  </div>
);

export const EmBotao = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 24, color: "var(--color-ink-500)" }}>
    <Spinner className="size-5" />
    <span className="text-sm text-ink-500">Carregando rodada…</span>
  </div>
);
