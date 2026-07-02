import { ScrollRow, Badge } from "resultadismo";

// Fileira mais larga que o container → o degradê das bordas indica que há mais
// conteúdo para arrastar.
export const Rodadas = () => (
  <div style={{ padding: 16, maxWidth: 320 }}>
    <ScrollRow innerClassName="px-1 py-1">
      {Array.from({ length: 14 }).map((_, i) => (
        <Badge key={i} tone={i === 3 ? "brand" : "neutral"}>
          Rodada {i + 1}
        </Badge>
      ))}
    </ScrollRow>
  </div>
);

export const Times = () => (
  <div style={{ padding: 16, maxWidth: 320 }}>
    <ScrollRow innerClassName="px-1 py-1">
      {["Flamengo", "Palmeiras", "Cruzeiro", "Grêmio", "Bahia", "Santos", "Vasco"].map((t) => (
        <Badge key={t} tone="outline">
          {t}
        </Badge>
      ))}
    </ScrollRow>
  </div>
);
