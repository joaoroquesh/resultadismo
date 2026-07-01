// Ponte entre os dados do Maneiger (edições, seleções, escudos) e o motor tático
// reformulado. Reaproveita o carregamento de dados do manager no ar (engine.ts:
// FORMATS, poolForYear, teamBySlug, TIER_LABEL) e o tipo Team; o motor só precisa
// do TeamLite {a,m,d,o}. Nada de número cru de tática vaza pra UI: só overall,
// forças (ATA/MEI/DEF/FIS) e % de postura.
import type { Team, Edition, Tier } from "../types";
import { FORMATS, poolForYear, TIER_LABEL } from "../engine";
import type { TeamLite, Form, ComBola, SemBola, Bloco } from "./tactics.ts";

export type { Team, Edition, Tier };
export { TIER_LABEL };

// Lista de edições, da mais recente pra mais antiga (igual ao seletor do no ar).
export function editionsDesc(): Edition[] {
  return FORMATS.slice().sort((a, b) => b.year - a.year);
}

// Seleções de uma edição, ordenadas por força (overall) desc.
export function teamsForYear(year: number): Team[] {
  return poolForYear(year);
}

// O Brasil daquela edição (para o atalho "Jogar com o Brasil"). Em algumas edições
// (ex.: 2026) o slug vem com sufixo de ano ("brasil2026"); então buscamos no pool do
// ano casando o slug SEM os 4 dígitos finais de ano contra "brasil".
export function brazilForYear(year: number): Team | null {
  const pool = poolForYear(year);
  for (const t of pool) {
    if (t.s.replace(/\d{4}$/, "") === "brasil") return t;
  }
  return null;
}

// Edição mais recente que tem o Brasil (atalho "Jogar Mata-Mata 2026" com Brasil).
export function latestEditionWithBrazil(): { edition: Edition; brasil: Team } | null {
  for (const ed of editionsDesc()) {
    const br = brazilForYear(ed.year);
    if (br) return { edition: ed, brasil: br };
  }
  return null;
}

// Team (formato do app) -> TeamLite (o que o motor consome). a/m/d/o já batem.
export function toLite(t: Team): TeamLite {
  return { a: t.a, m: t.m, d: t.d, o: t.o };
}

// FIS (físico) não é um campo do Team: derivamos de forma estável e leiga a partir
// de meio + defesa (entrega/corrida). NÃO entra no motor; é só leitura pro card.
export function fisFor(t: Team): number {
  return Math.round((t.m * 0.55 + t.d * 0.45));
}

// Sigla de 3 letras pro placar (FIFA 2026). Usa um override curado pros casos em
// que as 3 primeiras letras confundem (ex.: dois países começando igual).
const SIGLA_OVERRIDE: Record<string, string> = {
  brasil: "BRA", argentina: "ARG", uruguai: "URU", franca: "FRA", alemanha: "ALE",
  alemanhaocidental: "RFA", alemanhaoriental: "RDA", italia: "ITA", espanha: "ESP",
  inglaterra: "ING", holanda: "HOL", portugal: "POR", belgica: "BEL", croacia: "CRO",
  mexico: "MEX", chile: "CHI", colombia: "COL", suecia: "SUE", suica: "SUI",
  hungria: "HUN", austria: "AUT", urss: "URS", russia: "RUS", polonia: "POL",
  dinamarca: "DIN", estadosunidos: "EUA", eua: "EUA", japao: "JAP", coreiadosul: "COR",
  coreiadonorte: "PRK", nigeria: "NGA", camaroes: "CAM", gana: "GAN", senegal: "SEN",
  marrocos: "MAR", tunisia: "TUN", argelia: "ARG2", egito: "EGI", peru: "PER",
  paraguai: "PAR", bolivia: "BOL", equador: "EQU", costarica: "CRC", australia: "AUS",
  escocia: "ESC", romenia: "ROM", bulgaria: "BUL", iugoslavia: "IUG", tchecoslovaquia: "TCH",
  tchequia: "TCH", noruega: "NOR", irlanda: "IRL", turquia: "TUR", arabiasaudita: "ARA",
  ira: "IRA", iran: "IRA", china: "CHN", catar: "CAT", canada: "CAN", curacao: "CUR",
  caboverde: "CAB", costadomarfim: "CIV", africadosul: "AFS", paisdegales: "GAL",
  eslovenia: "ESL", ucrania: "UCR", grecia: "GRE", jamaica: "JAM", honduras: "HON",
  kuwait: "KUW", novazelandia: "NZL", elsalvador: "SAL", iraque: "IRQ", angola: "ANG",
  togo: "TOG", trinidadetobago: "TRI", haiti: "HAI", zaire: "ZAI", cuba: "CUB",
  emiradosarabes: "EAU", serviaemontenegro: "SCG", servia: "SRV", eslovaquia: "ESQ",
  irlandadonorte: "IRN", uzbequistao: "UZB", jordania: "JOR", panama: "PAN", israel: "ISR",
};

function normSlug(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function sigla(team: Team): string {
  const k = normSlug(team.s || team.n);
  if (SIGLA_OVERRIDE[k]) return SIGLA_OVERRIDE[k];
  return team.n.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase();
}

// ================================================================ rótulos de tática
// Nomes leigos das opções do motor. O motor usa slugs (posse, zona, alto...); a UI
// mostra estes. Curtos e escaneáveis, sem em dash, sem jargão de motor.
export const FORM_LABEL: Record<Form, string> = {
  "4-2-4": "4-2-4", "3-4-3": "3-4-3", "4-3-3": "4-3-3", "3-5-2": "3-5-2",
  "4-4-2": "4-4-2", "4-5-1": "4-5-1", "5-3-2": "5-3-2", "5-4-1": "5-4-1", "6-3-1": "6-3-1",
};

// Grid 3x3 da formação: linha = vocação (ofensiva / equilíbrio / defensiva).
export const FORM_GRID: { key: string; label: string; hint: string; forms: Form[] }[] = [
  { key: "ofe", label: "Ofensiva", hint: "peso no ataque", forms: ["4-2-4", "3-4-3", "4-3-3"] },
  { key: "equ", label: "Equilíbrio", hint: "peso no meio", forms: ["3-5-2", "4-4-2", "4-5-1"] },
  { key: "def", label: "Defensiva", hint: "peso na defesa", forms: ["5-3-2", "5-4-1", "6-3-1"] },
];

export const COMBOLA_LABEL: Record<ComBola, string> = {
  posse: "Posse", vertical: "Vertical", bola_longa: "Bola longa", contra: "Contra-ataque", drible: "Drible",
};
export const COMBOLA_DESC: Record<ComBola, string> = {
  posse: "toque e paciência",
  vertical: "rápido e direto",
  bola_longa: "chuveirinho na área",
  contra: "explode no espaço",
  drible: "no pé do craque",
};

export const SEMBOLA_LABEL: Record<SemBola, string> = {
  zona: "Zona", individual: "Individual", mista: "Mista", libero: "Líbero", dobra: "Dobra",
};
export const SEMBOLA_DESC: Record<SemBola, string> = {
  zona: "cada um cobre um espaço",
  individual: "cada um cola no homem",
  mista: "zona com vigias",
  libero: "um varredor atrás",
  dobra: "dois homens na bola",
};

export const BLOCO_LABEL: Record<Bloco, string> = { alto: "Alto", medio: "Médio", baixo: "Baixo" };
export const BLOCO_DESC: Record<Bloco, string> = {
  alto: "marca a saída do rival lá em cima",
  medio: "espera no meio-campo",
  baixo: "fecha perto da própria área",
};

// Postura é o único número de intensidade exposto (% de postura). Zona descritiva
// pro rótulo curto.
export function posturaZone(v: number): string {
  if (v >= 67) return "Ofensiva";
  if (v <= 33) return "Recuada";
  return "Equilíbrio";
}
