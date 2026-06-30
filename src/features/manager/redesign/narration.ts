// Narração boleira, breve, com concordância de gênero (o Brasil, a Suécia, os Estados Unidos).
// A transmissão não anuncia o que mudou na estatística: a ligação é por trás.
import type { MatchEvent, EventKind } from "./sim.ts";

export type Artigo = "o" | "a" | "os" | "as";

// Overrides para casos irregulares (plural, multi-palavra, exceções de gênero).
const ARTIGO_OVERRIDE: Record<string, Artigo> = {
  "estados unidos": "os", "emirados arabes unidos": "os", "estados unidos da america": "os",
  "africa do sul": "a", "coreia do sul": "a", "coreia do norte": "a", "arabia saudita": "a",
  "costa do marfim": "a", "republica tcheca": "a", "republica dominicana": "a", "bosnia e herzegovina": "a",
  "pais de gales": "o", "el salvador": "o", "congo": "o", "rd congo": "a", "haiti": "o", "catar": "o",
  "ira": "o", "iraque": "o", "irã": "o", "egito": "o", "japao": "o", "japão": "o", "senegal": "o",
  "equador": "o", "canada": "o", "canadá": "o", "uruguai": "o", "paraguai": "o", "chile": "o",
  "peru": "o", "panama": "o", "mexico": "o", "méxico": "o", "marrocos": "o", "camaroes": "os",
  "camarões": "os", "gana": "o", "uzbequistao": "o", "curacao": "o", "cabo verde": "o",
};

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function artigo(nome: string): Artigo {
  const k = norm(nome);
  if (ARTIGO_OVERRIDE[k]) return ARTIGO_OVERRIDE[k];
  // heurística: termina em "a" => feminino; senão masculino.
  return /a$/.test(k) ? "a" : "o";
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// "o Brasil", "a Suécia". Para início de frase use comNome(.., true).
export function comNome(nome: string, inicio = false): string {
  const a = artigo(nome);
  return (inicio ? cap(a) : a) + " " + nome;
}

const pick = (arr: string[], r: number) => arr[Math.floor(r * arr.length) % arr.length];

// Bancos por tipo de evento. {T} = "o Brasil"/"a Suécia" (com artigo). Verbos neutros.
const BANK: Partial<Record<EventKind, string[]>> = {
  inicio: ["Bola rolando.", "Começa o jogo.", "Tá valendo, apita o juiz."],
  grande_chance: ["{T} chega com perigo!", "Grande chance para {T}!", "{T} assusta a defesa!"],
  gol: ["Gooo! {T} balança a rede!", "{T} não perdoa, é gol!", "Pode comemorar, gol {DE}!"],
  defesa: ["O goleiro pega em cima da linha!", "Defendeu! Que mão.", "{T} para no goleiro."],
  finaliza_fora: ["{T} manda por cima.", "Tirou tinta da trave, {T}.", "Pra fora, {T} lamenta."],
  escanteio: ["Na pressão, escanteio para {T}.", "Tira a zaga, escanteio {DE}."],
  falta: ["Falta dura, juiz marca.", "Para o jogo, falta {DE}.", "Entrada firme, falta marcada."],
  intervalo: ["Fim do primeiro tempo.", "Vão pro vestiário."],
  fim: ["Fim de jogo!", "Acabou, apita o árbitro."],
};

// Gera o texto de um evento. teams = [nomeA, nomeB]. r = aleatório estável (0..1).
export function narrate(e: MatchEvent, teams: [string, string], r: number): string {
  const bank = BANK[e.kind];
  if (!bank) return "";
  let s = pick(bank, r);
  if (e.side === 0 || e.side === 1) {
    const nome = teams[e.side];
    s = s.replace("{T}", comNome(nome, /^\{T\}/.test(s))).replace("{DE}", "d" + artigo(nome) + " " + nome);
  }
  return s;
}

// Quais eventos entram na transmissão (narrate=true já vem do motor); aqui só formatamos.
export function buildTicker(events: MatchEvent[], teams: [string, string], seed: number): MatchEvent[] {
  return events.filter((e) => e.narrate).map((e, i) => ({
    ...e,
    text: narrate(e, teams, ((seed ^ (e.minute * 2654435761 + i)) >>> 0) / 4294967296),
  }));
}
