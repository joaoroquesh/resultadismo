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

// dados estáticos tipados (importados do slice)
export const DATA = RATINGS as Team[];
export const FORMATS = FORMATS_JSON as Edition[];
export const WC_GROUPS = GROUPS_JSON as WcGroupsEdition[];

const WC_GROUPS_BY_YEAR: Record<number, WcGroupsEdition> = {};
WC_GROUPS.forEach((ed) => {
  WC_GROUPS_BY_YEAR[ed.year] = ed;
});

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
  // jitter próprio, semeado pela partida (NÃO consome o state.rnd — não afeta o jogo).
  const rnd = mulberry32((state.seed ^ 0x5f3759df) >>> 0);
  const jit = (base: number, spread: number) => base + (rnd() * 2 - 1) * spread;

  // ---- finalizações e chutes ao gol: a partir dos EVENTOS reais ----
  let finA = 0, finB = 0, sotA = 0, sotB = 0;
  state.events.forEach((ev) => {
    const isA = ev.ownerSide === "A";
    if (isA) finA++; else finB++;
    // no alvo = gol + defesa do goleiro + metade dos "quase" (trave/raspando)
    const onTarget = ev.kind === "goal" || ev.kind === "defesa" || (ev.kind === "quase" && rnd() < 0.5);
    if (onTarget) { if (isA) sotA++; else sotB++; }
  });
  // todo gol é, por definição, chute ao gol (garante coerência narrativa).
  if (sotA < state.gA) sotA = state.gA;
  if (sotB < state.gB) sotB = state.gB;
  // finalizações nunca menores que os chutes ao gol.
  if (finA < sotA) finA = sotA;
  if (finB < sotB) finB = sotB;

  // ---- posse de bola: shareA (share de CHANCES) puxado pro meio + jitter ----
  // converte pra uma % "humana" (raramente abaixo de 32 / acima de 68), coerente com
  // quem mandou no jogo. Goleada com posse baixa fica implausível → ancora no placar.
  let possA = 50 + (state.shareA - 0.5) * 64; // ±32 em torno de 50
  const gd = state.gA - state.gB;
  possA += Math.max(-8, Math.min(8, gd * 2.2)); // quem fez mais gol tende a ter tido a bola
  possA = jit(possA, 3);
  possA = Math.max(32, Math.min(68, possA));
  const pA = Math.round(possA);
  const pB = 100 - pA;

  // ---- passes: ~ posse × ritmo do jogo (gameVol). força de meio refina a precisão ----
  const tempo = 880 * state.gameVol; // total aproximado de passes no jogo
  const passA = Math.round(jit((tempo * pA) / 100, 30));
  const passB = Math.round(jit((tempo * pB) / 100, 30));
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

// simula uma partida headless (IA x IA). mode 'alt' = uma rodada do motor com toda
// a variância; mode 'real' = puxa o resultado pra coerência com a FORÇA real.
export function simAIvsAI(
  teamA: Team,
  teamB: Team,
  seed: number,
  mode: WorldMode = "real",
): { gA: number; gB: number } {
  function one(s: number): { gA: number; gB: number } {
    const r = rngFrom(s);
    const tacA = aiTactic(r, teamA.o, teamB.o);
    const tacB = aiTactic(r, teamB.o, teamA.o);
    const res = simulateFull(teamA, teamB, tacA, tacB, s, defaultAiPolicy);
    return { gA: res.gA, gB: res.gB };
  }
  if (mode !== "real") return one(seed);
  const diff = teamA.o - teamB.o;
  const ad = Math.abs(diff);
  if (ad < 6) return one(seed); // forças vizinhas: deixa o jogo decidir
  const want = diff > 0 ? "A" : "B";
  const tries = ad >= 14 ? 5 : ad >= 9 ? 4 : 3;
  let best: { gA: number; gB: number } | null = null;
  for (let k = 0; k < tries; k++) {
    const res = one((seed ^ (k * 2654435761)) >>> 0);
    const w = res.gA > res.gB ? "A" : res.gB > res.gA ? "B" : "E";
    if (w === want) return res;
    if (w === "E" && best === null) best = res;
    if (best === null) best = res;
  }
  return best as { gA: number; gB: number };
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
export function knockoutResult(
  teamA: Team,
  teamB: Team,
  gA: number,
  gB: number,
  seed: number,
): KnockoutOutcome {
  if (gA > gB) return { winner: "A", pens: null };
  if (gB > gA) return { winner: "B", pens: null };
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
  const r = simAIvsAI(A, B, sd, camp.worldMode);
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
      const r = simAIvsAI(A, B, sd, camp.worldMode);
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
  // ITEM 17: na PRIMEIRA rodada de mata-mata, congela a ordem do chaveamento (já com
  // o sorteio do camp.rnd aplicado). projectBracket reconstrói a árvore inteira a
  // partir daqui — de forma determinística e reproduzível numa campanha recarregada.
  if (!camp.koBracketOrder) {
    camp.koBracketOrder = pairs.flatMap((pr) => [pr[0]?.s ?? "", pr[1]?.s ?? ""]);
  }
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
export function finishKnockoutStage(camp: Campaign, myWon: boolean): Team[] {
  const s = camp.state as KnockoutStageState;
  const winners: Team[] = [];
  s.pairs.forEach((pair, idx) => {
    const A = pair[0];
    const B = pair[1];
    if (idx === s.myPair) {
      if (s.bye) winners.push(camp.myTeam);
      else winners.push(myWon ? camp.myTeam : (s.myOpp as Team));
      return;
    }
    if (!B) {
      if (A) winners.push(A);
      return;
    }
    const sd =
      (camp.seed ^ (A!.o * 7919 + B.o * 104729 + idx * 911 + (s.stage.round || "").length * 13)) >>>
      0;
    const r = simAIvsAI(A as Team, B, sd, camp.worldMode);
    const kr = knockoutResult(A as Team, B, r.gA, r.gB, sd);
    winners.push(kr.winner === "A" ? (A as Team) : B);
  });
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
      const r = simAIvsAI(A as Team, B, sd, camp.worldMode);
      const kr = knockoutResult(A as Team, B, r.gA, r.gB, sd);
      camp.sfLosers!.push(kr.winner === "A" ? B : (A as Team));
    });
  }
  s.winners = winners;
  s.done = true;
  return winners;
}

// =====================================================================
// ITEM 17 — PROJEÇÃO DO CHAVEAMENTO (árvore inteira do mata-mata)
// Reconstrói a árvore de mata-mata da edição (R32/R16/QF/SF + Final), reunindo:
//   • os MEUS confrontos REAIS já jogados (de camp.history), e
//   • todos os IA×IA simulados com a MESMA sementagem de finishKnockoutStage —
// preenchendo até a Final e revelando o campeão MESMO após a eliminação. Função
// PURA e determinística (semeada por camp.seed + koBracketOrder congelado): o que
// se vê aqui é o que aconteceria/aconteceu. Não muta a campanha.
// =====================================================================

// Sementes IDÊNTICAS às do fluxo real (finishKnockoutStage), por rodada de chave.
function koPairSeed(seed: number, A: Team, B: Team, idx: number, round: string): number {
  return (seed ^ (A.o * 7919 + B.o * 104729 + idx * 911 + (round || "").length * 13)) >>> 0;
}

// rótulos da rodada por nº de confrontos (cobre R32..Final independe do `round`).
function koRoundMeta(nMatches: number, isFinal: boolean): { label: string; short: string; round: BracketRound["round"] } {
  if (isFinal || nMatches === 1) return { label: "Final", short: "Final", round: "FINAL" };
  if (nMatches === 2) return { label: "Semifinais", short: "Semis", round: "SF" };
  if (nMatches <= 4) return { label: "Quartas de final", short: "Quartas", round: "QF" };
  if (nMatches <= 8) return { label: "Oitavas de final", short: "Oitavas", round: "R16" };
  return { label: "32-avos de final", short: "32-avos", round: "R32" };
}

// chaveamento por força (snake) + leve embaralhada — MESMA regra do initKnockout. O
// real usa camp.rnd (não-reproduzível ao recarregar); aqui o rnd é derivado de
// camp.seed+roundIdx, deixando a projeção 100% determinística e save-safe.
function snakeSeedOrder(teams: Team[], rnd: () => number): Team[] {
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
  return bracket;
}

// monta a ordem do 1º mata-mata (slugs congelados) em Times reais; se a campanha
// foi salva antes do item 17 (sem koBracketOrder), reconstrói pela mesma regra do
// initKnockout, porém com rnd derivado de camp.seed (determinístico e save-safe).
function firstKoOrder(camp: Campaign): Team[] {
  const year = camp.edition.year;
  if (camp.koBracketOrder && camp.koBracketOrder.length) {
    return camp.koBracketOrder.map((slug) => (slug ? teamBySlug(year, slug) : null)).filter(Boolean) as Team[];
  }
  // fallback determinístico (campanhas antigas): replica o snake de initKnockout.
  // Sem a ordem real do camp.rnd não há como bater 100%, mas fica estável e plausível.
  const st = camp.state;
  let entry: Team[] = [];
  if (st && st.kind === "knockout") entry = st.pairs.flatMap((p) => p.filter(Boolean) as Team[]);
  else if (camp.carryTeams) entry = camp.carryTeams.slice();
  return snakeSeedOrder(entry, rngFrom((camp.seed ^ 0x5bd1e995) >>> 0));
}

// procura, no histórico, o MEU confronto de mata-mata contra `opp` (resultado real).
function myKoHistoryVs(camp: Campaign, opp: Team): HistoryEntry | null {
  for (const h of camp.history) {
    if (h.ko && h.opp.s === opp.s) return h;
  }
  return null;
}

// reordena, in-place, a rodada `seeded` pra colar meu adversário REAL ao meu lado,
// se eu estou presente e já joguei contra ele neste mata-mata. Mantém a paridade do
// par (índice par ↔ ímpar) e não duplica ninguém. Só atua quando há histórico real.
function anchorMyPair(camp: Campaign, seeded: Team[]): void {
  const meIdx = seeded.findIndex((t) => t.s === camp.myKey);
  if (meIdx < 0) return; // não estou nesta rodada
  // qual o meu adversário real aqui? procuro no histórico um KO contra alguém que
  // também esteja nesta rodada (e que eu ainda não tenha "consumido" em rodada anterior).
  const oppIdx = seeded.findIndex(
    (t, i) => i !== meIdx && t.s !== camp.myKey && myKoHistoryVs(camp, t) != null,
  );
  if (oppIdx < 0) return; // confronto futuro/projeção — deixa o sorteio decidir
  // posição do par do meu slot: pares são (2k, 2k+1).
  const pairBase = meIdx - (meIdx % 2);
  const partnerIdx = pairBase + (meIdx % 2 === 0 ? 1 : -1);
  if (partnerIdx === oppIdx) return; // já está colado
  const tmp = seeded[partnerIdx];
  seeded[partnerIdx] = seeded[oppIdx];
  seeded[oppIdx] = tmp;
}

export function projectBracket(camp: Campaign): BracketView | null {
  const order = firstKoOrder(camp);
  if (order.length < 2) return null; // edição sem chaveamento (ex.: quadrangular 1950)

  const seed = camp.seed;
  const rounds: BracketRound[] = [];
  let champion: Team | null = null;
  let myExitRound: number | null = null;

  // confronto -> {winner, slot a, slot b}. Meu jogo usa o placar real; IA×IA usa
  // a simulação determinística. Bye = uma vaga vazia (avança sem jogar).
  function resolve(a: Team | null, b: Team | null, idx: number, round: string): {
    match: BracketMatch;
    winner: Team | null;
  } {
    const mine = (a?.s === camp.myKey || b?.s === camp.myKey) && !!a && !!b;
    // bye (uma vaga só)
    if (!a || !b) {
      const present = a || b;
      const isMe = present?.s === camp.myKey;
      const slotPresent: BracketSlot = {
        team: present,
        score: null,
        pens: null,
        winner: true,
        isMe,
        champion: false,
      };
      const slotEmpty: BracketSlot = { team: null, score: null, pens: null, winner: false, isMe: false, champion: false };
      const match: BracketMatch = {
        a: a ? slotPresent : slotEmpty,
        b: b ? slotPresent : slotEmpty,
        bye: true,
        mine: false,
        real: false,
        pens: null,
      };
      return { match, winner: present };
    }

    // MEU confronto: usa o placar real do histórico, se já joguei.
    if (mine) {
      const opp = a.s === camp.myKey ? b : a;
      const h = myKoHistoryVs(camp, opp);
      if (h) {
        // h.gf/h.ga são SEMPRE do meu ponto de vista; mapeia pros lados a/b.
        const meIsA = a.s === camp.myKey;
        const myGoals = h.gf;
        const oppGoals = h.ga;
        const aScore = meIsA ? myGoals : oppGoals;
        const bScore = meIsA ? oppGoals : myGoals;
        const iWon = h.win;
        const winnerTeam = iWon ? camp.myTeam : opp;
        const aWon = a.s === winnerTeam.s;
        const slotA: BracketSlot = { team: a, score: aScore, pens: h.pens, winner: aWon, isMe: meIsA, champion: false };
        const slotB: BracketSlot = { team: b, score: bScore, pens: h.pens, winner: !aWon, isMe: !meIsA, champion: false };
        return {
          match: { a: slotA, b: slotB, bye: false, mine: true, real: true, pens: h.pens },
          winner: winnerTeam,
        };
      }
      // meu confronto ainda NÃO jogado (projeção do futuro): simula como IA×IA.
    }

    // IA×IA (ou meu jogo ainda não disputado): simulação determinística.
    const sd = koPairSeed(seed, a, b, idx, round);
    const r = simAIvsAI(a, b, sd, camp.worldMode);
    const kr = knockoutResult(a, b, r.gA, r.gB, sd);
    const aWon = kr.winner === "A";
    const slotA: BracketSlot = {
      team: a,
      score: r.gA,
      pens: kr.pens,
      winner: aWon,
      isMe: a.s === camp.myKey,
      champion: false,
    };
    const slotB: BracketSlot = {
      team: b,
      score: r.gB,
      pens: kr.pens,
      winner: !aWon,
      isMe: b.s === camp.myKey,
      champion: false,
    };
    return {
      match: { a: slotA, b: slotB, bye: false, mine, real: false, pens: kr.pens },
      winner: aWon ? a : b,
    };
  }

  // varre rodada a rodada até sobrar 1 (o campeão). A cada rodada o real RE-SORTEIA
  // os vencedores por força (initKnockout re-ranqueia carryTeams) — a projeção faz
  // o mesmo com snakeSeedOrder, então não é um bracket fixo: cada fase é redesenhada.
  let current: Team[] = order.slice();
  let roundIdx = 0;
  let guard = 0;
  while (current.length > 1 && guard < 12) {
    guard++;
    // a 1ª rodada já vem na ordem real congelada; as seguintes re-sorteiam.
    const seeded =
      roundIdx === 0 ? current : snakeSeedOrder(current, rngFrom((seed ^ (0x9e3779b9 + roundIdx * 2654435761)) >>> 0));
    // âncora do MEU caminho: se eu joguei esta rodada (histórico real), garanto que
    // meu adversário real fique colado a mim no par — assim a árvore mostra o
    // confronto que de fato aconteceu, não um par re-sorteado divergente.
    anchorMyPair(camp, seeded);
    const nMatches = Math.ceil(seeded.length / 2);
    const isFinal = nMatches === 1;
    const meta = koRoundMeta(nMatches, isFinal);
    const matches: BracketMatch[] = [];
    const winners: Team[] = [];
    for (let i = 0; i < seeded.length; i += 2) {
      const a = seeded[i] ?? null;
      const b = seeded[i + 1] ?? null;
      const { match, winner } = resolve(a, b, i / 2, meta.round);
      // detecta a rodada da minha eliminação (joguei e perdi este confronto).
      if (match.mine && match.real) {
        const iAdvanced = winner?.s === camp.myKey;
        if (!iAdvanced) myExitRound = roundIdx;
      }
      matches.push(match);
      if (winner) winners.push(winner);
    }
    if (isFinal) {
      champion = winners[0] ?? null;
      // marca o campeão no slot vencedor da final.
      const fm = matches[0];
      if (fm.a.winner) fm.a.champion = true;
      else if (fm.b.winner) fm.b.champion = true;
    }
    rounds.push({ label: meta.label, short: meta.short, round: meta.round, matches });
    current = winners;
    roundIdx++;
  }

  const iAmChampion = !!champion && champion.s === camp.myKey;
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
