// =====================================================================
// RESULTADISMO MANAGER — MOTOR v2/v4 (porte TS puro do protótipo jogável)
// mulberry32 · createMatch · stepMinute · applyCommand · simulateFull
// + runner data-driven de torneio (formatos/grupos reais) + sorteio.
//
// Núcleo 100% determinístico: NENHUM Math.random aqui. Toda aleatoriedade
// passa pelo PRNG mulberry32 semeado (seed), pra a campanha ser reproduzível
// e retomável. A UI (manager) e o managerLocal só consomem este módulo.
// =====================================================================
import type {
  BracketMatch,
  BracketRound,
  BracketSlot,
  BracketView,
  Campaign,
  ChanceKind,
  CmdState,
  CommandQuality,
  CommandResult,
  CommandType,
  Edition,
  Estilo,
  FinalGroupStageState,
  Form,
  GroupsStageState,
  HistoryEntry,
  KnockoutOutcome,
  KnockoutRound,
  KoMatchRecord,
  KoRoundRecord,
  KoSlotRecord,
  PenKick,
  PenResult,
  Shootout,
  KnockoutStageState,
  Marcacao,
  MatchEvent,
  MatchKind,
  MatchState,
  MatchStats,
  Postura,
  PossessionState,
  ProgressStep,
  SideStrength,
  Stage,
  Standing,
  StepResult,
  Tactic,
  Team,
  Tier,
  WcGroupsEdition,
  WorldMode,
} from "./types";
import RATINGS from "./data/ratings.json";
import FORMATS_JSON from "./data/formats.json";
import GROUPS_JSON from "./data/groups.json";
import RESULTS_JSON from "./data/results.json";

// dados estáticos tipados (importados do slice)
export const DATA = RATINGS as Team[];
export const FORMATS = FORMATS_JSON as Edition[];
export const WC_GROUPS = GROUPS_JSON as WcGroupsEdition[];

const WC_GROUPS_BY_YEAR: Record<number, WcGroupsEdition> = {};
WC_GROUPS.forEach((ed) => {
  WC_GROUPS_BY_YEAR[ed.year] = ed;
});

// =====================================================================
// BUG 1.1 — HISTÓRIA REAL FIEL: resultados REAIS de cada Copa (data/results.json).
// Em worldMode==="real", TODO jogo de fundo (IA×IA: grupos, 2ª fase, quadrangular,
// mata-mata, terceiro lugar, final, e a projeção do chaveamento) puxa o placar REAL
// daqui. Só os confrontos que EU jogo divergem da história (efeito borboleta).
// O lookup é por ano + par de slugs {a,b}, casando os DOIS sentidos; quando o mesmo
// par se repetiu (replays/2ª fase/reencontros), desempata por CLASSE de fase.
// =====================================================================
// um jogo real cru, já orientado a (a,b) com gols ga/gb (pa/pb = pênaltis, se houve).
interface RealMatchRaw {
  a: string;
  b: string;
  ga: number;
  gb: number;
  pa?: number;
  pb?: number;
  stage: string;
}
type RealResults = Record<string, RealMatchRaw[]>;
const RESULTS = RESULTS_JSON as RealResults;

// resultado REAL já orientado ao par consultado (teamA, teamB): gA/gB do ponto de
// vista de teamA, mais os pênaltis (se houve) e quem venceu.
export interface RealResult {
  gA: number;
  gB: number;
  pensA: number | null;
  pensB: number | null;
}

// classe grossa de fase (engine ↔ rótulos en de results.json), p/ desempatar pares
// que se repetem no mesmo ano. null = "não importa" (casa qualquer fase).
export type StageClass = "group" | "R32" | "R16" | "QF" | "SF" | "final" | "third";

// rótulo en de results.json → classe grossa. ATENÇÃO à ordem: "Semi-finals" e
// "Quarter-finals" CONTÊM "final" como substring — testá-los ANTES de "final".
function classifyRealStage(stage: string): StageClass {
  const s = stage.toLowerCase();
  if (s.includes("third") || s.includes("for third place")) return "third";
  if (s.includes("semi")) return "SF";
  if (s.includes("quarter")) return "QF";
  if (s.includes("round of 16")) return "R16";
  // mata-mata puro de 1934/38: preliminar/1ª rodada = oitavas (R16).
  if (s.includes("preliminary") || s.includes("first round")) return "R16";
  if (s.includes("final")) return "final"; // "Final" / "Final Round" (1950)
  // grupos e play-offs de grupo.
  return "group";
}

// normaliza um slug de results.json para o slug usado nas notas (ratings.json):
// remove sufixo de ano (ex.: "eua2026"→"eua") e aplica aliases pontuais.
const SLUG_ALIAS: Record<string, string> = { eua: "estadosunidos" };
function normalizeRealSlug(slug: string): string {
  const base = slug.replace(/\d{4}$/, "");
  return SLUG_ALIAS[base] || base;
}
function pairKeyUnordered(a: string, b: string): string {
  return a < b ? a + "~" + b : b + "~" + a;
}

// índice por ano: pairKey → lista de {classe, raw} (preserva a ordem original p/
// orientar gols). Construído uma vez (módulo), determinístico e barato.
interface IndexedReal {
  cls: StageClass;
  a: string; // slug normalizado do lado "a" original
  b: string;
  ga: number;
  gb: number;
  pa?: number;
  pb?: number;
}
const REAL_INDEX: Record<number, Record<string, IndexedReal[]>> = {};
(function buildRealIndex() {
  Object.keys(RESULTS).forEach((yKey) => {
    const year = Number(yKey);
    const byPair: Record<string, IndexedReal[]> = {};
    RESULTS[yKey].forEach((m) => {
      const a = normalizeRealSlug(m.a);
      const b = normalizeRealSlug(m.b);
      const key = pairKeyUnordered(a, b);
      (byPair[key] = byPair[key] || []).push({
        cls: classifyRealStage(m.stage),
        a,
        b,
        ga: m.ga,
        gb: m.gb,
        pa: m.pa,
        pb: m.pb,
      });
    });
    REAL_INDEX[year] = byPair;
  });
})();

// devolve o resultado REAL de teamA × teamB nesta edição (orientado a teamA), ou null
// se a história não tem esse confronto (ex.: par que nunca se enfrentou de verdade —
// fruto de um sorteio/efeito borboleta divergente). Se `cls` for passado, prioriza a
// fase certa quando o par se repetiu no ano; senão casa o 1º registro do par.
export function realResult(
  year: number,
  teamA: Team,
  teamB: Team,
  cls?: StageClass,
): RealResult | null {
  const byPair = REAL_INDEX[year];
  if (!byPair) return null;
  const aSlug = normalizeRealSlug(teamA.s);
  const bSlug = normalizeRealSlug(teamB.s);
  const recs = byPair[pairKeyUnordered(aSlug, bSlug)];
  if (!recs || recs.length === 0) return null;
  // escolhe o registro: classe igual primeiro; senão o 1º do par.
  let rec = recs[0];
  if (cls) {
    const m = recs.find((r) => r.cls === cls);
    if (m) rec = m;
  }
  // orienta os gols pro ponto de vista de teamA (o "a" do registro pode ser teamB).
  const aIsRecA = rec.a === aSlug;
  const gA = aIsRecA ? rec.ga : rec.gb;
  const gB = aIsRecA ? rec.gb : rec.ga;
  const hasPens = rec.pa != null && rec.pb != null;
  const pensA = hasPens ? (aIsRecA ? (rec.pa as number) : (rec.pb as number)) : null;
  const pensB = hasPens ? (aIsRecA ? (rec.pb as number) : (rec.pa as number)) : null;
  return { gA, gB, pensA, pensB };
}

// ---------------------------------------------------------------------
// PRNG + amostragens
// ---------------------------------------------------------------------
export function mulberry32(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rnd: () => number): number {
  const u = 1 - rnd();
  const v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function gammaSample(rnd: () => number, k: number): number {
  if (k < 1) {
    const u = rnd();
    return gammaSample(rnd, 1 + k) * Math.pow(u, 1 / k);
  }
  const d = k - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = gauss(rnd);
    let v = 1 + c * x;
    if (v <= 0) continue;
    v = v * v * v;
    const u2 = rnd();
    if (u2 < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u2) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// ---------------------------------------------------------------------
// Parâmetros do motor (v4)
// ---------------------------------------------------------------------
export const P = {
  RAW_CHANCES_PER_HALF: 4.7,
  CONV_BASE: 0.246,
  SHARE_SOFT: 1.55,
  CONV_DEF_PULL: 0.95,
  CONV_SPAN_FACTOR: 0.8,
  CHANCE_QUALITY_VAR: 0.28,
  FATIGUE_2H: 1.05,
  CONV_MIN: 0.04,
  CONV_MAX: 0.52,
  W_ATK: 0.6,
  W_MID: 0.4,
  // v4: 5 estilos · 5 posturas · 3 marcações · 8 formações
  // item 8: pesos dos componentes táticos ELEVADOS de forma equilibrada (~1.8×) pra
  // que tática+formação COERENTES possam sobrepor a força base — sem ignorá-la (gap
  // grande ainda manda). Calibrado com simulateFull (média de gols ~2.5–2.8 mantida).
  STYLE_CROSS_BONUS: 0.1,
  MARK_CROSS_EDGE: 0.08,
  STYLE_VS_STYLE: 0.045,
  POSTURE_EDGE_OFF: 0.05,
  POSTURE_EDGE_EXT: 0.085,
  COHERENCE_SYNERGY: 0.05,
  COHERENCE_PENALTY: 0.45,
  LAT_AMP: 1.25,
  LAT_NEG: 0.9,
  CENTER_DENS: 0.06,
  // tetos do edge tático elevados moderadamente (item 8): formação ±0.11, total ±0.20.
  FORM_EDGE_CAP: 0.11,
  EDGE_CAP: 0.2,
  // item 8: o netEdge agora é BIDIRECIONAL — além do ataque (tacMul), também pesa na
  // defesa e na conversão. kDef/kConv calibram quanto do edge vaza pra esses canais
  // (frações do edge), pra um plano coerente render um swing real ~±20% no resultado.
  EDGE_DEF_K: 0.78,
  EDGE_CONV_K: 0.32,
  OD_GAMMA_K: 8.0,
  OD_VOL_EXP: 0.55,
  OD_CONV_EXP: 0.3,
  CHANCES_HALF_CAP: 8,
  OPEN_POSTURE_GAIN: 0.22,
  OPEN_CHANCES_MAX: 1.3,
  OPEN_CONV_GAIN: 0.08,
  COLLAPSE_DIFF_TRIGGER: 3,
  COLLAPSE_MIN_MINUTE: 60,
  COLLAPSE_DEF_DROP: 0.14,
  COLLAPSE_CONV_DROP: 0.1,
  COLLAPSE_WINNER_CONV: 0.09,
  COLLAPSE_MAX_PANIC: 2.0,
  // timing de comandos por posse (v4)
  POSS_WITH: 0.52,
  POSS_WITHOUT: 0.48,
  POSS_SWING: 0.08,
  CMD_BAD_OFF: 0.35,
  CMD_BAD_EXPOSE: 1.15,
  CMD_BAD_RECUO_ATK: 0.85,
  CMD_OK: 0.75,
  TIMING_CONV_PEN: 0.9,
  PRESS_ATK: 1.28,
  PRESS_DEF_EXPOSE: 1.22,
  PRESS_CONV: 1.08,
  RECUO_ATK: 0.74,
  RECUO_DEF: 1.26,
  RECUO_CONV: 0.92,
  CMD_DECAY: 0.93,
  CMD_DURATION_MIN: 9,
  CMD_COOLDOWN_MIN: 6,
  OPEN_RECENTER: 1.0,
  MAX_GOALS_PER_SIDE: 7,
  // item 7: cooldown próprio do AJUSTE TÁTICO ao vivo (estilo/postura/marcação),
  // separado do press/recuo — evita "metralhar" os eixos. ~8' de relógio.
  LIVETAC_COOLDOWN_MIN: 8,
} as const;

// 5 POSTURAS (multiplicador interno)
type MentVal = { atk: number; def: number; conv: number };
const MENT: Record<Postura, MentVal> = {
  all_in: { atk: 1.3, def: 0.7, conv: 1.14 },
  atk: { atk: 1.16, def: 0.86, conv: 1.08 },
  eq: { atk: 1, def: 1, conv: 1 },
  def: { atk: 0.84, def: 1.16, conv: 0.94 },
  retranca: { atk: 0.7, def: 1.3, conv: 0.86 },
};
function postureEdge(p: Postura, mul: number): number {
  const e =
    p === "all_in"
      ? P.POSTURE_EDGE_EXT
      : p === "atk"
        ? P.POSTURE_EDGE_OFF
        : p === "def"
          ? -P.POSTURE_EDGE_OFF
          : p === "retranca"
            ? -P.POSTURE_EDGE_EXT
            : 0;
  return e * mul;
}

// 8 FORMAÇÕES: pesos de linha + largura(W) / densidade central(C)
type FormVal = { atk: number; mid: number; def: number; W: number; C: number };
export const FORMATIONS: Record<Form, FormVal> = {
  "433": { atk: 1.02, mid: 1.05, def: 1.0, W: 1, C: 1 },
  "442": { atk: 1.03, mid: 0.97, def: 1.02, W: 1, C: -1 },
  "352": { atk: 1.0, mid: 1.06, def: 1.0, W: 0, C: 1 },
  "4231": { atk: 0.98, mid: 1.03, def: 1.05, W: 0, C: 1 },
  "532": { atk: 0.93, mid: 0.98, def: 1.12, W: -1, C: 0 },
  "4312": { atk: 1.04, mid: 1.07, def: 0.96, W: -1, C: 1 },
  "343": { atk: 1.1, mid: 1.0, def: 0.9, W: 1, C: 0 },
  "424": { atk: 1.12, mid: 0.92, def: 0.92, W: 1, C: -1 },
};
// anel dirigido de 8 + 5 cordas (peso bruto baixo: formação é TENDÊNCIA)
const FORM_EDGES: [Form, Form, number][] = [
  ["433", "442", 0.045],
  ["442", "352", 0.04],
  ["352", "4312", 0.05],
  ["4312", "4231", 0.04],
  ["4231", "532", 0.045],
  ["532", "343", 0.045],
  ["343", "424", 0.04],
  ["424", "433", 0.035],
  ["433", "4231", 0.02],
  ["352", "343", 0.02],
  ["4231", "442", 0.02],
  ["532", "424", 0.03],
  ["4312", "424", 0.025],
];
const FORM_MATRIX: Record<Form, Record<Form, number>> = {} as Record<Form, Record<Form, number>>;
(function buildFormMatrix() {
  const F = Object.keys(FORMATIONS) as Form[];
  F.forEach((a) => {
    FORM_MATRIX[a] = {} as Record<Form, number>;
    F.forEach((b) => {
      FORM_MATRIX[a][b] = 0;
    });
  });
  FORM_EDGES.forEach((e) => {
    FORM_MATRIX[e[0]][e[1]] = +e[2];
    FORM_MATRIX[e[1]][e[0]] = -e[2];
  });
})();
function formBonus(my: Form, opp: Form): number {
  if (my === opp) return 0;
  return (FORM_MATRIX[my] && FORM_MATRIX[my][opp]) || 0;
}

// 5 ESTILOS (atk/mid/conv/ritmo)
type StyleVal = { atk: number; mid: number; conv: number; ritmo: number };
export const STYLE: Record<Estilo, StyleVal> = {
  passes: { atk: 1.04, mid: 1.08, conv: 1.0, ritmo: 0.88 },
  meio: { atk: 1.05, mid: 1.04, conv: 1.05, ritmo: 1.0 },
  lados: { atk: 1.06, mid: 0.98, conv: 1.02, ritmo: 1.02 },
  longas: { atk: 1.07, mid: 0.9, conv: 1.06, ritmo: 1.18 },
  contra: { atk: 1.0, mid: 0.94, conv: 1.13, ritmo: 1.16 },
};
// mini-anel não-transitivo de 5: passes>meio>longas>contra>lados>passes
const STYLE_RING: Record<Estilo, Estilo> = {
  passes: "meio",
  meio: "longas",
  longas: "contra",
  contra: "lados",
  lados: "passes",
};
function styleVsStyle(my: Estilo, opp: Estilo): number {
  if (my === opp) return 0;
  if (STYLE_RING[my] === opp) return P.STYLE_VS_STYLE;
  if (STYLE_RING[opp] === my) return -P.STYLE_VS_STYLE;
  return 0;
}

// ===== TRANSPARÊNCIA DO CONFRONTO (item 8) =====
// "O que vence o que", legível, SEM número cru — só o anel pedra-papel-tesoura dos
// estilos. A UI mostra isto na seleção de tática (anel geral, às cegas) e badges de
// vantagem no intervalo (quando a tática do rival é revelada).
export const STYLE_BEATS: Record<Estilo, Estilo> = { ...STYLE_RING };
// rótulo curto de cada estilo (espelha ESTILO_NM da ui, mas o engine não importa ui).
const ESTILO_SHORT: Record<Estilo, string> = {
  passes: "Troca de Passes",
  meio: "Pelo Meio",
  lados: "Pelos Lados",
  longas: "Bolas Longas",
  contra: "Contra-ataque",
};
// quem o estilo X "supera" e por quem é "superado" no anel não-transitivo.
export function styleMatchup(e: Estilo): { beats: Estilo; beatsLabel: string; losesTo: Estilo; losesToLabel: string } {
  const beats = STYLE_RING[e];
  let losesTo: Estilo = e;
  (Object.keys(STYLE_RING) as Estilo[]).forEach((k) => {
    if (STYLE_RING[k] === e) losesTo = k;
  });
  return { beats, beatsLabel: ESTILO_SHORT[beats], losesTo, losesToLabel: ESTILO_SHORT[losesTo] };
}

// Vantagens CONCRETAS do meu plano contra o do rival (usado no intervalo, com a
// tática da IA revelada). Devolve sinais legíveis — sem expor o netEdge numérico.
// Regras data-driven (espelham styleCross/markCross), avaliadas em sequência.
export type MatchupSignal = { kind: "good" | "bad" | "neutral"; text: string };
type MatchupRule = { when: (my: Tactic, opp: Tactic) => boolean; kind: MatchupSignal["kind"]; text: string };
const inSet = <T,>(v: T, ...xs: T[]) => xs.indexOf(v) >= 0;
const MATCHUP_RULES: MatchupRule[] = [
  { when: (m, o) => m.estilo === "passes" && o.marcacao === "baixa", kind: "good", text: "Troca de passes fura o bloco baixo deles." },
  { when: (m, o) => m.estilo === "passes" && o.marcacao === "alta", kind: "bad", text: "A pressão alta deles atrapalha sua troca de passes." },
  { when: (m, o) => m.estilo === "longas" && o.marcacao === "alta", kind: "good", text: "Bolas longas passam por cima da pressão alta deles." },
  { when: (m, o) => m.estilo === "longas" && o.marcacao === "baixa", kind: "bad", text: "Bola longa rende pouco contra o bloco baixo deles." },
  { when: (m, o) => m.estilo === "meio" && o.marcacao === "alta", kind: "good", text: "Jogar pelo meio quebra a marcação alta deles." },
  { when: (m, o) => m.estilo === "contra" && inSet(o.postura, "atk", "all_in"), kind: "good", text: "Eles se lançam — seu contra-ataque acha o espaço nas costas." },
  { when: (m, o) => m.marcacao === "alta" && inSet(o.estilo, "passes", "meio"), kind: "good", text: "Pressão alta sufoca a saída de bola deles." },
  { when: (m, o) => m.marcacao === "alta" && inSet(o.estilo, "contra", "longas"), kind: "bad", text: "Marcar alto deixa espaço pro contra/bola longa deles." },
  { when: (m, o) => m.marcacao === "baixa" && inSet(o.estilo, "contra", "lados"), kind: "good", text: "Bloco baixo fecha o contra-ataque e as pontas deles." },
  { when: (m, o) => inSet(o.postura, "retranca", "def") && inSet(m.postura, "atk", "all_in"), kind: "neutral", text: "Eles se fecham e você vai pra cima — paciência pra furar." },
];
export function matchupHints(my: Tactic, opp: Tactic): MatchupSignal[] {
  const out: MatchupSignal[] = [];
  // estilo × estilo (anel não-transitivo)
  const sv = styleVsStyle(my.estilo, opp.estilo);
  if (sv > 0) out.push({ kind: "good", text: `Seu ${ESTILO_SHORT[my.estilo]} leva a melhor sobre o ${ESTILO_SHORT[opp.estilo]} deles.` });
  else if (sv < 0) out.push({ kind: "bad", text: `O ${ESTILO_SHORT[opp.estilo]} deles neutraliza seu ${ESTILO_SHORT[my.estilo]}.` });
  MATCHUP_RULES.forEach((r) => {
    if (r.when(my, opp)) out.push({ kind: r.kind, text: r.text });
  });
  return out;
}

// 3 MARCAÇÕES
type MarkVal = { defEff: number; fadiga2T: number };
const MARK: Record<Marcacao, MarkVal> = {
  alta: { defEff: 1.08, fadiga2T: 1.07 },
  media: { defEff: 1.0, fadiga2T: 1.0 },
  baixa: { defEff: 1.06, fadiga2T: 0.95 },
};

// ESTILO meu × MARCAÇÃO/POSTURA do rival (ft + conv)
function styleCross(
  myStyle: Estilo,
  oppStyle: Estilo,
  oppMark: Marcacao,
  oppPosture: Postura,
): { ft: number; conv: number } {
  let ft = 0;
  let conv = 1.0;
  const B = P.STYLE_CROSS_BONUS;
  const oppHigh = oppPosture === "atk" || oppPosture === "all_in";
  if (myStyle === "passes") {
    if (oppMark === "baixa") ft += B;
    if (oppMark === "alta") ft -= B;
  } else if (myStyle === "meio") {
    if (oppMark === "alta") ft += B;
    if (oppMark === "media") ft -= B * 0.6;
  } else if (myStyle === "longas") {
    if (oppMark === "alta") ft += B * 1.1;
    if (oppMark === "baixa") ft -= B;
  } else if (myStyle === "contra") {
    if (oppMark === "alta") ft += B;
    if (oppHigh) conv *= 1 + B;
    if (oppMark === "baixa") ft -= B;
  } else if (myStyle === "lados") {
    if (oppMark === "media") ft += B * 0.6;
    if (oppMark === "baixa") ft -= B * 0.8;
  }
  ft += styleVsStyle(myStyle, oppStyle);
  return { ft, conv };
}

// MINHA marcação × ESTILO do rival (edge espelho + rivalConv)
function markCross(
  myMark: Marcacao,
  oppStyle: Estilo,
): { defEff: number; fadiga2T: number; rivalConv: number; edge: number } {
  const m = MARK[myMark];
  let rivalConv = 1.0;
  const defEff = m.defEff;
  let edge = 0;
  const E = P.MARK_CROSS_EDGE;
  if (myMark === "alta") {
    if (oppStyle === "passes" || oppStyle === "meio") {
      rivalConv *= 0.94;
      edge += E;
    }
    if (oppStyle === "contra" || oppStyle === "longas") {
      edge -= E;
    }
  } else if (myMark === "baixa") {
    if (oppStyle === "contra" || oppStyle === "lados") {
      rivalConv *= 0.94;
      edge += E;
    }
    if (oppStyle === "passes" || oppStyle === "longas") {
      edge -= E;
    }
  }
  return { defEff, fadiga2T: m.fadiga2T, rivalConv, edge };
}

// FORMAÇÃO × ESTILO próprio: largura (W) e densidade central (C)
function formStyleTune(
  form: Form,
  style: Estilo,
  formEdge: number,
): { formEdge: number; latKill: number; dens: number } {
  const f = FORMATIONS[form] || FORMATIONS["433"];
  const out = { formEdge, latKill: 1.0, dens: 0 };
  if (style === "lados") {
    if (f.W > 0 && formEdge > 0) out.formEdge = formEdge * P.LAT_AMP;
    if (f.W > 0 && formEdge < 0) out.formEdge = formEdge * P.LAT_NEG;
    if (f.W < 0) {
      out.formEdge = formEdge * P.LAT_NEG;
      out.latKill = form === "4312" ? 0.5 : 0.8;
      out.dens -= P.CENTER_DENS * 0.5;
    }
  }
  if (style === "meio") {
    out.dens += f.C > 0 ? P.CENTER_DENS : f.C < 0 ? -P.CENTER_DENS : 0;
  }
  if (style === "passes") {
    out.dens +=
      f.C > 0 ? P.CENTER_DENS * 0.6 : form === "442" || form === "424" ? -P.CENTER_DENS * 0.8 : 0;
  }
  if (style === "longas") {
    out.dens +=
      form === "424" || form === "442" || form === "532"
        ? P.CENTER_DENS * 0.7
        : form === "433" || form === "4312"
          ? -P.CENTER_DENS * 0.6
          : 0;
  }
  if (style === "contra") {
    out.dens += form === "343" || form === "424" ? -P.CENTER_DENS * 0.5 : 0;
  }
  return out;
}

// COERÊNCIA formação ↔ 3 eixos (postureMul, synergy; latKill via formStyleTune)
export function coherence(tac: Tactic): { postureMul: number; synergy: number; latKill: number } {
  const form = tac.form;
  const p = tac.postura;
  const style = tac.estilo;
  const mark = tac.marcacao;
  const out = { postureMul: 1.0, synergy: 0, latKill: 1.0 };
  const ext_off = p === "all_in" || p === "atk";
  const ext_def = p === "retranca" || p === "def";
  const heavyOff = p === "all_in";
  const heavyDef = p === "retranca";
  if ((form === "532" || form === "4231") && ext_off) {
    out.postureMul = P.COHERENCE_PENALTY;
    out.synergy -= heavyOff ? 0.04 : 0.02;
  }
  if ((form === "343" || form === "424") && ext_def) {
    out.postureMul = P.COHERENCE_PENALTY;
    out.synergy -= heavyDef ? 0.04 : 0.02;
  }
  if (form === "532" && mark === "alta") {
    out.synergy -= 0.03;
  }
  if (form === "4312" && style === "lados") {
    out.latKill = 0.5;
  }
  const off = form === "343" || form === "433" || form === "4312" || form === "424";
  if (off && ext_off && mark === "alta") {
    out.synergy += P.COHERENCE_SYNERGY;
  }
  const def = form === "532" || form === "4231";
  if (def && ext_def && mark === "baixa") {
    out.synergy += P.COHERENCE_SYNERGY;
  }
  return out;
}

export function sideStrength(team: Team, tac: Tactic, oppTac: Tactic): SideStrength {
  const posture = MENT[tac.postura] || MENT.eq;
  const fw = FORMATIONS[tac.form] || FORMATIONS["433"];
  const st = STYLE[tac.estilo] || STYLE.lados;
  const coh = coherence(tac);
  const postAtk = 1 + (posture.atk - 1) * coh.postureMul;
  const postDef = 1 + (posture.def - 1) * coh.postureMul;
  const postConv = 1 + (posture.conv - 1) * coh.postureMul;
  let formEdge = formBonus(tac.form, oppTac.form);
  const fst = formStyleTune(tac.form, tac.estilo, formEdge);
  formEdge = fst.formEdge;
  if (formEdge > P.FORM_EDGE_CAP) formEdge = P.FORM_EDGE_CAP;
  if (formEdge < -P.FORM_EDGE_CAP) formEdge = -P.FORM_EDGE_CAP;
  const sc = styleCross(tac.estilo, oppTac.estilo, oppTac.marcacao, oppTac.postura);
  const mc = markCross(tac.marcacao, oppTac.estilo);
  const tacticEdge =
    sc.ft + mc.edge + postureEdge(tac.postura, coh.postureMul) + coh.synergy + fst.dens;
  let netEdge = formEdge + tacticEdge;
  if (netEdge > P.EDGE_CAP) netEdge = P.EDGE_CAP;
  if (netEdge < -P.EDGE_CAP) netEdge = -P.EDGE_CAP;
  const baseOff = team.a * P.W_ATK + team.m * P.W_MID;
  const styleOff = st.atk * st.mid;
  let tacMul = 1 + netEdge;
  if (tacMul < 0.55) tacMul = 0.55;
  const off = baseOff * postAtk * styleOff * tacMul;
  // item 8: edge BIDIRECIONAL — um plano coerente (netEdge>0) também endurece a minha
  // defesa e qualifica minha conversão; um plano furado (netEdge<0) cobra nos dois. Sem
  // ignorar a base: a força (team.d, baseOff) segue dominando o gap grande.
  const defEdge = 1 + netEdge * P.EDGE_DEF_K;
  const convEdge = 1 + netEdge * P.EDGE_CONV_K;
  const defEff = team.d * fw.def * postDef * mc.defEff * defEdge;
  const convMod = postConv * st.conv * sc.conv * convEdge;
  const aggressive = tac.postura === "atk" || tac.postura === "all_in";
  return {
    off,
    ft: off,
    defEff,
    convMod,
    ritmo: st.ritmo,
    fadiga2T: mc.fadiga2T,
    rivalConvVsMe: mc.rivalConv,
    postureIsOff: aggressive,
    markIsHigh: tac.marcacao === "alta",
    netEdge,
    formEdge,
    tacticEdge,
    possSwing:
      tac.postura === "retranca"
        ? -P.POSS_SWING
        : tac.postura === "def"
          ? -P.POSS_SWING * 0.5
          : aggressive
            ? P.POSS_SWING * (tac.postura === "all_in" ? 1.3 : 1)
            : tac.estilo === "contra"
              ? -P.POSS_SWING * 0.8
              : 0,
  };
}

// ITEM 7: recomputa as forças de AMBOS os lados quando uma tática muda DURANTE a
// partida (meu ajuste ao vivo, ou a reação da IA). Recalcula SA/SB e o share de
// chances, SEM tocar gols/minuto/comandos. `tacA`/`tacB` viram as táticas correntes.
// Preserva o determinismo do resto (não consome o rnd da partida).
export function recomputeStrengths(state: MatchState, tacA: Tactic, tacB: Tactic): void {
  const SA = sideStrength(state.teamA, tacA, tacB);
  const SB = sideStrength(state.teamB, tacB, tacA);
  state.SA = SA;
  state.SB = SB;
  state.tacA = tacA;
  state.tacB = tacB;
  const ftA = Math.pow(SA.ft, P.SHARE_SOFT);
  const ftB = Math.pow(SB.ft, P.SHARE_SOFT);
  state.shareA = ftA / (ftA + ftB);
}

// ITEM 14 (reativo, ligado ao item 7): a IA ajusta a MENTALIDADE conforme o placar
// ao vivo. Mantém forma/estilo/marcação do plano inicial; só a POSTURA reage ao
// contexto (gap de força + diferença de gols + minuto). Regra dura herdada do item
// 14: um time MUITO mais forte que está perdendo vai pra cima (nunca retranca); um
// time que ganha e é mais fraco fecha pra segurar. Determinístico (sem rnd).
export function reactiveAiPosture(
  base: Tactic,
  aiStrength: number,
  oppStrength: number,
  aiGoals: number,
  oppGoals: number,
  minute: number,
): Postura {
  if (minute < 25) return base.postura; // cedo demais pra reagir
  const gap = aiStrength - oppStrength; // + = IA mais forte
  const diff = aiGoals - oppGoals; // + = IA na frente
  const late = minute >= 65;
  // IA perdendo → sobe a mentalidade (mais ainda se for favorita / se for tarde).
  if (diff < 0) {
    if (gap >= 5 || late) return diff <= -2 ? "all_in" : "atk";
    return "atk";
  }
  // IA ganhando → segura, proporcional à vantagem e ao relógio (mas favorita não retranca).
  if (diff > 0) {
    if (late && diff >= 2) return gap >= 12 ? "def" : "retranca";
    if (late) return "def";
    return diff >= 2 ? "def" : base.postura;
  }
  // empate tarde: favorito propõe, azarão segura o ponto/pênalti.
  if (late) return gap >= 8 ? "atk" : gap <= -8 ? "def" : base.postura;
  return base.postura;
}

// ---------- COMANDOS COM TIMING POR POSSE (v4) ----------
function newCmdState(): CmdState {
  return { type: null, quality: "ok", startedMin: -999, untilMin: -999, cooldownUntilMin: -999 };
}
export function possessionState(state: MatchState, side: "A" | "B"): PossessionState {
  let p = side === "A" ? state.shareA : 1 - state.shareA;
  p += side === "A" ? state.SA.possSwing : state.SB.possSwing;
  p -= (side === "A" ? state.SB.possSwing : state.SA.possSwing) * 0.5;
  const diff = side === "A" ? state.gA - state.gB : state.gB - state.gA;
  if (state.minute >= P.COLLAPSE_MIN_MINUTE && diff >= 2) p -= 0.04;
  p = Math.max(0.05, Math.min(0.95, p));
  const withBall = p >= P.POSS_WITH || (state.lastOwner === side && p > P.POSS_WITHOUT);
  const without = p <= P.POSS_WITHOUT && !(state.lastOwner === side);
  return { poss: p, withBall, without };
}
export function commandQuality(type: CommandType, ps: PossessionState): CommandQuality {
  if (type === "press") return ps.withBall ? "good" : ps.without ? "bad" : "ok";
  return ps.without ? "good" : ps.withBall ? "bad" : "ok"; // recuo
}
function cmdEffect(cs: CmdState, minute: number): { atk: number; def: number; conv: number } {
  if (!cs.type || minute >= cs.untilMin) return { atk: 1, def: 1, conv: 1 };
  const decay = Math.pow(P.CMD_DECAY, Math.max(0, minute - cs.startedMin));
  const l = (base: number) => 1 + (base - 1) * decay;
  const q = cs.quality || "ok";
  if (cs.type === "press") {
    if (q === "good")
      return { atk: l(P.PRESS_ATK), def: l(1 / P.PRESS_DEF_EXPOSE), conv: l(P.PRESS_CONV) };
    if (q === "bad")
      return {
        atk: l(1 + (P.PRESS_ATK - 1) * P.CMD_BAD_OFF),
        def: l(1 / (P.PRESS_DEF_EXPOSE * P.CMD_BAD_EXPOSE)),
        conv: l(P.PRESS_CONV * P.TIMING_CONV_PEN),
      };
    return {
      atk: l(1 + (P.PRESS_ATK - 1) * P.CMD_OK),
      def: l(1 / (1 + (P.PRESS_DEF_EXPOSE - 1) * P.CMD_OK)),
      conv: l(1 + (P.PRESS_CONV - 1) * P.CMD_OK),
    };
  } else {
    // recuo
    if (q === "good")
      return { atk: l(P.RECUO_ATK), def: l(P.RECUO_DEF), conv: l(P.RECUO_CONV) };
    if (q === "bad")
      return {
        atk: l(P.RECUO_ATK * P.CMD_BAD_RECUO_ATK),
        def: l(1 + (P.RECUO_DEF - 1) * 0.5),
        conv: l(P.RECUO_CONV * P.TIMING_CONV_PEN),
      };
    return {
      atk: l(1 - (1 - P.RECUO_ATK) * P.CMD_OK),
      def: l(1 + (P.RECUO_DEF - 1) * P.CMD_OK),
      conv: l(1 - (1 - P.RECUO_CONV) * P.CMD_OK),
    };
  }
}
function canCommand(cs: CmdState, minute: number): boolean {
  return minute >= cs.cooldownUntilMin;
}
function issueCommand(
  cs: CmdState,
  minute: number,
  type: CommandType,
  quality: CommandQuality,
): boolean {
  if (!canCommand(cs, minute)) return false;
  cs.type = type;
  cs.quality = quality || "ok";
  cs.startedMin = minute;
  cs.untilMin = minute + P.CMD_DURATION_MIN;
  cs.cooldownUntilMin = minute + P.CMD_COOLDOWN_MIN;
  return true;
}

export function createMatch(
  teamA: Team,
  teamB: Team,
  tacA: Tactic,
  tacB: Tactic,
  seed: number,
): MatchState {
  const rnd = mulberry32((seed >>> 0) || 1);
  const SA = sideStrength(teamA, tacA, tacB);
  const SB = sideStrength(teamB, tacB, tacA);
  const odRaw = gammaSample(rnd, P.OD_GAMMA_K) / P.OD_GAMMA_K;
  let openStruct = 1.0;
  if (SA.postureIsOff) openStruct += P.OPEN_POSTURE_GAIN * 0.15;
  if (SB.postureIsOff) openStruct += P.OPEN_POSTURE_GAIN * 0.15;
  if (SA.markIsHigh) openStruct += P.OPEN_POSTURE_GAIN * 0.25;
  if (SB.markIsHigh) openStruct += P.OPEN_POSTURE_GAIN * 0.25;
  openStruct *= (SA.ritmo + SB.ritmo) / 2;
  openStruct *= P.OPEN_RECENTER;
  if (openStruct > P.OPEN_CHANCES_MAX) openStruct = P.OPEN_CHANCES_MAX;
  const gameVol = Math.pow(odRaw * openStruct, P.OD_VOL_EXP);
  const convVol = Math.pow(odRaw, P.OD_CONV_EXP);
  const ftA = Math.pow(SA.ft, P.SHARE_SOFT);
  const ftB = Math.pow(SB.ft, P.SHARE_SOFT);
  return {
    rnd,
    seed: (seed >>> 0) || 1,
    teamA,
    teamB,
    tacA,
    tacB,
    SA,
    SB,
    shareA: ftA / (ftA + ftB),
    gameVol,
    convVol,
    openStruct,
    gA: 0,
    gB: 0,
    minute: 0,
    half: 1,
    cmdA: newCmdState(),
    cmdB: newCmdState(),
    lastOwner: null,
    finished: false,
    events: [],
    schedule: [],
  };
}

function buildHalfSchedule(state: MatchState, half: number): number[] {
  const rnd = state.rnd;
  const base = half === 1 ? 0 : 45;
  const lambda = P.RAW_CHANCES_PER_HALF * state.gameVol;
  const n = Math.max(2, Math.min(P.CHANCES_HALF_CAP, Math.round(lambda + (rnd() * 2 - 1))));
  const s: number[] = [];
  for (let c = 0; c < n; c++) s.push(base + Math.floor(rnd() * 45) + 1);
  s.sort((a, b) => a - b);
  return s;
}

const OUTCOMES: ChanceKind[] = ["quase", "defesa", "fora", "bloqueio"];
function pickOutcome(rnd: () => number): ChanceKind {
  return OUTCOMES[Math.floor(rnd() * OUTCOMES.length)];
}

function resolveChance(state: MatchState, m: number): MatchEvent {
  const rnd = state.rnd;
  const half = m > 45 ? 2 : 1;
  const fat = half === 2 ? P.FATIGUE_2H : 1.0;
  const ceA = cmdEffect(state.cmdA, m);
  const ceB = cmdEffect(state.cmdB, m);
  const fatA_def = half === 2 ? state.SA.fadiga2T : 1.0;
  const fatB_def = half === 2 ? state.SB.fadiga2T : 1.0;
  let panicA = 0;
  let panicB = 0;
  const diff = state.gA - state.gB;
  if (m >= P.COLLAPSE_MIN_MINUTE && Math.abs(diff) >= P.COLLAPSE_DIFF_TRIGGER) {
    const panic = Math.min(P.COLLAPSE_MAX_PANIC, Math.abs(diff) - (P.COLLAPSE_DIFF_TRIGGER - 1));
    if (diff > 0) panicB = panic;
    else panicA = panic;
  }
  let shareA = state.shareA;
  if (panicB > 0) shareA = Math.min(0.97, shareA + 0.05 * panicB);
  if (panicA > 0) shareA = Math.max(0.03, shareA - 0.05 * panicA);
  const ownerA = rnd() < shareA;
  state.lastOwner = ownerA ? "A" : "B"; // v4
  const Q = P.CHANCE_QUALITY_VAR;
  let qual = 1 - Q + rnd() * 2 * Q;
  qual *= 1 + (state.convVol - 1) * 0.4;
  const openConv = 1 + Math.max(0, state.openStruct - 1) * P.OPEN_CONV_GAIN;
  const capA = P.MAX_GOALS_PER_SIDE > 0 && state.gA >= P.MAX_GOALS_PER_SIDE;
  const capB = P.MAX_GOALS_PER_SIDE > 0 && state.gB >= P.MAX_GOALS_PER_SIDE;

  function tryConvert(
    att: SideStrength,
    def: SideStrength,
    attCmd: { atk: number; def: number; conv: number },
    defCmd: { atk: number; def: number; conv: number },
    attPanic: number,
    defPanic: number,
    defFat: number,
    isA: boolean,
  ): MatchEvent {
    const off = att.off * attCmd.atk;
    let defEff = def.defEff * defCmd.def * defFat;
    if (defPanic > 0) defEff *= 1 - P.COLLAPSE_DEF_DROP * defPanic;
    let convPanic = 1.0;
    if (attPanic > 0) convPanic *= 1 - P.COLLAPSE_CONV_DROP * attPanic;
    if (defPanic > 0) convPanic *= 1 + P.COLLAPSE_WINNER_CONV * defPanic;
    const ratio = off / (off + defEff * P.CONV_DEF_PULL);
    let conv =
      P.CONV_BASE *
      (0.6 + ratio * P.CONV_SPAN_FACTOR) *
      att.convMod *
      attCmd.conv *
      qual *
      fat *
      state.convVol *
      openConv *
      convPanic *
      def.rivalConvVsMe;
    if (conv < P.CONV_MIN) conv = P.CONV_MIN;
    if (conv > P.CONV_MAX) conv = P.CONV_MAX;
    const capped = isA ? capA : capB;
    const goal = !capped && rnd() < conv;
    if (capped) rnd();
    return {
      goal,
      team: isA ? state.teamA.n : state.teamB.n,
      ownerSide: isA ? "A" : "B",
      kind: goal ? "goal" : pickOutcome(rnd),
      m,
    };
  }

  let ev: MatchEvent;
  if (ownerA) {
    ev = tryConvert(state.SA, state.SB, ceA, ceB, panicA, panicB, fatB_def, true);
    if (ev.goal) state.gA++;
  } else {
    ev = tryConvert(state.SB, state.SA, ceB, ceA, panicB, panicA, fatA_def, false);
    if (ev.goal) state.gB++;
  }
  ev.m = m;
  return ev;
}

export function stepMinute(state: MatchState): StepResult {
  if (state.finished)
    return {
      minute: state.minute,
      half: state.half,
      events: [],
      score: { a: state.gA, b: state.gB },
      halftime: false,
      finished: true,
    };
  if (state.minute === 0) state.schedule = buildHalfSchedule(state, 1);
  if (state.minute === 45) state.schedule = state.schedule.concat(buildHalfSchedule(state, 2));
  state.minute++;
  const m = state.minute;
  const evs: MatchEvent[] = [];
  for (let i = 0; i < state.schedule.length; i++) {
    if (state.schedule[i] === m) {
      const ev = resolveChance(state, m);
      evs.push(ev);
      state.events.push(ev);
    }
  }
  const halftime = m === 45;
  if (m >= 90) state.finished = true;
  state.half = m > 45 ? 2 : 1;
  return {
    minute: m,
    half: state.half,
    events: evs,
    score: { a: state.gA, b: state.gB },
    halftime,
    finished: state.finished,
  };
}

export function applyCommand(
  state: MatchState,
  side: "A" | "B",
  type: CommandType,
): CommandResult {
  const cs = side === "A" ? state.cmdA : state.cmdB;
  const ps = possessionState(state, side);
  const q = commandQuality(type, ps);
  const ok = issueCommand(cs, state.minute, type, q);
  const hint = !ok
    ? "em cooldown"
    : q === "good"
      ? type === "press"
        ? "boa hora — com a bola"
        : "boa hora — sem a bola"
      : q === "bad"
        ? type === "press"
          ? "fora de hora — pressionar sem a bola expõe o contra"
          : "fora de hora — recuar com a bola entrega a posse"
        : "jogo disputado — efeito parcial";
  return { ok, quality: q, poss: ps.poss, hint, cooldownUntilMin: cs.cooldownUntilMin, untilMin: cs.untilMin };
}

export function defaultAiPolicy(state: MatchState, side: "A" | "B"): CommandType | null {
  const diff = side === "A" ? state.gA - state.gB : state.gB - state.gA;
  const m = state.minute;
  const ps = possessionState(state, side);
  if (m >= 60 && diff < 0 && ps.withBall) return "press";
  if (m >= 75 && diff >= 1 && ps.without) return "recuo";
  if (m >= 85 && diff <= -2 && ps.poss >= P.POSS_WITHOUT) return "press";
  return null;
}

export function simulateFull(
  teamA: Team,
  teamB: Team,
  tacA: Tactic,
  tacB: Tactic,
  seed: number,
  aiPolicy?: (st: MatchState, side: "A" | "B") => CommandType | null,
): { gA: number; gB: number; events: MatchEvent[]; openStruct: number; gameVol: number } {
  const st = createMatch(teamA, teamB, tacA, tacB, seed);
  while (!st.finished) {
    if (aiPolicy) {
      const ca = aiPolicy(st, "A");
      if (ca) applyCommand(st, "A", ca);
      const cb = aiPolicy(st, "B");
      if (cb) applyCommand(st, "B", cb);
    }
    stepMinute(st);
  }
  return { gA: st.gA, gB: st.gB, events: st.events, openStruct: st.openStruct, gameVol: st.gameVol };
}

// =====================================================================
// ITEM 12 — ESTATÍSTICAS DA PARTIDA (derivação determinística)
// Não é simulação nova: lê os EVENTOS reais do motor + as forças, e produz uma
// leitura plausível e coerente. Ancorada nos eventos (finalizações/chutes ao gol),
// o resto sai de posse × ritmo × força com jitter SEMEADO por state.seed — então o
// MESMO jogo mostra SEMPRE os mesmos números (importante p/ "copiar resultado").
// =====================================================================
export function deriveMatchStats(state: MatchState): MatchStats {
  // pós-jogo: lê os eventos do MOTOR (partida inteira).
  return deriveStatsFromEvents(state, state.events);
}

// MELHORIA 2.2 / BUG 1.3 — estatísticas a partir de uma LISTA EXPLÍCITA de lances
// (os JÁ REVELADOS na transmissão). Os gols são contados DESTES eventos — não de
// state.gA/gB — então as stats batem 100% com o placar visível neste instante (ao
// vivo, no intervalo e no fim). O ritmo de passes escala pela fração do jogo já
// transcorrida (maior minuto revelado / 90), pra a posse/passes crescerem de forma
// plausível minuto a minuto. Jitter SEMEADO por state.seed (determinístico, estável).
export function deriveStatsFromEvents(state: MatchState, events: MatchEvent[]): MatchStats {
  // jitter próprio, semeado pela partida (NÃO consome o state.rnd — não afeta o jogo).
  const rnd = mulberry32((state.seed ^ 0x5f3759df) >>> 0);
  const jit = (base: number, spread: number) => base + (rnd() * 2 - 1) * spread;

  // ---- gols contados DOS EVENTOS passados (fonte única com o placar da UI) ----
  let goalsA = 0, goalsB = 0, maxMin = 0;
  // ---- finalizações e chutes ao gol: a partir dos EVENTOS passados ----
  let finA = 0, finB = 0, sotA = 0, sotB = 0;
  events.forEach((ev) => {
    const isA = ev.ownerSide === "A";
    if (isA) finA++; else finB++;
    if (ev.goal) { if (isA) goalsA++; else goalsB++; }
    if (ev.m > maxMin) maxMin = ev.m;
    // no alvo = gol + defesa do goleiro + metade dos "quase" (trave/raspando)
    const onTarget = ev.kind === "goal" || ev.kind === "defesa" || (ev.kind === "quase" && rnd() < 0.5);
    if (onTarget) { if (isA) sotA++; else sotB++; }
  });
  // todo gol é, por definição, chute ao gol (garante coerência narrativa).
  if (sotA < goalsA) sotA = goalsA;
  if (sotB < goalsB) sotB = goalsB;
  // finalizações nunca menores que os chutes ao gol.
  if (finA < sotA) finA = sotA;
  if (finB < sotB) finB = sotB;

  // ---- posse de bola: shareA (share de CHANCES) puxado pro meio + jitter ----
  // converte pra uma % "humana" (raramente abaixo de 32 / acima de 68), coerente com
  // quem mandou no jogo. Goleada com posse baixa fica implausível → ancora no placar.
  let possA = 50 + (state.shareA - 0.5) * 64; // ±32 em torno de 50
  const gd = goalsA - goalsB;
  possA += Math.max(-8, Math.min(8, gd * 2.2)); // quem fez mais gol tende a ter tido a bola
  possA = jit(possA, 3);
  possA = Math.max(32, Math.min(68, possA));
  const pA = Math.round(possA);
  const pB = 100 - pA;

  // ---- passes: ~ posse × ritmo × FRAÇÃO do jogo já transcorrida (cresce ao vivo) ----
  const elapsed = Math.max(0.06, Math.min(1, maxMin / 90));
  const tempo = 880 * state.gameVol * elapsed; // total aproximado de passes ATÉ AGORA
  const passSpread = 30 * elapsed;
  const passA = Math.round(jit((tempo * pA) / 100, passSpread));
  const passB = Math.round(jit((tempo * pB) / 100, passSpread));
  const accFromMid = (m: number) => Math.max(64, Math.min(91, 64 + (m - 60) * 0.62));
  const accA = Math.round(Math.max(60, Math.min(93, jit(accFromMid(state.teamA.m), 3))));
  const accB = Math.round(Math.max(60, Math.min(93, jit(accFromMid(state.teamB.m), 3))));

  // ---- faltas: quem corre MAIS atrás da bola (menos posse) comete mais. ----
  const foulsFrom = (poss: number) => 8 + (50 - poss) * 0.22;
  const foulA = Math.max(4, Math.round(jit(foulsFrom(pA), 2)));
  const foulB = Math.max(4, Math.round(jit(foulsFrom(pB), 2)));

  // ---- desarmes: quem defende mais (menos posse) + força defensiva desarma mais. ----
  const tackFrom = (poss: number, d: number) => 9 + (50 - poss) * 0.2 + (d - 70) * 0.12;
  const tackA = Math.max(3, Math.round(jit(tackFrom(pA, state.teamA.d), 2)));
  const tackB = Math.max(3, Math.round(jit(tackFrom(pB, state.teamB.d), 2)));

  return {
    poss: { a: pA, b: pB },
    fin: { a: finA, b: finB },
    sot: { a: sotA, b: sotB },
    passes: { a: passA, b: passB },
    passAcc: { a: accA, b: accB },
    fouls: { a: foulA, b: foulB },
    tackles: { a: tackA, b: tackB },
  };
}

// =====================================================================
// DADOS + RUNNER GENÉRICO DE TORNEIO
// =====================================================================
export function teamBySlug(year: number, slug: string): Team | null {
  for (let i = 0; i < DATA.length; i++) {
    if (DATA[i].y === year && DATA[i].s === slug) return DATA[i];
  }
  return null;
}
// pool por ano, ordenado por força (o) desc
export function poolForYear(y: number): Team[] {
  return DATA.filter((d) => d.y === y)
    .slice()
    .sort((a, b) => b.o - a.o);
}

export const TIER_LABEL: Record<Tier, string> = {
  S: "Lendária",
  A: "Favorita",
  B: "Forte",
  C: "Média",
  D: "Zebra",
};
const TIER_FRASE: Record<Tier, string[]> = {
  S: ["Time pra eternidade. O mundo joga contra.", "Favoritíssima absoluta — só não ganhar é fracasso."],
  A: ["Cotada pro título, e com razão.", "Das melhores da edição — caneta afiada."],
  B: ["Time forte, briga lá em cima.", "Pode incomodar qualquer um num dia bom."],
  C: ["Time de meio de tabela — depende do seu comando.", "Sem favoritismo, mas com chance de surpresa."],
  D: ["A zebra clássica. Levar longe vira lenda.", "Ninguém aposta nela — esse é o charme."],
};
export function fraseFor(t: Tier, seedN: number): string {
  const arr = TIER_FRASE[t] || TIER_FRASE.C;
  return arr[seedN % arr.length];
}

// mulberry pra sorteios fora do motor
export function rngFrom(seed: number): () => number {
  return mulberry32((seed >>> 0) || 1);
}
export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

// nome curto/longo de fase pra UI/progresso
export function stageShort(stage: Stage): string {
  if (stage.type === "groups") return "Grupos";
  if (stage.type === "second_groups") return "2ª fase";
  if (stage.type === "final_group") return "Quadrangular";
  if (stage.type === "third_place") return "3º lugar";
  if (stage.type === "final") return "Final";
  if (stage.type === "knockout") {
    return (
      { R32: "32-avos", R16: "Oitavas", QF: "Quartas", SF: "Semis" }[stage.round ?? "QF"] ||
      stage.round ||
      "Mata-mata"
    );
  }
  return stage.type;
}
export function stageLong(stage: Stage): string {
  if (stage.type === "groups") return "Fase de grupos";
  if (stage.type === "second_groups") return "Segunda fase de grupos";
  if (stage.type === "final_group") return "Quadrangular final (pontos corridos)";
  if (stage.type === "third_place") return "Disputa de 3º lugar";
  if (stage.type === "final") return "A Final";
  if (stage.type === "knockout") {
    return (
      {
        R32: "32-avos de final",
        R16: "Oitavas de final",
        QF: "Quartas de final",
        SF: "Semifinais",
      }[stage.round ?? "QF"] ||
      stage.round ||
      "Mata-mata"
    );
  }
  return stage.type;
}

// A IA escolhe uma tática plausível e coerente (uso INTERNO do bot, NÃO é mostrado
// ao jogador como "ideal"). Mentalidade por ARQUÉTIPO de gap de força (item 14).
// ===== ARQUÉTIPOS DA IA POR GAP DE FORÇA (item 14) =====
// A mentalidade INICIAL do bot agora vem do gap = minhaForça − forçaDoRival, não da
// força absoluta. Regra dura: GIGANTE e FAVORITO NUNCA retrancam contra um fraco; o
// AZARÃO/UNDERDOG se fecha contra um gigante. Cada arquétipo sorteia de subconjuntos
// COERENTES (formação ↔ postura ↔ marcação) pra não cair nos combos penalizados por
// coherence() (ex.: 532+all_in, 343+retranca).
type Archetype = {
  forms: Form[];
  estilos: Estilo[];
  posturas: Postura[];
  marcacoes: Marcacao[];
};
const AI_ARCHETYPES: { min: number; arch: Archetype }[] = [
  // GIGANTE (gap ≥ +12): propõe o jogo, vai pra cima, nunca recua.
  {
    min: 12,
    arch: {
      forms: ["433", "343", "424", "4312", "352"],
      estilos: ["lados", "meio", "passes"],
      posturas: ["atk", "all_in", "eq"],
      marcacoes: ["alta", "media"],
    },
  },
  // FAVORITO (+5..+12): ofensivo/equilibrado, sem retranca.
  {
    min: 5,
    arch: {
      forms: ["433", "442", "352", "4312", "343"],
      estilos: ["lados", "meio", "passes", "longas"],
      posturas: ["atk", "eq"],
      marcacoes: ["alta", "media"],
    },
  },
  // EQUILIBRADO (|gap| < 5): leque completo, o jogo decide no detalhe.
  {
    min: -5,
    arch: {
      forms: ["433", "442", "352", "4231", "4312", "343"],
      estilos: ["lados", "meio", "passes", "longas", "contra"],
      posturas: ["eq", "atk", "def"],
      marcacoes: ["alta", "media", "baixa"],
    },
  },
  // AZARÃO (-12..-5): cauteloso, contra-ataque, bloco mais baixo.
  {
    min: -12,
    arch: {
      forms: ["442", "4231", "532", "352"],
      estilos: ["contra", "longas", "lados"],
      posturas: ["eq", "def"],
      marcacoes: ["media", "baixa"],
    },
  },
  // UNDERDOG EXTREMO (gap ≤ -12): se fecha, joga no erro do gigante.
  {
    min: -Infinity,
    arch: {
      forms: ["532", "4231", "442"],
      estilos: ["contra", "longas"],
      posturas: ["retranca", "def"],
      marcacoes: ["baixa", "media"],
    },
  },
];
function archetypeFor(gap: number): Archetype {
  for (const a of AI_ARCHETYPES) if (gap >= a.min) return a.arch;
  return AI_ARCHETYPES[AI_ARCHETYPES.length - 1].arch;
}
function pickFrom<T>(rnd: () => number, arr: T[]): T {
  return arr[Math.floor(rnd() * arr.length)];
}
// myStrength/oppStrength = forças base (overall) dos dois times. Se oppStrength não
// for passado, cai no EQUILIBRADO (gap 0) — compatível com chamadas antigas.
export function aiTactic(rnd: () => number, myStrength: number, oppStrength?: number): Tactic {
  const gap = myStrength - (oppStrength ?? myStrength);
  const arch = archetypeFor(gap);
  return {
    form: pickFrom(rnd, arch.forms),
    estilo: pickFrom(rnd, arch.estilos),
    postura: pickFrom(rnd, arch.posturas),
    marcacao: pickFrom(rnd, arch.marcacoes),
  };
}

// contexto p/ casar o resultado REAL (bug 1.1): ano da edição + classe de fase.
export interface RealContext {
  year: number;
  cls?: StageClass;
}

// resultado de uma partida de fundo (IA×IA): gols + pênaltis reais (quando vieram da
// história e o jogo terminou empatado num confronto eliminatório). `real` marca que
// o placar saiu de results.json, não da simulação.
export interface SimResult {
  gA: number;
  gB: number;
  pensA: number | null;
  pensB: number | null;
  real: boolean;
}

// simula uma partida headless (IA x IA). mode 'alt' = uma rodada do motor com toda a
// variância. mode 'real' = se `ctx` (ano+fase) acha o confronto em results.json, usa o
// placar REAL FIEL (bug 1.1); senão, cai numa simulação enviesada pela FORÇA real (o
// par não existe na história — efeito borboleta de um sorteio divergente).
export function simAIvsAI(
  teamA: Team,
  teamB: Team,
  seed: number,
  mode: WorldMode = "real",
  ctx?: RealContext,
): SimResult {
  // HISTÓRIA REAL: placar fiel da edição (determinístico — vem de um JSON estático).
  if (mode === "real" && ctx) {
    const rr = realResult(ctx.year, teamA, teamB, ctx.cls);
    if (rr) return { gA: rr.gA, gB: rr.gB, pensA: rr.pensA, pensB: rr.pensB, real: true };
  }
  function one(s: number): SimResult {
    const r = rngFrom(s);
    const tacA = aiTactic(r, teamA.o, teamB.o);
    const tacB = aiTactic(r, teamB.o, teamA.o);
    const res = simulateFull(teamA, teamB, tacA, tacB, s, defaultAiPolicy);
    return { gA: res.gA, gB: res.gB, pensA: null, pensB: null, real: false };
  }
  if (mode !== "real") return one(seed);
  const diff = teamA.o - teamB.o;
  const ad = Math.abs(diff);
  if (ad < 6) return one(seed); // forças vizinhas: deixa o jogo decidir
  const want = diff > 0 ? "A" : "B";
  const tries = ad >= 14 ? 5 : ad >= 9 ? 4 : 3;
  let best: SimResult | null = null;
  for (let k = 0; k < tries; k++) {
    const res = one((seed ^ (k * 2654435761)) >>> 0);
    const w = res.gA > res.gB ? "A" : res.gB > res.gA ? "B" : "E";
    if (w === want) return res;
    if (w === "E" && best === null) best = res;
    if (best === null) best = res;
  }
  return best as SimResult;
}

// ITEM 10: disputa de pênaltis cobrança a cobrança. DETERMINÍSTICA (semeada por
// `seed`), o vencedor EMERGE das cobranças. Conversão por chute = base alta puxada
// pela qualidade do BATEDOR (ataque) e pela defesa do GOLEIRO adversário, mantendo
// um VIÉS LEVE pela força (realista) > 50/50. Regra FIFA: 5 cada, parada antecipada
// quando matematicamente decidido, depois morte súbita par a par.
export function simulatePenalties(teamA: Team, teamB: Team, seed: number): Shootout {
  const r = rngFrom((seed ^ 0x9e3779b9) >>> 0);
  // probabilidade de conversão do lado que bate, vs o goleiro do outro lado.
  function convProb(shooter: Team, keeper: Team): number {
    // base ~0.76; ataque forte sobe, defesa (goleiro) forte desce. viés leve.
    const p = 0.76 + (shooter.a - 78) * 0.004 - (keeper.d - 78) * 0.0035;
    return Math.max(0.58, Math.min(0.9, p));
  }
  const pcA = convProb(teamA, teamB);
  const pcB = convProb(teamB, teamA);
  const kicks: PenKick[] = [];
  let scoreA = 0;
  let scoreB = 0;
  let idxA = 0;
  let idxB = 0;

  function outcome(p: number): PenResult {
    // converte? senão, distribui o erro entre defesa/trave/fora (defesa mais comum).
    if (r() < p) return "gol";
    const e = r();
    if (e < 0.5) return "defesa";
    if (e < 0.78) return "fora";
    return "trave";
  }
  // gols restantes possíveis pro time, dado quantas das 5 ainda não bateu.
  const remaining = (taken: number) => Math.max(0, 5 - taken);
  function decidedInRegulation(): boolean {
    // A não alcança B nem com todos os restantes, ou vice-versa.
    if (scoreA > scoreB + remaining(idxB)) return true;
    if (scoreB > scoreA + remaining(idxA)) return true;
    return false;
  }

  // ---- 5 cobranças cada, alternando A,B,A,B... com parada antecipada ----
  for (let round = 0; round < 5; round++) {
    // A bate
    {
      const res = outcome(pcA);
      if (res === "gol") scoreA++;
      idxA++;
      kicks.push({ side: "A", index: idxA, result: res, scoreA, scoreB });
      if (decidedInRegulation()) break;
    }
    // B bate
    {
      const res = outcome(pcB);
      if (res === "gol") scoreB++;
      idxB++;
      kicks.push({ side: "B", index: idxB, result: res, scoreA, scoreB });
      if (decidedInRegulation()) break;
    }
  }

  // ---- morte súbita: pares completos até alguém abrir vantagem ----
  let guard = 0;
  while (scoreA === scoreB && guard < 40) {
    guard++;
    const resA = outcome(pcA);
    if (resA === "gol") scoreA++;
    idxA++;
    kicks.push({ side: "A", index: idxA, result: resA, scoreA, scoreB });
    const resB = outcome(pcB);
    if (resB === "gol") scoreB++;
    idxB++;
    kicks.push({ side: "B", index: idxB, result: resB, scoreA, scoreB });
  }

  const winner: "A" | "B" = scoreA >= scoreB ? "A" : "B";
  return { kicks, winner, scoreA, scoreB, pens: scoreA + "×" + scoreB };
}

// resolve confronto de mata-mata. No empate, a disputa de pênaltis (item 10) decide:
// o vencedor e a string `pens` saem da MESMA simulação — coerentes por construção.
// `realPens` (bug 1.1): se a história tem o placar de pênaltis REAL deste confronto,
// usa-o (vencedor + string), em vez de re-simular — coerência total com a Copa real.
export function knockoutResult(
  teamA: Team,
  teamB: Team,
  gA: number,
  gB: number,
  seed: number,
  realPens?: { a: number | null; b: number | null } | null,
): KnockoutOutcome {
  if (gA > gB) return { winner: "A", pens: null };
  if (gB > gA) return { winner: "B", pens: null };
  if (realPens && realPens.a != null && realPens.b != null) {
    const pa = realPens.a;
    const pb = realPens.b;
    return { winner: pa >= pb ? "A" : "B", pens: pa + "×" + pb };
  }
  const so = simulatePenalties(teamA, teamB, seed);
  return { winner: so.winner, pens: so.pens };
}

// ---------- standings helper (pontos corridos) ----------
function emptyStanding(team: Team): Standing {
  return { team, P: 0, J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, SG: 0 };
}
function applyResultToStanding(st: Standing, gf: number, ga: number, threePts: boolean): void {
  st.J++;
  st.GP += gf;
  st.GC += ga;
  st.SG = st.GP - st.GC;
  if (gf > ga) {
    st.V++;
    st.P += threePts ? 3 : 2;
  } else if (gf === ga) {
    st.E++;
    st.P += 1;
  } else {
    st.D++;
  }
}
export function sortStandings(arr: Standing[]): Standing[] {
  return arr.slice().sort((a, b) => {
    if (b.P !== a.P) return b.P - a.P;
    if (b.SG !== a.SG) return b.SG - a.SG;
    if (b.GP !== a.GP) return b.GP - a.GP;
    return b.team.o - a.team.o;
  });
}
function findStanding(arr: Standing[], key: string): Standing {
  for (let i = 0; i < arr.length; i++) if (arr[i].team.s === key) return arr[i];
  return arr[0];
}

// =====================================================================
// CAMPANHA: instancia a edição, sorteia grupos, roda a estrutura real.
// =====================================================================
export function buildCampaign(edition: Edition, myTeam: Team, seed: number, worldMode: WorldMode): Campaign {
  const pool = poolForYear(edition.year);
  const rnd = rngFrom(seed);
  const camp: Campaign = {
    edition,
    seed,
    myKey: myTeam.s,
    myTeam,
    stages: edition.stages,
    threePts: edition.year >= 1994, // 3 pts a partir de 1994
    stageIdx: 0,
    state: null,
    alive: true,
    eliminated: false,
    champion: false,
    finishedAt: null,
    placement: null,
    history: [],
    pool,
    rnd,
    worldMode,
  };
  initStage(camp);
  return camp;
}

function initStage(camp: Campaign): void {
  const stage = camp.stages[camp.stageIdx];
  if (!stage) {
    camp.alive = false;
    return;
  }
  if (stage.type === "groups") return initGroups(camp, stage, false);
  if (stage.type === "second_groups") return initGroups(camp, stage, true);
  if (stage.type === "final_group") return initFinalGroup(camp, stage);
  if (stage.type === "knockout" || stage.type === "second_round_knockout")
    return initKnockout(camp, stage);
  if (stage.type === "third_place") return initThirdPlace(camp, stage);
  if (stage.type === "final") return initFinal(camp, stage);
  camp.alive = false;
}

// divide um array em N grupos (snake por pote) garantindo o meu time num grupo
function makeGroups(
  teams: Team[],
  nGroups: number,
  sizes: number[] | null,
  size: number,
  rnd: () => number,
): Team[][] {
  const ranked = teams.slice().sort((a, b) => b.o - a.o);
  const groups: Team[][] = [];
  for (let i = 0; i < nGroups; i++) groups.push([]);
  const caps: number[] = [];
  for (let g = 0; g < nGroups; g++) caps.push(sizes ? sizes[g] || 0 : size);
  const byTier: Record<string, Team[]> = {};
  ranked.forEach((t) => {
    (byTier[t.t] = byTier[t.t] || []).push(t);
  });
  let ordered: Team[] = [];
  (["S", "A", "B", "C", "D"] as Tier[]).forEach((tk) => {
    if (byTier[tk]) ordered = ordered.concat(shuffle(byTier[tk], rnd));
  });
  const totalCap = caps.reduce((a, b) => a + b, 0);
  ordered = ordered.slice(0, totalCap);
  let gi = 0;
  let dir = 1;
  for (let k = 0; k < ordered.length; k++) {
    let tries = 0;
    while (groups[gi].length >= caps[gi] && tries < nGroups * 2) {
      gi += dir;
      if (gi >= nGroups) {
        gi = nGroups - 1;
        dir = -1;
      } else if (gi < 0) {
        gi = 0;
        dir = 1;
      }
      tries++;
    }
    if (groups[gi].length < caps[gi]) groups[gi].push(ordered[k]);
    gi += dir;
    if (gi >= nGroups) {
      gi = nGroups - 1;
      dir = -1;
    } else if (gi < 0) {
      gi = 0;
      dir = 1;
    }
  }
  return groups;
}
function findMyGroup(groups: Team[][], myKey: string): number {
  for (let g = 0; g < groups.length; g++)
    for (let i = 0; i < groups[g].length; i++) if (groups[g][i].s === myKey) return g;
  return 0;
}

// monta os grupos REAIS da edição (composição idêntica à Copa real, de groups.json).
function realGroupsFor(camp: Campaign): Team[][] | null {
  const wc = WC_GROUPS_BY_YEAR[camp.edition.year];
  if (!wc || !wc.groups || wc.stage_drawn !== "groups") return null;
  const year = camp.edition.year;
  const used: Record<string, number> = {};
  const groups: Team[][] = [];
  let myFound = false;
  for (let gi = 0; gi < wc.groups.length; gi++) {
    const g: Team[] = [];
    const slugs = wc.groups[gi].teams;
    for (let i = 0; i < slugs.length; i++) {
      const t = teamBySlug(year, slugs[i]);
      if (!t) continue; // placeholder / slug fora do dataset
      if (used[t.s]) continue; // nunca duplica uma seleção
      used[t.s] = 1;
      g.push(t);
      if (t.s === camp.myKey) myFound = true;
    }
    if (g.length) groups.push(g);
  }
  if (!myFound || groups.length < 2) return null;
  return groups;
}

// ---------------- GROUPS (fase de grupos / 2ª fase) ----------------
function initGroups(camp: Campaign, stage: Stage, isSecond: boolean): void {
  let srcTeams: Team[];
  let groups: Team[][] | null = null;
  if (isSecond) {
    srcTeams = camp.carryTeams ?? [];
  } else {
    srcTeams = camp.pool.slice();
    groups = realGroupsFor(camp); // tenta a composição REAL primeiro
  }
  const nG = stage.groups ?? 1;
  if (!groups) groups = makeGroups(srcTeams, nG, stage.sizes ?? null, stage.size ?? 4, camp.rnd);
  const myG = findMyGroup(groups, camp.myKey);
  const myGroupTeams = groups[myG];
  const opps = myGroupTeams.filter((t) => t.s !== camp.myKey);
  camp.state = {
    kind: "groups",
    isSecond,
    stage,
    groups,
    myG,
    myGroupTeams,
    standings: groups.map((grp) => grp.map(emptyStanding)),
    myOpps: opps,
    myMatchIdx: 0,
    advance: stage.advance ?? 2,
    bestThirds: stage.best_thirds ?? 0,
    done: false,
  };
}
function currentGroupOpp(camp: Campaign): Team | null {
  const s = camp.state as GroupsStageState;
  if (s.myMatchIdx >= s.myOpps.length) return null;
  return s.myOpps[s.myMatchIdx];
}
// chave estável de um par IA×IA num grupo (i<j índices no array do grupo).
function pairKey(gIdx: number, i: number, j: number): string {
  return gIdx + ":" + i + ":" + j;
}
// semente determinística de um confronto IA×IA — IDÊNTICA à usada no fim, pra a
// tabela apurada rodada a rodada bater 100% com a apuração final (determinismo).
function groupPairSeed(camp: Campaign, gIdx: number, i: number, j: number): number {
  const A = (camp.state as GroupsStageState).groups[gIdx][i];
  const B = (camp.state as GroupsStageState).groups[gIdx][j];
  return (camp.seed ^ (A.o * 7919 + B.o * 104729 + gIdx * 131 + i * 17 + j * 31)) >>> 0;
}
// aplica UM par IA×IA ao standings do grupo, 1x só (idempotente via playedPairs).
function playGroupPair(camp: Campaign, gIdx: number, i: number, j: number): void {
  const s = camp.state as GroupsStageState;
  const key = pairKey(gIdx, i, j);
  const played = (s.playedPairs = s.playedPairs ?? []);
  if (played.indexOf(key) >= 0) return;
  const grp = s.groups[gIdx];
  const A = grp[i];
  const B = grp[j];
  // nunca apura aqui um jogo MEU — esse passa pelo resolveGroupMatch (placar real).
  if (gIdx === s.myG && (A.s === camp.myKey || B.s === camp.myKey)) return;
  const sd = groupPairSeed(camp, gIdx, i, j);
  const r = simAIvsAI(A, B, sd, camp.worldMode, { year: camp.edition.year, cls: "group" });
  applyResultToStanding(findStanding(s.standings[gIdx], A.s), r.gA, r.gB, camp.threePts);
  applyResultToStanding(findStanding(s.standings[gIdx], B.s), r.gB, r.gA, camp.threePts);
  played.push(key);
}
// calendário round-robin do MEU grupo pelo método do círculo. rounds[r] = lista de
// pares [i,j] que jogam na rodada r (inclui o meu confronto). Como cada rodada é um
// emparelhamento perfeito, após N rodadas todo time do grupo jogou N vezes — a tabela
// avança balanceada com a minha sequência de jogos. (Independe da minha ordem exata:
// o conjunto de pares e as sementes por par são fixos, então o final é idêntico.)
function myGroupRounds(teams: Team[]): [number, number][][] {
  const n = teams.length;
  const idx = teams.map((_, i) => i);
  // método do círculo precisa de nº par; com ímpar entra um "fantasma" (-1 = folga).
  const arr = n % 2 === 0 ? idx.slice() : idx.concat([-1]);
  const m = arr.length;
  const rounds: [number, number][][] = [];
  let order = arr.slice();
  for (let r = 0; r < m - 1; r++) {
    const round: [number, number][] = [];
    for (let k = 0; k < m / 2; k++) {
      const a = order[k];
      const b = order[m - 1 - k];
      if (a === -1 || b === -1) continue; // folga (grupo ímpar)
      round.push(a < b ? [a, b] : [b, a]);
    }
    rounds.push(round);
    // rotaciona mantendo o primeiro fixo
    const fixed = order[0];
    const rest = order.slice(1);
    rest.unshift(rest.pop() as number);
    order = [fixed, ...rest];
  }
  return rounds;
}
// apura os IA×IA do MEU grupo até a rodada `roundsPlayed` (= nº de jogos que já fiz),
// mantendo a tabela do hub coerente jogo a jogo. Idempotente.
function catchUpMyGroup(camp: Campaign, roundsPlayed: number): void {
  const s = camp.state as GroupsStageState;
  const rounds = myGroupRounds(s.groups[s.myG]);
  for (let r = 0; r < roundsPlayed && r < rounds.length; r++) {
    rounds[r].forEach(([i, j]) => playGroupPair(camp, s.myG, i, j));
  }
}
export function resolveGroupMatch(camp: Campaign, gf: number, ga: number): void {
  const s = camp.state as GroupsStageState;
  const opp = s.myOpps[s.myMatchIdx];
  const myStand = findStanding(s.standings[s.myG], camp.myKey);
  const oppStand = findStanding(s.standings[s.myG], opp.s);
  applyResultToStanding(myStand, gf, ga, camp.threePts);
  applyResultToStanding(oppStand, ga, gf, camp.threePts);
  const ptsLabel = gf > ga ? (camp.threePts ? "+3" : "+2") : gf === ga ? "+1" : "+0";
  camp.history.push({
    stage: stageShort(s.stage),
    opp,
    gf,
    ga,
    pens: null,
    win: gf > ga,
    draw: gf === ga,
    ptsLabel,
  });
  s.myMatchIdx++;
  // após a minha rodada, avança os IA×IA do meu grupo na mesma rodada — a tabela do
  // hub deixa de mostrar adversários parados em 0/0/0 (item 1).
  catchUpMyGroup(camp, s.myMatchIdx);
}

export function finishGroupsStage(camp: Campaign): boolean {
  const s = camp.state as GroupsStageState;
  // apura todos os IA×IA ainda não jogados, de TODOS os grupos. playGroupPair é
  // idempotente: o que a tabela do hub já apurou rodada a rodada (item 1) não conta
  // de novo, e o resultado final é IDÊNTICO (mesma semente por par).
  s.groups.forEach((grp, gIdx) => {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++) {
        playGroupPair(camp, gIdx, i, j);
      }
  });
  const qualified: Team[] = [];
  const thirds: Standing[] = [];
  s.sortedStandings = s.standings.map((grpStand) => sortStandings(grpStand));
  s.sortedStandings.forEach((sorted) => {
    for (let k = 0; k < s.advance && k < sorted.length; k++) qualified.push(sorted[k].team);
    if (s.bestThirds > 0 && sorted[2]) thirds.push(sorted[2]);
  });
  if (s.bestThirds > 0) {
    thirds.sort((a, b) => {
      if (b.P !== a.P) return b.P - a.P;
      if (b.SG !== a.SG) return b.SG - a.SG;
      return b.GP - a.GP;
    });
    thirds.slice(0, s.bestThirds).forEach((st) => qualified.push(st.team));
  }
  const myAdvanced = qualified.some((t) => t.s === camp.myKey);
  s.qualified = qualified;
  s.myAdvanced = myAdvanced;
  s.done = true;
  return myAdvanced;
}

// ---------------- FINAL GROUP (1950) ----------------
function initFinalGroup(camp: Campaign, stage: Stage): void {
  const teams = (camp.carryTeams ?? []).slice();
  const opps = teams.filter((t) => t.s !== camp.myKey);
  camp.state = {
    kind: "final_group",
    stage,
    teams,
    standings: teams.map(emptyStanding),
    myOpps: opps,
    myMatchIdx: 0,
    done: false,
  };
}
function currentFinalGroupOpp(camp: Campaign): Team | null {
  const s = camp.state as FinalGroupStageState;
  if (s.myMatchIdx >= s.myOpps.length) return null;
  return s.myOpps[s.myMatchIdx];
}
export function resolveFinalGroupMatch(camp: Campaign, gf: number, ga: number): void {
  const s = camp.state as FinalGroupStageState;
  const opp = s.myOpps[s.myMatchIdx];
  applyResultToStanding(findStanding(s.standings, camp.myKey), gf, ga, camp.threePts);
  applyResultToStanding(findStanding(s.standings, opp.s), ga, gf, camp.threePts);
  const ptsLabel = gf > ga ? "+2" : gf === ga ? "+1" : "+0";
  camp.history.push({
    stage: "Quadrangular",
    opp,
    gf,
    ga,
    pens: null,
    win: gf > ga,
    draw: gf === ga,
    ptsLabel,
  });
  s.myMatchIdx++;
}
export function finishFinalGroup(camp: Campaign): boolean {
  const s = camp.state as FinalGroupStageState;
  const teams = s.teams;
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++) {
      const A = teams[i];
      const B = teams[j];
      if (A.s === camp.myKey || B.s === camp.myKey) continue;
      const sd = (camp.seed ^ (A.o * 7919 + B.o * 104729 + i * 17 + j * 31)) >>> 0;
      const r = simAIvsAI(A, B, sd, camp.worldMode, { year: camp.edition.year, cls: "group" });
      applyResultToStanding(findStanding(s.standings, A.s), r.gA, r.gB, camp.threePts);
      applyResultToStanding(findStanding(s.standings, B.s), r.gB, r.gA, camp.threePts);
    }
  s.sorted = sortStandings(s.standings);
  s.done = true;
  s.champ = s.sorted[0].team;
  s.myPlace = s.sorted.findIndex((st) => st.team.s === camp.myKey) + 1;
  return s.champ.s === camp.myKey;
}

// ---------------- KNOCKOUT (R32/R16/QF/SF) ----------------
function initKnockout(camp: Campaign, stage: Stage): void {
  const teams = camp.carryTeams ? camp.carryTeams.slice() : camp.pool.slice();
  const rnd = camp.rnd;
  const ranked = teams.slice().sort((a, b) => b.o - a.o);
  const n = ranked.length;
  const bracket: Team[] = [];
  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    if (lo === hi) {
      bracket.push(ranked[lo]);
      lo++;
    } else {
      bracket.push(ranked[lo]);
      bracket.push(ranked[hi]);
      lo++;
      hi--;
    }
  }
  for (let t = 0; t < bracket.length - 1; t += 2) {
    if (rnd() < 0.18) {
      const tmp = bracket[t];
      bracket[t] = bracket[t + 1];
      bracket[t + 1] = tmp;
    }
  }
  const pairs: (Team | null)[][] = [];
  for (let p = 0; p < bracket.length; p += 2) pairs.push([bracket[p], bracket[p + 1] ?? null]);
  let myPair = -1;
  let myOpp: Team | null = null;
  for (let pi = 0; pi < pairs.length; pi++) {
    const A = pairs[pi][0];
    const B = pairs[pi][1];
    if (A && A.s === camp.myKey) {
      myPair = pi;
      myOpp = B;
      break;
    }
    if (B && B.s === camp.myKey) {
      myPair = pi;
      myOpp = A;
      pairs[pi] = [B, A]; // normaliza: eu sou sempre A
      break;
    }
  }
  camp.state = { kind: "knockout", stage, pairs, myPair, myOpp, done: false };
  if (myOpp == null) (camp.state as KnockoutStageState).bye = true;
}
export function resolveKnockoutMatch(
  camp: Campaign,
  gf: number,
  ga: number,
  seedMatch: number,
): boolean {
  const s = camp.state as KnockoutStageState;
  const opp = s.myOpp as Team;
  const kr = knockoutResult(camp.myTeam, opp, gf, ga, seedMatch);
  const iWin = kr.winner === "A";
  camp.history.push({
    stage: stageShort(s.stage),
    opp,
    gf,
    ga,
    pens: kr.pens,
    win: iWin,
    draw: false,
    ptsLabel: iWin ? "Avançou" : "Eliminado",
    ko: true,
  });
  s.myResult = { win: iWin, gf, ga, pens: kr.pens };
  return iWin;
}
// classe grossa de uma fase eliminatória do engine (p/ casar o resultado real).
function koStageClass(stage: Stage): StageClass {
  const r = stage.round;
  if (r === "R32") return "R32";
  if (r === "R16") return "R16";
  if (r === "QF") return "QF";
  if (r === "SF") return "SF";
  return "QF";
}
// monta um KoSlotRecord (slug + gols) — null-safe p/ bye.
function koSlot(team: Team | null, score: number | null): KoSlotRecord {
  return { slug: team ? team.s : null, score: team ? score : null };
}
// anexa (ou substitui, se já existir a mesma rodada) um KoRoundRecord. Idempotente:
// fechar a mesma rodada duas vezes (ex.: bye + re-commit) não duplica nem diverge.
function recordKoRound(camp: Campaign, rec: KoRoundRecord): void {
  const arr = (camp.koRounds = camp.koRounds ?? []);
  const at = arr.findIndex((r) => r.round === rec.round);
  if (at >= 0) arr[at] = rec;
  else arr.push(rec);
}
export function finishKnockoutStage(camp: Campaign, myWon: boolean): Team[] {
  const s = camp.state as KnockoutStageState;
  const winners: Team[] = [];
  const cls = koStageClass(s.stage);
  const year = camp.edition.year;
  // BUG 1.2: monta o registro REAL desta rodada (pares + placares + vencedor) pra
  // projectBracket ler o que de fato aconteceu na campanha — sem recalcular nada.
  const roundRec: KoRoundRecord = {
    round: (s.stage.round ?? "FINAL") as KnockoutRound | "FINAL",
    matches: [],
  };
  s.pairs.forEach((pair, idx) => {
    const A = pair[0];
    const B = pair[1];
    if (idx === s.myPair) {
      // MEU confronto: usa o resultado REAL do meu jogo (resolveKnockoutMatch) ou bye.
      if (s.bye) {
        winners.push(camp.myTeam);
        roundRec.matches.push({
          a: koSlot(camp.myTeam, null),
          b: koSlot(null, null),
          winnerSide: "A",
          pens: null,
          bye: true,
          mine: false,
        });
      } else {
        const opp = s.myOpp as Team;
        const mr = s.myResult;
        const iWon = myWon;
        winners.push(iWon ? camp.myTeam : opp);
        roundRec.matches.push({
          a: koSlot(camp.myTeam, mr ? mr.gf : null),
          b: koSlot(opp, mr ? mr.ga : null),
          winnerSide: iWon ? "A" : "B",
          pens: mr ? mr.pens : null,
          bye: false,
          mine: true,
        });
      }
      return;
    }
    if (!B) {
      if (A) winners.push(A);
      roundRec.matches.push({
        a: koSlot(A, null),
        b: koSlot(null, null),
        winnerSide: A ? "A" : null,
        pens: null,
        bye: true,
        mine: false,
      });
      return;
    }
    const sd =
      (camp.seed ^ (A!.o * 7919 + B.o * 104729 + idx * 911 + (s.stage.round || "").length * 13)) >>>
      0;
    const r = simAIvsAI(A as Team, B, sd, camp.worldMode, { year, cls });
    const kr = knockoutResult(A as Team, B, r.gA, r.gB, sd, { a: r.pensA, b: r.pensB });
    winners.push(kr.winner === "A" ? (A as Team) : B);
    roundRec.matches.push({
      a: koSlot(A as Team, r.gA),
      b: koSlot(B, r.gB),
      winnerSide: kr.winner,
      pens: kr.pens,
      bye: false,
      mine: false,
    });
  });
  // anexa a rodada fechada ao histórico de chaveamento da campanha (idempotente: se
  // já registramos esta rodada — re-fechamento — substitui em vez de duplicar).
  recordKoRound(camp, roundRec);
  // perdedores das SF (pra eventual third_place)
  if (s.stage.round === "SF") {
    camp.sfLosers = [];
    s.pairs.forEach((pair, idx) => {
      const A = pair[0];
      const B = pair[1];
      if (!B) return;
      if (idx === s.myPair) {
        camp.sfLosers!.push(myWon ? (s.myOpp as Team) : camp.myTeam);
        return;
      }
      const sd = (camp.seed ^ (A!.o * 7919 + B.o * 104729 + idx * 911 + 2)) >>> 0;
      const r = simAIvsAI(A as Team, B, sd, camp.worldMode, { year, cls });
      const kr = knockoutResult(A as Team, B, r.gA, r.gB, sd, { a: r.pensA, b: r.pensB });
      camp.sfLosers!.push(kr.winner === "A" ? B : (A as Team));
    });
  }
  s.winners = winners;
  s.done = true;
  return winners;
}

// BUG 1.2: grava a FINAL jogada por mim como uma rodada de chaveamento (o meu
// confronto É a final inteira — 1v1). `iWon` decide o lado vencedor; `pens` vem do
// knockoutResult do meu jogo. Idempotente via recordKoRound.
export function recordFinalRound(
  camp: Campaign,
  opp: Team,
  gf: number,
  ga: number,
  iWon: boolean,
  pens: string | null,
): void {
  recordKoRound(camp, {
    round: "FINAL",
    matches: [
      {
        a: koSlot(camp.myTeam, gf),
        b: koSlot(opp, ga),
        winnerSide: iWon ? "A" : "B",
        pens,
        bye: false,
        mine: true,
      },
    ],
  });
}
// BUG 1.2: grava a disputa de 3º lugar jogada por mim (desvio do mata-mata).
export function recordThirdRound(
  camp: Campaign,
  opp: Team,
  gf: number,
  ga: number,
  iWon: boolean,
  pens: string | null,
): void {
  recordKoRound(camp, {
    round: "THIRD",
    matches: [
      {
        a: koSlot(camp.myTeam, gf),
        b: koSlot(opp, ga),
        winnerSide: iWon ? "A" : "B",
        pens,
        bye: false,
        mine: true,
      },
    ],
  });
}

// =====================================================================
// BUG 1.2 — CHAVEAMENTO VINCULADO AO HISTÓRICO DA CAMPANHA
// projectBracket lê ESTRITAMENTE camp.koRounds — as rodadas de mata-mata que de fato
// foram fechadas na campanha (pares + placares + vencedor reais, gravados por
// finishKnockoutStage / recordFinalRound / recordThirdRound). NÃO recalcula árvore
// paralela: o que a campanha jogou é o que aparece. Fases FUTURAS ainda não disputadas
// simplesmente não estão em koRounds, então ficam OCULTAS (sem spoiler) e o `reveal`
// só completa a árvore com a HISTÓRIA REAL (results.json) DEPOIS que a campanha acaba.
// Função pura: não muta a campanha.
// =====================================================================

// rótulos de exibição por classe de rodada gravada.
function koRoundLabels(round: KoRoundRecord["round"]): { label: string; short: string } {
  switch (round) {
    case "R32":
      return { label: "32-avos de final", short: "32-avos" };
    case "R16":
      return { label: "Oitavas de final", short: "Oitavas" };
    case "QF":
      return { label: "Quartas de final", short: "Quartas" };
    case "SF":
      return { label: "Semifinais", short: "Semis" };
    case "THIRD":
      return { label: "Disputa de 3º lugar", short: "3º lugar" };
    case "FINAL":
      return { label: "Final", short: "Final" };
  }
}

// converte um KoMatchRecord (gravado) em BracketMatch (UI). Resolve slugs→Team na
// edição. `champion` é marcado fora, só na final de fato decidida.
function recordToBracketMatch(camp: Campaign, rec: KoMatchRecord): BracketMatch {
  const year = camp.edition.year;
  const teamOf = (slug: string | null): Team | null => (slug ? teamBySlug(year, slug) : null);
  const ta = teamOf(rec.a.slug);
  const tb = teamOf(rec.b.slug);
  const aWon = rec.winnerSide === "A";
  const bWon = rec.winnerSide === "B";
  const slotA: BracketSlot = {
    team: ta,
    score: rec.a.score,
    pens: rec.pens,
    winner: aWon,
    isMe: !!ta && ta.s === camp.myKey,
    champion: false,
  };
  const slotB: BracketSlot = {
    team: tb,
    score: rec.b.score,
    pens: rec.pens,
    winner: bWon,
    isMe: !!tb && tb.s === camp.myKey,
    champion: false,
  };
  return { a: slotA, b: slotB, bye: rec.bye, mine: rec.mine, real: rec.mine, pens: rec.pens };
}

// edição tem chaveamento? (1950 = quadrangular final, sem mata-mata → false).
// Detecta pela estrutura REAL da edição (formats.json): existe alguma fase eliminatória
// (knockout/second_round_knockout/final/third_place) que não seja só grupos.
function editionHasBracket(camp: Campaign): boolean {
  return camp.stages.some(
    (st) =>
      st.type === "knockout" ||
      st.type === "second_round_knockout" ||
      st.type === "final" ||
      st.type === "third_place",
  );
}

// BUG 1.2 (reveal): completa a árvore com a HISTÓRIA REAL além de onde a campanha
// parou — usado SÓ no fim de campanha, pra revelar o campeão real. Reúne, por classe
// de rodada (R32→R16→QF→SF→Final), os confrontos de results.json daquela edição que
// ainda não foram revelados pela campanha. Determinístico (lê JSON estático). Em
// worldMode==='alt' não há história — então não revela nada (fica "em aberto").
const KO_CLASS_ORDER: { cls: StageClass; round: KoRoundRecord["round"] }[] = [
  { cls: "R32", round: "R32" },
  { cls: "R16", round: "R16" },
  { cls: "QF", round: "QF" },
  { cls: "SF", round: "SF" },
  { cls: "final", round: "FINAL" },
];
function realKoRoundsAfter(camp: Campaign, playedRounds: Set<KoRoundRecord["round"]>): BracketRound[] {
  if (camp.worldMode !== "real") return [];
  const year = camp.edition.year;
  const byPair = REAL_INDEX[year];
  if (!byPair) return [];
  // agrupa todos os jogos reais por classe de rodada.
  const byClass: Record<string, IndexedReal[]> = {};
  Object.values(byPair).forEach((recs) => {
    recs.forEach((r) => {
      (byClass[r.cls] = byClass[r.cls] || []).push(r);
    });
  });
  const out: BracketRound[] = [];
  KO_CLASS_ORDER.forEach(({ cls, round }) => {
    if (playedRounds.has(round)) return; // a campanha já revelou esta rodada
    const recs = byClass[cls];
    if (!recs || recs.length === 0) return;
    const labels = koRoundLabels(round);
    const matches: BracketMatch[] = recs.map((r) => {
      const ta = teamBySlug(year, r.a);
      const tb = teamBySlug(year, r.b);
      const aWon = r.ga > r.gb || (r.ga === r.gb && (r.pa ?? 0) >= (r.pb ?? 0));
      const pens = r.pa != null && r.pb != null ? r.pa + "×" + r.pb : null;
      const slotA: BracketSlot = { team: ta, score: r.ga, pens, winner: aWon, isMe: false, champion: false };
      const slotB: BracketSlot = { team: tb, score: r.gb, pens, winner: !aWon, isMe: false, champion: false };
      return { a: slotA, b: slotB, bye: false, mine: false, real: false, pens };
    });
    out.push({ label: labels.label, short: labels.short, round, matches });
  });
  return out;
}

// `reveal` = true (fim de campanha): completa a árvore com a história real além de
// onde parei, pra mostrar o campeão real. `reveal` = false (durante a campanha): só
// as rodadas já jogadas — fases futuras ficam ocultas (sem spoiler).
export function projectBracket(camp: Campaign, reveal: boolean = false): BracketView | null {
  if (!editionHasBracket(camp)) return null; // ex.: 1950 (quadrangular final)
  const played = camp.koRounds ?? [];
  // ordena terceiro-lugar logo antes da final (estética de árvore); o resto na ordem
  // em que foi gravado (= ordem real das rodadas da edição).
  const rank = (r: KoRoundRecord["round"]) =>
    r === "THIRD" ? 98 : r === "FINAL" ? 99 : 0;
  const playedSorted = played
    .map((r, i) => ({ r, i }))
    .sort((x, y) => rank(x.r.round) - rank(y.r.round) || x.i - y.i)
    .map((x) => x.r);

  const rounds: BracketRound[] = [];
  let champion: Team | null = null;
  let myExitRound: number | null = null;

  playedSorted.forEach((rec) => {
    const labels = koRoundLabels(rec.round);
    const matches = rec.matches.map((m) => recordToBracketMatch(camp, m));
    const roundIdx = rounds.length;
    // detecta a rodada em que eu caí (joguei e perdi um confronto eliminatório real;
    // 3º lugar não conta como "queda" — já é um desvio).
    if (rec.round !== "THIRD") {
      matches.forEach((m) => {
        if (m.mine && !m.bye) {
          const iWonSlot = (m.a.isMe && m.a.winner) || (m.b.isMe && m.b.winner);
          if (!iWonSlot) myExitRound = roundIdx;
        }
      });
    }
    // campeão: só quando a FINAL foi de fato decidida na campanha.
    if (rec.round === "FINAL" && matches[0]) {
      const fm = matches[0];
      if (fm.a.winner && fm.a.team) {
        champion = fm.a.team;
        fm.a.champion = true;
      } else if (fm.b.winner && fm.b.team) {
        champion = fm.b.team;
        fm.b.champion = true;
      }
    }
    rounds.push({ label: labels.label, short: labels.short, round: rec.round, matches });
  });

  // no fim de campanha (reveal), completa com a história real além de onde parei.
  // SALVAGUARDA anti-spoiler: só revela com a campanha de fato encerrada (!alive) —
  // assim, mesmo que reveal=true vaze pra uma campanha viva, nada é antecipado.
  if (reveal && !camp.alive && !champion) {
    const playedSet = new Set(played.map((r) => r.round));
    const extra = realKoRoundsAfter(camp, playedSet);
    extra.forEach((er) => {
      if (er.round === "FINAL" && er.matches[0]) {
        const fm = er.matches[0];
        if (fm.a.winner && fm.a.team) {
          champion = fm.a.team;
          fm.a.champion = true;
        } else if (fm.b.winner && fm.b.team) {
          champion = fm.b.team;
          fm.b.champion = true;
        }
      }
      // posiciona o 3º lugar antes da final também na parte revelada.
      rounds.push(er);
    });
    rounds.sort((a, b) => rank(a.round) - rank(b.round));
  }

  if (rounds.length === 0) return null; // ainda não joguei nenhuma rodada de mata-mata

  const iAmChampion = !!champion && (champion as Team).s === camp.myKey;
  return { rounds, champion, myExitRound, iAmChampion };
}

// ---------------- THIRD PLACE ----------------
function initThirdPlace(camp: Campaign, stage: Stage): void {
  const contenders = camp.thirdPlaceTeams || camp.sfLosers || [];
  const iAmIn = contenders.some((t) => t.s === camp.myKey);
  let myOpp: Team | null = null;
  if (iAmIn) myOpp = contenders.find((t) => t.s !== camp.myKey) || null;
  camp.state = { kind: "third_place", stage, contenders, iAmIn, myOpp, done: false };
}

// ---------------- FINAL ----------------
function initFinal(camp: Campaign, stage: Stage): void {
  const finalists = camp.carryTeams ? camp.carryTeams.slice() : [];
  const iAmIn = finalists.some((t) => t.s === camp.myKey);
  const myOpp = iAmIn ? finalists.find((t) => t.s !== camp.myKey) || null : null;
  camp.state = { kind: "final", stage, finalists, iAmIn, myOpp, done: false };
}

// =====================================================================
// PROGRESSÃO ENTRE ESTÁGIOS
// =====================================================================
function runSecondGroups(camp: Campaign): { winners: Team[]; runners: Team[] } {
  const s = camp.state as GroupsStageState;
  const winners: Team[] = [];
  const runners: Team[] = [];
  (s.sortedStandings ?? []).forEach((sorted) => {
    if (sorted[0]) winners.push(sorted[0].team);
    if (sorted[1]) runners.push(sorted[1].team);
  });
  return { winners, runners };
}

export function advanceCampaign(camp: Campaign, iSurvive: boolean): void {
  const stage = camp.stages[camp.stageIdx];

  if (stage.type === "groups") {
    const qualified = (camp.state as GroupsStageState).qualified ?? [];
    if (!iSurvive) {
      eliminate(camp, stageLong(stage));
      return;
    }
    camp.carryTeams = qualified;
    nextStage(camp);
    return;
  }

  if (stage.type === "final_group") {
    const place = (camp.state as FinalGroupStageState).myPlace || (iSurvive ? 1 : 4);
    camp.alive = false;
    if (iSurvive) {
      camp.champion = true;
      camp.placement = "Campeão";
      camp.finishedAt = "champion";
    } else if (place === 2) {
      camp.placement = "Vice-campeão";
      camp.finishedAt = "runnerup";
    } else if (place === 3) {
      camp.placement = "3º lugar";
      camp.finishedAt = "thirdplace";
    } else {
      camp.placement = "4º lugar";
      camp.finishedAt = "thirdplace";
    }
    camp.stageIdx = camp.stages.length;
    return;
  }

  if (stage.type === "second_groups") {
    const sg = runSecondGroups(camp);
    const next = camp.stages[camp.stageIdx + 1];
    const nextIsThird = next && next.type === "third_place";
    if (nextIsThird) {
      camp.finalists = sg.winners;
      camp.thirdPlaceTeams = sg.runners;
      const iWon = sg.winners.some((t) => t.s === camp.myKey);
      const iRunner = sg.runners.some((t) => t.s === camp.myKey);
      if (iWon) {
        camp.carryTeams = sg.winners;
        camp.skipThird = true;
        jumpToFinal(camp);
        return;
      }
      if (iRunner) {
        camp.carryTeams = null;
        nextStage(camp);
        return;
      }
      eliminate(camp, stageLong(stage));
      return;
    } else {
      if (!iSurvive) {
        eliminate(camp, stageLong(stage));
        return;
      }
      camp.carryTeams = sg.winners;
      nextStage(camp);
      return;
    }
  }

  if (stage.type === "knockout") {
    const nxt = camp.stages[camp.stageIdx + 1];
    const roundIsSF = stage.round === "SF";
    if (!iSurvive) {
      if (roundIsSF && nxt && nxt.type === "third_place") {
        camp.thirdPlaceTeams = camp.sfLosers || [];
        nextStage(camp);
        return;
      }
      eliminate(camp, stageLong(stage));
      return;
    }
    camp.carryTeams = (camp.state as KnockoutStageState).winners ?? [];
    if (nxt && nxt.type === "third_place") {
      camp.thirdPlaceTeams = camp.sfLosers || [];
      jumpToFinal(camp);
      return;
    }
    nextStage(camp);
    return;
  }

  if (stage.type === "third_place") {
    camp.alive = false;
    camp.placement = iSurvive ? "3º lugar" : "4º lugar";
    camp.finishedAt = "thirdplace";
    return;
  }

  if (stage.type === "final") {
    camp.alive = false;
    if (iSurvive) {
      camp.champion = true;
      camp.placement = "Campeão";
      camp.finishedAt = "champion";
    } else {
      camp.placement = "Vice-campeão";
      camp.finishedAt = "runnerup";
    }
    return;
  }
  camp.alive = false;
}

function nextStage(camp: Campaign): void {
  camp.stageIdx++;
  if (camp.stageIdx >= camp.stages.length) {
    camp.alive = false;
    return;
  }
  initStage(camp);
}
function jumpToFinal(camp: Campaign): void {
  let idx = camp.stageIdx + 1;
  while (idx < camp.stages.length && camp.stages[idx].type !== "final") idx++;
  camp.stageIdx = idx;
  if (camp.stageIdx >= camp.stages.length) {
    camp.alive = false;
    return;
  }
  initStage(camp);
}
function eliminate(camp: Campaign, atStageName: string): void {
  camp.alive = false;
  camp.eliminated = true;
  camp.finishedAt = "out";
  camp.placement = "Eliminado — " + atStageName;
}

// o próximo confronto que EU jogo no estágio corrente (ou null se o estágio
// precisa ser "fechado" simulando a IA).
export function myNextMatch(camp: Campaign): { opp: Team; kind: MatchKind } | null {
  const s = camp.state;
  if (!s) return null;
  if (s.kind === "groups" || s.kind === "final_group") {
    const opp = s.kind === "groups" ? currentGroupOpp(camp) : currentFinalGroupOpp(camp);
    if (opp) return { opp, kind: s.kind };
    return null;
  }
  if (s.kind === "knockout") {
    if (s.bye) return null;
    return s.myOpp ? { opp: s.myOpp, kind: "knockout" } : null;
  }
  if (s.kind === "third_place") {
    return s.iAmIn && s.myOpp ? { opp: s.myOpp, kind: "third_place" } : null;
  }
  if (s.kind === "final") {
    return s.iAmIn && s.myOpp ? { opp: s.myOpp, kind: "final" } : null;
  }
  return null;
}

// progresso global do torneio para a barra. third_place é um DESVIO (só p/ perdedor de semi).
export function campaignProgress(camp: Campaign): ProgressStep[] {
  const atThird = camp.state && camp.state.kind === "third_place" && camp.state.iAmIn;
  const landedThird = camp.placement === "3º lugar" || camp.placement === "4º lugar";
  const out: ProgressStep[] = [];
  camp.stages.forEach((st, i) => {
    if (st.type === "third_place" && !(atThird || landedThird)) return; // esconde o desvio
    const label = stageShort(st);
    let status: ProgressStep["status"] = "todo";
    if (i < camp.stageIdx) status = "done";
    else if (i === camp.stageIdx) status = camp.eliminated ? "out" : "now";
    out.push({ label, status, type: st.type });
  });
  if (camp.champion) out.forEach((o) => (o.status = "done"));
  return out;
}

export function isQualified(camp: Campaign, key: string): boolean {
  const s = camp.state as GroupsStageState;
  const q = s.qualified ?? [];
  for (let i = 0; i < q.length; i++) if (q[i].s === key) return true;
  return false;
}
export function wcGroupName(year: number, gIdx: number): string {
  const wc = WC_GROUPS_BY_YEAR[year];
  if (wc && wc.groups && wc.groups[gIdx]) return wc.groups[gIdx].name;
  return "Grupo " + String.fromCharCode(65 + gIdx);
}

// =====================================================================
// SCORE de fim de campanha
// =====================================================================
function placementRank(camp: Campaign): number {
  if (camp.champion) return 1;
  if (camp.finishedAt === "runnerup") return 2;
  if (camp.placement === "3º lugar") return 3;
  if (camp.placement === "4º lugar") return 4;
  return 8;
}
export function campaignScore(camp: Campaign) {
  const rank = placementRank(camp);
  let base = camp.champion ? 1000 : rank === 2 ? 620 : rank === 3 ? 440 : rank === 4 ? 360 : 0;
  const stagesPassed = camp.stageIdx;
  base += stagesPassed * 70;
  let wins = 0;
  let draws = 0;
  let gd = 0;
  camp.history.forEach((h) => {
    if (h.win) wins++;
    else if (h.draw) draws++;
    gd += h.gf - h.ga;
  });
  base += wins * 45 + draws * 15 + Math.max(0, gd) * 8;
  // Bônus de dificuldade por TIER (decisão do João): zebra escala, gigante não
  // ganha bônus. S/A = sem bônus; B/C/D crescem. Mantém o teto 2.4×.
  let mult = TIER_DIFFICULTY_MULT[camp.myTeam.t] ?? 1;
  mult = Math.max(1, Math.min(2.4, mult));
  const pctExtra = Math.round((mult - 1) * 100);
  const total = Math.round(base * mult);
  return { base, mult, total, pctExtra, rank, wins, draws };
}

// multiplicador de dificuldade por tier do time comandado (item 18).
// S/A = elite, sem bônus; B leve; C médio; D (zebra) alto.
export const TIER_DIFFICULTY_MULT: Record<Tier, number> = {
  S: 1.0,
  A: 1.0,
  B: 1.15,
  C: 1.45,
  D: 1.9,
};

// histórico utilitário p/ a UI: tipos já estão em ./types
export type { HistoryEntry };
