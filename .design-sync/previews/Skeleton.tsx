import { Skeleton } from "resultadismo";

// Skeleton só aceita className; o tamanho vem do wrapper (inline) + h-full/w-full.
const Bar = ({ w, h = 12 }: { w: number | string; h?: number }) => (
  <div style={{ width: w, height: h }}>
    <Skeleton className="h-full w-full" />
  </div>
);

export const CartaoDeJogo = () => (
  <div style={{ padding: 16, maxWidth: 360 }}>
    <div
      className="rounded-lg bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border"
      style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ width: 44, height: 44 }}>
          <Skeleton className="size-full rounded-full" />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <Bar w="60%" />
          <Bar w="40%" />
        </div>
      </div>
      <Bar w="100%" h={40} />
    </div>
  </div>
);

export const Linhas = () => (
  <div style={{ padding: 16, maxWidth: 360, display: "flex", flexDirection: "column", gap: 10 }}>
    <Bar w="92%" h={14} />
    <Bar w="75%" h={14} />
    <Bar w="80%" h={14} />
    <Bar w="50%" h={14} />
  </div>
);
