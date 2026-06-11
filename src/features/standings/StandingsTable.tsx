import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/lib/pricing";
import type { StandingRow } from "@/lib/types";

export function StandingsTable({
  rows,
  currentUserId,
  pot,
}: {
  rows: StandingRow[];
  currentUserId?: string | null;
  /** Gestão do Bolão: selo de quem está levando prêmio (cents por user). */
  pot?: { prizeByUserId: Map<string, number> };
}) {
  const [expanded, setExpanded] = useState(false);
  // com selo de prêmio na linha, aperta o espaçamento pra sobrar largura pro
  // nome+selo e o 💰 nunca encostar na coluna de cravadas (telas pequenas).
  const hasAnyPrize = !!pot && rows.some((r) => pot.prizeByUserId.has(r.user_id));
  const gap = expanded ? "gap-2" : hasAnyPrize ? "gap-2" : "gap-3";
  // com selo, encolhe as colunas numéricas do resumo pra liberar largura pro
  // nome+💰 (telas pequenas com valores maiores).
  const numW = hasAnyPrize ? "w-8" : "w-9";
  const ptsW = hasAnyPrize ? "w-9" : "w-10";

  return (
    <div className="overflow-hidden rounded-lg bg-surface shadow-[var(--shadow-soft)] ring-1 ring-border">
      <div className="flex items-center justify-between border-b border-ink-100 px-3 py-1.5">
        <span className="text-[11px] font-semibold text-ink-400">
          {rows.length} {rows.length === 1 ? "jogador" : "jogadores"}
        </span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 rounded-pill px-2 py-1 text-[11px] font-semibold text-brand-600 transition-colors hover:bg-ink-100"
        >
          {expanded ? "Resumo" : "Detalhes"}
          <ChevronDown
            className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      <div className={cn(expanded && "overflow-x-auto")}>
        <div className={cn(expanded && "min-w-[420px]")}>
          <div
            className={cn(
              "flex items-center border-b border-ink-100 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-ink-400",
              gap,
            )}
          >
            <span className="w-5 text-center">#</span>
            <span className="min-w-0 flex-1">Jogador</span>
            {expanded ? (
              <>
                <span className="w-7 text-center" title="Jogos">J</span>
                <span className="w-7 text-center text-gold-700" title="Cravadas">C</span>
                <span className="w-7 text-center text-grass-600" title="Saldos">S</span>
                <span className="w-7 text-center text-aqua-600" title="Acertos">A</span>
                <span className="w-9 text-right" title="Aproveitamento">%</span>
              </>
            ) : (
              <>
                <span className={cn("text-center text-gold-700", numW)} title="Cravadas">CRA</span>
                <span className={cn("text-center", numW)} title="Aproveitamento">%</span>
              </>
            )}
            <span className={cn("text-right", ptsW)}>Pts</span>
          </div>

          <ul className="divide-y divide-ink-100">
            {rows.map((row) => {
              const isMe = row.user_id === currentUserId;
              return (
                <li
                  key={row.user_id}
                  className={cn(
                    "px-3 py-2.5",
                    isMe && "bg-surface-2 ring-1 ring-inset ring-brand-600",
                  )}
                >
                  <Link
                    to={`/jogador/${row.user_id}`}
                    className={cn("flex items-center transition-opacity hover:opacity-80", gap)}
                  >
                  <span
                    className={cn(
                      "flex w-5 justify-center text-sm font-bold tabular-nums",
                      row.rank === 1 && "text-gold-600",
                      row.rank === 2 && "text-ink-400",
                      row.rank === 3 && "text-[#b08d57]",
                      row.rank > 3 && "text-ink-400",
                    )}
                  >
                    {row.rank}
                  </span>
                  <Avatar src={row.avatar_url} name={row.display_name} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-semibold text-ink-900">
                      {row.display_name}
                      {isMe && (
                        <span className="ml-1 text-xs font-medium text-brand-600">(você)</span>
                      )}
                    </span>
                    {/* 2ª linha: quando o jogador leva prêmio, mostra SÓ o selo
                        (esconde "X jogos") pra não competir por espaço e o 💰
                        nunca encostar na coluna de cravadas no mobile. */}
                    {(() => {
                      const prize = pot?.prizeByUserId.get(row.user_id);
                      if (prize == null && expanded) return null;
                      return (
                        <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-[11px] text-ink-400">
                          {prize != null ? (
                            <span className="inline-flex shrink-0 items-center rounded-pill bg-gold-600/15 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-gold-700">
                              💰 {formatBRL(prize)}
                            </span>
                          ) : (
                            <>
                              {row.jogos} {row.jogos === 1 ? "jogo" : "jogos"}
                            </>
                          )}
                        </span>
                      );
                    })()}
                  </div>
                  {expanded ? (
                    <>
                      <span className="w-7 text-center text-xs tabular-nums text-ink-500">
                        {row.jogos}
                      </span>
                      <span className="w-7 text-center text-sm font-semibold tabular-nums text-gold-700">
                        {row.cravadas}
                      </span>
                      <span className="w-7 text-center text-sm font-semibold tabular-nums text-grass-600">
                        {row.saldos}
                      </span>
                      <span className="w-7 text-center text-sm font-semibold tabular-nums text-aqua-600">
                        {row.acertos}
                      </span>
                      <span className="w-9 text-right text-xs tabular-nums text-ink-500">
                        {row.aproveitamento}%
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={cn("text-center text-sm font-semibold tabular-nums text-gold-700", numW)}>
                        {row.cravadas}
                      </span>
                      <span className={cn("text-center text-xs tabular-nums text-ink-500", numW)}>
                        {row.aproveitamento}%
                      </span>
                    </>
                  )}
                  <span className={cn("text-right text-lg font-extrabold tabular-nums text-ink-950", ptsW)}>
                    {row.pontos}
                  </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
