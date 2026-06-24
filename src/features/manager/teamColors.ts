// Cores das seleções para os cards de nome do placar (item 5). Curado à mão a
// partir das cores oficiais de cada seleção — o João é dono da identidade visual.
// Chave = slug canônico (mesmo `teamCrestSlug` dos escudos). `bg`/`text` já com
// contraste testado (texto sobre amarelo/laranja é o caso difícil).
//
// Os cards do placar vivem SEMPRE sobre o board escuro (--color-board, igual nos
// dois temas), então estas cores ficam legíveis tanto no claro quanto no escuro.
import { teamCrestSlug } from "@/lib/teamCrests";

export interface TeamColor {
  bg: string;
  text: string;
}

// Mapa curado slug→{bg,text}. Inclui as chaves de ALIAS (eua, iran, capeverde,
// republicatcheca) com as MESMAS cores do destino canônico (item 3/5 alinhados).
export const TEAM_COLORS: Record<string, TeamColor> = {
  uruguai: { bg: "#5BB8E6", text: "#0C2340" },
  argentina: { bg: "#75AADB", text: "#0C2340" },
  estadosunidos: { bg: "#0A3161", text: "#FFFFFF" },
  iugoslavia: { bg: "#003DA5", text: "#FFFFFF" },
  brasil: { bg: "#FFDF00", text: "#009C3B" },
  chile: { bg: "#0039A6", text: "#FFFFFF" },
  franca: { bg: "#1B2A6B", text: "#FFFFFF" },
  paraguai: { bg: "#D52B1E", text: "#FFFFFF" },
  romenia: { bg: "#002B7F", text: "#FCD116" },
  peru: { bg: "#D91023", text: "#FFFFFF" },
  belgica: { bg: "#1A1A1A", text: "#FDDA24" },
  mexico: { bg: "#006847", text: "#FFFFFF" },
  bolivia: { bg: "#D52B1E", text: "#F9E300" },
  italia: { bg: "#1E6FD9", text: "#FFFFFF" },
  austria: { bg: "#ED2939", text: "#FFFFFF" },
  tchecoslovaquia: { bg: "#11457E", text: "#FFFFFF" },
  espanha: { bg: "#AA151B", text: "#F1BF00" },
  alemanha: { bg: "#161616", text: "#F6F6F6" },
  hungria: { bg: "#477050", text: "#FFFFFF" },
  suica: { bg: "#D52B1E", text: "#FFFFFF" },
  suecia: { bg: "#0066A6", text: "#FECC02" },
  holanda: { bg: "#F36C21", text: "#1A1A1A" },
  egito: { bg: "#CE1126", text: "#FFFFFF" },
  polonia: { bg: "#D4213D", text: "#FFFFFF" },
  noruega: { bg: "#BA0C2F", text: "#FFFFFF" },
  cuba: { bg: "#002A8F", text: "#FFFFFF" },
  indiasorientais: { bg: "#CE1126", text: "#FFFFFF" },
  inglaterra: { bg: "#F2F2F2", text: "#C8102E" },
  alemanhaocidental: { bg: "#161616", text: "#FFFFFF" },
  escocia: { bg: "#0065BF", text: "#FFFFFF" },
  turquia: { bg: "#E30A17", text: "#FFFFFF" },
  coreiadosul: { bg: "#0A3161", text: "#FFFFFF" },
  urss: { bg: "#CC0000", text: "#FFD700" },
  paisdegales: { bg: "#C8102E", text: "#00B140" },
  irlandadonorte: { bg: "#00843D", text: "#FFFFFF" },
  bulgaria: { bg: "#00966E", text: "#FFFFFF" },
  colombia: { bg: "#FCD116", text: "#003893" },
  portugal: { bg: "#046A38", text: "#FFE000" },
  coreiadonorte: { bg: "#024FA2", text: "#FFFFFF" },
  israel: { bg: "#0038B8", text: "#FFFFFF" },
  marrocos: { bg: "#C1272D", text: "#FFFFFF" },
  elsalvador: { bg: "#0F47AF", text: "#FFFFFF" },
  alemanhaoriental: { bg: "#1A1A1A", text: "#FFCE00" },
  haiti: { bg: "#00209F", text: "#FFFFFF" },
  australia: { bg: "#00843D", text: "#FFCD00" },
  zaire: { bg: "#009543", text: "#FCD116" },
  tunisia: { bg: "#E70013", text: "#FFFFFF" },
  ira: { bg: "#239F40", text: "#FFFFFF" },
  argelia: { bg: "#006233", text: "#FFFFFF" },
  camaroes: { bg: "#007A5E", text: "#FCD116" },
  honduras: { bg: "#0073CF", text: "#FFFFFF" },
  kuwait: { bg: "#007A3D", text: "#FFFFFF" },
  novazelandia: { bg: "#1A1A1A", text: "#FFFFFF" },
  dinamarca: { bg: "#C8102E", text: "#FFFFFF" },
  canada: { bg: "#D52B1E", text: "#FFFFFF" },
  iraque: { bg: "#CE1126", text: "#FFFFFF" },
  irlanda: { bg: "#169B62", text: "#FF883E" },
  costarica: { bg: "#002B7F", text: "#FFFFFF" },
  emiradosarabes: { bg: "#00732F", text: "#FFFFFF" },
  nigeria: { bg: "#008751", text: "#FFFFFF" },
  russia: { bg: "#0039A6", text: "#FFFFFF" },
  arabiasaudita: { bg: "#006C35", text: "#FFFFFF" },
  grecia: { bg: "#0D5EAF", text: "#FFFFFF" },
  croacia: { bg: "#D10000", text: "#FFFFFF" },
  japao: { bg: "#BC002D", text: "#FFFFFF" },
  africadosul: { bg: "#007A4D", text: "#FFB81C" },
  jamaica: { bg: "#009B3A", text: "#FED100" },
  senegal: { bg: "#00853F", text: "#FDEF42" },
  equador: { bg: "#FFD100", text: "#034EA2" },
  eslovenia: { bg: "#005DA4", text: "#FFFFFF" },
  china: { bg: "#DE2910", text: "#FFDE00" },
  republicatcheca: { bg: "#11457E", text: "#FFFFFF" },
  costadomarfim: { bg: "#F77F00", text: "#FFFFFF" },
  gana: { bg: "#006B3F", text: "#FCD116" },
  ucrania: { bg: "#0057B7", text: "#FFD700" },
  serviaemontenegro: { bg: "#C6363C", text: "#FFFFFF" },
  angola: { bg: "#CE1126", text: "#FFCB00" },
  togo: { bg: "#006A4E", text: "#FFCE00" },
  trinidadetobago: { bg: "#DA1A35", text: "#FFFFFF" },
  servia: { bg: "#C6363C", text: "#FFFFFF" },
  eslovaquia: { bg: "#0B4EA2", text: "#FFFFFF" },
  bosniaeherzegovina: { bg: "#002395", text: "#FECB00" },
  islandia: { bg: "#02529C", text: "#FFFFFF" },
  panama: { bg: "#005293", text: "#FFFFFF" },
  catar: { bg: "#8A1538", text: "#FFFFFF" },
  eua: { bg: "#0A3161", text: "#FFFFFF" },
  iran: { bg: "#239F40", text: "#FFFFFF" },
  uzbequistao: { bg: "#0099B5", text: "#FFFFFF" },
  capeverde: { bg: "#003893", text: "#FFFFFF" },
  jordania: { bg: "#007A3D", text: "#FFFFFF" },
  curacao: { bg: "#002B7F", text: "#FFE800" },
};

// ALIAS de slug — mesmos do ManagerCrest (item 3). Alguns ratings usam um slug e
// o asset/cor vivem em outro. Resolvemos os dois lados.
const SLUG_ALIAS: Record<string, string> = {
  capeverde: "caboverde",
  estadosunidos: "eua",
  iran: "ira",
  republicatcheca: "tchequia",
};

// Pílula neutra (sobre o board escuro) para slugs sem cor curada — legível e calma.
const FALLBACK: TeamColor = { bg: "rgba(255,255,255,0.10)", text: "#FFFFFF" };

/** Cores do card do time. Tenta o slug do rating e o slug do escudo (alias), com fallback neutro. */
export function teamColors(slug: string | null | undefined, name?: string | null): TeamColor {
  const direct = teamCrestSlug(slug);
  if (direct && TEAM_COLORS[direct]) return TEAM_COLORS[direct];
  // alias do slug do rating → slug do asset (e vice-versa, ambos podem estar no mapa)
  if (direct && SLUG_ALIAS[direct] && TEAM_COLORS[SLUG_ALIAS[direct]]) return TEAM_COLORS[SLUG_ALIAS[direct]];
  const byName = teamCrestSlug(name);
  if (byName && TEAM_COLORS[byName]) return TEAM_COLORS[byName];
  if (byName && SLUG_ALIAS[byName] && TEAM_COLORS[SLUG_ALIAS[byName]]) return TEAM_COLORS[SLUG_ALIAS[byName]];
  return FALLBACK;
}
