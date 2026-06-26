// Componentes de apresentação compartilhados do Manager.
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { AtkStyle, DefStyle, Form, GroupOtherResult, MatchStats, Standing, Tactic, Team } from "./types";
import { defenseMatchup, matchupHints, sintoniaReadout, sortStandings, styleMatchup } from "./engine";
import type { PresetKey } from "./engine";
import { PRESET_DESC } from "./ui";
import {
  ATK_IDENTITY_SHORT,
  ATK_NM,
  DEF_IDENTITY_SHORT,
  DEF_NM,
  FORM_COL_LABEL,
  FORM_ROWS,
  type SliderKey,
  SLIDER_META,
  sliderZone,
  TIER_LABEL,
  flagEmoji,
  flagSigla,
  starsFor,
} from "./ui";
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
  withName = false,
}: {
  mine: Team;
  opp: Team;
  light?: boolean;
  withName?: boolean; // mostra escudo + nome do time (cabeçalho da tela de tática)
}) {
  const muted = light ? "text-white/70" : "text-ink-500";
  return (
    <div
      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2"
      aria-label={`Comparação de força: ${mine.n} contra ${opp.n}`}
    >
      <StrengthSide team={mine} sideLabel="Você" align="left" light={light} withName={withName} />
      <span className={`self-center text-[10px] font-extrabold uppercase tracking-wide ${muted}`}>
        {withName ? "vs" : "força"}
      </span>
      <StrengthSide team={opp} sideLabel={TIER_LABEL[opp.t]} align="right" light={light} withName={withName} />
    </div>
  );
}

function StrengthSide({
  team,
  sideLabel,
  align,
  light,
  withName = false,
}: {
  team: Team;
  sideLabel: string;
  align: "left" | "right";
  light: boolean;
  withName?: boolean;
}) {
  const muted = light ? "text-white/70" : "text-ink-500";
  const right = align === "right";
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 ${right ? "items-end text-right" : "items-start"}`}>
      {withName && (
        <span className={`flex min-w-0 max-w-full items-center gap-1.5 ${right ? "flex-row-reverse" : ""}`}>
          <ManagerCrest slug={team.s} name={team.n} size={20} className="shrink-0" />
          <span className={`truncate text-[13.5px] font-extrabold ${light ? "text-white" : "text-ink-900"}`}>
            {team.n}
          </span>
        </span>
      )}
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
      ? "bg-grass-500/15 border border-grass-600/30"
      : cls === "lose"
        ? "bg-flame-500/12 border border-flame-600/30"
        : "bg-surface-2 border border-border";
  return (
    <div
      className={`my-1 flex items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-[13px] text-ink-800 ${tone}`}
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

// ===== ESTILO (ataque OU defesa) — picker com 1 LINHA de identidade por opção (§3).
// Lista vertical: cada linha = nome + identidade, escaneável e nunca quebra (mobile→
// desktop). role=radiogroup; a opção marcada ganha o realce de marca. Os números do
// motor NÃO aparecem aqui (decisão item 13) — só a identidade boleira. =====
type StyleOpt<T> = { value: T; name: string; short: string };
const ATK_PICK: StyleOpt<AtkStyle>[] = (
  ["posse", "vertical", "bolalonga", "contra", "drible"] as AtkStyle[]
).map((v) => ({ value: v, name: ATK_NM[v], short: ATK_IDENTITY_SHORT[v] }));
const DEF_PICK: StyleOpt<DefStyle>[] = (
  ["zona", "individual", "mista", "libero", "dobra"] as DefStyle[]
).map((v) => ({ value: v, name: DEF_NM[v], short: DEF_IDENTITY_SHORT[v] }));

// ITEM 5: COLUNA compacta de estilo — radio + nome + 1 linha CURTA. Pensada pra ficar
// lado a lado (2 colunas) já a partir de ~360px sem quebrar: alvo ≥44px, texto trunca,
// descrição curtíssima (ATK/DEF_IDENTITY_SHORT). role=radiogroup por coluna.
function StyleColumn<T extends string>({
  label,
  opts,
  value,
  onPick,
}: {
  label: string;
  opts: StyleOpt<T>[];
  value: T;
  onPick: (v: T) => void;
}) {
  const hid = `mgr-stylecol-${label}`;
  return (
    <section aria-labelledby={hid} className="min-w-0">
      <h3 id={hid} className="mb-1.5 text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        {label}
      </h3>
      <div role="radiogroup" aria-label={label} className="flex flex-col gap-1.5">
        {opts.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onPick(o.value)}
              className={`flex min-h-[44px] min-w-0 items-center gap-2 rounded-[12px] border px-2.5 py-1.5 text-left transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-out active:scale-[0.99] ${
                on ? "border-brand-500 bg-brand-500/10 shadow-sm" : "border-border bg-surface-2 hover:border-brand-400"
              }`}
            >
              <span
                aria-hidden
                className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 transition-colors ${
                  on ? "border-brand-600" : "border-ink-300"
                }`}
              >
                <span className={`h-2 w-2 rounded-full bg-brand-600 transition-transform duration-150 ${on ? "scale-100" : "scale-0"}`} />
              </span>
              <span className="min-w-0">
                <span className={`block truncate text-[13px] font-bold leading-tight ${on ? "text-brand-800" : "text-ink-800"}`}>
                  {o.name}
                </span>
                <span className="block truncate text-[10.5px] leading-snug text-ink-500">{o.short}</span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// ITEM 5: os dois pickers (ataque · defesa) LADO A LADO em 2 colunas, descrição reduzida.
// 2 colunas desde ~360px; o gap encolhe no mobile. Cada coluna com seu título.
export function AttackDefenseColumns({
  atk,
  def,
  onAtk,
  onDef,
}: {
  atk: AtkStyle;
  def: DefStyle;
  onAtk: (v: AtkStyle) => void;
  onDef: (v: DefStyle) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:gap-3">
      <StyleColumn label="Estilo de ataque" opts={ATK_PICK} value={atk} onPick={onAtk} />
      <StyleColumn label="Estilo de defesa" opts={DEF_PICK} value={def} onPick={onDef} />
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
export function StyleRing({ atk }: { atk: AtkStyle }) {
  const m = styleMatchup(atk);
  return (
    <div className="mt-2.5 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
      <div className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        O que seu ataque enfrenta
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="rounded-md bg-brand-600 px-2 py-1 font-bold text-white">
          {ATK_NM[atk]}
        </span>
        <span className="font-bold text-grass-600">machuca ›</span>
        <span className="rounded-md bg-grass-500/15 px-2 py-1 font-bold text-grass-700">
          {m.beatsLabel}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[12.5px]">
        <span className="rounded-md bg-flame-500/12 px-2 py-1 font-bold text-flame-700">
          {m.losesToLabel}
        </span>
        <span className="font-bold text-flame-600">› sufoca o seu</span>
      </div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-ink-600">
        Escolher o ataque certo pra defesa deles ajuda, mas a força base ainda pesa muito.
        Formação, pressão e sliders somam ao plano.
      </div>
    </div>
  );
}

// ===== "O QUE VENCE O QUE" (§14 transparência) — resumo HONESTO e legível do efeito das
// escolhas, ANTES de apitar (tática do rival ainda às cegas). Mostra: o confronto do meu
// ATAQUE (quem ele machuca / o que o sufoca), a leitura da minha DEFESA (o que ela segura
// / o que a fura) e a SINTONIA atual (meus sliders × o ideal do meu estilo/formação/força).
// Estrelas e chips, SEM número cru do motor (item 13) — só o valor 0–100 dos sliders já
// aparece no próprio slider, escolha do usuário. Determinístico (puro). =====
function TuneStars({ score }: { score: number }) {
  // 0..1 → 5 pontos (meia em meia). Reusa o vocabulário de estrelas do app.
  const n = Math.round(score * 10) / 2;
  const pct = Math.max(0, Math.min(100, score * 100));
  return (
    <span aria-label={`Sintonia: ${n} de 5`} className="relative inline-block select-none align-middle leading-none tracking-[0.12em]">
      <span aria-hidden className="text-ink-300">
        ★★★★★
      </span>
      <span aria-hidden className="absolute inset-0 overflow-hidden whitespace-nowrap text-gold-500" style={{ width: `${pct}%` }}>
        ★★★★★
      </span>
    </span>
  );
}
const TUNE_AXIS_LABEL: Record<"pressao" | "amplitude" | "agressividade", string> = {
  pressao: "Pressão",
  amplitude: "Amplitude",
  agressividade: "Pegada",
};
const TUNE_WANT_WORD: Record<"pressao" | "amplitude" | "agressividade", { alto: string; baixo: string }> = {
  pressao: { alto: "bloco alto", baixo: "bloco baixo" },
  amplitude: { alto: "pelas alas", baixo: "pelo meio" },
  agressividade: { alto: "pegada forte", baixo: "pegada suave" },
};
export function MatchPreview({ my, team }: { my: Tactic; team: Team }) {
  const atk = styleMatchup(my.atk);
  const def = defenseMatchup(my.def);
  const tune = sintoniaReadout(my, team);
  const sintoniaWord = tune.score >= 0.7 ? "afiada" : tune.score >= 0.45 ? "ok" : "fora de sintonia";
  return (
    <section
      aria-labelledby="mgr-preview-h"
      className="rounded-[14px] border border-border bg-surface-2 p-3.5"
    >
      <h3 id="mgr-preview-h" className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
        O que vence o que
      </h3>

      {/* ataque + defesa, lado a lado no desktop, empilhado no mobile */}
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded-[11px] border border-border bg-surface px-3 py-2.5">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-400">Seu ataque</div>
          <div className="mt-1 flex items-baseline gap-1.5 text-[12.5px] leading-snug">
            <b className="font-extrabold text-brand-800">{ATK_NM[my.atk]}</b>
          </div>
          <div className="mt-1 text-[12px] leading-snug text-ink-700">
            machuca <b className="font-bold text-grass-700">{atk.beatsLabel}</b> · sofre com{" "}
            <b className="font-bold text-flame-700">{atk.losesToLabel}</b>
          </div>
        </div>
        <div className="rounded-[11px] border border-border bg-surface px-3 py-2.5">
          <div className="text-[10px] font-extrabold uppercase tracking-wide text-ink-400">Sua defesa</div>
          <div className="mt-1 flex items-baseline gap-1.5 text-[12.5px] leading-snug">
            <b className="font-extrabold text-brand-800">{DEF_NM[my.def]}</b>
          </div>
          <div className="mt-1 text-[12px] leading-snug text-ink-700">
            segura <b className="font-bold text-grass-700">{def.stopsLabel}</b> · cede pra{" "}
            <b className="font-bold text-flame-700">{def.weakToLabel}</b>
          </div>
        </div>
      </div>

      {/* SINTONIA — estrelas + 3 chips (pressão/amplitude/pegada), §6.5 */}
      <div className="mt-2.5 rounded-[11px] border border-border bg-surface px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wide text-ink-400">
            Sintonia dos sliders
          </span>
          <span className="flex items-center gap-1.5">
            <TuneStars score={tune.score} />
            <span className="text-[11px] font-bold text-ink-600">{sintoniaWord}</span>
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tune.axes.map((ax) => {
            const labels = TUNE_WANT_WORD[ax.key];
            const want = ax.wants === "neutro" ? "tanto faz" : ax.wants === "alto" ? labels.alto : labels.baixo;
            const tone =
              ax.state === "match"
                ? "border border-grass-600/30 bg-grass-500/12 text-grass-700"
                : ax.state === "off"
                  ? "border border-flame-600/30 bg-flame-500/10 text-flame-700"
                  : "border border-border bg-surface-2 text-ink-600";
            const mark = ax.state === "match" ? "▲" : ax.state === "off" ? "▼" : "•";
            return (
              <span
                key={ax.key}
                className={`inline-flex items-center gap-1.5 rounded-[9px] px-2 py-1 text-[11.5px] font-semibold ${tone}`}
              >
                <span aria-hidden className="text-[10px] font-black">
                  {mark}
                </span>
                <span>
                  {TUNE_AXIS_LABEL[ax.key]}: pede {want}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-snug text-ink-500">
        Casar o ataque com a defesa deles e sintonizar os sliders ajuda, mas a força base ainda
        pesa muito. O plano estreita a diferença, não vira um abismo.
      </p>
    </section>
  );
}

// ===== SLIDER de tática (0–100) — rótulo dos polos + valor cru (escolha do usuário, ok
// mostrar o 0–100, item 13) + feedback de arraste. O trilho enche até o valor; o thumb
// cresce no toque/arraste. Acessível: input range nativo (role=slider) com aria-valuetext
// = a zona ("Pressão alta"). Tokens do tema (claro/escuro). =====
export function TacticSlider({
  slider,
  value,
  onChange,
  disabled,
}: {
  slider: SliderKey;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const meta = SLIDER_META[slider];
  const [dragging, setDragging] = useState(false);
  const zone = sliderZone(slider, value);
  const stop = () => setDragging(false);
  return (
    <div className={`select-none ${disabled ? "opacity-55" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <label className="text-[12.5px] font-bold text-ink-900">{meta.label}</label>
        <span className="flex items-baseline gap-1.5">
          <span className="text-[11px] font-semibold text-brand-700">{zone}</span>
          <span
            className={`min-w-[2.25rem] rounded-md px-1.5 py-0.5 text-center text-[11px] font-extrabold tabular-nums transition-colors duration-150 ${
              dragging ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-700"
            }`}
          >
            {value}
          </span>
        </span>
      </div>
      {/* trilho com preenchimento até o valor (sem libs; só transform/cor) */}
      <div className="relative mt-2 h-5">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-surface-2">
          <span
            className="block h-full rounded-full bg-brand-500"
            style={{ width: `${value}%`, transition: dragging ? "none" : "width 150ms ease-out" }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
          onPointerDown={() => setDragging(true)}
          onPointerUp={stop}
          onPointerCancel={stop}
          onBlur={stop}
          aria-label={meta.label}
          aria-valuetext={`${value}, ${zone}`}
          className={`mgr-range absolute inset-0 h-5 w-full cursor-pointer appearance-none bg-transparent disabled:cursor-not-allowed ${
            dragging ? "mgr-range--drag" : ""
          }`}
        />
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[10.5px] font-semibold text-ink-500">
        <span>{meta.lo}</span>
        <span>{meta.hi}</span>
      </div>
    </div>
  );
}

// bloco com os 4 sliders na ordem canônica. `onPatch` recebe o campo + valor. Espaço
// generoso entre eles (respiro), legível em qualquer largura.
export function TacticSliders({
  tac,
  onPatch,
  disabled,
}: {
  tac: Tactic;
  onPatch: (key: SliderKey, v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3.5">
      {(["postura", "pressao", "amplitude", "agressividade"] as SliderKey[]).map((k) => (
        <TacticSlider key={k} slider={k} value={tac[k]} onChange={(v) => onPatch(k, v)} disabled={disabled} />
      ))}
    </div>
  );
}

// ===== PRESETS (§9) — atalho rápido (5). Um toque carrega o conjunto pronto; o preset
// é só o PONTO DE PARTIDA, ajustável na mão sem salvar. Pílulas roláveis no mobile,
// linha cheia no desktop. role=radiogroup (cada pílula é uma opção de partida). =====
const PRESET_ORDER_UI: PresetKey[] = ["pressao", "craque", "toque", "direto", "ferrolho"];
const PRESET_LABEL_UI: Record<PresetKey, string> = {
  pressao: "Pressão",
  craque: "Craque",
  toque: "Toque",
  direto: "Direto",
  ferrolho: "Ferrolho",
};
export function PresetPicker({
  active,
  onPick,
}: {
  active: PresetKey;
  onPick: (k: PresetKey) => void;
}) {
  return (
    <section aria-labelledby="mgr-preset-h">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 id="mgr-preset-h" className="text-[11px] font-extrabold uppercase tracking-wide text-ink-500">
          Começe por um preset
        </h3>
        <span className="shrink-0 text-[10.5px] font-semibold text-ink-400">ajuste na mão depois</span>
      </div>
      <div role="radiogroup" aria-label="Preset de partida" className="grid grid-cols-5 gap-1">
        {PRESET_ORDER_UI.map((k) => {
          const on = active === k;
          return (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={on}
              title={PRESET_DESC[k]}
              onClick={() => onPick(k)}
              className={`flex min-h-[44px] min-w-0 items-center justify-center rounded-[11px] border px-1 text-center text-[12px] font-bold leading-tight transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-out active:scale-[0.96] sm:text-[13px] ${
                on
                  ? "border-transparent bg-brand-600 text-white shadow-sm"
                  : "border-border bg-surface-2 text-ink-700 hover:border-brand-400 hover:text-ink-900"
              }`}
            >
              {PRESET_LABEL_UI[k]}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] leading-snug text-ink-500">{PRESET_DESC[active]}</p>
    </section>
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
      ? "border border-grass-600/30 bg-grass-500/12 text-grass-700"
      : k === "bad"
        ? "border border-flame-600/30 bg-flame-500/10 text-flame-700"
        : "border border-border bg-surface-2 text-ink-700";
  const mark = (k: "good" | "bad" | "neutral") => (k === "good" ? "▲" : k === "bad" ? "▼" : "•");
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {hints.map((h, i) => (
        <div
          key={i}
          className={`flex items-start gap-2 rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-semibold ${tone(h.kind)}`}
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

// ===== FORMAÇÃO — grid 3×3 (§2). A LINHA é a afinidade primária (Ofensiva / Equilíbrio
// / Defensiva), legível por um rótulo à esquerda e uma faixa de cor sutil. A COLUNA é a
// tendência secundária (mais ofensiva → mais defensiva). role=radiogroup; clicar só muda
// a formação (não mexe nos estilos/sliders). Robusto em 360→1280, claro e escuro. =====
const ROW_TONE: Record<string, { rail: string; tag: string }> = {
  ata: { rail: "bg-flame-500/60", tag: "text-flame-700" },
  mei: { rail: "bg-gold-500/60", tag: "text-gold-700" },
  def: { rail: "bg-aqua-500/60", tag: "text-aqua-700" },
};
export function FormGrid({
  value,
  onPick,
}: {
  value: Form;
  onPick: (v: Form) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Formação" className="flex flex-col gap-1.5">
      {FORM_ROWS.map((row) => {
        const tone = ROW_TONE[row.key];
        return (
          <div key={row.key} className="grid grid-cols-[4.75rem_1fr] items-stretch gap-2">
            <div className="flex items-center gap-1.5">
              <span aria-hidden className={`h-full w-1 shrink-0 rounded-full ${tone.rail}`} />
              <div className="min-w-0 leading-tight">
                <div className={`text-[10.5px] font-extrabold uppercase tracking-wide ${tone.tag}`}>
                  {row.label}
                </div>
                <div className="truncate text-[9.5px] font-semibold text-ink-400">{row.hint}</div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {row.forms.map((f, ci) => {
                const on = value === f;
                return (
                  <button
                    key={f}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={`${f}, ${row.label.toLowerCase()}, ${FORM_COL_LABEL[ci]}`}
                    onClick={() => onPick(f)}
                    className={`min-h-[46px] rounded-[11px] border text-[14px] font-extrabold tabular-nums tracking-tight transition-[transform,background-color,color,border-color,box-shadow] duration-150 ease-out active:scale-[0.96] ${
                      on
                        ? "border-transparent bg-brand-600 text-white shadow-sm"
                        : "border-border bg-surface-2 text-ink-700 hover:border-brand-400 hover:text-ink-900"
                    }`}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
