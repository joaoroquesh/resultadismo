// =====================================================================
// RESULTADISMO MANAGER — MOTOR v2/v4 (porte TS puro do protótipo jogável)
// mulberry32 · createMatch · stepMinute · simulateFull
// + runner data-driven de torneio (formatos/grupos reais) + sorteio.
//
// Núcleo 100% determinístico: NENHUM Math.random aqui. Toda aleatoriedade
// passa pelo PRNG mulberry32 semeado (seed), pra a campanha ser reproduzível
// e retomável. A UI (manager) e o managerLocal só consomem este módulo.
// =====================================================================
import type {
  AtkStyle,
  BracketMatch,
  BracketRound,
  BracketSlot,
  BracketView,
  Campaign,
  ChanceKind,
  DefStyle,
  Edition,
  FinalGroupStageState,
  Form,
  GroupOtherResult,
  GroupRoundLog,
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
  MatchEvent,
  MatchKind,
  MatchState,
  MatchStats,
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
// se a história não tem esse confronto NAQUELA FASE (ex.: par que nunca se enfrentou de
// verdade — fruto de um sorteio/efeito borboleta divergente — OU que só se enfrentou em
// OUTRA fase). REGRA DURA (efeito borboleta correto): quando `cls` é passado, só vale o
// placar REAL se o par se enfrentou EXATAMENTE naquela classe de fase. Sem isso, um par
// que historicamente só se viu no GRUPO (ex.: 1954 Alemanha×Hungria no Grupo 2, ou
// 1994/2002 Brasil no grupo) vazaria aquele placar como se fosse uma semi/quartas REAL
// num cruzamento que nunca aconteceu — exatamente o falso-real que a continuação precisa
// evitar. `cls` ausente (consulta agnóstica) mantém o fallback pro 1º registro do par.
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
  // escolhe o registro: se `cls` foi pedido, EXIGE um registro daquela fase (senão null,
  // pra o confronto ser SIMULADO em vez de herdar o placar de outra fase). Sem `cls`,
  // casa o 1º registro do par.
  let rec = recs[0];
  if (cls) {
    const m = recs.find((r) => r.cls === cls);
    if (!m) return null; // par não se enfrentou NESTA fase → simula (sem falso-real)
    rec = m;
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
  // ——— CALIBRAÇÃO DE FORÇA (validação Monte Carlo §17, rev 4) ———
  // SHARE_SOFT amplia a fatia de chances pelo GAP de força (off^SHARE no share). Em força
  // IGUAL é ~neutro (1:1 → 0.5), então NÃO mexe na simetria entre iguais (§17 meta 1: Brasil
  // ×Brasil ~38/24/38), mas faz o GIGANTE dominar o gap grande (§17 meta 4). O §16 ancorava
  // 1.55 (protótipo); a validação MC mostrou que 1.55 deixava o gigante em ~48% de vitória
  // num gap de 18 (força não dominava). 2.2 recoloca a força no comando sem inverter nada.
  SHARE_SOFT: 2.2,
  CONV_DEF_PULL: 0.95,
  // CONV_SPAN_FACTOR pesa o quanto a razão off/def (a FORÇA, canal literal §16) move a
  // conversão. 0.8→1.1: amplia o domínio do gap E o impacto da SINTONIA (§6.5) — a validação
  // MC (§17 meta 3) mostrou a sintonia fraca (38%×35%) em 0.8; 1.1 leva a ~46%×30% (alvo
  // 44×29). Entre iguais a razão é 1:1, então segue ~neutro (não quebra as metas 1/2).
  CONV_SPAN_FACTOR: 1.1,
  CHANCE_QUALITY_VAR: 0.28,
  FATIGUE_2H: 1.05,
  CONV_MIN: 0.04,
  CONV_MAX: 0.52,
  W_ATK: 0.6,
  W_MID: 0.4,
  // ——— rev 4 (estudo-taticas-v3 §16): o encaixe vira 2 grupos com peso que inverte.
  // O edge BIDIRECIONAL (item 8) continua: além do ataque (offEf), o edge endurece a
  // defesa e qualifica a conversão. kDef/kConv calibram a fração que vaza pra esses
  // canais — sem ignorar a força base (gap grande ainda manda).
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

// =====================================================================
// NÚCLEO TÁTICO — estudo-taticas-v3 · rev 4 (§16, implementation-ready)
// Encaixe = soma ponderada de Estrutura (0.60→0.45) e Táticas (0.40→0.55), com peso
// que inverte ao longo do jogo. Os valores abaixo são os do §16, copiados como estão.
// =====================================================================

// ordem canônica dos eixos (índices das matrizes).
const FORM: Form[] = ["4-2-4", "3-4-3", "4-3-3", "4-4-2", "3-5-2", "4-5-1", "5-3-2", "5-4-1", "6-3-1"];
const ATK: AtkStyle[] = ["posse", "vertical", "bolalonga", "contra", "drible"];
const DEF: DefStyle[] = ["zona", "individual", "mista", "libero", "dobra"];

// ——— Matriz Ataque × Defesa (§4, duplamente balanceada, em meios) ———
// linhas = ataque; colunas = defesa, na ordem de DEF [zona, individual, mista, libero, dobra].
const AD: Record<AtkStyle, number[]> = {
  posse: [0, -1, 0.5, 1, -0.5],
  vertical: [-1, -0.5, 1, 0, 0.5],
  bolalonga: [-0.5, 0, -1, 0.5, 1],
  contra: [0.5, 1, -0.5, -1, 0],
  drible: [1, 0.5, 0, -0.5, -1],
};
// ——— Pressão / bloco (§5): ataque × bloco do rival [alta, media, baixa] ———
const PR: Record<AtkStyle, number[]> = {
  posse: [0, 0, -0.5],
  vertical: [1, 0.5, -1],
  bolalonga: [1, 0, -0.5],
  contra: [1, 0, -1],
  drible: [0, 0.5, 0.5],
};

// ——— 9 formações (grid 3×3): afinidade de elenco [ATA, MEI, DEF] (§8, do grid) ———
const AFIN_FORM: Record<Form, number[]> = {
  "4-2-4": [2, -1, -1],
  "3-4-3": [2, 0, -2],
  "4-3-3": [2, -2, 0],
  "4-4-2": [0, 2, -2],
  "3-5-2": [-1, 2, -1],
  "4-5-1": [-2, 2, 0],
  "5-3-2": [0, -2, 2],
  "5-4-1": [-2, 0, 2],
  "6-3-1": [-1, -1, 2],
};
// linha do grid: 0 = ATA (4-2-4/3-4-3/4-3-3), 1 = MEI (4-4-2/3-5-2/4-5-1), 2 = DEF (5-3-2/5-4-1/6-3-1).
function formRow(f: Form): 0 | 1 | 2 {
  const i = FORM.indexOf(f);
  return (i < 3 ? 0 : i < 6 ? 1 : 2) as 0 | 1 | 2;
}

// ——— Coerência da formação (§2): casamento estilo↔formação, clamp [-.10,+.10] ———
// EST_CASA/DEF_CASA listam as formações que CASAM com cada estilo (1º item = casa forte).
const EST_CASA: Record<AtkStyle, Form[]> = {
  posse: ["4-4-2", "3-5-2", "4-5-1"],
  vertical: ["4-3-3", "3-4-3", "4-2-4"],
  bolalonga: ["4-2-4", "5-3-2", "4-4-2"],
  contra: ["5-3-2", "5-4-1", "4-5-1"],
  drible: ["4-3-3", "3-4-3", "4-4-2"],
};
const DEF_CASA: Record<DefStyle, Form[]> = {
  zona: ["4-4-2", "4-3-3", "4-2-4"],
  individual: ["4-3-3", "3-4-3", "4-5-1"],
  mista: ["4-4-2", "3-5-2", "4-5-1"],
  libero: ["5-3-2", "5-4-1", "6-3-1"],
  dobra: ["3-5-2", "4-5-1", "5-4-1"],
};
function coerenciaForm(form: Form, atk: AtkStyle, def: DefStyle): number {
  const ea = EST_CASA[atk];
  const ec = ea.indexOf(form) === 0 ? 0.06 : ea.indexOf(form) > 0 ? 0.04 : -0.03;
  const da = DEF_CASA[def];
  const dc = da.indexOf(form) >= 0 ? 0.04 : -0.02;
  return clamp(ec + dc, -0.1, 0.1);
}

// ——— Afinidade de elenco (§8): bônus por distribuição de força do PRÓPRIO time ———
const AFIN_ATK: Record<AtkStyle, number[]> = {
  posse: [-1, 2, -1],
  vertical: [2, -1, -1],
  bolalonga: [-1, -1, 2],
  contra: [-1, -1, 2],
  drible: [2, -1, -1],
};
const AFIN_DEF: Record<DefStyle, number[]> = {
  zona: [-1, -1, 2],
  individual: [-1, -1, 2],
  libero: [-1, -1, 2],
  mista: [-1, 2, -1],
  dobra: [-1, 2, -1],
};
function dot(v: number[], w: number[]): number {
  return v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
}
// dev = (X − média)/média por linha (ATA/MEI/DEF) do time. clamp ±0.08.
function afinidadeElenco(team: Team, atk: AtkStyle, def: DefStyle, form: Form): number {
  const mean = (team.a + team.m + team.d) / 3 || 1;
  const dev = [(team.a - mean) / mean, (team.m - mean) / mean, (team.d - mean) / mean];
  const raw = (dot(AFIN_ATK[atk], dev) + dot(AFIN_DEF[def], dev) + dot(AFIN_FORM[form], dev)) / 3;
  return clamp(0.12 * raw, -0.08, 0.08);
}

// ——— SINTONIA dos sliders (§6.5): leans -1..+1 que puxam o ideal ———
const PRESS_ATK: Record<AtkStyle, number> = { posse: 0.3, vertical: 1, bolalonga: 0, contra: -1, drible: 0 };
const PRESS_DEF: Record<DefStyle, number> = { zona: 0, individual: 0.7, mista: 0, libero: -1, dobra: 0.7 };
const PRESS_FORMROW = [1, 0, -1]; // ATA, MEI, DEF
const AMPL_ATK: Record<AtkStyle, number> = { posse: -0.7, vertical: 0.5, bolalonga: 1, contra: 0, drible: -1 };
const AMPL_FORM: Record<Form, number> = {
  "4-2-4": 0.5,
  "3-4-3": 0.5,
  "4-3-3": 0.5,
  "4-4-2": -0.3,
  "3-5-2": -0.3,
  "4-5-1": 0.4,
  "5-3-2": -0.3,
  "5-4-1": -0.5,
  "6-3-1": -0.5,
};
const PEG_ATK: Record<AtkStyle, number> = { posse: -1, vertical: 0.3, bolalonga: 0, contra: 0.7, drible: -0.5 };
const PEG_DEF: Record<DefStyle, number> = { zona: -0.3, individual: 1, mista: 0, libero: -0.3, dobra: 1 };

// força do time numa escala -1..+1 (pivô 80, ±20 = clamp). + = forte.
function forcaTier(team: Team): number {
  return clamp((teamMean(team) - 80) / 20, -1, 1);
}
function teamMean(team: Team): number {
  return (team.a + team.m + team.d) / 3;
}
function align(v: number, ideal: number): number {
  return 1 - (2 * Math.abs(v - ideal)) / 100; // +1 no ideal, −1 no oposto
}
// sintonia ∈ [-1,+1]: o quanto os sliders batem o ideal do seu estilo/formação/força.
function sintonia(tac: Tactic, team: Team): number {
  const ft = forcaTier(team);
  const idealPress = 50 + 30 * clamp((PRESS_ATK[tac.atk] + PRESS_DEF[tac.def] + PRESS_FORMROW[formRow(tac.form)] + ft) / 4, -1, 1);
  const idealAmpl = 50 + 30 * clamp((AMPL_ATK[tac.atk] + AMPL_FORM[tac.form]) / 2, -1, 1);
  const idealPeg = 50 + 30 * clamp((PEG_ATK[tac.atk] + PEG_DEF[tac.def] - 0.3 * ft) / 2, -1, 1);
  return (
    0.5 * align(tac.pressao, idealPress) +
    0.3 * align(tac.amplitude, idealAmpl) +
    0.2 * align(tac.agressividade, idealPeg)
  );
}

// ——— Constantes / pesos (§16) ———
const kPost = 0.12;
// ônus dos EXTREMOS de slider (exponencial, só nas pontas). Castiga SÓ quando um slider
// está em [0,10] ou [90,100], crescendo de forma EXPONENCIAL (não linear): 0 na borda
// (90 ou 10), ONUS_MAX no talo (100 ou 0). t ∈ (0,1] é o quão fundo no extremo está; a
// curva exp(K·t) torna o castigo desprezível perto da borda e perceptível só no talo.
// O edge total continua clampado (±0.32), então o ônus afina, não domina.
const ONUS_K = 3.5; // acentua a curva (quanto maior, mais "tudo no fim do extremo")
const ONUS_MAX = 0.05; // castigo por slider no talo (100/0); 4 no talo ≈ 0.20 de edge
function sliderOnus(v: number): number {
  const t = v > 90 ? (v - 90) / 10 : v < 10 ? (10 - v) / 10 : 0;
  if (t <= 0) return 0;
  return (ONUS_MAX * (Math.exp(ONUS_K * t) - 1)) / (Math.exp(ONUS_K) - 1);
}
// ônus dos extremos = soma do sliderOnus dos 4 sliders (postura, pressão, amplitude, pegada).
function onusExtremos(tac: Tactic): number {
  return (
    sliderOnus(tac.postura) +
    sliderOnus(tac.pressao) +
    sliderOnus(tac.amplitude) +
    sliderOnus(tac.agressividade)
  );
}
// peso da Estrutura ao longo do jogo: 0.60 (início) → 0.45 (fim). `feeling` ∈ [0,1].
function wEstrutura(feeling: number): number {
  return 0.6 - 0.15 * clamp(feeling, 0, 1);
}
// fadiga (§12): suave na força (−8%), forte na execução tática (−55%). F ∈ [0,1].
function fadigaTat(F: number): number {
  return 1 - 0.55 * clamp(F, 0, 1);
}
function fadigaForca(F: number): number {
  return 1 - 0.08 * clamp(F, 0, 1);
}
// Drible/Contra leem a Força Base (§3): Drible premia o FORTE, Contra premia o FRACO.
// Leitura RELATIVA ao rival (pivô = a força do oponente), pra ser NEUTRA entre iguais
// (§3 "neutros entre iguais") e crescer só no descasamento. O forte não ganha no Contra;
// o fraco não ganha no Drible. Clampado pra não estourar o teto sozinho.
function dribleForca(team: Team, opp: Team): number {
  return clamp(((team.a - opp.a) / 20) * 0.6, -0.6, 0.6);
}
function contraForca(team: Team, opp: Team): number {
  return clamp(((teamMean(opp) - teamMean(team)) / 20) * 0.6, -0.6, 0.6);
}
// largura da defesa do rival: "estreita" (meio/sem alas) deixa as alas livres → bônus
// pra amplitude alta. narrow(def) ∈ {+1 estreita, 0 neutra}. (§16: 0.12·amplitude·narrow)
const NARROW_DEF: Record<DefStyle, number> = { zona: 0, individual: 0, mista: 0, libero: 1, dobra: 1 };

// helper de clamp (min,max)
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
// bucket do slider de pressão → índice [0=alta,1=media,2=baixa] da matriz PR.
function blocoIdx(pressao: number): 0 | 1 | 2 {
  return (pressao >= 67 ? 0 : pressao >= 34 ? 1 : 2) as 0 | 1 | 2;
}

// ===== ESTRUTURA + TÁTICAS (§7) — crus, antes do teto/fadiga/peso =====
// estrutura olha SÓ o meu ataque vs a defesa DELE (matriz §4) + a minha coerência +
// minha afinidade de elenco + o bônus de Drible/Contra (leem a Força Base vs o rival).
function estruturaEdge(team: Team, tac: Tactic, oppTeam: Team, oppTac: Tactic): number {
  const ad = AD[tac.atk][DEF.indexOf(oppTac.def)];
  const coh = coerenciaForm(tac.form, tac.atk, tac.def);
  const af = afinidadeElenco(team, tac.atk, tac.def, tac.form);
  const drb = tac.atk === "drible" ? dribleForca(team, oppTeam) : 0;
  const ctr = tac.atk === "contra" ? contraForca(team, oppTeam) : 0;
  return ad + coh + af + drb + ctr;
}
// táticas olham a pressão (vs o bloco dele), a amplitude (vs a largura da defesa dele),
// a sintonia (sliders × meu estilo/formação/força) e a agressividade (pegada).
function taticasEdge(tac: Tactic, oppTac: Tactic, team: Team): number {
  const pr = 0.34 * PR[tac.atk][blocoIdx(oppTac.pressao)];
  const amp = 0.12 * (((tac.amplitude - 50) / 50) * NARROW_DEF[oppTac.def]);
  const sin = 0.34 * sintonia(tac, team);
  const agr = 0.1 * (((tac.agressividade - 50) / 50) * 0.5);
  return pr + amp + sin + agr;
}

// teto por fase (§11): faixa do edge total por fase + jitter ±2%. Determinístico
// (semeado por seed do confronto). Default = grupos.
type FaseKey = "estreia" | "grupos" | "quartas" | "final";
const TETO_FASE: Record<FaseKey, [number, number]> = {
  estreia: [0.18, 0.22],
  grupos: [0.26, 0.3],
  quartas: [0.22, 0.27],
  final: [0.15, 0.2],
};
function tetoFase(fase: FaseKey, rnd?: () => number): number {
  const [lo, hi] = TETO_FASE[fase] ?? TETO_FASE.grupos;
  const base = (lo + hi) / 2;
  const jitter = rnd ? (rnd() * 2 - 1) * 0.02 : 0;
  return base + jitter;
}

// COERÊNCIA — derivada do novo modelo, p/ a UI ("Análise da comissão"). Mantém a
// assinatura {postureMul, synergy, latKill} que pontos antigos podem consultar; aqui o
// "synergy" = coerenciaForm e o "postureMul" reflete o quão extrema é a postura.
export function coherence(tac: Tactic): { postureMul: number; synergy: number; latKill: number } {
  const synergy = coerenciaForm(tac.form, tac.atk, tac.def);
  const p = (tac.postura - 50) / 50; // -1..+1
  return { postureMul: 1 + kPost * p, synergy, latKill: 1 };
}

// =====================================================================
// TRANSPARÊNCIA DO CONFRONTO (UI) — legível, SEM número cru. Espelha a matriz §4 (AD:
// ataque × defesa) e a pressão §5. A UI mostra "o que o seu ATAQUE supera/teme" na
// seleção (às cegas) e badges concretos no intervalo (tática do rival revelada).
// =====================================================================
const ATK_SHORT: Record<AtkStyle, string> = {
  posse: "Posse",
  vertical: "Vertical",
  bolalonga: "Bola longa",
  contra: "Contra-ataque",
  drible: "Drible",
};
const DEF_SHORT: Record<DefStyle, string> = {
  zona: "Zona",
  individual: "Individual",
  mista: "Mista",
  libero: "Líbero",
  dobra: "Dobra",
};
// p/ um ATAQUE, a defesa que ele mais castiga (AD máx) e a que mais o sufoca (AD mín).
export function styleMatchup(atk: AtkStyle): {
  beats: DefStyle;
  beatsLabel: string;
  losesTo: DefStyle;
  losesToLabel: string;
} {
  const row = AD[atk];
  let bi = 0;
  let wi = 0;
  for (let i = 1; i < DEF.length; i++) {
    if (row[i] > row[bi]) bi = i;
    if (row[i] < row[wi]) wi = i;
  }
  return {
    beats: DEF[bi],
    beatsLabel: DEF_SHORT[DEF[bi]],
    losesTo: DEF[wi],
    losesToLabel: DEF_SHORT[DEF[wi]],
  };
}

// p/ uma DEFESA, o ataque que ela mais SUFOCA (AD mín na coluna) e o que mais a CASTIGA
// (AD máx na coluna) — espelha §3.2. Lê a matriz §4 por coluna (perspectiva do atacante,
// invertida: AD baixo = defesa ganha). SEM número cru.
export function defenseMatchup(def: DefStyle): {
  stops: AtkStyle;
  stopsLabel: string;
  weakTo: AtkStyle;
  weakToLabel: string;
} {
  const col = DEF.indexOf(def);
  let si = 0;
  let wi = 0;
  for (let i = 1; i < ATK.length; i++) {
    if (AD[ATK[i]][col] < AD[ATK[si]][col]) si = i; // atacante mais sufocado
    if (AD[ATK[i]][col] > AD[ATK[wi]][col]) wi = i; // atacante que mais castiga
  }
  return {
    stops: ATK[si],
    stopsLabel: ATK_SHORT[ATK[si]],
    weakTo: ATK[wi],
    weakToLabel: ATK_SHORT[ATK[wi]],
  };
}

// Vantagens CONCRETAS do meu plano contra o do rival (intervalo, tática da IA revelada).
// Derivado das MESMAS regras do motor (AD + pressão), sem expor o edge numérico.
export type MatchupSignal = { kind: "good" | "bad" | "neutral"; text: string };
export function matchupHints(my: Tactic, opp: Tactic): MatchupSignal[] {
  const out: MatchupSignal[] = [];
  // 1) meu ataque × a defesa DELES (matriz §4).
  const ad = AD[my.atk][DEF.indexOf(opp.def)];
  if (ad >= 1)
    out.push({ kind: "good", text: `Seu ${ATK_SHORT[my.atk]} machuca a marcação ${DEF_SHORT[opp.def].toLowerCase()} deles.` });
  else if (ad >= 0.5)
    out.push({ kind: "good", text: `Seu ${ATK_SHORT[my.atk]} leva leve vantagem sobre a defesa deles.` });
  else if (ad <= -1)
    out.push({ kind: "bad", text: `A marcação ${DEF_SHORT[opp.def].toLowerCase()} deles abafa seu ${ATK_SHORT[my.atk]}.` });
  else if (ad <= -0.5)
    out.push({ kind: "bad", text: `A defesa deles leva leve vantagem sobre seu ${ATK_SHORT[my.atk]}.` });
  // 2) minha pressão × o meu ataque (§5): bloco do rival deixa (ou não) o espaço certo.
  const pr = PR[my.atk][blocoIdx(opp.pressao)];
  if (pr >= 1)
    out.push({ kind: "good", text: "O bloco deles deixa exatamente o espaço que seu ataque procura." });
  else if (pr <= -1)
    out.push({ kind: "bad", text: "O bloco deles fecha o espaço que seu ataque precisa." });
  // 3) Drible/Contra leem a força (premiam forte/fraco) — leitura boleira.
  if (my.atk === "drible")
    out.push({ kind: "neutral", text: "Drible rende no pé do craque: brilha quando você é o time mais forte." });
  if (my.atk === "contra")
    out.push({ kind: "neutral", text: "Contra-ataque premia o azarão: explode no espaço de quem se lança." });
  return out;
}

// ===== SINTONIA (§6.5), legível pra UI — SEM número cru do motor =====
// "Sua pressão está alta, mas o seu Contra pede bloco baixo." Cada eixo (pressão/
// amplitude/pegada) tem um IDEAL que sai do seu estilo + formação + força (as MESMAS
// fórmulas do `sintonia()` acima). A UI mostra: a direção pedida (alto/baixo/neutro), se
// o seu slider BATE esse pedido (estado), e o quanto está perto. O `score` global é o
// `sintonia` interno (−1..+1) remapeado pra 0..1 — vira estrelas/barra, nunca um edge.
export type TuneState = "match" | "off" | "neutral";
export interface TuneAxis {
  key: "pressao" | "amplitude" | "agressividade";
  wants: "alto" | "baixo" | "neutro"; // direção que o seu setup pede
  state: TuneState; // match = bate · off = contraria · neutral = pedido fraco
  ideal: number; // 0–100 (alvo do slider; a UI pode marcar no trilho)
}
export interface SintoniaReadout {
  score: number; // 0..1 (estrelas/barra; 1 = totalmente sintonizado)
  axes: TuneAxis[]; // pressão, amplitude, pegada — na ordem de peso
}
// classifica um lean cru (-1..+1) em direção pedida; |lean|<0.34 conta como "neutro"
// (o pedido é fraco, qualquer valor serve). Espelha o idealPress/Ampl/Peg do motor.
function tuneDir(lean: number): "alto" | "baixo" | "neutro" {
  if (lean >= 0.34) return "alto";
  if (lean <= -0.34) return "baixo";
  return "neutro";
}
// estado do slider vs o ideal: bate (perto), contraria (longe pro lado errado) ou neutro.
function tuneState(v: number, ideal: number, wants: "alto" | "baixo" | "neutro"): TuneState {
  if (wants === "neutro") return "neutral";
  const a = align(v, ideal); // +1 no ideal, −1 no oposto
  if (a >= 0.34) return "match";
  if (a <= -0.34) return "off";
  return "neutral";
}
export function sintoniaReadout(tac: Tactic, team: Team): SintoniaReadout {
  const ft = forcaTier(team);
  const pressLean = clamp((PRESS_ATK[tac.atk] + PRESS_DEF[tac.def] + PRESS_FORMROW[formRow(tac.form)] + ft) / 4, -1, 1);
  const amplLean = clamp((AMPL_ATK[tac.atk] + AMPL_FORM[tac.form]) / 2, -1, 1);
  const pegLean = clamp((PEG_ATK[tac.atk] + PEG_DEF[tac.def] - 0.3 * ft) / 2, -1, 1);
  const idealPress = 50 + 30 * pressLean;
  const idealAmpl = 50 + 30 * amplLean;
  const idealPeg = 50 + 30 * pegLean;
  const axes: TuneAxis[] = [
    { key: "pressao", wants: tuneDir(pressLean), state: tuneState(tac.pressao, idealPress, tuneDir(pressLean)), ideal: Math.round(idealPress) },
    { key: "amplitude", wants: tuneDir(amplLean), state: tuneState(tac.amplitude, idealAmpl, tuneDir(amplLean)), ideal: Math.round(idealAmpl) },
    { key: "agressividade", wants: tuneDir(pegLean), state: tuneState(tac.agressividade, idealPeg, tuneDir(pegLean)), ideal: Math.round(idealPeg) },
  ];
  // sintonia interna (−1..+1) → 0..1, mesmos pesos do motor (0.5/0.3/0.2).
  const raw = sintonia(tac, team);
  const score = clamp((raw + 1) / 2, 0, 1);
  return { score, axes };
}

// ===== DICA DE IMPACTO DO AJUSTE AO VIVO (§14) — o coração da camada de ensino =====
// Quando o jogador mexe UM slider durante a partida, esta função lê o ESTADO REAL (a
// sintonia §6.5 do novo valor + a matriz §4/pressão §5 contra a tática vigente do rival)
// e devolve 1 ou 2 frases boleiras que explicam o efeito — inclusive a SINTONIA ("sua
// pressão está alta, mas o Contra pede bloco baixo"). NÃO entrega o edge numérico nem a
// regra oculta: ensina o "o que ajuda / o que custa" lendo o seu setup. Pura e
// determinística (sem rnd) — função só do estado.
//
// `key` é o slider que mudou; `next`/`prev` são a tática depois/antes; `team` é o meu time
// (pra a sintonia ler a minha força); `opp`/`oppTac` é o rival (já revelado no intervalo
// ou a tática vigente da IA ao vivo — a matriz/pressão usam o estilo/bloco DELE).
export type LiveHintTone = "good" | "bad" | "neutral";
export interface LiveHint {
  tone: LiveHintTone;
  text: string;
}
// os 4 sliders ajustáveis (mesmas chaves do Tactic; tipado aqui pra o engine não depender
// da ui — a ui reexporta como SliderKey).
export type AdjustKey = "postura" | "pressao" | "amplitude" | "agressividade";
// rótulo curto da DIREÇÃO que cada eixo pede, na voz de boteco (não "alto/baixo" cru).
const TUNE_WANT_PHRASE: Record<"pressao" | "amplitude" | "agressividade", { alto: string; baixo: string }> = {
  pressao: { alto: "bloco alto", baixo: "bloco baixo" },
  amplitude: { alto: "jogo pelas alas", baixo: "jogo pelo meio" },
  agressividade: { alto: "pegada forte", baixo: "pegada leve" },
};
const ATK_POSSESSIVE: Record<AtkStyle, string> = {
  posse: "a sua Posse",
  vertical: "o seu jogo Vertical",
  bolalonga: "a sua Bola longa",
  contra: "o seu Contra-ataque",
  drible: "o seu Drible",
};
// frase de SINTONIA pro eixo que mudou: lê o lean real do meu setup (idêntico ao motor) e
// diz se o novo valor casa ou contraria o que o meu estilo/formação/força pede. É a frase
// que ensina "subir a pressão ajuda o Vertical e atrapalha o Contra".
function sintoniaHintFor(key: "pressao" | "amplitude" | "agressividade", next: Tactic, team: Team): LiveHint {
  const r = sintoniaReadout(next, team);
  const ax = r.axes.find((a) => a.key === key)!;
  const want = TUNE_WANT_PHRASE[key];
  const atkWord = ATK_POSSESSIVE[next.atk];
  if (ax.wants === "neutro") {
    return { tone: "neutral", text: `${cap(atkWord)} não faz exigência forte aqui: dá pra calibrar pelo jogo.` };
  }
  const wantWord = ax.wants === "alto" ? want.alto : want.baixo;
  if (ax.state === "match") {
    return { tone: "good", text: `Casou: ${atkWord} pede ${wantWord}, e é pra lá que você foi.` };
  }
  if (ax.state === "off") {
    return { tone: "bad", text: `Cuidado: ${atkWord} pede ${wantWord}, e você foi pro lado oposto.` };
  }
  return { tone: "neutral", text: `${cap(atkWord)} pede ${wantWord}: você está quase lá, vale chegar mais perto.` };
}
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// o PAPEL da PRESSÃO (§6.1/§12): o MEU slider de pressão decide ONDE eu espero a bola
// (altura do bloco) — sobe a recuperação alta mas é o maior driver de fadiga (§12). NÃO se
// confunde com a matriz §5 (que cruza o meu ATAQUE com o bloco DO RIVAL, não com o meu); a
// sintonia §6.5 (linha 2 da dica) é quem diz se essa altura casa com o meu estilo.
function pressaoRoleHint(next: Tactic, dir: number): LiveHint {
  const bloco = blocoIdx(next.pressao); // 0 alta · 1 média · 2 baixa
  if (bloco === 0) return { tone: "neutral", text: "Bloco alto: você sufoca a saída deles e rouba mais perto do gol, mas o time cansa mais rápido." };
  if (bloco === 2) return { tone: "neutral", text: "Bloco baixo: você cede o campo, espera atrás e poupa fôlego pro contragolpe." };
  return { tone: "neutral", text: dir > 0 ? "Você subiu a linha de marcação: rouba um pouco mais alto." : "Você recuou a linha: fica mais compacto atrás." };
}
// o PAPEL da AMPLITUDE (§6.3): cruza com a LARGURA da defesa do rival (§16: narrow → alas livres).
function amplitudeRoleHint(next: Tactic, dir: number, oppTac: Tactic): LiveHint {
  const wide = next.amplitude >= 60;
  if (wide && NARROW_DEF[oppTac.def] > 0)
    return { tone: "good", text: `Indo pelas alas você ataca o ponto fraco da ${DEF_SHORT[oppTac.def].toLowerCase()}: ela aperta o miolo e larga as pontas.` };
  if (!wide && next.amplitude <= 40)
    return { tone: "neutral", text: "Fechando pelo meio você concentra o ataque no miolo: bom contra defesa aberta, arriscado contra muita gente no centro." };
  return { tone: "neutral", text: dir > 0 ? "Você abriu o jogo pelas pontas." : "Você puxou o jogo mais pro meio." };
}
// o PAPEL da PEGADA (§6.4/§13): intensidade do duelo (e risco de cartão).
function pegadaRoleHint(next: Tactic, dir: number): LiveHint {
  if (next.agressividade >= 67) return { tone: "neutral", text: "Pegada forte ganha mais duelo, mas o risco de cartão sobe." };
  if (next.agressividade <= 33) return { tone: "neutral", text: "Pegada leve evita cartão, mas cede o corpo a corpo." };
  return { tone: "neutral", text: dir > 0 ? "Você endureceu a marcação no duelo." : "Você aliviou a pegada nos duelos." };
}
// o PAPEL da POSTURA (§6.1): realoca a força ataque↔defesa (não soma no encaixe).
function posturaRoleHint(next: Tactic, dir: number): LiveHint {
  if (next.postura >= 67) return { tone: "neutral", text: "Postura ofensiva: joga mais peso no ataque e arrisca atrás." };
  if (next.postura <= 33) return { tone: "neutral", text: "Postura recuada: reforça a defesa e abre mão de gente na frente." };
  return { tone: "neutral", text: dir > 0 ? "Você puxou o time um pouco mais pra frente." : "Você recuou um pouco o time." };
}
export function liveAdjustHints(key: AdjustKey, next: Tactic, prev: Tactic, team: Team, oppTac: Tactic): LiveHint[] {
  const out: LiveHint[] = [];
  const dir = next[key] - prev[key]; // + subiu, − desceu
  // 1) o PAPEL do eixo (§5/§6.1/§6.3/§6.4) + a interação concreta com o rival.
  if (key === "pressao") out.push(pressaoRoleHint(next, dir));
  else if (key === "amplitude") out.push(amplitudeRoleHint(next, dir, oppTac));
  else if (key === "agressividade") out.push(pegadaRoleHint(next, dir));
  else out.push(posturaRoleHint(next, dir));
  // 2) a SINTONIA do eixo (§6.5) — a leitura que casa o valor com o seu estilo/força. A
  //    postura não tem eixo de sintonia (ela realoca), então só os 3 sliders táticos.
  if (key === "pressao" || key === "amplitude" || key === "agressividade") {
    out.push(sintoniaHintFor(key, next, team));
  }
  return out;
}

// ===== LEITURA DA COMISSÃO TÉCNICA (intervalo, §14) — o que fazer no 2º tempo =====
// No Vestiário, a tática do rival JÁ apareceu (formação + estilos, nunca os sliders dele).
// Esta função lê a matriz §4 (meu ataque × a defesa dele E o ataque dele × a minha defesa),
// a pressão §5 e a FORÇA (§10) pra entregar 2 a 3 recados práticos do que ajustar — sem
// número cru. É a "leitura do que fazer" que o produto pede (lê a matriz + pressão + força).
// Pura: função do meu plano + o do rival + as duas forças.
export interface CommissionRead {
  tone: LiveHintTone;
  text: string;
}
export function commissionRead(my: Tactic, oppTac: Tactic, team: Team, opp: Team): CommissionRead[] {
  const out: CommissionRead[] = [];
  // 1) MEU ATAQUE × a defesa DELES (matriz §4). O que melhor fura a marcação que apareceu.
  const myAd = AD[my.atk][DEF.indexOf(oppTac.def)];
  if (myAd <= -0.5) {
    // o meu ataque sofre: sugere o ataque que CASTIGA a defesa deles (sem dar o número).
    const better = bestAtkVsDef(oppTac.def);
    if (better !== my.atk)
      out.push({ tone: "bad", text: `A marcação ${DEF_SHORT[oppTac.def].toLowerCase()} deles abafa ${ATK_POSSESSIVE[my.atk]}. ${cap(ATK_POSSESSIVE[better])} machucaria mais essa defesa.` });
    else
      out.push({ tone: "bad", text: `${cap(ATK_POSSESSIVE[my.atk])} esbarra na marcação ${DEF_SHORT[oppTac.def].toLowerCase()} deles. Pense em variar o caminho do gol.` });
  } else if (myAd >= 0.5) {
    out.push({ tone: "good", text: `${cap(ATK_POSSESSIVE[my.atk])} leva vantagem sobre a marcação ${DEF_SHORT[oppTac.def].toLowerCase()} deles: insista nesse caminho.` });
  }
  // 2) O ATAQUE DELES × a minha defesa (coluna da matriz §4): a minha marcação segura?
  const theirAd = AD[oppTac.atk][DEF.indexOf(my.def)];
  if (theirAd >= 0.5) {
    const shield = bestDefVsAtk(oppTac.atk);
    if (shield !== my.def)
      out.push({ tone: "bad", text: `${cap(ATK_POSSESSIVE_THIRD(oppTac.atk))} deles está achando brecha na sua ${DEF_SHORT[my.def].toLowerCase()}. A marcação ${DEF_SHORT[shield].toLowerCase()} seguraria melhor.` });
    else
      out.push({ tone: "bad", text: `${cap(ATK_POSSESSIVE_THIRD(oppTac.atk))} deles está incomodando. Atenção redobrada atrás.` });
  } else if (theirAd <= -0.5) {
    out.push({ tone: "good", text: `Sua marcação ${DEF_SHORT[my.def].toLowerCase()} segura bem ${ATK_POSSESSIVE_THIRD(oppTac.atk)} deles. Pode soltar mais o time.` });
  }
  // 3) FORÇA (§10): quem é favorito decide o tom do 2º tempo (sem mostrar número).
  const gap = teamMean(team) - teamMean(opp);
  if (gap >= 8)
    out.push({ tone: "neutral", text: "Você tem o elenco mais forte: proponha o jogo e force o erro deles." });
  else if (gap <= -8)
    out.push({ tone: "neutral", text: "Eles têm mais talento no papel: feche os espaços e seja mortal no contragolpe." });
  // garante ao menos um recado (confronto parelho de planos e forças).
  if (out.length === 0)
    out.push({ tone: "neutral", text: "Planos e forças parelhos: o detalhe e a sintonia dos sliders decidem." });
  return out.slice(0, 3);
}
// possessivo em 3ª pessoa (o ataque DELES) — pra não repetir "o seu".
const ATK_THIRD: Record<AtkStyle, string> = {
  posse: "a Posse",
  vertical: "o jogo Vertical",
  bolalonga: "a Bola longa",
  contra: "o Contra-ataque",
  drible: "o Drible",
};
function ATK_POSSESSIVE_THIRD(a: AtkStyle): string {
  return ATK_THIRD[a];
}
// melhor ATAQUE contra uma defesa (AD máx na coluna) — o caminho que mais castiga.
function bestAtkVsDef(def: DefStyle): AtkStyle {
  const col = DEF.indexOf(def);
  let bi = 0;
  for (let i = 1; i < ATK.length; i++) if (AD[ATK[i]][col] > AD[ATK[bi]][col]) bi = i;
  return ATK[bi];
}
// melhor DEFESA contra um ataque (AD mín na linha do ataque) — a que mais sufoca.
function bestDefVsAtk(atk: AtkStyle): DefStyle {
  const row = AD[atk];
  let bi = 0;
  for (let i = 1; i < DEF.length; i++) if (row[i] < row[bi]) bi = i;
  return DEF[bi];
}

// ===== RECADO DO TÉCNICO pós-jogo (§14) — UMA lição coerente com o que ROLOU =====
// Em vez de uma frase genérica sorteada, lê o confronto REAL de planos (meu ataque × a
// defesa deles via matriz §4, a minha sintonia §6.5, a força §10) E o placar pra escolher
// a lição mais honesta — o "o que venceu o que" desta partida, sem número cru. Quando o
// jogo foi parelho/sem um fator dominante, cai num pool boleiro neutro (escolha
// determinística por seed, pra reprodutibilidade). `gf/ga` = meu placar; `seed` desempata.
// Devolve UMA string (a UI mostra um único recado). Pura.
const COACH_NEUTRAL_FALLBACK: string[] = [
  "Jogo de detalhe: no fim, quem sintonizou melhor os sliders levou a melhor.",
  "Pouca coisa separou os planos. A leitura do banco e a hora de cada ajuste pesaram.",
  "Tática parelha. Daqui pra frente, casar o ataque com a defesa deles vira ouro.",
  "No xadrez dos planos ninguém abriu vantagem grande. O acerto fino é que decide.",
];
export function postMatchCoachRead(
  my: Tactic,
  aiTac: Tactic,
  team: Team,
  opp: Team,
  gf: number,
  ga: number,
  seed: number,
): string {
  const won = gf > ga;
  const lost = gf < ga;
  // 1) o eixo MAIS forte do confronto: meu ataque × a defesa deles (matriz §4).
  const myAd = AD[my.atk][DEF.indexOf(aiTac.def)];
  if (myAd >= 1) {
    return won
      ? `${cap(ATK_POSSESSIVE[my.atk])} achou o caminho certo: a marcação ${DEF_SHORT[aiTac.def].toLowerCase()} deles não tinha resposta. Plano premiado.`
      : `${cap(ATK_POSSESSIVE[my.atk])} casava bem com a defesa deles, mas faltou pontaria pra transformar o domínio em gol.`;
  }
  if (myAd <= -1) {
    const better = bestAtkVsDef(aiTac.def);
    return lost
      ? `A marcação ${DEF_SHORT[aiTac.def].toLowerCase()} deles engoliu ${ATK_POSSESSIVE[my.atk]}. ${cap(ATK_POSSESSIVE[better])} teria furado mais aquele bloco.`
      : `${cap(ATK_POSSESSIVE[my.atk])} apanhou da marcação ${DEF_SHORT[aiTac.def].toLowerCase()} deles, mas você segurou o resultado. Pra próxima, ${ATK_POSSESSIVE[better]} sofre menos ali.`;
  }
  // 2) a SINTONIA dos sliders (§6.5) — se estava afiada ou fora, a lição é essa.
  const tune = sintoniaReadout(my, team).score;
  if (tune >= 0.72) {
    return won
      ? "Os sliders estavam afiados: pressão, amplitude e pegada casaram com o seu estilo. Sintonia que rende."
      : "Os sliders estavam bem sintonizados; o que faltou veio da força bruta, não do plano.";
  }
  if (tune <= 0.4) {
    const off = sintoniaReadout(my, team).axes.find((a) => a.state === "off");
    if (off) {
      const want = TUNE_WANT_PHRASE[off.key][off.wants === "alto" ? "alto" : "baixo"];
      return `Faltou sintonia: ${ATK_POSSESSIVE[my.atk]} pedia ${want}, e os sliders foram pro outro lado. Ajustar isso muda o próximo jogo.`;
    }
    return "Os sliders ficaram fora de sintonia com o seu estilo. Um acerto fino ali soltaria o time.";
  }
  // 3) a FORÇA (§10) — quando nada tático dominou, o talento explica.
  const gap = teamMean(team) - teamMean(opp);
  if (won && gap <= -8) return "Zebra de coragem: você comandou o azarão e tirou ouro de um plano bem montado contra um time mais forte.";
  if (lost && gap <= -8) return "Eles tinham mais talento no papel e fizeram valer. Seu plano deu trabalho, faltou pouco.";
  if (won && gap >= 8) return "Favoritismo confirmado, mas sem relaxar: o plano manteve o controle e não deu brecha.";
  // 4) fallback boleiro neutro (determinístico por seed).
  return COACH_NEUTRAL_FALLBACK[(seed >>> 0) % COACH_NEUTRAL_FALLBACK.length];
}

// contexto temporal do encaixe (§11 inversão + §12 fadiga + §11 teto por fase). Tudo
// opcional: o kickoff usa o default (estrutura dominando, sem fadiga, teto de grupos).
export interface EdgeCtx {
  feeling?: number; // 0 (início) → 1 (fim): inverte o peso Estrutura↔Táticas
  fatigue?: number; // 0..1: cansaço (suave na força, forte no edge tático)
  teto?: number; // teto explícito do edge total (sobrepõe `fase`)
  fase?: FaseKey; // fase do torneio (§11): define a faixa do teto (default = grupos)
}
// ritmo do jogo por estilo de ataque (volume/abertura) — substitui o antigo STYLE.ritmo.
const ATK_RITMO: Record<AtkStyle, number> = {
  posse: 0.88,
  vertical: 1.08,
  bolalonga: 1.16,
  contra: 1.14,
  drible: 1.0,
};
// fadiga 2º tempo por pressão do bloco (pressão alta cansa mais; baixa cansa menos).
function fadiga2TFromPressao(pressao: number): number {
  const b = blocoIdx(pressao);
  return b === 0 ? 1.07 : b === 2 ? 0.95 : 1.0;
}

// ===== ENCAIXE (§7/§16) =====
// edge = tetoFase·fadigaTat·( wE·estrutura + wT·taticas ) − onus.
// A POSTURA NÃO entra no encaixe: ela REALOCA a força (kPost) no off/def.
export function sideStrength(
  team: Team,
  tac: Tactic,
  oppTeam: Team,
  oppTac: Tactic,
  ctx: EdgeCtx = {},
): SideStrength {
  const feeling = ctx.feeling ?? 0;
  const F = ctx.fatigue ?? 0;
  const teto = ctx.teto ?? tetoFase(ctx.fase ?? "grupos");
  const estrutura = estruturaEdge(team, tac, oppTeam, oppTac);
  const taticas = taticasEdge(tac, oppTac, team);
  const wE = wEstrutura(feeling);
  const wT = 1 - wE;
  let edge = teto * fadigaTat(F) * (wE * estrutura + wT * taticas) - onusExtremos(tac);
  // trava de segurança (o encaixe nunca vira o jogo sozinho): clampa o edge final.
  edge = clamp(edge, -0.32, 0.32);

  // POSTURA realoca a força (não soma no encaixe): ofensiva tira da defesa e vice-versa.
  const p = (tac.postura - 50) / 50; // -1..+1
  const ff = fadigaForca(F);
  const baseOff = team.a * P.W_ATK + team.m * P.W_MID;
  const offEf = baseOff * (1 + kPost * p) * ff * (1 + edge);
  // edge BIDIRECIONAL (preservado do v9): um plano coerente também endurece a defesa e
  // qualifica a conversão; um furado cobra nos dois. A força base segue dominando.
  const defEff = team.d * (1 - kPost * p) * ff * (1 + edge * P.EDGE_DEF_K);
  const convMod = 1 + edge * P.EDGE_CONV_K;

  const ritmo = ATK_RITMO[tac.atk];
  const press = blocoIdx(tac.pressao); // 0 alta
  const aggressive = tac.postura >= 62; // postura ofensiva
  // swing de posse: postura defensiva/contra cede a bola; ofensiva/posse toma.
  let possSwing = 0;
  if (tac.postura <= 30) possSwing = -P.POSS_SWING;
  else if (tac.postura <= 44) possSwing = -P.POSS_SWING * 0.5;
  else if (aggressive) possSwing = P.POSS_SWING * (tac.postura >= 80 ? 1.3 : 1);
  else if (tac.atk === "contra") possSwing = -P.POSS_SWING * 0.8;
  else if (tac.atk === "posse") possSwing = P.POSS_SWING * 0.6;

  return {
    off: offEf,
    ft: offEf,
    defEff,
    convMod,
    ritmo,
    fadiga2T: fadiga2TFromPressao(tac.pressao),
    rivalConvVsMe: 1.0,
    postureIsOff: aggressive,
    markIsHigh: press === 0,
    netEdge: edge,
    estruturaEdge: estrutura,
    taticasEdge: taticas,
    possSwing,
  };
}

// ITEM 7: recomputa as forças de AMBOS os lados quando uma tática muda DURANTE a
// partida (meu ajuste ao vivo, ou a reação da IA). Recalcula SA/SB e o share de
// chances, SEM tocar gols/minuto/comandos. `tacA`/`tacB` viram as táticas correntes.
// Preserva o determinismo do resto (não consome o rnd da partida).
export function recomputeStrengths(state: MatchState, tacA: Tactic, tacB: Tactic, ctx: EdgeCtx = {}): void {
  // §11: o teto da fase vale a partida inteira — se o ctx não trouxe `fase`, herda a do
  // MatchState (setada no createMatch). Assim a reação ao vivo da IA mantém o teto certo.
  const c: EdgeCtx = ctx.fase ? ctx : { ...ctx, fase: (state.fase as FaseKey | undefined) };
  const SA = sideStrength(state.teamA, tacA, state.teamB, tacB, c);
  const SB = sideStrength(state.teamB, tacB, state.teamA, tacA, c);
  state.SA = SA;
  state.SB = SB;
  state.tacA = tacA;
  state.tacB = tacB;
  const ftA = Math.pow(SA.ft, P.SHARE_SOFT);
  const ftB = Math.pow(SB.ft, P.SHARE_SOFT);
  state.shareA = ftA / (ftA + ftB);
}

// §11 — peso por minuto (inversão Estrutura↔Táticas) + §12 fadiga aproximada.
// `feeling(t)` sobe de 0→1 do começo ao fim de cada tempo; o intervalo RESETA pra cima
// (o 2º tempo recomeça com a estrutura pesando mais e decai de novo, mais fundo). A
// fadiga sobe suave com o minuto (mais no 2º tempo). Determinístico (só função do minuto).
function feelingFromMinute(minute: number): number {
  // 1º tempo: 0..~0.5 ; 2º tempo: reseta pra ~0.25 e vai até ~1.0.
  if (minute <= 45) return clamp(minute / 90, 0, 1); // 0 → 0.5
  return clamp(0.25 + (minute - 45) / 60, 0, 1); // 0.25 → ~1.0 no 90'
}
function fatigueFromMinute(minute: number): number {
  return clamp(minute / 110, 0, 1); // ~0.82 no 90'
}
function edgeCtxForMinute(minute: number, fase?: FaseKey): EdgeCtx {
  return { feeling: feelingFromMinute(minute), fatigue: fatigueFromMinute(minute), fase };
}

// BUG #3: o "volume" do jogo (quão aberto/truncado, nº e qualidade de chances) deixa de
// ser um valor congelado no kickoff — passa a ser DERIVÁVEL das táticas correntes + um
// PRNG estável. Espelha a fórmula do createMatch, mas recebe o rnd de fora (pra a
// recomputação ser semeada por um hash do ponto de virada, não pelo stream da partida).
function deriveVolumes(
  SA: SideStrength,
  SB: SideStrength,
  rnd: () => number,
): { openStruct: number; gameVol: number; convVol: number } {
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
  return { openStruct, gameVol, convVol };
}

// BUG #3: hash determinístico e estável de um par de táticas (8 eixos). Vira parte da
// semente de recomputação — então DUAS táticas diferentes recomputam um futuro
// diferente (tática importa), e a MESMA tática no MESMO ponto recomputa o MESMO futuro
// (determinismo). 32-bit, sem colisão prática entre os combos do jogo.
function tacticHash(tacA: Tactic, tacB: Tactic): number {
  // hash dos campos NOVOS: formação (4b) + ataque (3b) + defesa (3b) + os 4 sliders
  // quantizados em 5 níveis (0..4, ~3b cada). Combinados num inteiro estável por lado.
  const q = (v: number): number => Math.max(0, Math.min(4, Math.round(v / 25))); // 0..4
  const code = (t: Tactic): number => {
    let c = (FORM.indexOf(t.form) & 15) >>> 0;
    c = c * 5 + (ATK.indexOf(t.atk) & 7);
    c = c * 5 + (DEF.indexOf(t.def) & 7);
    c = c * 5 + q(t.postura);
    c = c * 5 + q(t.pressao);
    c = c * 5 + q(t.amplitude);
    c = c * 5 + q(t.agressividade);
    return c >>> 0;
  };
  // mistura os dois lados em 32 bits com constantes ímpares grandes.
  return ((Math.imul(code(tacA), 2654435761) ^ Math.imul(code(tacB), 40503)) >>> 0) || 1;
}

// BUG #3 — RECOMPUTAÇÃO DETERMINÍSTICA DO FUTURO. A timeline é estruturada em SEGMENTOS:
// o passado (minutos JÁ reproduzidos, ≤ fromMinute) é IMUTÁVEL — seus lances já estão em
// state.events/schedule e seguem valendo. Quando a tática muda (no intervalo: formação +
// eixos a partir do min 45→46; ao vivo: eixos a partir do minuto seguinte), recomputamos
// os minutos FUTUROS a partir do estado atual (placar + minuto) com a nova tática minha
// vs a do rival. Para o resultado ser determinístico (mesma seed + mesmas decisões →
// mesma partida) E sensível à tática (mudar o plano muda os lances/placar do trecho
// futuro), o futuro é semeado por uma seed ESTÁVEL = f(seed, fromMinute, placar,
// tacticHash). Trocamos state.rnd por esse PRNG novo: todo sorteio futuro (volume,
// agenda de chances e desfechos) passa a sair dele. O placar EXIBIDO continua derivando
// ESTRITAMENTE dos gols dos eventos revelados (este motor não reseta gols nem inventa
// gol fantasma — só reescreve a agenda/forças do que ainda NÃO aconteceu).
export function recomputeFromMinute(
  state: MatchState,
  tacA: Tactic,
  tacB: Tactic,
  fromMinute: number,
): void {
  // 1) forças correntes com a nova tática (atualiza SA/SB/share/tac). O contexto de
  //    minuto entra aqui (§11 inversão Estrutura↔Táticas + §12 fadiga): no intervalo
  //    (fromMinute=45) o feeling reseta pra cima e o 2º tempo volta a decair.
  recomputeStrengths(state, tacA, tacB, edgeCtxForMinute(fromMinute, state.fase as FaseKey | undefined));
  // 2) re-semeia o futuro com uma seed estável do ponto de virada. mistura o estado
  //    (minuto + placar) e o hash das táticas — assim o trecho futuro depende SÓ de
  //    (seed da partida, momento, placar, planos), nunca do timing real de playback.
  const reSeed =
    (state.seed ^
      ((fromMinute + 1) * 0x9e3779b1) ^
      ((state.gA * 73856093) ^ (state.gB * 19349663)) ^
      tacticHash(tacA, tacB)) >>>
    0;
  const rnd = mulberry32(reSeed || 1);
  state.rnd = rnd;
  // 3) volumes do jogo recomputados das novas forças (jogo pode abrir/truncar conforme
  //    o plano) — consome o rnd novo, mantendo a sementagem estável.
  const vol = deriveVolumes(state.SA, state.SB, rnd);
  state.openStruct = vol.openStruct;
  state.gameVol = vol.gameVol;
  state.convVol = vol.convVol;
  // 4) reescreve a AGENDA do trecho futuro do tempo CORRENTE (minutos > fromMinute até o
  //    fim do tempo), SE esse tempo já está em andamento (sua agenda já foi montada).
  //    O passado (≤ fromMinute) fica intacto. CASO LIMITE DO INTERVALO: em fromMinute=45
  //    a agenda do 2º tempo ainda NÃO foi concatenada (stepMinute faz isso ao cruzar o
  //    minuto 45) — então NÃO geramos nada aqui; o 2º tempo nasce no stepMinute já com o
  //    rnd/volume novos. Isso evita duplicar a agenda do 2º tempo.
  const inFirstHalf = fromMinute < 45;
  const halfEnd = inFirstHalf ? 45 : 90;
  const halfBase = inFirstHalf ? 0 : 45;
  // a agenda do tempo corrente já existe? (1º tempo: sempre, após o min 0; 2º tempo: só
  // depois que stepMinute cruzou o 45 — detectável por algum minuto agendado > 45.)
  const halfScheduled = inFirstHalf
    ? state.schedule.some((m) => m <= 45)
    : state.schedule.some((m) => m > 45);
  if (fromMinute >= 45 && !halfScheduled) {
    // intervalo exato (2º tempo ainda não agendado): mantém a agenda como está.
    return;
  }
  const kept = state.schedule.filter((m) => m <= fromMinute);
  // nº de chances do RESTANTE do tempo, proporcional ao quanto do tempo ainda falta.
  const fullLambda = P.RAW_CHANCES_PER_HALF * state.gameVol;
  const span = halfEnd - fromMinute; // minutos restantes no tempo
  const remainFrac = Math.max(0, span / 45);
  const lambda = fullLambda * remainFrac;
  const n = Math.max(0, Math.min(P.CHANCES_HALF_CAP, Math.round(lambda + (rnd() * 2 - 1))));
  const future: number[] = [];
  for (let c = 0; c < n && span > 0; c++) {
    future.push(fromMinute + 1 + Math.floor(rnd() * span));
  }
  // clampa ao tempo corrente e reordena.
  const merged = kept
    .concat(future.map((m) => Math.max(halfBase + 1, Math.min(halfEnd, m))))
    .sort((a, b) => a - b);
  state.schedule = merged;
}

// ITEM 14 (reativo, ligado ao item 7): a IA ajusta a POSTURA (slider 0–100) conforme o
// placar ao vivo. Mantém formação/estilos/sliders restantes do plano inicial; só a
// postura reage (gap de força + diferença de gols + minuto). Regra dura: um time MUITO
// mais forte que está perdendo vai pra cima (nunca retranca); um time que ganha e é mais
// fraco fecha pra segurar. Determinístico (sem rnd). Devolve a NOVA postura (0–100).
export function reactiveAiPosture(
  base: Tactic,
  aiStrength: number,
  oppStrength: number,
  aiGoals: number,
  oppGoals: number,
  minute: number,
): number {
  if (minute < 25) return base.postura; // cedo demais pra reagir
  const gap = aiStrength - oppStrength; // + = IA mais forte
  const diff = aiGoals - oppGoals; // + = IA na frente
  const late = minute >= 65;
  // IA perdendo → sobe a postura (mais ainda se for favorita / se for tarde).
  if (diff < 0) {
    if (gap >= 5 || late) return diff <= -2 ? 92 : 76; // all-in / ofensiva
    return 76;
  }
  // IA ganhando → segura, proporcional à vantagem e ao relógio (favorita não retranca).
  if (diff > 0) {
    if (late && diff >= 2) return gap >= 12 ? 30 : 14; // defensiva / retranca
    if (late) return 30;
    return diff >= 2 ? 30 : base.postura;
  }
  // empate tarde: favorito propõe, azarão segura o ponto/pênalti.
  if (late) return gap >= 8 ? 76 : gap <= -8 ? 30 : base.postura;
  return base.postura;
}

// ITEM H: o "banco de comandos" (Pressionar/Recuar com timing por posse) FOI REMOVIDO.
// O controle ao vivo do jogador agora é só o Ajuste tático (Estilo/Postura/Marcação),
// aplicado via recomputeStrengths. A partida segue puramente pela força tática dos dois
// lados + variância determinística — sem multiplicadores de comando.

export function createMatch(
  teamA: Team,
  teamB: Team,
  tacA: Tactic,
  tacB: Tactic,
  seed: number,
  fase?: FaseKey,
): MatchState {
  const rnd = mulberry32((seed >>> 0) || 1);
  // §11: o teto da fase vale a partida toda — entra já no kickoff (e nos recomputes).
  const ctx0: EdgeCtx = { fase };
  const SA = sideStrength(teamA, tacA, teamB, tacB, ctx0);
  const SB = sideStrength(teamB, tacB, teamA, tacA, ctx0);
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
    finished: false,
    events: [],
    schedule: [],
    fase,
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
  const Q = P.CHANCE_QUALITY_VAR;
  let qual = 1 - Q + rnd() * 2 * Q;
  qual *= 1 + (state.convVol - 1) * 0.4;
  const openConv = 1 + Math.max(0, state.openStruct - 1) * P.OPEN_CONV_GAIN;
  const capA = P.MAX_GOALS_PER_SIDE > 0 && state.gA >= P.MAX_GOALS_PER_SIDE;
  const capB = P.MAX_GOALS_PER_SIDE > 0 && state.gB >= P.MAX_GOALS_PER_SIDE;

  // ITEM H: sem multiplicadores de comando — a finalização depende só de força tática,
  // fadiga, variância e colapso. (Idêntico ao caminho "sem comando" do motor anterior.)
  function tryConvert(
    att: SideStrength,
    def: SideStrength,
    attPanic: number,
    defPanic: number,
    defFat: number,
    isA: boolean,
  ): MatchEvent {
    const off = att.off;
    let defEff = def.defEff * defFat;
    if (defPanic > 0) defEff *= 1 - P.COLLAPSE_DEF_DROP * defPanic;
    let convPanic = 1.0;
    if (attPanic > 0) convPanic *= 1 - P.COLLAPSE_CONV_DROP * attPanic;
    if (defPanic > 0) convPanic *= 1 + P.COLLAPSE_WINNER_CONV * defPanic;
    const ratio = off / (off + defEff * P.CONV_DEF_PULL);
    let conv =
      P.CONV_BASE *
      (0.6 + ratio * P.CONV_SPAN_FACTOR) *
      att.convMod *
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
    ev = tryConvert(state.SA, state.SB, panicA, panicB, fatB_def, true);
    if (ev.goal) state.gA++;
  } else {
    ev = tryConvert(state.SB, state.SA, panicB, panicA, fatA_def, false);
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

// ITEM H: simula a partida completa headless. Sem banco de comandos — só força tática
// + variância determinística. (applyCommand e defaultAiPolicy foram REMOVIDOS.)
export function simulateFull(
  teamA: Team,
  teamB: Team,
  tacA: Tactic,
  tacB: Tactic,
  seed: number,
): { gA: number; gB: number; events: MatchEvent[]; openStruct: number; gameVol: number } {
  const st = createMatch(teamA, teamB, tacA, tacB, seed);
  while (!st.finished) {
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

  // ---- posse de bola: EVOLUI por JANELA conforme quem domina cada trecho ----
  // BUG #2: a posse não é mais um valor final fixo. A base é o share de chances do motor
  // (shareA), mas ela é PUXADA pela DOMINÂNCIA RECENTE — quem criou mais lances na janela
  // dos últimos ~18' revelados leva a bola pra perto de si. À medida que novos lances
  // entram, a posse OSCILA de forma coerente (e converge pro panorama geral no fim).
  const W = 18; // tamanho da janela (min) que pesa "quem manda agora"
  let winA = 0, winB = 0; // lances de cada lado dentro da janela [maxMin-W, maxMin]
  events.forEach((ev) => {
    if (maxMin - ev.m <= W) {
      if (ev.ownerSide === "A") winA++; else winB++;
    }
  });
  const winTot = winA + winB;
  // dominância recente em [-1,+1] (A manda = +). Sem lances na janela → 0 (neutra).
  const recentDom = winTot > 0 ? (winA - winB) / winTot : 0;
  let possA = 50 + (state.shareA - 0.5) * 50; // base do panorama geral (±25)
  possA += recentDom * 9; // a JANELA empurra a posse pro lado que domina agora
  const gd = goalsA - goalsB;
  possA += Math.max(-6, Math.min(6, gd * 1.8)); // quem fez mais gol tende a ter tido a bola
  possA = jit(possA, 2.5);
  possA = Math.max(32, Math.min(68, possA));
  const pA = Math.round(possA);
  const pB = 100 - pA;

  // ---- passes: ~ posse × ritmo × FRAÇÃO do jogo já transcorrida (cresce ao vivo) ----
  const elapsed = Math.max(0.06, Math.min(1, maxMin / 90));
  const tempo = 880 * state.gameVol * elapsed; // total aproximado de passes ATÉ AGORA
  const passSpread = 30 * elapsed;
  const passA = Math.round(jit((tempo * pA) / 100, passSpread));
  const passB = Math.round(jit((tempo * pB) / 100, passSpread));
  // precisão de passe: base no meio-campo do time, com uma leve deriva pela dominância
  // recente (quem está mandando no trecho troca passe com mais conforto). Evolui ao vivo.
  const accFromMid = (m: number) => Math.max(64, Math.min(91, 64 + (m - 60) * 0.62));
  const accA = Math.round(Math.max(60, Math.min(93, jit(accFromMid(state.teamA.m) + recentDom * 2.5, 2.5))));
  const accB = Math.round(Math.max(60, Math.min(93, jit(accFromMid(state.teamB.m) - recentDom * 2.5, 2.5))));

  // ---- faltas e desarmes: ACUMULAM de micro-eventos da timeline ATÉ o minuto corrente.
  // BUG #2: em vez de um número final fixo, varremos minuto a minuto (1..maxMin) e
  // decidimos de forma DETERMINÍSTICA (semeada por seed+minuto) se houve uma falta e/ou
  // um desarme naquele minuto, e de QUAL lado — enviesado por quem DEFENDE mais (menos
  // posse) e pela força defensiva. Assim os contadores SOBEM ao longo do jogo, distribuídos
  // no tempo, e são estáveis (mesma seed → mesma sequência). ----
  const ft = foulsTacklesUpTo(state, events, maxMin);
  const foulA = ft.foulA, foulB = ft.foulB, tackA = ft.tackA, tackB = ft.tackB;

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

// BUG #2: acumula faltas e desarmes a partir de MICRO-EVENTOS determinísticos da timeline
// até o minuto `upTo`. Para cada minuto 1..upTo, um PRNG semeado por (seed, minuto) decide
// se houve falta e/ou desarme, e de qual lado. O viés de lado vem de quem DEFENDE mais (o
// time com MENOS posse — derivado do shareA ESTÁVEL do motor, não da posse-janela que
// oscila) e da janela local de lances (um trecho com muitos ataques de um lado gera mais
// faltas/desarmes do outro). MONOTÔNICO em `upTo`: a decisão de cada minuto passado não
// muda quando o tempo avança (a base de viés é estável), então os contadores só SOBEM.
// Estável (não consome o state.rnd da partida).
function foulsTacklesUpTo(
  state: MatchState,
  events: MatchEvent[],
  upTo: number,
): { foulA: number; foulB: number; tackA: number; tackB: number } {
  let foulA = 0, foulB = 0, tackA = 0, tackB = 0;
  if (upTo <= 0) return { foulA, foulB, tackA, tackB };
  // probabilidade-base por minuto de uma falta / um desarme (calibra ~12-16 faltas e
  // ~14-20 desarmes no jogo cheio, valores plausíveis de futebol).
  const FOUL_P = 0.3;
  const TACK_P = 0.38;
  // viés de lado: o time com MENOS posse comete mais falta e desarma mais. A base usa a
  // FORÇA GERAL imutável (teamA.o × teamB.o), NÃO o shareA (que muda quando a tática é
  // recomputada ao vivo) nem a posse-janela (que oscila) — assim a decisão de cada minuto
  // passado é FIXA e os contadores nunca regridem (monotônicos). Time mais fraco no
  // overall defende mais → comete/desarma mais.
  const oDiff = state.teamB.o - state.teamA.o; // + = B mais forte → A defende mais
  const defBiasA = Math.max(0.3, Math.min(0.7, 0.5 + oDiff * 0.012));
  const dDiff = state.teamA.d - state.teamB.d; // desarme pende pro time de defesa melhor
  const tackBiasA = Math.max(0.3, Math.min(0.7, defBiasA + dDiff * 0.004));
  for (let m = 1; m <= upTo; m++) {
    // janela local: quem atacou nos últimos 4' empurra a falta/desarme pro lado contrário.
    let locA = 0, locB = 0;
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (ev.m <= m && m - ev.m <= 4) {
        if (ev.ownerSide === "A") locA++; else locB++;
      }
    }
    const locTot = locA + locB;
    // se A ataca muito agora, B comete a falta/desarme (e vice-versa).
    const localPushToA = locTot > 0 ? (locB - locA) / locTot : 0; // + = pende pra A
    const r = mulberry32((state.seed ^ (m * 0x85ebca6b)) >>> 0);
    if (r() < FOUL_P) {
      const pToA = Math.max(0.12, Math.min(0.88, defBiasA + localPushToA * 0.25));
      if (r() < pToA) foulA++; else foulB++;
    }
    if (r() < TACK_P) {
      const pToA = Math.max(0.12, Math.min(0.88, tackBiasA + localPushToA * 0.25));
      if (r() < pToA) tackA++; else tackB++;
    }
  }
  return { foulA, foulB, tackA, tackB };
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
  S: ["Time pra eternidade. O mundo joga contra.", "Favoritíssima absoluta: só não ganhar é fracasso."],
  A: ["Cotada pro título, e com razão.", "Das melhores da edição, caneta afiada."],
  B: ["Time forte, briga lá em cima.", "Pode incomodar qualquer um num dia bom."],
  C: ["Time de meio de tabela: depende do seu comando.", "Sem favoritismo, mas com chance de surpresa."],
  D: ["A zebra clássica. Levar longe vira lenda.", "Ninguém aposta nela, e esse é o charme."],
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

// =====================================================================
// 5 PRESETS (§9) — pentágono balanceado. Cada um vence 2 / perde 2 (em escala). São o
// "modo simples": ponto de partida que o jogador AJUSTA na mão (sliders/estilo/formação)
// — o ajuste muda o jogo via sintonia (§6.5) + postura (§6.1).
// Valores do §16 {form, atk, def, post, press, larg, agr} mapeados pros campos do Tactic.
// =====================================================================
export type PresetKey = "pressao" | "craque" | "toque" | "direto" | "ferrolho";
export const PRESETS: Record<PresetKey, Tactic> = {
  pressao: { form: "3-4-3", atk: "vertical", def: "individual", postura: 70, pressao: 88, amplitude: 60, agressividade: 62 },
  craque: { form: "4-3-3", atk: "drible", def: "dobra", postura: 62, pressao: 50, amplitude: 35, agressividade: 48 },
  toque: { form: "4-4-2", atk: "posse", def: "mista", postura: 58, pressao: 58, amplitude: 38, agressividade: 35 },
  direto: { form: "4-2-4", atk: "bolalonga", def: "zona", postura: 78, pressao: 55, amplitude: 75, agressividade: 50 },
  ferrolho: { form: "5-3-2", atk: "contra", def: "libero", postura: 22, pressao: 26, amplitude: 48, agressividade: 60 },
};
export const PRESET_ORDER: PresetKey[] = ["pressao", "craque", "toque", "direto", "ferrolho"];
// rótulos curtos pros presets (a UI pode reusar; o engine não importa a ui).
export const PRESET_LABEL: Record<PresetKey, string> = {
  pressao: "Pressão",
  craque: "Craque",
  toque: "Toque",
  direto: "Direto",
  ferrolho: "Ferrolho",
};
// aplica um preset (cópia nova — o jogador edita à vontade depois).
export function applyPreset(key: PresetKey): Tactic {
  return { ...PRESETS[key] };
}
// qual preset um Tactic corrente "é" (o mais próximo) — pra a UI marcar o chip ativo
// mesmo após ajustes na mão. Distância por formação/estilos (peso alto) + sliders.
export function nearestPreset(tac: Tactic): PresetKey {
  let best: PresetKey = "toque";
  let bestD = Infinity;
  for (const k of PRESET_ORDER) {
    const p = PRESETS[k];
    let d = 0;
    if (p.form !== tac.form) d += 3;
    if (p.atk !== tac.atk) d += 3;
    if (p.def !== tac.def) d += 3;
    d += Math.abs(p.postura - tac.postura) / 25;
    d += Math.abs(p.pressao - tac.pressao) / 25;
    d += Math.abs(p.amplitude - tac.amplitude) / 25;
    d += Math.abs(p.agressividade - tac.agressividade) / 25;
    if (d < bestD) {
      bestD = d;
      best = k;
    }
  }
  return best;
}

// =====================================================================
// ⭐ IA POR FASE (§14) — o nó tático que aperta conforme o torneio avança.
//
// O produto define TRÊS regimes da IA (estudo-taticas-v3 §14/§16):
//   · "grupos"  (estreia + fase de grupos + quadrangular): a IA joga com PRESET PURO —
//     escolhe um dos 5 presets coerente com a própria força (gap vs o jogador), com um
//     leve jitter pra variar. SIMPLES e LEGÍVEL. NÃO lê o seu plano. É aqui que o
//     azarão-Ferrolho dá trabalho ao gigante que ERRA o preset (§17).
//   · "ajusta" (oitavas + quartas): a IA começa a LER o seu setup (atk/def/form/sliders)
//     e responde com a tática que te NEUTRALIZA — varre presets + variações e fica com o
//     de melhor encaixe contra você (matriz §4 + pressão §5 + sintonia §6.5). Aperta o
//     nó já no pré-jogo. A intensidade da adaptação cresce de oitavas → quartas.
//   · "ao_vivo" (semi + final): além de adaptar no pré-jogo (forte), a IA também adapta
//     AO VIVO — no intervalo (reage ao 1º tempo) e em resposta às SUAS mudanças (a UI
//     chama reactiveAiTactic quando você muda a tática). É quando o gigante que adapta
//     derruba o azarão (§17). Tudo DETERMINÍSTICO por seed (sem Date.now/Math.random).
//
// `matchPhaseForKind` mapeia o MatchKind + a rodada do mata-mata pro regime. A UI usa
// isso pra saber se entrega a reação ao vivo completa (semi/final) ou só a postura (v9).
// =====================================================================
export type MatchPhase = "grupos" | "ajusta" | "ao_vivo";

// regime da IA a partir do tipo de jogo + (se mata-mata) a rodada. Oitavas/quartas =
// "ajusta"; semi/final = "ao_vivo"; grupos/quadrangular/32-avos = "grupos" (preset puro).
// `round` = stage.round do KnockoutStageState (R32/R16/QF/SF) quando kind==="knockout".
export function matchPhaseForKind(kind: MatchKind, round?: KnockoutRound): MatchPhase {
  if (kind === "final") return "ao_vivo"; // a final é sempre o regime máximo
  if (kind === "third_place") return "ajusta"; // disputa de 3º: adapta no pré-jogo
  if (kind === "knockout") {
    if (round === "SF") return "ao_vivo"; // semifinal
    if (round === "R16" || round === "QF") return "ajusta"; // oitavas/quartas
    return "grupos"; // 32-avos (fase ainda cedo): preset puro
  }
  return "grupos"; // groups / final_group
}

// a fase do PRÓXIMO jogo do jogador, lida direto do estado da campanha (pra a UI e o
// startMatch não recalcularem a rodada na mão). null se não há jogo meu pendente.
export function matchPhaseForCampaign(camp: Campaign): MatchPhase {
  const s = camp.state;
  if (!s) return "grupos";
  if (s.kind === "knockout") return matchPhaseForKind("knockout", s.stage.round);
  if (s.kind === "final") return "ao_vivo";
  if (s.kind === "third_place") return "ajusta";
  return "grupos";
}

// fase do torneio → faixa do teto do edge (§11). A "estreia" (1º jogo da campanha) tem o
// teto mais baixo (a tática mexe pouco); grupos/oitavas é o pico; quartas/semis afina; a
// final é a mais apertada. Deriva do MatchKind + rodada + se é a estreia. (= MatchFase.)
export function faseKeyFor(kind: MatchKind, round: KnockoutRound | undefined, isOpener: boolean): FaseKey {
  if (kind === "final") return "final";
  if (kind === "knockout") {
    if (round === "SF") return "quartas"; // semis afina (faixa quartas/semis do §11)
    if (round === "QF") return "quartas";
    if (round === "R16") return "grupos"; // oitavas: pico, junto com grupos
    return "grupos"; // 32-avos
  }
  if (kind === "third_place") return "quartas";
  // grupos/quadrangular: estreia tem teto baixo; demais rodadas = pico de grupos.
  return isOpener ? "estreia" : "grupos";
}

// fase (§11) do PRÓXIMO jogo do jogador, lida da campanha — pra a UI passar ao createMatch
// e o teto do edge valer já no kickoff. "estreia" = o jogador ainda não disputou nenhum
// jogo nesta campanha (history vazia).
export function faseForCampaignMatch(camp: Campaign): FaseKey {
  const s = camp.state;
  const isOpener = camp.history.length === 0;
  if (s?.kind === "knockout") return faseKeyFor("knockout", s.stage.round, isOpener);
  if (s?.kind === "final") return faseKeyFor("final", undefined, isOpener);
  if (s?.kind === "third_place") return faseKeyFor("third_place", undefined, isOpener);
  return faseKeyFor("groups", undefined, isOpener);
}

// ===== IA por gap (§14) — usa PRESET cedo, com leve jitter pra variar =====
// myStrength/oppStrength = forças base (overall) dos dois times. Mapeia o gap a um preset
// coerente (gigante propõe, azarão se fecha) e dá um pequeno empurrão nos sliders pra
// não ficar idêntica jogo a jogo (determinístico via rnd). Compatível com a assinatura
// antiga (oppStrength opcional → preset neutro).
function presetForGap(gap: number): PresetKey {
  if (gap >= 12) return "pressao"; // gigante: sufoca
  if (gap >= 5) return "toque"; // favorito: domina a bola
  if (gap > -5) return "craque"; // parelho: no detalhe
  if (gap > -12) return "direto"; // azarão: vertical/peso ofensivo
  return "ferrolho"; // underdog extremo: se fecha
}
function jitterSlider(rnd: () => number, v: number, amp: number): number {
  return Math.round(clamp(v + (rnd() * 2 - 1) * amp, 0, 100));
}
export function aiTactic(rnd: () => number, myStrength: number, oppStrength?: number): Tactic {
  const gap = myStrength - (oppStrength ?? myStrength);
  const base = applyPreset(presetForGap(gap));
  return {
    ...base,
    postura: jitterSlider(rnd, base.postura, 8),
    pressao: jitterSlider(rnd, base.pressao, 8),
    amplitude: jitterSlider(rnd, base.amplitude, 8),
    agressividade: jitterSlider(rnd, base.agressividade, 8),
  };
}

// ===== IA que ADAPTA (§14) — o nó tático =====
// A partir das oitavas, a IA lê o setup do jogador e responde pra MAXIMIZAR o próprio
// encaixe contra ele (desata o nó): testa cada preset + ajustes e fica com o de melhor
// DOMÍNIO (meu edge − o edge dele) contra o plano do jogador. Determinística (varre um
// conjunto fixo). `playerTac` é a tática conhecida do jogador (no pré-jogo a IA só vê
// isso nas fases que o produto libera, oitavas+). Tudo SEM rnd no núcleo da varredura.

// domínio tático de `mine` (tática da IA) sobre `theirs` (tática do jogador), nos dois
// times. = (estrutura+táticas da IA contra o jogador) − (estrutura+táticas do jogador
// contra a IA). Quanto maior, mais a IA neutraliza/explora o plano do jogador. Espelha
// EXATAMENTE o núcleo de sideStrength (mesmas funções §4/§5/§6.5), sem teto/fadiga — é
// um ranqueador relativo, não o edge final do jogo.
function tacticDomination(aiTeam: Team, mine: Tactic, oppTeam: Team, theirs: Tactic): number {
  const ai = estruturaEdge(aiTeam, mine, oppTeam, theirs) + taticasEdge(mine, theirs, aiTeam);
  const pl = estruturaEdge(oppTeam, theirs, aiTeam, mine) + taticasEdge(theirs, mine, oppTeam);
  return ai - pl;
}

// conjunto de CANDIDATAS da IA: os 5 presets + variações de slider (em cima dos eixos
// que a sintonia §6.5 e a pressão §5 mais mexem). Determinístico (lista fixa). É o leque
// de respostas que a IA pondera contra o seu plano.
function aiCandidateTactics(): Tactic[] {
  const out: Tactic[] = [];
  for (const k of PRESET_ORDER) {
    const c = applyPreset(k);
    out.push(c);
    // sobe a pressão + pegada (sufoca / aperta o duelo).
    out.push({ ...c, pressao: clamp(c.pressao + 18, 0, 100), agressividade: clamp(c.agressividade + 12, 0, 100) });
    // fecha pelo meio + recua a postura (tira o espaço das alas, segura).
    out.push({ ...c, amplitude: clamp(c.amplitude - 18, 0, 100), postura: clamp(c.postura - 12, 0, 100) });
    // abre pelas alas + sobe a postura (vai pra cima e amplia).
    out.push({ ...c, amplitude: clamp(c.amplitude + 18, 0, 100), postura: clamp(c.postura + 12, 0, 100) });
    // baixa o bloco (espera o rival lá atrás — castiga quem precisa de espaço alto).
    out.push({ ...c, pressao: clamp(c.pressao - 20, 0, 100) });
  }
  return out;
}

// a melhor tática-resposta CRUA da IA contra `playerTac` (a que mais domina), ignorando a
// fase. É o "100% adaptada". A intensidade da fase mistura isto com o preset puro (abaixo).
function bestCounterTactic(aiTeam: Team, oppTeam: Team, playerTac: Tactic): Tactic {
  const cands = aiCandidateTactics();
  let best = cands[0];
  let bestScore = -Infinity;
  for (const v of cands) {
    const score = tacticDomination(aiTeam, v, oppTeam, playerTac);
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  return best;
}

// mistura discreta entre a tática-resposta e o preset puro, por `intensity` ∈ [0,1]:
//  · estrutura (formação/estilos): adota a da resposta a partir de intensity ≥ 0.5
//    (oitavas adapta os estilos só "meio caminho" → 50/50 por hash; quartas+ sempre).
//  · sliders: interpola linearmente puro→resposta por intensity (adaptação contínua).
// `hash` desempata o caso 50/50 de forma determinística (sem rnd).
function blendTactics(pure: Tactic, counter: Tactic, intensity: number, hash: number): Tactic {
  const t = clamp(intensity, 0, 1);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * t);
  const takeStruct = t >= 0.999 ? true : t < 0.5 ? false : (hash & 1) === 1;
  return {
    form: takeStruct ? counter.form : pure.form,
    atk: takeStruct ? counter.atk : pure.atk,
    def: takeStruct ? counter.def : pure.def,
    postura: lerp(pure.postura, counter.postura),
    pressao: lerp(pure.pressao, counter.pressao),
    amplitude: lerp(pure.amplitude, counter.amplitude),
    agressividade: lerp(pure.agressividade, counter.agressividade),
  };
}

// quanto a IA adapta em cada fase de pré-jogo. grupos = 0 (preset puro); oitavas ajusta
// parcial; quartas ajusta forte; semi/final praticamente 100% (e ainda reage ao vivo).
function adaptIntensity(phase: MatchPhase, round?: KnockoutRound): number {
  if (phase === "grupos") return 0;
  if (phase === "ao_vivo") return 1; // semi/final: pré-jogo já no talo (e adapta ao vivo)
  // "ajusta": oitavas mais leve, quartas mais pesada.
  return round === "QF" ? 0.85 : 0.55; // R16 / 3º lugar = 0.55
}

// ⭐ DECISÃO TÁTICA DA IA POR FASE (§14) — entrada única usada pela UI no pré-jogo.
// `phase` vem de matchPhaseForKind/ForCampaign. Em "grupos" devolve o preset puro (com
// jitter, sem ler o jogador). Em "ajusta"/"ao_vivo" mistura o preset puro com a melhor
// resposta ao plano do jogador, por intensidade da fase. Determinístico (o jitter usa o
// `rnd` semeado; o resto é função pura das táticas).
export function aiTacticForPhase(
  rnd: () => number,
  aiTeam: Team,
  oppTeam: Team,
  playerTac: Tactic,
  phase: MatchPhase,
  round?: KnockoutRound,
): Tactic {
  const pure = aiTactic(rnd, aiTeam.o, oppTeam.o); // preset por gap + jitter (com rnd)
  if (phase === "grupos") return pure;
  const counter = bestCounterTactic(aiTeam, oppTeam, playerTac);
  // hash estável do confronto (forças + plano do jogador) pra o desempate 50/50 de
  // estrutura nas oitavas ser determinístico e variar por jogo.
  const hash = tacticHash(playerTac, pure) ^ ((aiTeam.o * 73856093) ^ (oppTeam.o * 19349663));
  return blendTactics(pure, counter, adaptIntensity(phase, round), hash >>> 0);
}

// compat: assinatura antiga (sempre adapta 100%). Mantida pra não quebrar chamadas
// existentes; o caminho novo é aiTacticForPhase.
export function adaptAiTactic(
  _rnd: () => number,
  aiTeam: Team,
  oppTeam: Team,
  playerTac: Tactic,
): Tactic {
  return bestCounterTactic(aiTeam, oppTeam, playerTac);
}

// ⭐ IA REATIVA AO VIVO NA SEMI/FINAL (§14) — re-adapta lendo o placar e o plano CORRENTE
// do jogador. Usada pelos ganchos do v9 (recomputeStrengths/recomputeFromMinute) quando a
// fase é "ao_vivo":
//   · no INTERVALO (keepStructure=false): a IA pode RE-ESTRUTURAR — muda formação/estilos
//     E sliders pra responder ao 1º tempo e ao seu novo plano do vestiário;
//   · AO VIVO (keepStructure=true): respeita a mesma lei que você (estrutura só muda no
//     intervalo, §1) — mantém formação/estilos da IA e só RE-AFINA os sliders contra o
//     que você faz agora + o ânimo do placar.
// Combina o nó tático (bestCounterTactic vs o seu plano atual) com o ânimo do placar:
// reusa reactiveAiPosture pra empurrar a postura conforme quem ganha/perde (favorito não
// retranca; azarão segura). DETERMINÍSTICO (sem rnd) — a UI fornece a re-sementagem
// estável via recomputeFromMinute. `current` é a tática vigente da IA (preserva a
// estrutura ao vivo). Devolve a NOVA tática da IA.
export function reactiveAiTactic(
  aiTeam: Team,
  oppTeam: Team,
  playerTacNow: Tactic,
  current: Tactic,
  aiGoals: number,
  oppGoals: number,
  minute: number,
  keepStructure: boolean,
): Tactic {
  // 1) o nó tático: melhor resposta (estrutura+sliders) contra o que o jogador faz AGORA.
  const counter = bestCounterTactic(aiTeam, oppTeam, playerTacNow);
  // 2) ao vivo, a estrutura fica TRAVADA (só os sliders da resposta entram); no intervalo
  //    a IA adota também a formação/estilos da resposta.
  const merged: Tactic = keepStructure
    ? { form: current.form, atk: current.atk, def: current.def, postura: counter.postura, pressao: counter.pressao, amplitude: counter.amplitude, agressividade: counter.agressividade }
    : counter;
  // 3) o ânimo do placar ajusta a postura por cima (regra do v9, sobre a postura adaptada).
  const postura = reactiveAiPosture(merged, aiTeam.o, oppTeam.o, aiGoals, oppGoals, minute);
  return { ...merged, postura };
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
    const res = simulateFull(teamA, teamB, tacA, tacB, s);
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
  // BUG #1: a SEQUÊNCIA dos meus adversários TEM de seguir a ordem das rodadas do
  // round-robin do grupo (myGroupRounds), não a ordem crua do array do grupo. Assim,
  // myOpps[k] = meu adversário na RODADA k do round-robin: depois do meu jogo k,
  // catchUpMyGroup(k) apura exatamente os outros pares das rodadas 0..k-1, TODO time do
  // grupo fica com k jogos e o "outro jogo da rodada k" é o par CORRETO (os dois que não
  // sou eu, naquela rodada). Sem isso, eu enfrentava um time e a tabela apurava o par de
  // OUTRA rodada — repetindo um adversário e deixando outro em J=0.
  const opps = myOppsInRoundOrder(myGroupTeams, camp.myKey);
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
// `collect` (ITEM C): quando for o MEU grupo, empilha o placar apurado pra a UI poder
// narrar "enquanto você jogava". `collect` recebe SÓ os jogos que de fato foram
// apurados nesta chamada (idempotência preservada — par já jogado não recoleta).
function playGroupPair(
  camp: Campaign,
  gIdx: number,
  i: number,
  j: number,
  collect?: (r: GroupOtherResult) => void,
): void {
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
  if (collect) collect({ a: A, b: B, ga: r.gA, gb: r.gB });
}
// ITEM C: calcula (SEM mutar) os IA×IA do MEU grupo numa rodada — usado pela tela de
// resultado, que renderiza ANTES do commit que grava o roundLog. Como usa a MESMA
// semente por par (groupPairSeed) e o MESMO simAIvsAI, o que aqui se mostra é
// idêntico ao que catchUpMyGroup vai gravar. Pura: lê grupos/standings, não escreve.
export function previewGroupRoundResults(camp: Campaign, round: number): GroupOtherResult[] {
  const s = camp.state;
  if (!s || s.kind !== "groups" || round < 0) return [];
  const gs = s as GroupsStageState;
  const rounds = myGroupRounds(gs.groups[gs.myG]);
  if (round >= rounds.length) return [];
  const out: GroupOtherResult[] = [];
  rounds[round].forEach(([i, j]) => {
    const grp = gs.groups[gs.myG];
    const A = grp[i];
    const B = grp[j];
    if (A.s === camp.myKey || B.s === camp.myKey) return; // o meu jogo não entra
    const sd = groupPairSeed(camp, gs.myG, i, j);
    const r = simAIvsAI(A, B, sd, camp.worldMode, { year: camp.edition.year, cls: "group" });
    out.push({ a: A, b: B, ga: r.gA, gb: r.gB });
  });
  return out;
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
// BUG #1: minha sequência de adversários ALINHADA às rodadas do round-robin. Para cada
// rodada r de myGroupRounds, acha o par que me contém; o outro time é meu adversário da
// rodada r. Devolve [oppRodada0, oppRodada1, ...]. Garante que, após o meu jogo k, os
// "outros pares" das rodadas 0..k-1 (apurados por catchUpMyGroup) sejam coerentes com o
// que eu de fato joguei — todo time do grupo com o MESMO número de jogos, sem repetir um
// adversário nem deixar outro parado em J=0. (Grupo ímpar: a rodada em que eu "folgo"
// não entra; eu jogo n-1 vezes, igual ao nº de adversários reais.)
function myOppsInRoundOrder(group: Team[], myKey: string): Team[] {
  const myIdx = group.findIndex((t) => t.s === myKey);
  if (myIdx < 0) return group.filter((t) => t.s !== myKey);
  const rounds = myGroupRounds(group);
  const opps: Team[] = [];
  rounds.forEach((round) => {
    for (const [a, b] of round) {
      if (a === myIdx) {
        opps.push(group[b]);
        return;
      }
      if (b === myIdx) {
        opps.push(group[a]);
        return;
      }
    }
    // rodada sem o meu jogo = a minha folga (grupo ímpar): não adiciona adversário.
  });
  return opps;
}
// apura os IA×IA do MEU grupo até a rodada `roundsPlayed` (= nº de jogos que já fiz),
// mantendo a tabela do hub coerente jogo a jogo. Idempotente. ITEM C: além de aplicar
// o placar, registra em roundLog os jogos IA×IA que ESTA chamada de fato apurou (rodada
// por rodada), pra a UI explicar "enquanto você jogava (rodada N)" — sem dupla
// contagem (par já apurado não recoleta) e determinístico.
function catchUpMyGroup(camp: Campaign, roundsPlayed: number): void {
  const s = camp.state as GroupsStageState;
  const rounds = myGroupRounds(s.groups[s.myG]);
  const log = (s.roundLog = s.roundLog ?? []);
  for (let r = 0; r < roundsPlayed && r < rounds.length; r++) {
    if (log.some((e) => e.round === r)) continue; // rodada já registrada
    const results: GroupOtherResult[] = [];
    rounds[r].forEach(([i, j]) => playGroupPair(camp, s.myG, i, j, (gr) => results.push(gr)));
    // só registra a rodada se algum IA×IA foi de fato apurado nela (a minha própria
    // partida não entra; rodadas só com a folga do grupo ímpar ficam vazias).
    log.push({ round: r, results });
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
  // ITEM C: antes do varredor global, fecha o round-robin do MEU grupo registrando
  // CADA rodada restante no roundLog (rodadas que eu não cheguei a "ver" porque o
  // grupo encerrou). Assim, ao ir pra a classificação, os resultados decisivos que
  // definiram quem passou ficam disponíveis pra a UI — sem dupla contagem.
  catchUpMyGroup(camp, myGroupRounds(s.groups[s.myG]).length);
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
// emparelhamento PURO de uma rodada de mata-mata: ranqueia por força (o), dobra a
// chave (1×N, 2×N-1, …) e aplica o MESMO swap determinístico de 18% por par. Fonte
// ÚNICA do pareamento — usada tanto no init real quanto na continuação do chaveamento
// (efeito borboleta), garantindo que a mesma entrada produza os mesmos confrontos.
function koPairsFromTeams(teams: Team[], rnd: () => number): (Team | null)[][] {
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
  return pairs;
}
function initKnockout(camp: Campaign, stage: Stage): void {
  const teams = camp.carryTeams ? camp.carryTeams.slice() : camp.pool.slice();
  const pairs = koPairsFromTeams(teams, camp.rnd);
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
    pending: false,
  };
  const slotB: BracketSlot = {
    team: tb,
    score: rec.b.score,
    pens: rec.pens,
    winner: bWon,
    isMe: !!tb && tb.s === camp.myKey,
    champion: false,
    pending: false,
  };
  return { a: slotA, b: slotB, bye: rec.bye, mine: rec.mine, real: rec.mine, pens: rec.pens, pending: false };
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

// ITEM #9 (efeito borboleta — universo paralelo): completa a árvore a partir de onde a
// campanha parou, CONTINUANDO O PRÓPRIO CHAVEAMENTO da campanha — NÃO despejando a
// história real solta. Parte dos VENCEDORES DE FATO da última rodada eliminatória
// jogada (lidos de camp.koRounds) e avança rodada a rodada até sair campeão, reusando o
// MESMO emparelhamento (koPairsFromTeams: ranking + swap 18% determinístico) e resolvendo
// cada confronto com simAIvsAI(A,B,seed,worldMode,{year,cls}) + knockoutResult. Como
// simAIvsAI só usa o placar real quando AQUELE par exato se enfrentou de fato naquela
// fase na história, os confrontos que batem com a Copa saem reais e os divergentes (fruto
// do meu jogo — inclusive eu terminar o grupo em 2º e mudar o cruzamento) saem simulados:
// é o efeito borboleta. Função PURA (não muta camp) e DETERMINÍSTICA (mesma seed → mesma
// continuação): cada rodada/confronto é semeado de forma estável a partir de camp.seed.
//
// camp.stages descreve a estrutura da edição: as fases "knockout" (R32/R16/QF/SF) em
// ordem, seguidas opcionalmente por "third_place" e "final". A continuação respeita essa
// estrutura, derivando o 3º lugar dos perdedores das semis e a final dos vencedores das
// semis (ou do último "knockout" antes da final).

// vencedores de fato registrados numa rodada de mata-mata da campanha (lê winnerSide;
// resolve slug→Team). Ignora byes sem time. É daqui que a continuação puxa os times que
// AVANÇARAM — nunca da história.
function winnersOfRecord(camp: Campaign, rec: KoRoundRecord): Team[] {
  const year = camp.edition.year;
  const out: Team[] = [];
  rec.matches.forEach((m) => {
    const slug =
      m.winnerSide === "A" ? m.a.slug : m.winnerSide === "B" ? m.b.slug : (m.a.slug ?? m.b.slug);
    const t = slug ? teamBySlug(year, slug) : null;
    if (t) out.push(t);
  });
  return out;
}
// resolve um confronto IA×IA do bracket continuado (placar + vencedor + pênaltis),
// semeado de forma estável por camp.seed + identidade da rodada/par. Espelha o espírito
// de finishKnockoutStage. `cls` orienta a busca do placar real (par exato naquela fase).
function continuationMatch(
  camp: Campaign,
  A: Team,
  B: Team,
  cls: StageClass,
  roundTag: number,
  idx: number,
): BracketMatch {
  const year = camp.edition.year;
  const sd = (camp.seed ^ (A.o * 7919 + B.o * 104729 + idx * 911 + roundTag * 5779)) >>> 0;
  const r = simAIvsAI(A, B, sd, camp.worldMode, { year, cls });
  const kr = knockoutResult(A, B, r.gA, r.gB, sd, { a: r.pensA, b: r.pensB });
  const aWon = kr.winner === "A";
  const slotA: BracketSlot = {
    team: A,
    score: r.gA,
    pens: kr.pens,
    winner: aWon,
    isMe: A.s === camp.myKey,
    champion: false,
    pending: false,
  };
  const slotB: BracketSlot = {
    team: B,
    score: r.gB,
    pens: kr.pens,
    winner: !aWon,
    isMe: B.s === camp.myKey,
    champion: false,
    pending: false,
  };
  return { a: slotA, b: slotB, bye: false, mine: false, real: r.real, pens: kr.pens, pending: false };
}

// continua o chaveamento a partir dos vencedores reais da última rodada jogada, até a
// final. Pura/determinística. Devolve as rodadas continuadas (sem incluir as já jogadas).
function continueBracketAfterCampaign(camp: Campaign): BracketRound[] {
  const played = camp.koRounds ?? [];
  const playedSet = new Set(played.map((r) => r.round));
  // fases de mata-mata da edição (em ordem), separando os "knockout" do third/final.
  const koStages: { round: KnockoutRound; cls: StageClass }[] = [];
  let hasThird = false;
  let hasFinal = false;
  camp.stages.forEach((st) => {
    if ((st.type === "knockout" || st.type === "second_round_knockout") && st.round) {
      koStages.push({ round: st.round, cls: koStageClass(st) });
    } else if (st.type === "third_place") hasThird = true;
    else if (st.type === "final") hasFinal = true;
  });

  // ponto de partida: a rodada "knockout" mais profunda JÁ registrada na campanha e seus
  // vencedores reais. Se nenhuma foi registrada, não há de onde continuar.
  let startIdx = -1;
  for (let i = koStages.length - 1; i >= 0; i--) {
    if (playedSet.has(koStages[i].round)) {
      startIdx = i;
      break;
    }
  }

  const out: BracketRound[] = [];
  let carry: Team[];
  let sfLosers: Team[] = [];

  if (startIdx >= 0) {
    const startRec = played.find((r) => r.round === koStages[startIdx].round);
    if (!startRec) return out;
    carry = winnersOfRecord(camp, startRec);
  } else {
    // não joguei nenhuma rodada de mata-mata "knockout" registrada — nada a continuar
    // (projectBracket já cobre o caso degenerado); evita revelar do nada.
    return out;
  }

  // avança as fases "knockout" seguintes à última registrada.
  for (let i = startIdx + 1; i < koStages.length; i++) {
    if (carry.length < 2) break;
    const { round, cls } = koStages[i];
    const pairs = koPairsFromTeams(carry, rngFrom((camp.seed ^ (round.length * 2654435761)) >>> 0));
    const labels = koRoundLabels(round);
    const matches: BracketMatch[] = [];
    const winners: Team[] = [];
    const losers: Team[] = [];
    pairs.forEach((pair, idx) => {
      const A = pair[0];
      const B = pair[1];
      if (A && !B) {
        winners.push(A);
        matches.push({
          a: { team: A, score: null, pens: null, winner: true, isMe: A.s === camp.myKey, champion: false, pending: false },
          b: { team: null, score: null, pens: null, winner: false, isMe: false, champion: false, pending: false },
          bye: true,
          mine: false,
          real: false,
          pens: null,
          pending: false,
        });
        return;
      }
      if (!A || !B) return;
      const bm = continuationMatch(camp, A, B, cls, idx + 1, idx);
      matches.push(bm);
      const winner = bm.a.winner ? A : B;
      const loser = bm.a.winner ? B : A;
      winners.push(winner);
      losers.push(loser);
    });
    out.push({ label: labels.label, short: labels.short, round, matches });
    carry = winners;
    if (round === "SF") sfLosers = losers;
  }

  // 3º lugar: perdedores das semis (se a edição tem a disputa e ainda não foi jogada).
  // Se a SF foi CONTINUADA aqui, sfLosers já está preenchido. Se a SF foi JOGADA na
  // campanha (eu caí na própria SF), derivo os perdedores do registro real da SF.
  if (hasThird && !playedSet.has("THIRD")) {
    let losers = sfLosers;
    if (losers.length < 2 && playedSet.has("SF")) {
      const sfRec = played.find((r) => r.round === "SF");
      if (sfRec) {
        const year = camp.edition.year;
        const ls: Team[] = [];
        sfRec.matches.forEach((m) => {
          const loserSlug =
            m.winnerSide === "A" ? m.b.slug : m.winnerSide === "B" ? m.a.slug : null;
          const t = loserSlug ? teamBySlug(year, loserSlug) : null;
          if (t) ls.push(t);
        });
        losers = ls;
      }
    }
    if (losers.length >= 2) {
      const labels = koRoundLabels("THIRD");
      const bm = continuationMatch(camp, losers[0], losers[1], "third", 97, 0);
      out.push({ label: labels.label, short: labels.short, round: "THIRD", matches: [bm] });
    }
  }

  // final: vencedores das semis (ou do último knockout). Marca o campeão.
  if (hasFinal && !playedSet.has("FINAL") && carry.length >= 2) {
    const labels = koRoundLabels("FINAL");
    const bm = continuationMatch(camp, carry[0], carry[1], "final", 99, 0);
    if (bm.a.winner) bm.a.champion = true;
    else bm.b.champion = true;
    out.push({ label: labels.label, short: labels.short, round: "FINAL", matches: [bm] });
  }

  return out;
}

// ITEM B: monta a RODADA ATUAL EM ANDAMENTO como confrontos PENDENTES (pareados, mas
// sem placar/vencedor). Os pares já são conhecidos no momento que a rodada abre
// (camp.state.pairs) — inclusive o meu próximo confronto e os IA×IA paralelos. Não é
// spoiler: é só a chave/pareamento, sem antecipar resultado de jogo não disputado. Só
// vale para uma fase eliminatória AINDA NÃO concluída e AINDA NÃO registrada em
// koRounds (não duplica). Devolve null se não há rodada atual pendente a mostrar.
function pendingCurrentRound(camp: Campaign, playedSet: Set<KoRoundRecord["round"]>): BracketRound | null {
  const st = camp.state;
  if (!st) return null;
  const pendingSlot = (team: Team | null): BracketSlot => ({
    team,
    score: null,
    pens: null,
    winner: false,
    isMe: !!team && team.s === camp.myKey,
    champion: false,
    pending: true,
  });
  const pendingMatch = (a: Team | null, b: Team | null, mine: boolean): BracketMatch => ({
    a: pendingSlot(a),
    b: pendingSlot(b),
    bye: !a || !b,
    mine,
    real: false,
    pens: null,
    pending: true,
  });

  if (st.kind === "knockout") {
    const round = (st.stage.round ?? "FINAL") as KoRoundRecord["round"];
    if (st.done || playedSet.has(round)) return null; // já concluída/registrada
    const labels = koRoundLabels(round);
    const matches = st.pairs.map((pair, idx) =>
      pendingMatch(pair[0] ?? null, pair[1] ?? null, idx === st.myPair),
    );
    if (matches.length === 0) return null;
    return { label: labels.label, short: labels.short, round, matches };
  }
  if (st.kind === "final") {
    if (st.done || playedSet.has("FINAL") || !st.iAmIn || !st.myOpp) return null;
    const labels = koRoundLabels("FINAL");
    return {
      label: labels.label,
      short: labels.short,
      round: "FINAL",
      matches: [pendingMatch(camp.myTeam, st.myOpp, true)],
    };
  }
  if (st.kind === "third_place") {
    if (st.done || playedSet.has("THIRD") || !st.iAmIn || !st.myOpp) return null;
    const labels = koRoundLabels("THIRD");
    return {
      label: labels.label,
      short: labels.short,
      round: "THIRD",
      matches: [pendingMatch(camp.myTeam, st.myOpp, true)],
    };
  }
  return null;
}

// `reveal` = true (fim de campanha): CONTINUA o chaveamento da campanha além de onde
// parei (efeito borboleta — a partir dos vencedores reais), pra revelar o campeão.
// `reveal` = false (durante a campanha): rodadas já jogadas + a rodada ATUAL pareada
// como PENDENTE (sem placar). Fases futuras (que dependem dos vencedores da atual)
// ficam ocultas até serem determinadas (sem spoiler).
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

  const playedSet = new Set(played.map((r) => r.round));

  if (reveal && !camp.alive && !champion) {
    // FIM DE CAMPANHA (reveal): CONTINUA o chaveamento da campanha a partir dos
    // vencedores REAIS da última rodada jogada (efeito borboleta — simAIvsAI usa o
    // placar real só onde o par exato se enfrentou de fato na história). SALVAGUARDA
    // anti-spoiler: só com a campanha encerrada (!alive) — se reveal=true vazar numa
    // campanha viva, nada é antecipado.
    const extra = continueBracketAfterCampaign(camp);
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
      rounds.push(er);
    });
    rounds.sort((a, b) => rank(a.round) - rank(b.round));
  } else if (!reveal && camp.alive) {
    // DURANTE A CAMPANHA: anexa a rodada ATUAL pareada como PENDENTE (sem placar). As
    // fases futuras (que dependem dos vencedores desta) seguem ocultas.
    const pendingRound = pendingCurrentRound(camp, playedSet);
    if (pendingRound) {
      rounds.push(pendingRound);
      rounds.sort((a, b) => rank(a.round) - rank(b.round));
    }
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
  camp.placement = "Eliminado: " + atStageName;
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

// ITEM C: resultados IA×IA do MEU grupo numa rodada específica (0-based), pra a UI
// narrar "enquanto você jogava". Função pura — lê o roundLog que catchUpMyGroup
// montou determinísticamente. `round` < 0 ou inexistente → lista vazia.
export function groupRoundResults(camp: Campaign, round: number): GroupOtherResult[] {
  const s = camp.state;
  if (!s || s.kind !== "groups" || round < 0) return [];
  const entry = (s.roundLog ?? []).find((e) => e.round === round);
  return entry ? entry.results : [];
}
// ITEM C: índice (0-based) da rodada de grupo que ACABEI de jogar — pra o resultado
// pós-jogo puxar os IA×IA paralelos daquela rodada. Como resolveGroupMatch já
// incrementou myMatchIdx, a rodada recém-jogada é myMatchIdx-1.
export function lastGroupRoundPlayed(camp: Campaign): number {
  const s = camp.state;
  if (!s || s.kind !== "groups") return -1;
  return (s as GroupsStageState).myMatchIdx - 1;
}
// ITEM C: resultados IA×IA da ÚLTIMA rodada do meu grupo (a decisiva), pra a tela de
// classificação mostrar os jogos que definiram quem passou. finishGroupsStage gravou
// todas as rodadas no log; aqui pego a de maior índice com resultados. Pura.
export function finalGroupRoundResults(camp: Campaign): GroupOtherResult[] {
  const s = camp.state;
  if (!s || s.kind !== "groups") return [];
  const log = (s as GroupsStageState).roundLog ?? [];
  let best: GroupRoundLog | null = null;
  log.forEach((e) => {
    if (e.results.length > 0 && (!best || e.round > best.round)) best = e;
  });
  return best ? (best as GroupRoundLog).results : [];
}

// ITEM D: id da última rodada de mata-mata FECHADA na campanha (a recém-apurada),
// pra a tela de resultados da fase exibir exatamente a rodada que acabou de fechar.
// Lê camp.koRounds (fonte única — finishKnockoutStage/recordFinalRound já gravaram).
export function lastKoRoundId(camp: Campaign): string | null {
  const arr = camp.koRounds ?? [];
  if (arr.length === 0) return null;
  return arr[arr.length - 1].round;
}
// ITEM D: a BracketRound (pra UI) de uma rodada específica já jogada — reúne os
// confrontos REAIS da campanha (projectBracket lê só camp.koRounds, sem recalcular).
// `roundId` = "R32"/"R16"/"QF"/"SF"/"FINAL"/"THIRD". null se não houver.
export function koRoundView(camp: Campaign, roundId: string): BracketRound | null {
  const view = projectBracket(camp);
  if (!view) return null;
  return view.rounds.find((r) => r.round === roundId) ?? null;
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
