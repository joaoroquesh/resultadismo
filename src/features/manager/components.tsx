// Componentes de apresentação compartilhados do Manager.
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { GroupOtherResult, Estilo, MatchStats, Standing, Tactic, Team } from "./types";
import { matchupHints, sortStandings, styleMatchup } from "./engine";
import { ESTILO_NM, TIER_LABEL, flagEmoji, flagSigla, starsFor } from "./ui";
import { teamColors } from "./teamColors";
import { Button } from "@/components/ui/Button";
import { teamCrestPath } from "@/lib/teamCrests";

// Transição de ENTRADA de tela: fade + slide-up sutil (~190ms, ease-out-quart, só
// transform/opacity) na montagem de cada tela. `screenKey` força o remount da
// animação a cada troca de tela (intro→draft→hub→tática→ao vivo→resultado), dando a
// sensação de progressão fluida em vez de corte seco. prefers-reduced-motion zera
// via kill-switch global (index.css). NÃO anima propriedades de layout.
export function ScreenTransition({
  screenKey,
  children,
}: {
  screenKey: string;
  children: ReactNode;
}) {
  return (
    <div key={screenKey} className="animate-manager-screen">
      {children}
    </div>
  );
}

// Prevenção de erro (Nielsen #5) — confirmação INLINE (sem modal, que é proibido como
// 1ª escolha) pra ações destrutivas/irreversíveis: descartar campanha, sair da
// partida, apurar uma fase em bloco. Aparece no lugar do botão, com mensagem clara e
// "Cancelar / Confirmar". Tokens do tema, ≥44px, aria. `tone` define a cor do CTA.
export function ConfirmInline({
  message,
  confirmLabel,
  cancelLabel = "Cancelar",
  tone = "danger",
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "danger" | "brand";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={message}
      className="mt-3 rounded-[14px] border border-border bg-surface-2 p-3.5"
    >
      <p className="text-[13.5px] font-semibold leading-snug text-ink-800">{message}</p>
      <div className="mt-3 flex gap-2">
        <Button variant="outline" fullWidth onClick={onCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={tone === "danger" ? "danger" : "primary"}
          fullWidth
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

// ITEM #10: alias de slug — alguns ratings usam um slug e o asset do app vive em
// outro. Resolvemos TODOS os lados antes de cair no fallback (emoji → sigla), pra que
// o escudo NUNCA suma. Auditoria: todas as 132 seleções de todas as edições foram
// conferidas contra public/teams; estas são as divergências slug-do-rating × arquivo.
const CREST_ALIAS: Record<string, string> = {
  // documentados (rating usa um nome, o asset outro)
  capeverde: "caboverde",
  estadosunidos: "eua",
  eua: "eua",
  usa: "eua",
  iran: "ira",
  ira: "ira",
  republicatcheca: "tchequia",
  chequia: "tchequia",
  // variações de grafia que poderiam aparecer em edições futuras (defesa em
  // profundidade — apontam só para arquivos que existem em public/teams)
  paisesbaixos: "holanda",
  gales: "paisdegales",
  bosnia: "bosniaeherzegovina",
  bosniaherzegovina: "bosniaeherzegovina",
  serbia: "servia",
  marfim: "costadomarfim",
  costamarfim: "costadomarfim",
  emiratosarabes: "emiradosarabes",
  emiradosarabesunidos: "emiradosarabes",
  trinidadtobago: "trinidadetobago",
  uniaosovietica: "urss",
  republicacheca: "tchequia",
};

// ITEM #10: alguns slugs de rating trazem o ANO colado (ex.: "brasil2026", "iran2026",
// "capeverde2026"). Tirar o sufixo de ano deixa o slug bater direto com o arquivo (ou
// com um alias), em vez de depender só do nome exibido. Pura — não muda nada do motor.
function stripYearSuffix(slug: string): string {
  return slug.replace(/(?:19|20)\d{2}$/, "");
}

/**
 * Caminho do escudo do app para um time, com CADEIA de resolução robusta — nesta ordem:
 *  1) slug cru;  2) alias do slug cru;  3) slug sem o ano colado;  4) alias do slug sem ano;
 *  5) nome exibido (último recurso). Devolve o 1º que existir em /teams, senão null
 *  (e aí o ManagerCrest cai pra bandeira/sigla). Garante que o MEU time nunca fique sem
 *  brasão por causa de um slug com ano ou uma grafia divergente.
 */
function managerCrestPath(slug?: string | null, name?: string | null): string | null {
  const s = slug ?? "";
  const bare = stripYearSuffix(s);
  return teamCrestPath(
    s,
    CREST_ALIAS[s],
    bare !== s ? bare : null,
    bare !== s ? CREST_ALIAS[bare] : null,
    name,
  );
}

// ITEM #10: escudo real do app ao lado do nome. Mesmo pipeline do TeamCrest do app
// (teamCrestPath casa por slug em /teams), com a cadeia robusta de managerCrestPath.
// Fallback infalível: escudo real → emoji de bandeira → sigla de 3 letras — NUNCA um
// espaço vazio. Cobertura auditada 100% nas 132 seleções de todas as edições.
export function ManagerCrest({
  slug,
  name,
  size = 18,
  className = "",
}: {
  slug?: string | null;
  name: string;
  size?: number;
  className?: string;
}) {
  const src = managerCrestPath(slug, name);
  if (!src) return <Flag name={name} className={className} />;
  // ITEM #10: `key={src}` força uma instância NOVA do <img> sempre que a fonte muda (ex.:
  // o card do próximo confronto troca de adversário na mesma posição). Sem isso, o React
  // reaproveitava a instância e o estado "quebrado" do time ANTERIOR escondia o brasão
  // (válido) do novo — a bandeira "sumia". Fresh instance ⇒ broken volta a false.
  return <CrestImg key={src} src={src} name={name} size={size} className={className} />;
}

// <img> do escudo com fallback infalível: se a carga falhar (onError), cai pra bandeira/
// sigla via <Flag> — nunca um espaço vazio. Estado isolado por instância (ver key acima).
function CrestImg({
  src,
  name,
  size,
  className,
}: {
  src: string;
  name: string;
  size: number;
  className: string;
}) {
  const [broken, setBroken] = useState(false);
  if (broken) return <Flag name={name} className={className} />;
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      // sem lazy: são ícones pequenos e SEMPRE visíveis (card do próximo jogo, placar,
      // tabela). Eager evita o flash em branco no primeiro paint.
      decoding="async"
      onError={() => setBroken(true)}
      className={`inline-block shrink-0 object-contain ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function Flag({ name, className = "" }: { name: string; className?: string }) {
  const emoji = flagEmoji(name);
  if (emoji)
    return (
      <span aria-hidden className={`text-sm leading-none ${className}`}>
        {emoji}
      </span>
    );
  return (
    <span
      aria-hidden
      className={`inline-grid h-[18px] min-w-[26px] place-items-center rounded-[3px] border border-border bg-surface-2 px-1 text-[11px] font-bold text-ink-700 ${className}`}
    >
      {flagSigla(name)}
    </span>
  );
}

export function TeamName({ team }: { team: Team }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <ManagerCrest slug={team.s} name={team.n} />
      <span>{team.n}</span>
    </span>
  );
}

// ITEM 13: estrelas com preenchimento FRACIONÁRIO (não só meia). Camada de ★
// douradas mascarada por width = (o/99)*100%, sobre ★ vazias — render consistente
// em qualquer device (abandona o glifo ⯨, que renderiza mal). Mantém a precisão
// interna (o motor segue lendo o overall cru; aqui é só apresentação).
export function Stars({ o, light = false }: { o: number; light?: boolean }) {
  const { n } = starsFor(o);
  const pct = Math.max(0, Math.min(100, (o / 99) * 100));
  const base = light ? "text-white/30" : "text-ink-300";
  const fill = light ? "text-white" : "text-gold-500";
  return (
    <span
      aria-label={`${n} de 5 estrelas`}
      className="relative inline-block select-none align-middle leading-none tracking-[0.06em]"
    >
      <span aria-hidden className={base}>
        ★★★★★
      </span>
      <span
        aria-hidden
        className={`absolute inset-0 overflow-hidden whitespace-nowrap ${fill}`}
        style={{ width: `${pct}%` }}
      >
        ★★★★★
      </span>
    </span>
  );
}

// tabela de classificação (grupo / quadrangular). Marca a minha linha e os classificados.
export function StandingsTable({
  standings,
  advance,
  myKey,
  qualifiedKeys,
  // CLAREZA (v9): legenda curta P/J/SG abaixo da tabela — abreviações de tabela de
  // futebol são padrão, mas pra quem é leigo uma chave de uma linha tira a dúvida.
  showLegend = false,
}: {
  standings: Standing[];
  advance: number;
  myKey: string;
  qualifiedKeys?: Set<string>;
  showLegend?: boolean;
}) {
  const sorted = sortStandings(standings);
  // Realce da rodada (item C): guarda o último P por seleção e, quando ele muda
  // (rival apurado em IA×IA), pulsa o fundo da linha por ~700ms — torna VISÍVEL o
  // efeito da rodada que antes mudava a tabela em silêncio. Só background-color
  // (não reordena, não mexe no layout). Não pulsa na 1ª montagem.
  const prevP = useRef<Map<string, number> | null>(null);
  const [flashed, setFlashed] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next = new Map(sorted.map((r) => [r.team.s, r.P]));
    const prev = prevP.current;
    if (prev) {
      const changed = new Set<string>();
      next.forEach((p, key) => {
        const before = prev.get(key);
        if (before !== undefined && before !== p) changed.add(key);
      });
      if (changed.size > 0) {
        setFlashed(changed);
        const t = setTimeout(() => setFlashed(new Set()), 750);
        prevP.current = next;
        return () => clearTimeout(t);
      }
    }
    prevP.current = next;
  }, [sorted]);
  return (
    <>
    <table className="mt-1 w-full border-collapse text-[13.5px]">
      <thead>
        <tr>
          <th scope="col" className="border-b border-border px-1 py-1.5 text-left text-[10px] font-extrabold uppercase tracking-wide text-ink-500">
            Seleção
          </th>
          {/* a11y (v9): a sigla curta da coluna ganha o nome cheio em title/aria-label,
              pra leitor de tela e hover dizerem "Pontos"/"Jogos"/"Saldo de gols". */}
          <th scope="col" title="Pontos" aria-label="Pontos" className="border-b border-border px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-500">
            P
          </th>
          <th scope="col" title="Jogos" aria-label="Jogos" className="border-b border-border px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-500">
            J
          </th>
          <th scope="col" title="Saldo de gols" aria-label="Saldo de gols" className="border-b border-border px-1 py-1.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-500">
            SG
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((row, i) => {
          const isMe = row.team.s === myKey;
          const qualified = qualifiedKeys ? qualifiedKeys.has(row.team.s) : i < advance;
          const flash = flashed.has(row.team.s);
          return (
            <tr
              key={row.team.s}
              className={`${isMe ? "bg-brand-500/12" : ""} ${flash ? "animate-manager-row-flash" : ""}`}
            >
              <td
                className={`flex items-center gap-1.5 border-b border-border px-1 py-1.5 text-left font-bold ${
                  isMe ? "text-brand-700" : "text-ink-900"
                }`}
              >
                <ManagerCrest slug={row.team.s} name={row.team.n} />
                <span className="truncate">{row.team.n}</span>
                {qualified && <span className="text-[9px] text-grass-600">▲</span>}
              </td>
              <td className="border-b border-border px-1 py-1.5 text-center font-extrabold tabular-nums">
                {row.P}
              </td>
              <td className="border-b border-border px-1 py-1.5 text-center tabular-nums">{row.J}</td>
              <td className="border-b border-border px-1 py-1.5 text-center tabular-nums">
                {row.SG > 0 ? "+" : ""}
                {row.SG}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
      {showLegend && (
        <p className="mt-1.5 text-[10.5px] leading-snug text-ink-500">
          <b className="font-bold text-ink-600">P</b> pontos · <b className="font-bold text-ink-600">J</b> jogos ·{" "}
          <b className="font-bold text-ink-600">SG</b> saldo de gols · <span className="text-grass-600">▲</span> classificado
        </p>
      )}
    </>
  );
}

// ITEM C — "Enquanto você jogava": os outros jogos IA×IA do MEU grupo na mesma
// rodada. Explica POR QUE a tabela mudou (a pontuação dos rivais não aparece do
// nada). Escudo + cor da seleção (teamColors) + placar legível. Tokens do tema,
// legível em DARK e LIGHT. `title`/`note` ajustam o contexto (rodada normal vs.
// encerramento do grupo).
export function GroupRoundResultsPanel({
  results,
  title,
  note,
  highlight = false,
}: {
  results: GroupOtherResult[];
  title: string;
  note?: string;
  highlight?: boolean;
}) {
  if (results.length === 0) return null;
  return (
    <section
      className={`mt-4 rounded-[14px] border bg-surface p-3.5 ${
        highlight ? "border-brand-400" : "border-border"
      }`}
      aria-label={title}
    >
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">{title}</div>
      <ul className="mt-2 flex flex-col gap-1.5">
        {results.map((r, i) => (
          <GroupResultRow key={`${r.a.s}-${r.b.s}-${i}`} r={r} />
        ))}
      </ul>
      {note && <p className="mt-2 text-[11.5px] leading-snug text-ink-600">{note}</p>}
    </section>
  );
}

function GroupResultRow({ r }: { r: GroupOtherResult }) {
  const ca = teamColors(r.a.s, r.a.n);
  const cb = teamColors(r.b.s, r.b.n);
  const aWon = r.ga > r.gb;
  const bWon = r.gb > r.ga;
  return (
    <li className="flex items-center gap-2 rounded-[10px] bg-surface-2 px-2.5 py-1.5 text-[13px]">
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5 text-right">
        <span className={`truncate ${aWon ? "font-extrabold text-ink-900" : "font-medium text-ink-600"}`}>
          {r.a.n}
        </span>
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: ca.bg }}
        />
        <ManagerCrest slug={r.a.s} name={r.a.n} size={18} />
      </span>
      <span className="shrink-0 px-1 font-mono text-[14px] font-black tabular-nums text-ink-900">
        {r.ga}
        <span className="px-0.5 text-ink-400">×</span>
        {r.gb}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <ManagerCrest slug={r.b.s} name={r.b.n} size={18} />
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: cb.bg }}
        />
        <span className={`truncate ${bWon ? "font-extrabold text-ink-900" : "font-medium text-ink-600"}`}>
          {r.b.n}
        </span>
      </span>
    </li>
  );
}

// ITEM F — confronto de FORÇA simétrico: as DUAS seleções lado a lado, estrelas
// comparáveis e o tier de cada uma sob o respectivo escudo (sem rótulo "Média" solto
// no meio). Usado no card do próximo jogo (e em qualquer ponto VS). `light` adapta
// pro fundo escuro do card do hub. Estrelas, nunca número cru (decisão item 13).
export function StrengthVS({
  mine,
  opp,
  light = false,
}: {
  mine: Team;
  opp: Team;
  light?: boolean;
}) {
  const muted = light ? "text-white/70" : "text-ink-500";
  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-start gap-2"
      aria-label={`Comparação de força: ${mine.n} contra ${opp.n}`}
    >
      <StrengthSide team={mine} sideLabel="Você" align="left" light={light} />
      <span className={`self-center text-[10px] font-extrabold uppercase tracking-wide ${muted}`}>
        força
      </span>
      <StrengthSide team={opp} sideLabel={TIER_LABEL[opp.t]} align="right" light={light} />
    </div>
  );
}

function StrengthSide({
  team,
  sideLabel,
  align,
  light,
}: {
  team: Team;
  sideLabel: string;
  align: "left" | "right";
  light: boolean;
}) {
  const muted = light ? "text-white/70" : "text-ink-500";
  return (
    <div className={`flex flex-col gap-0.5 ${align === "right" ? "items-end text-right" : "items-start"}`}>
      <Stars o={team.o} light={light} />
      <span className={`text-[10.5px] font-bold uppercase tracking-wide ${muted}`}>{sideLabel}</span>
    </div>
  );
}

// linha de resultado (histórico de jogos)
export function HistoryRow({
  stage,
  opp,
  gf,
  ga,
  pens,
  win,
  draw,
  ko,
}: {
  stage: string;
  opp: Team;
  gf: number;
  ga: number;
  pens: string | null;
  win: boolean;
  draw: boolean;
  ko?: boolean;
}) {
  const cls = ko
    ? win
      ? "win"
      : "lose"
    : win
      ? "win"
      : draw
        ? "neutral"
        : "lose";
  const tone =
    cls === "win"
      ? "bg-grass-500/15 border-l-grass-600"
      : cls === "lose"
        ? "bg-flame-500/12 border-l-flame-600"
        : "bg-surface-2 border-l-transparent";
  return (
    <div
      className={`my-1 flex items-center justify-between gap-2 rounded-[10px] border-l-[3px] px-3 py-2 text-[13px] text-ink-800 ${tone}`}
    >
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <span className="shrink-0">{stage} ·</span>
        <ManagerCrest slug={opp.s} name={opp.n} />
        <span className="truncate">{opp.n}</span>
      </span>
      <span className="shrink-0 font-mono font-extrabold tabular-nums">
        {gf}×{ga}
        {pens ? ` (${pens} pen)` : ""}
      </span>
    </div>
  );
}

// controle segmentado manual (estilo/postura/marcação) — escolhas 100% do jogador,
// SEM apontar opção "ideal" (sem ⚠/✓), espelhando o protótipo.
export function SegBlock<T extends string>({
  label,
  opts,
  value,
  onPick,
}: {
  label: string;
  opts: [T, string][];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 mt-3.5 flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        {label}
      </div>
      <div className="flex gap-1.5 overflow-x-auto rounded-[13px] border border-border bg-surface-2 p-1">
        {opts.map(([v, lbl]) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(v)}
              className={`min-h-[42px] min-w-max whitespace-nowrap rounded-[10px] px-3 text-[13px] font-bold transition-[transform,background-color,color,box-shadow] duration-150 ease-out active:scale-[0.97] ${
                on ? "scale-[1.03] bg-brand-600 text-white shadow-sm" : "text-ink-600 hover:text-ink-800"
              }`}
            >
              {lbl}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ITEM #7 — legenda discreta que distingue Finalizações × Chutes ao gol. Aparece sob as
// barras quando as duas métricas estão à vista. Não polui (uma linha, ink-500), e
// garante a leitura correta da coerência do motor (chutes ao gol ≤ finalizações sempre).
// Reutilizada pelos painéis pós-jogo, do intervalo e ao vivo — para a explicação ser a
// MESMA em todos os pontos de contato.
export function StatsLegend({ className = "" }: { className?: string }) {
  return (
    <p
      className={`mt-2.5 border-t border-border pt-2 text-[10.5px] leading-snug text-ink-500 ${className}`}
    >
      <b className="font-bold text-ink-600">Finalizações</b>: todos os arremates (inclusive
      pra fora e bloqueados). <b className="font-bold text-ink-600">Chutes ao gol</b>: só os
      na direção do gol.
    </p>
  );
}

// ITEM 12 — painel de estatísticas. Uma linha por métrica, com barra comparativa
// (proporção entre os dois lados) e os números nas pontas. Tokens do tema (sem hex
// hardcoded) — legível em claro e escuro.
// ITEM #6: o intervalo deixou de ser "denso" — mostra as 6 métricas, iguais ao ao
// vivo/pós-jogo. O parâmetro `dense` foi removido (não havia outro uso de 3 stats).
export function MatchStatsPanel({
  stats,
  myName,
  oppName,
  title = "Estatísticas da partida",
}: {
  stats: MatchStats;
  myName: string;
  oppName: string;
  title?: string;
}) {
  const rows: { label: string; a: number; b: number; suffix?: string }[] = [
    { label: "Posse de bola", a: stats.poss.a, b: stats.poss.b, suffix: "%" },
    { label: "Finalizações", a: stats.fin.a, b: stats.fin.b },
    { label: "Chutes ao gol", a: stats.sot.a, b: stats.sot.b },
    { label: "Passes certos", a: stats.passAcc.a, b: stats.passAcc.b, suffix: "%" },
    { label: "Faltas", a: stats.fouls.a, b: stats.fouls.b },
    { label: "Desarmes", a: stats.tackles.a, b: stats.tackles.b },
  ];
  return (
    <div className="rounded-[14px] border border-border bg-surface p-3.5">
      <div className="mb-1 flex items-center justify-between text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">
        <span className="truncate text-brand-700">{myName}</span>
        <span className="shrink-0 px-2">{title}</span>
        <span className="truncate text-right text-ink-700">{oppName}</span>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        {rows.map((r) => {
          const total = r.a + r.b || 1;
          const pa = Math.round((r.a / total) * 100);
          const aWins = r.a >= r.b;
          return (
            <div key={r.label}>
              <div className="flex items-center justify-between text-[12.5px] font-bold tabular-nums text-ink-800">
                <span className={aWins ? "text-brand-700" : undefined}>
                  {r.a}
                  {r.suffix ?? ""}
                </span>
                <span className="text-[10.5px] font-extrabold uppercase tracking-wide text-ink-500">
                  {r.label}
                </span>
                <span className={!aWins ? "text-ink-900" : undefined}>
                  {r.b}
                  {r.suffix ?? ""}
                </span>
              </div>
              <div
                className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label={`${r.label}: ${myName} ${r.a}${r.suffix ?? ""}, ${oppName} ${r.b}${r.suffix ?? ""}`}
              >
                <span className="block h-full rounded-l-full bg-brand-500" style={{ width: `${pa}%` }} />
                <span className="block h-full rounded-r-full bg-ink-400" style={{ width: `${100 - pa}%` }} />
              </div>
            </div>
          );
        })}
      </div>
      <StatsLegend />
    </div>
  );
}

// ITEM 8 (transparência) — "O QUE VENCE O QUE", às cegas, na seleção de tática.
// Mostra o anel pedra-papel-tesoura do MEU estilo: quem ele supera e por quem é
// superado. SEM número cru (mantém o tom boleiro), só a regra existente revelada.
export function StyleRing({ estilo }: { estilo: Estilo }) {
  const m = styleMatchup(estilo);
  return (
    <div className="mt-2.5 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        O que vence o que
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="rounded-md bg-brand-600 px-2 py-1 font-bold text-white">
          {ESTILO_NM[estilo]}
        </span>
        <span className="font-bold text-grass-600">vence ›</span>
        <span className="rounded-md bg-grass-500/15 px-2 py-1 font-bold text-grass-700">
          {m.beatsLabel}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="rounded-md bg-flame-500/12 px-2 py-1 font-bold text-flame-700">
          {m.losesToLabel}
        </span>
        <span className="font-bold text-flame-600">› supera o seu</span>
      </div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-ink-600">
        Estilo certo pode virar o jogo, mas a força base ainda pesa muito. Formação,
        postura e marcação somam ao plano.
      </div>
    </div>
  );
}

// ITEM 8 (transparência) — vantagens CONCRETAS do meu plano contra o do rival, no
// intervalo (tática da IA já revelada). Badges legíveis, derivados das MESMAS regras
// do motor (matchupHints), sem expor o edge numérico.
export function MatchupBadges({ my, opp }: { my: Tactic; opp: Tactic }) {
  const hints = matchupHints(my, opp);
  if (hints.length === 0)
    return (
      <div className="mt-2 text-[12px] text-ink-600">
        Confronto parelho de planos: o detalhe (e a força) decide.
      </div>
    );
  const tone = (k: "good" | "bad" | "neutral") =>
    k === "good"
      ? "border-l-grass-600 bg-grass-500/12 text-grass-700"
      : k === "bad"
        ? "border-l-flame-600 bg-flame-500/10 text-flame-700"
        : "border-l-ink-300 bg-surface-2 text-ink-700";
  const mark = (k: "good" | "bad" | "neutral") => (k === "good" ? "▲" : k === "bad" ? "▼" : "•");
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {hints.map((h, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 rounded-[10px] border-l-[3px] px-2.5 py-1.5 text-[12.5px] font-semibold ${tone(h.kind)}`}
        >
          <span aria-hidden className="mt-px shrink-0 text-[11px] font-black">
            {mark(h.kind)}
          </span>
          <span className="min-w-0">{h.text}</span>
        </div>
      ))}
    </div>
  );
}

// grid das 8 formações (manual; clicar NÃO mexe nos outros eixos)
export function FormGrid<T extends string>({
  opts,
  value,
  onPick,
}: {
  opts: [T, string][];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {opts.map(([v, lbl]) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(v)}
            className={`min-h-[42px] rounded-[10px] border px-1 text-[12.5px] font-bold transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-out active:scale-[0.96] ${
              on
                ? "scale-[1.04] border-transparent bg-brand-600 text-white shadow-sm"
                : "border-border bg-surface-2 text-ink-600 hover:border-brand-400"
            }`}
          >
            {lbl}
          </button>
        );
      })}
    </div>
  );
}
