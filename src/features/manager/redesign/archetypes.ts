// Arquétipos de treinador (PROPOSTA para validação). Cada um dá bônus leve a
// algumas formações e estilos, penalidade leve a outros, neutro na maior parte.
// Opcional: dá para jogar sem perfil. Inspirados em treinadores reais.
import type { Form, ComBola, Bloco, Tactic } from "./tactics.ts";

export type ArchetypeKey = "posicional" | "reativo" | "intenso" | "equilibrista" | "relacional" | "copeiro";

export interface Archetype {
  key: ArchetypeKey;
  nome: string;
  lente: string;       // como vê futebol
  treinadores: string[]; // inspiração real
  forms: Form[];       // formações bonificadas
  comBola: ComBola[];  // estilos com bola bonificados
  bloco: Bloco[];      // alturas de bloco bonificadas
  penaliza: { comBola?: ComBola[]; bloco?: Bloco[] };
  brilha: string;      // contexto onde rende mais
}

export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  posicional:   { key:"posicional", nome:"Posicional", lente:"Controle, posse e estrutura.", treinadores:["Guardiola","Del Bosque","Luis Enrique"], forms:["4-3-3","3-5-2"], comBola:["posse","vertical"], bloco:["alto","medio"], penaliza:{ comBola:["bola_longa"] }, brilha:"Seleções de meio forte." },
  reativo:      { key:"reativo", nome:"Reativo", lente:"Bloco, transição e gestão de risco.", treinadores:["Mourinho","Simeone","Capello"], forms:["4-4-2","5-3-2","4-5-1"], comBola:["contra","bola_longa"], bloco:["medio","baixo"], penaliza:{ comBola:["posse"] }, brilha:"Zebra e mata-mata." },
  intenso:      { key:"intenso", nome:"Intenso", lente:"Intensidade, pressão e transição rápida.", treinadores:["Klopp","Bielsa","Nagelsmann"], forms:["4-3-3","3-4-3"], comBola:["vertical","contra"], bloco:["alto"], penaliza:{ bloco:["baixo"] }, brilha:"Elenco físico." },
  equilibrista: { key:"equilibrista", nome:"Equilibrista", lente:"Adapta sem perder o desenho.", treinadores:["Ancelotti","Zagallo","Löw"], forms:["4-4-2","3-5-2"], comBola:["posse","vertical"], bloco:["medio"], penaliza:{}, brilha:"Grupos parelhos." },
  relacional:   { key:"relacional", nome:"Relacional", lente:"Aproximações, associação e drible.", treinadores:["Diniz","Menotti","Scaloni"], forms:["4-2-4","3-4-3"], comBola:["drible","posse"], bloco:["medio"], penaliza:{ comBola:["bola_longa"] }, brilha:"Talento técnico." },
  copeiro:      { key:"copeiro", nome:"Copeiro", lente:"Mata-mata, nervo e momento.", treinadores:["Scolari","Lippi","Deschamps"], forms:["5-3-2","4-5-1","4-4-2"], comBola:["contra"], bloco:["baixo","medio"], penaliza:{ comBola:["drible"] }, brilha:"Copa curta e pressão." },
};

export const ARCHETYPE_LIST = Object.values(ARCHETYPES);

// Bônus de coerência do arquétipo para uma tática (em unidades de sinal).
// Pequeno: dá tempero, não decide. Some 0 em média entre arquétipos.
export function archetypeBonus(arch: ArchetypeKey | null, t: Tactic): number {
  if (!arch) return 0;
  const a = ARCHETYPES[arch];
  let s = 0;
  if (a.forms.includes(t.form)) s += 0.6;
  if (a.comBola.includes(t.comBola)) s += 0.6;
  if (a.bloco.includes(t.bloco)) s += 0.4;
  if (a.penaliza.comBola?.includes(t.comBola)) s -= 0.6;
  if (a.penaliza.bloco?.includes(t.bloco)) s -= 0.5;
  return s;
}

// Dilemas para descobrir o arquétipo (5 perguntas, 3 opções). Pontua cada arquétipo.
export interface Dilema { pergunta: string; opcoes: { texto: string; pontos: Partial<Record<ArchetypeKey, number>> }[]; }
export const DILEMAS: Dilema[] = [
  { pergunta: "Você tem uma seleção tecnicamente superior.", opcoes: [
    { texto: "Mando no jogo, controlo a bola.", pontos: { posicional: 2, relacional: 1 } },
    { texto: "Acelero antes que se organizem.", pontos: { intenso: 2 } },
    { texto: "Controlo sem me expor.", pontos: { equilibrista: 2, reativo: 1 } } ] },
  { pergunta: "O rival pressiona alto.", opcoes: [
    { texto: "Saio tocando e atraio.", pontos: { posicional: 2 } },
    { texto: "Bola longa nas costas.", pontos: { reativo: 1, copeiro: 1 } },
    { texto: "Aproximo e improviso.", pontos: { relacional: 2 } } ] },
  { pergunta: "Perdeu a bola no ataque.", opcoes: [
    { texto: "Pressiono na hora.", pontos: { intenso: 2 } },
    { texto: "Recomponho o bloco.", pontos: { reativo: 2 } },
    { texto: "Depende do placar.", pontos: { copeiro: 2, equilibrista: 1 } } ] },
  { pergunta: "Seu craque pede liberdade.", opcoes: [
    { texto: "Libero e aproximo.", pontos: { relacional: 2 } },
    { texto: "Libero, mas exijo pressão.", pontos: { intenso: 1, posicional: 1 } },
    { texto: "O sistema vem primeiro.", pontos: { equilibrista: 2 } } ] },
  { pergunta: "Você é zebra no mata-mata.", opcoes: [
    { texto: "Bloco baixo e contra.", pontos: { reativo: 2, copeiro: 1 } },
    { texto: "Pressão surpresa.", pontos: { intenso: 1 } },
    { texto: "Levo pro detalhe, pênalti.", pontos: { copeiro: 2 } } ] },
];

export function resolveArchetype(scores: Partial<Record<ArchetypeKey, number>>): ArchetypeKey {
  let best: ArchetypeKey = "equilibrista", bestV = -1;
  for (const a of ARCHETYPE_LIST) { const v = scores[a.key] || 0; if (v > bestV) { bestV = v; best = a.key; } }
  return best;
}
