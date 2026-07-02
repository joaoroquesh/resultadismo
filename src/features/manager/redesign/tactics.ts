// Resultadismo Manager — núcleo tático reconstruído (Fase 1).
// Puro, determinístico e sem dependência de UI. Tudo que a tela mostra como
// "coerência" ou "encaixe" sai daqui, como sinal e frase (nunca número cru).
//
// Convenções de escala das matrizes: valores inteiros de sinal
//   ++ = +2 · + = +1 · 0 = 0 · − = −1 · −− = −2
// convertidos em fração por UNIT. As linhas das matrizes somam ~0; as colunas
// ficam perto de 0 respeitando o futebol real (líbero é sólido, dobra é gamble).

// ---------------------------------------------------------------- modelo
export type Form =
  | "4-2-4" | "3-4-3" | "4-3-3" | "3-5-2" | "4-4-2"
  | "4-5-1" | "5-3-2" | "5-4-1" | "6-3-1";
export type ComBola = "posse" | "vertical" | "bola_longa" | "contra" | "drible";
export type SemBola = "zona" | "individual" | "mista" | "libero" | "dobra";
export type Bloco = "alto" | "medio" | "baixo";

export const FORMS: Form[] = ["4-2-4","3-4-3","4-3-3","3-5-2","4-4-2","4-5-1","5-3-2","5-4-1","6-3-1"];
export const COMBOLA: ComBola[] = ["posse","vertical","bola_longa","contra","drible"];
export const SEMBOLA: SemBola[] = ["zona","individual","mista","libero","dobra"];
export const BLOCOS: Bloco[] = ["alto","medio","baixo"];

// Postura é um slider contínuo 0..100 (50 = equilíbrio). NÃO tem encaixe:
// multiplica um lado e divide o oposto (ver postureMul).
export interface Tactic {
  form: Form;
  comBola: ComBola;
  semBola: SemBola;
  bloco: Bloco;
  postura: number; // 0 = retranca total, 50 = equilíbrio, 100 = all-in
}

export const DEFAULT_TACTIC: Tactic = {
  form: "4-3-3", comBola: "posse", semBola: "zona", bloco: "medio", postura: 50,
};

// Time mínimo que o motor tático precisa (compatível com types.Team).
export interface TeamLite { a: number; m: number; d: number; o: number; }

// ---------------------------------------------------------------- matrizes
// COERÊNCIA C1 — formação × estilo com bola (linhas somam 0).
const C1: Record<Form, Record<ComBola, number>> = {
  "4-2-4": { posse:-1, vertical:+1, bola_longa:0, contra:-2, drible:+2 },
  "3-4-3": { posse:0, vertical:+2, bola_longa:-1, contra:-2, drible:+1 },
  "4-3-3": { posse:+2, vertical:+1, bola_longa:-2, contra:0, drible:-1 },
  "3-5-2": { posse:+2, vertical:+1, bola_longa:-1, contra:0, drible:-2 },
  "4-4-2": { posse:0, vertical:0, bola_longa:+1, contra:+1, drible:-2 },
  "4-5-1": { posse:0, vertical:-1, bola_longa:+1, contra:+2, drible:-2 },
  "5-3-2": { posse:-1, vertical:0, bola_longa:+1, contra:+2, drible:-2 },
  "5-4-1": { posse:-2, vertical:-1, bola_longa:+1, contra:+2, drible:0 },
  "6-3-1": { posse:-2, vertical:-1, bola_longa:+2, contra:+1, drible:0 },
};

// COERÊNCIA C2 — formação × estilo sem bola (linhas somam 0).
const C2: Record<Form, Record<SemBola, number>> = {
  "4-2-4": { zona:+1, individual:+1, mista:0, libero:-2, dobra:0 },
  "3-4-3": { zona:+1, individual:-1, mista:0, libero:+1, dobra:-1 },
  "4-3-3": { zona:+1, individual:+1, mista:+1, libero:-2, dobra:-1 },
  "3-5-2": { zona:0, individual:-1, mista:+1, libero:+1, dobra:-1 },
  "4-4-2": { zona:+1, individual:+1, mista:0, libero:-1, dobra:-1 },
  "4-5-1": { zona:+1, individual:0, mista:+1, libero:-1, dobra:-1 },
  "5-3-2": { zona:-1, individual:-1, mista:0, libero:+2, dobra:0 },
  "5-4-1": { zona:-1, individual:-1, mista:0, libero:+2, dobra:0 },
  "6-3-1": { zona:-1, individual:-2, mista:0, libero:+2, dobra:+1 },
};

// COERÊNCIA C3 — estilo sem bola × altura de bloco (linhas somam 0; colunas ~0).
const C3: Record<SemBola, Record<Bloco, number>> = {
  zona:       { alto:0, medio:+1, baixo:-1 },
  individual: { alto:+2, medio:0, baixo:-2 },
  mista:      { alto:+1, medio:0, baixo:-1 },
  libero:     { alto:-2, medio:0, baixo:+2 },
  dobra:      { alto:-1, medio:0, baixo:+1 },
};

// ENCAIXE E1 — meu com bola × defesa do rival (linhas somam 0).
// Serve para os dois lados: defesa minha vs ataque do rival = −E1[rivalAtk][minhaDef].
const E1: Record<ComBola, Record<SemBola, number>> = {
  posse:      { zona:+1, individual:-1, mista:0, libero:+1, dobra:-1 },
  vertical:   { zona:-1, individual:+1, mista:0, libero:-1, dobra:+1 },
  bola_longa: { zona:+1, individual:-1, mista:0, libero:-1, dobra:+1 },
  contra:     { zona:-1, individual:+1, mista:0, libero:-1, dobra:+1 },
  drible:     { zona:0, individual:+2, mista:0, libero:0, dobra:-2 },
};

// ENCAIXE E2 — meu com bola × bloco do rival (linhas somam 0; coluna média = 0).
const E2: Record<ComBola, Record<Bloco, number>> = {
  posse:      { alto:-1, medio:0, baixo:+1 },
  vertical:   { alto:+1, medio:0, baixo:-1 },
  bola_longa: { alto:+2, medio:0, baixo:-2 },
  contra:     { alto:+2, medio:0, baixo:-2 },
  drible:     { alto:-1, medio:0, baixo:+1 },
};

// Índice ofensivo de cada formação, base do encaixe leve formação × formação.
const FORM_OI: Record<Form, number> = {
  "4-2-4":+2, "3-4-3":+2, "4-3-3":+1, "3-5-2":+1, "4-4-2":0,
  "4-5-1":-1, "5-3-2":-1, "5-4-1":-2, "6-3-1":-2,
};

// ---------------------------------------------------------------- pesos
// UNIT controla o quanto 1 ponto de sinal vira fração de força. W_TACTIC é o
// peso global da tática. Calibrados pelo harness de balanceamento para que a
// influência tática fique na faixa de 25 a 50% das oscilações.
const UNIT = 0.092;
const W_TACTIC = 1.0;
const FORM_VS_FORM_UNIT = 0.012; // leve, antisimétrico (soma 0)
const POSTURE_MAX = 1.5; // multiplicador nas pontas (all-in / retranca)

export function clampN(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Centra uma matriz nas duas margens (remove o efeito principal "estilo X é
// bom em geral", preserva a interação). Garante linhas e colunas com soma ~0,
// que é o alvo de balanceamento. Usada só no cálculo numérico de força; a UI
// mostra o sinal do desenho original (futebol real).
function doubleCenter<R extends string, C extends string>(m: Record<R, Record<C, number>>): Record<R, Record<C, number>> {
  const rows = Object.keys(m) as R[];
  const cols = Object.keys(m[rows[0]]) as C[];
  const out = Object.fromEntries(rows.map((r) => [r, { ...m[r] }])) as Record<R, Record<C, number>>;
  for (let it = 0; it < 12; it++) {
    for (const r of rows) { const mean = cols.reduce((a, c) => a + out[r][c], 0) / cols.length; for (const c of cols) out[r][c] -= mean; }
    for (const c of cols) { const mean = rows.reduce((a, r) => a + out[r][c], 0) / rows.length; for (const r of rows) out[r][c] -= mean; }
  }
  return out;
}
const C1c = doubleCenter(C1), C2c = doubleCenter(C2), C3c = doubleCenter(C3);
const E1c = doubleCenter(E1), E2c = doubleCenter(E2);

// Postura: multiplica um lado, divide o outro. p01 em [0,1]; 0.5 = neutro.
// O lado oposto cai um pouco mais rápido do que o escolhido sobe (expoente 1.25):
// assim a postura é "nem boa nem ruim" em pontos esperados (atacar muito abre as
// costas), em vez de premiar sempre quem ataca.
export function postureMul(postura: number): { off: number; def: number } {
  const p01 = clampN(postura, 0, 100) / 100;
  const off = Math.pow(POSTURE_MAX, 2 * p01 - 1); // 1/M .. M
  return { off, def: Math.pow(off, -1.25) };
}

// Encaixe leve formação × formação, antisimétrico (a vantagem de A é a desvantagem de B).
function formVsForm(my: Form, opp: Form): number {
  return clampN((FORM_OI[my] - FORM_OI[opp]) * FORM_VS_FORM_UNIT * 0.5, -0.04, 0.04);
}

// ---------------------------------------------------------------- coerência / encaixe
// Coerência ofensiva: formação combina com o estilo com bola.
export function coherenceAtk(t: Tactic): number {
  return C1c[t.form][t.comBola] * UNIT;
}
// Coerência defensiva: formação combina com o estilo sem bola e com a altura de bloco.
export function coherenceDef(t: Tactic): number {
  return (C2c[t.form][t.semBola] + C3c[t.semBola][t.bloco]) * UNIT;
}
// Encaixe ofensivo: meu ataque contra a defesa e o bloco do rival, mais o leve forma×forma.
export function encaixeAtk(me: Tactic, opp: Tactic): number {
  return (E1c[me.comBola][opp.semBola] + E2c[me.comBola][opp.bloco]) * UNIT + formVsForm(me.form, opp.form);
}
// Encaixe defensivo: minha defesa resistindo ao ataque do rival (sinal invertido).
export function encaixeDef(me: Tactic, opp: Tactic): number {
  return -(E1c[opp.comBola][me.semBola] + E2c[opp.comBola][me.bloco]) * UNIT;
}

// ---------------------------------------------------------------- força efetiva
export interface SideStrength {
  off: number;   // potencial ofensivo efetivo
  def: number;   // solidez defensiva efetiva
  paceLean: number; // tendência de ritmo aberto (+) ou truncado (−)
}

const ATK_FROM = (t: TeamLite) => 0.62 * t.a + 0.38 * t.m;
const DEF_FROM = (t: TeamLite) => 0.62 * t.d + 0.38 * t.m;

// Ritmo: posse e bloco alto abrem o jogo; bloco baixo e contra truncam.
const PACE_COMBOLA: Record<ComBola, number> = { posse:+0.3, vertical:+0.5, bola_longa:+0.2, contra:-0.2, drible:+0.1 };
const PACE_BLOCO: Record<Bloco, number> = { alto:+0.5, medio:0, baixo:-0.5 };

// archUnits: bônus do arquétipo do treinador, em unidades de sinal (0 = sem perfil).
export function sideStrength(team: TeamLite, me: Tactic, opp: Tactic, oppTeam: TeamLite, archUnits = 0): SideStrength {
  const pm = postureMul(me.postura);
  const offTac = W_TACTIC * (coherenceAtk(me) + encaixeAtk(me, opp) + archUnits * UNIT * 0.6);
  const defTac = W_TACTIC * (coherenceDef(me) + encaixeDef(me, opp) + archUnits * UNIT * 0.4);
  // bloco alto rende posse/território (benefício do pressionador), com custo físico implícito.
  const blocoTerr = me.bloco === "alto" ? 0.02 : me.bloco === "baixo" ? -0.01 : 0;
  const off = ATK_FROM(team) * pm.off * (1 + offTac + blocoTerr);
  const def = DEF_FROM(team) * pm.def * (1 + defTac);
  const paceLean = PACE_COMBOLA[me.comBola] + PACE_BLOCO[me.bloco] + (me.postura - 50) / 100;
  void oppTeam;
  return { off, def, paceLean };
}

// ---------------------------------------------------------------- sinais para a UI
export type SignalLevel = "pp" | "p" | "z" | "m" | "mm"; // forte+ , + , neutro , − , −−
export interface Signal { level: SignalLevel; }

export function toSignal(raw: number): SignalLevel {
  // raw em unidades de sinal (não fração). Mapeia para os 5 estados.
  if (raw >= 1.5) return "pp";
  if (raw >= 0.5) return "p";
  if (raw > -0.5) return "z";
  if (raw > -1.5) return "m";
  return "mm";
}

// Coerências individuais ANTES do jogo (tática às cegas), sem o rival.
export function coherenceSignals(t: Tactic): { key: string; level: SignalLevel }[] {
  return [
    { key: "formacao_combola", level: toSignal(C1[t.form][t.comBola]) },
    { key: "formacao_sembola", level: toSignal(C2[t.form][t.semBola]) },
    { key: "sembola_bloco", level: toSignal(C3[t.semBola][t.bloco]) },
  ];
}

// Encaixes individuais NO INTERVALO (rival revelado).
export function matchupSignals(me: Tactic, opp: Tactic): { key: string; level: SignalLevel }[] {
  return [
    { key: "ataque_vs_defesa", level: toSignal(E1[me.comBola][opp.semBola]) },
    { key: "defesa_vs_ataque", level: toSignal(-E1[opp.comBola][me.semBola]) },
    { key: "ataque_vs_bloco", level: toSignal(E2[me.comBola][opp.bloco]) },
    { key: "ataque_rival_vs_meu_bloco", level: toSignal(-E2[opp.comBola][me.bloco]) },
    { key: "formacao_vs_formacao", level: toSignal((FORM_OI[me.form] - FORM_OI[opp.form]) / 2) },
  ];
}

// ---------------------------------------------------------------- presets (modo rápido)
export type PresetKey = "mandaNoJogo" | "mordeEAcelera" | "ganharSofrendo" | "furaRetranca" | "fecharCompetir" | "bolaLongaSegunda";
export const PRESETS: Record<PresetKey, { nome: string; linha: string; t: Omit<Tactic,"postura"> & { postura: number } }> = {
  mandaNoJogo:      { nome: "Manda no jogo", linha: "Posse e meio forte", t: { form:"4-3-3", comBola:"posse", semBola:"zona", bloco:"medio", postura:62 } },
  mordeEAcelera:    { nome: "Morde e acelera", linha: "Pressão e verticalidade", t: { form:"3-4-3", comBola:"vertical", semBola:"mista", bloco:"alto", postura:66 } },
  ganharSofrendo:   { nome: "Copa se ganha sofrendo", linha: "Bloco e contra", t: { form:"5-3-2", comBola:"contra", semBola:"libero", bloco:"baixo", postura:30 } },
  furaRetranca:     { nome: "Fura retranca", linha: "Drible e presença", t: { form:"4-2-4", comBola:"drible", semBola:"mista", bloco:"medio", postura:74 } },
  fecharCompetir:   { nome: "Fechar e competir", linha: "Compacto, morde no gatilho", t: { form:"4-5-1", comBola:"contra", semBola:"zona", bloco:"medio", postura:42 } },
  bolaLongaSegunda: { nome: "Bola longa e segunda bola", linha: "Direto e disputa", t: { form:"4-4-2", comBola:"bola_longa", semBola:"mista", bloco:"medio", postura:50 } },
};
export function tacticFromPreset(k: PresetKey): Tactic { return { ...PRESETS[k].t }; }

// Exporta tabelas para o harness de balanceamento.
export const _matrices = { C1, C2, C3, E1, E2, FORM_OI, UNIT, W_TACTIC };
