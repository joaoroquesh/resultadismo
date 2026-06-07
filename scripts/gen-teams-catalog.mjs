// Builder do data/teams-catalog.json (Resultadismo).
// Lê public/teams, casa cada arquivo (por slug) com metadados ricos e emite o
// catálogo no schema combinado. Acrescenta as seleções da Copa 2026 que ainda
// não têm escudo (crest_file: null + crest_source com a bandeira no Wikimedia).
//
// Uso (na máquina do repo):  node scripts/gen-teams-catalog.mjs
import { readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Root do repo: pasta-pai de scripts/ (ou REPO_ROOT no ambiente, se definido).
const ROOT = process.env.REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const TEAMS_DIR = join(ROOT, "public", "teams");
const OUT_DIR = join(ROOT, "data");
const OUT_FILE = join(OUT_DIR, "teams-catalog.json");

// Slug IDÊNTICO ao do repo (scripts/gen-team-crests.mjs / teamCrests.ts).
const slug = (s) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Códigos de competição (provider_code ESPN), conforme o app.
const C = {
  serieA: "bra.1", serieB: "bra.2", serieC: "bra.3",
  paulista: "bra.camp.paulista", carioca: "bra.camp.carioca",
  mineiro: "bra.camp.mineiro", gaucho: "bra.camp.gaucho",
  copaBR: "bra.copa_do_brazil",
  liber: "conmebol.libertadores", sula: "conmebol.sudamericana", america: "conmebol.america",
  epl: "eng.1", laliga: "esp.1", itaA: "ita.1", bundes: "ger.1", ligue1: "fra.1",
  ucl: "uefa.champions", uel: "uefa.europa",
  wc: "fifa.world",
};

// Arquivos suspeitos (duplicata/typo): não viram entrada de time; só reportados.
const DUP = {
  "checa": "tchequia (duplicata/legado de Tchéquia)",
  "gilbratar": "gibraltar (typo de 'gibraltar')",
  "athleticmg": "atleticomg (typo de Atlético-MG)",
};

// META keyed pelo SLUG ATUAL do arquivo em public/teams.
// valor = [name_pt, short_pt, tla, country, kind, [competitions], [aliasesEN]]
const M = {
  // ---------- Brasil: clubes ----------
  abc: ["ABC", "ABC", "ABC", "Brasil", "club", [C.serieC, C.copaBR], ["ABC", "ABC FC", "ABC Natal"]],
  aguasanta: ["Água Santa", "Água Santa", null, "Brasil", "club", [C.paulista, C.copaBR], ["Agua Santa", "EC Água Santa"]],
  aguiademaraba: ["Águia de Marabá", "Águia de Marabá", null, "Brasil", "club", [C.copaBR], ["Aguia de Maraba"]],
  altos: ["Altos", "Altos", null, "Brasil", "club", [C.copaBR], ["Altos", "Atlético Altos"]],
  amazonas: ["Amazonas", "Amazonas", null, "Brasil", "club", [C.serieB, C.copaBR], ["Amazonas FC"]],
  americamg: ["América-MG", "América-MG", "AME", "Brasil", "club", [C.serieB, C.mineiro, C.copaBR], ["America Mineiro", "America-MG", "América Mineiro"]],
  americarn: ["América-RN", "América-RN", null, "Brasil", "club", [C.serieC, C.copaBR], ["America-RN", "America RN"]],
  aparecidense: ["Aparecidense", "Aparecidense", null, "Brasil", "club", [C.serieC, C.copaBR], ["Aparecidense", "Grêmio Aparecidense"]],
  athleticopr: ["Athletico-PR", "Athletico-PR", "CAP", "Brasil", "club", [C.serieB, C.copaBR, C.sula], ["Athletico Paranaense", "Athletico-PR", "Atletico Paranaense"]],
  atleticogo: ["Atlético-GO", "Atlético-GO", "ACG", "Brasil", "club", [C.serieB, C.copaBR], ["Atletico Goianiense", "Atletico-GO"]],
  atleticomg: ["Atlético-MG", "Atlético-MG", "CAM", "Brasil", "club", [C.serieA, C.mineiro, C.copaBR, C.sula], ["Atletico Mineiro", "Atletico-MG", "Atlético Mineiro"]],
  avai: ["Avaí", "Avaí", null, "Brasil", "club", [C.serieB, C.copaBR], ["Avai", "Avaí FC"]],
  bahia: ["Bahia", "Bahia", "BAH", "Brasil", "club", [C.serieA, C.copaBR, C.liber], ["Bahia", "EC Bahia"]],
  botafogo: ["Botafogo", "Botafogo", "BOT", "Brasil", "club", [C.serieA, C.carioca, C.copaBR, C.liber], ["Botafogo", "Botafogo RJ", "Botafogo-RJ", "Botafogo de Futebol e Regatas"]],
  botafogopb: ["Botafogo-PB", "Botafogo-PB", null, "Brasil", "club", [C.serieC, C.copaBR], ["Botafogo-PB", "Botafogo PB"]],
  botafogosp: ["Botafogo-SP", "Botafogo-SP", null, "Brasil", "club", [C.serieB, C.paulista, C.copaBR], ["Botafogo-SP", "Botafogo SP"]],
  brusque: ["Brusque", "Brusque", null, "Brasil", "club", [C.serieC, C.copaBR], ["Brusque", "Brusque FC"]],
  ceara: ["Ceará", "Ceará", "CEA", "Brasil", "club", [C.serieA, C.copaBR], ["Ceara", "Ceará SC"]],
  chapecoense: ["Chapecoense", "Chapecoense", "CHA", "Brasil", "club", [C.serieB, C.copaBR], ["Chapecoense", "Chapecoense AF"]],
  confianca: ["Confiança", "Confiança", null, "Brasil", "club", [C.serieC, C.copaBR], ["Confianca", "AD Confiança"]],
  corinthians: ["Corinthians", "Corinthians", "COR", "Brasil", "club", [C.serieA, C.paulista, C.copaBR, C.sula], ["Corinthians", "SC Corinthians"]],
  coritiba: ["Coritiba", "Coritiba", "CFC", "Brasil", "club", [C.serieB, C.copaBR], ["Coritiba", "Coritiba FC"]],
  crb: ["CRB", "CRB", null, "Brasil", "club", [C.serieB, C.copaBR], ["CRB", "Clube de Regatas Brasil"]],
  criciuma: ["Criciúma", "Criciúma", "CRI", "Brasil", "club", [C.serieB, C.copaBR], ["Criciuma", "Criciúma EC"]],
  cruzeiro: ["Cruzeiro", "Cruzeiro", "CRU", "Brasil", "club", [C.serieA, C.mineiro, C.copaBR, C.sula], ["Cruzeiro", "Cruzeiro EC"]],
  csa: ["CSA", "CSA", null, "Brasil", "club", [C.serieC, C.copaBR], ["CSA", "Centro Sportivo Alagoano"]],
  cuiaba: ["Cuiabá", "Cuiabá", "CUI", "Brasil", "club", [C.serieB, C.copaBR], ["Cuiaba", "Cuiabá EC"]],
  ferroviaria: ["Ferroviária", "Ferroviária", null, "Brasil", "club", [C.serieC, C.paulista, C.copaBR], ["Ferroviaria", "Ferroviária", "AFE"]],
  ferroviario: ["Ferroviário", "Ferroviário", null, "Brasil", "club", [C.serieC, C.copaBR], ["Ferroviario", "Ferroviário AC"]],
  flamengo: ["Flamengo", "Flamengo", "FLA", "Brasil", "club", [C.serieA, C.carioca, C.copaBR, C.liber], ["Flamengo", "CR Flamengo"]],
  fluminense: ["Fluminense", "Fluminense", "FLU", "Brasil", "club", [C.serieA, C.carioca, C.copaBR, C.liber], ["Fluminense", "Fluminense FC"]],
  fortaleza: ["Fortaleza", "Fortaleza", "FOR", "Brasil", "club", [C.serieA, C.copaBR, C.liber], ["Fortaleza", "Fortaleza EC"]],
  goias: ["Goiás", "Goiás", "GOI", "Brasil", "club", [C.serieB, C.copaBR], ["Goias", "Goiás EC"]],
  gremio: ["Grêmio", "Grêmio", "GRE", "Brasil", "club", [C.serieA, C.gaucho, C.copaBR, C.sula], ["Gremio", "Grêmio FBPA", "Gremio Porto Alegre"]],
  internacional: ["Internacional", "Internacional", "INT", "Brasil", "club", [C.serieA, C.gaucho, C.copaBR, C.liber], ["Internacional", "SC Internacional", "Inter Porto Alegre"]],
  juazeirense: ["Juazeirense", "Juazeirense", null, "Brasil", "club", [C.copaBR], ["Juazeirense"]],
  juventude: ["Juventude", "Juventude", "JUV", "Brasil", "club", [C.serieA, C.gaucho, C.copaBR], ["Juventude", "EC Juventude"]],
  maracana: ["Maracanã-CE", "Maracanã", null, "Brasil", "club", [C.copaBR], ["Maracana", "Maracanã EC"]],
  maringa: ["Maringá", "Maringá", null, "Brasil", "club", [C.serieC, C.copaBR], ["Maringa", "Maringá FC"]],
  mirassol: ["Mirassol", "Mirassol", null, "Brasil", "club", [C.serieA, C.paulista, C.copaBR], ["Mirassol", "Mirassol FC"]],
  nautico: ["Náutico", "Náutico", null, "Brasil", "club", [C.serieC, C.copaBR], ["Nautico", "Náutico Capibaribe"]],
  novorizontino: ["Novorizontino", "Novorizontino", null, "Brasil", "club", [C.serieB, C.paulista, C.copaBR], ["Novorizontino", "Grêmio Novorizontino"]],
  operario: ["Operário-PR", "Operário", null, "Brasil", "club", [C.serieB, C.copaBR], ["Operario", "Operário Ferroviário"]],
  palmeiras: ["Palmeiras", "Palmeiras", "PAL", "Brasil", "club", [C.serieA, C.paulista, C.copaBR, C.liber], ["Palmeiras", "SE Palmeiras"]],
  paysandu: ["Paysandu", "Paysandu", null, "Brasil", "club", [C.serieB, C.copaBR], ["Paysandu", "Paysandu SC"]],
  rbbragantino: ["Red Bull Bragantino", "Bragantino", "RBB", "Brasil", "club", [C.serieA, C.paulista, C.copaBR, C.sula], ["Red Bull Bragantino", "RB Bragantino", "Bragantino"]],
  remo: ["Remo", "Remo", null, "Brasil", "club", [C.serieB, C.copaBR], ["Remo", "Clube do Remo"]],
  retro: ["Retrô", "Retrô", null, "Brasil", "club", [C.serieC, C.copaBR], ["Retro", "Retrô FC"]],
  sampaio: ["Sampaio Corrêa", "Sampaio Corrêa", null, "Brasil", "club", [C.serieC, C.copaBR], ["Sampaio Correa", "Sampaio Corrêa FC"]],
  santos: ["Santos", "Santos", "SAN", "Brasil", "club", [C.serieA, C.paulista, C.copaBR], ["Santos", "Santos FC"]],
  saojosers: ["São José-RS", "São José-RS", null, "Brasil", "club", [C.gaucho, C.serieC], ["Sao Jose-RS", "São José EC"]],
  saopaulo: ["São Paulo", "São Paulo", "SAO", "Brasil", "club", [C.serieA, C.paulista, C.copaBR, C.liber], ["Sao Paulo", "São Paulo FC"]],
  sport: ["Sport", "Sport", "SPT", "Brasil", "club", [C.serieA, C.copaBR], ["Sport Recife", "Sport Club do Recife"]],
  vasco: ["Vasco da Gama", "Vasco", "VAS", "Brasil", "club", [C.serieA, C.carioca, C.copaBR], ["Vasco da Gama", "Vasco", "CR Vasco da Gama"]],
  vilanova: ["Vila Nova", "Vila Nova", null, "Brasil", "club", [C.serieB, C.copaBR], ["Vila Nova", "Vila Nova FC"]],
  vitoria: ["Vitória", "Vitória", "VIT", "Brasil", "club", [C.serieA, C.copaBR], ["Vitoria", "EC Vitória"]],
  voltaredonda: ["Volta Redonda", "Volta Redonda", null, "Brasil", "club", [C.carioca, C.serieC, C.copaBR], ["Volta Redonda", "Volta Redonda FC"]],
  capital: ["Capital-DF", "Capital", null, "Brasil", "club", [C.copaBR], ["Capital", "Capital CF"]],

  // ---------- Argentina ----------
  banfield: ["Banfield", "Banfield", null, "Argentina", "club", [], ["Banfield", "CA Banfield"]],
  bocajuniors: ["Boca Juniors", "Boca", "BOC", "Argentina", "club", [C.liber], ["Boca Juniors", "CA Boca Juniors"]],
  centralcordoba: ["Central Córdoba", "Central Córdoba", null, "Argentina", "club", [C.sula], ["Central Cordoba", "Central Córdoba SdE"]],
  defensayjusticia: ["Defensa y Justicia", "Defensa", null, "Argentina", "club", [C.sula], ["Defensa y Justicia"]],
  estudiantes: ["Estudiantes", "Estudiantes", null, "Argentina", "club", [C.liber], ["Estudiantes", "Estudiantes de La Plata"]],
  godoycruz: ["Godoy Cruz", "Godoy Cruz", null, "Argentina", "club", [C.sula], ["Godoy Cruz"]],
  huracan: ["Huracán", "Huracán", null, "Argentina", "club", [C.sula], ["Huracan", "CA Huracán"]],
  lanus: ["Lanús", "Lanús", null, "Argentina", "club", [C.sula], ["Lanus", "CA Lanús"]],
  racing: ["Racing", "Racing", null, "Argentina", "club", [C.liber], ["Racing Club", "Racing Avellaneda"]],
  riverplate: ["River Plate", "River", "RIV", "Argentina", "club", [C.liber], ["River Plate", "CA River Plate"]],
  talleres: ["Talleres", "Talleres", null, "Argentina", "club", [C.liber], ["Talleres", "Talleres de Córdoba"]],
  union: ["Unión Santa Fe", "Unión", null, "Argentina", "club", [C.sula], ["Union Santa Fe", "Unión de Santa Fe", "CA Unión"]],
  velezsarsfield: ["Vélez Sarsfield", "Vélez", null, "Argentina", "club", [C.liber], ["Velez Sarsfield", "Vélez"]],

  // ---------- Uruguai ----------
  cerrolargo: ["Cerro Largo", "Cerro Largo", null, "Uruguai", "club", [C.sula], ["Cerro Largo", "Cerro Largo FC"]],
  nacional: ["Nacional", "Nacional", null, "Uruguai", "club", [C.liber], ["Nacional", "Club Nacional de Football", "Nacional (URU)"]],
  penarol: ["Peñarol", "Peñarol", null, "Uruguai", "club", [C.liber], ["Penarol", "CA Peñarol"]],
  racinguru: ["Racing (URU)", "Racing Montevideo", null, "Uruguai", "club", [C.sula], ["Racing Montevideo", "Racing Club de Montevideo"]],
  wanderers: ["Montevideo Wanderers", "Wanderers", null, "Uruguai", "club", [C.sula], ["Montevideo Wanderers", "Wanderers"]],

  // ---------- Paraguai ----------
  cerroporteo: ["Cerro Porteño", "Cerro Porteño", null, "Paraguai", "club", [C.liber], ["Cerro Porteno", "Cerro Porteño"]],
  libertad: ["Libertad", "Libertad", null, "Paraguai", "club", [C.liber], ["Libertad", "Club Libertad"]],
  luqueno: ["Sportivo Luqueño", "Luqueño", null, "Paraguai", "club", [C.sula], ["Sportivo Luqueno", "Luqueño"]],
  olimpia: ["Olimpia", "Olimpia", null, "Paraguai", "club", [C.liber], ["Olimpia", "Club Olimpia"]],

  // ---------- Chile ----------
  colocolo: ["Colo-Colo", "Colo-Colo", null, "Chile", "club", [C.liber], ["Colo Colo", "Colo-Colo"]],
  iquique: ["Deportes Iquique", "Iquique", null, "Chile", "club", [C.sula], ["Deportes Iquique"]],
  palestino: ["Palestino", "Palestino", null, "Chile", "club", [C.sula], ["Palestino", "CD Palestino"]],
  unionespanola: ["Unión Española", "Unión Española", null, "Chile", "club", [C.sula], ["Union Espanola", "Unión Española"]],
  univdechile: ["Universidad de Chile", "U. de Chile", null, "Chile", "club", [C.liber, C.sula], ["Universidad de Chile", "U de Chile", "Universidad de Chile (CHI)"]],

  // ---------- Colômbia ----------
  americacali: ["América de Cali", "América de Cali", null, "Colômbia", "club", [C.liber, C.sula], ["America de Cali"]],
  atleticonacional: ["Atlético Nacional", "Atl. Nacional", null, "Colômbia", "club", [C.liber], ["Atletico Nacional", "Atlético Nacional (COL)"]],
  bucaramanga: ["Atlético Bucaramanga", "Bucaramanga", null, "Colômbia", "club", [C.liber], ["Atletico Bucaramanga", "Bucaramanga"]],
  oncecaldas: ["Once Caldas", "Once Caldas", null, "Colômbia", "club", [C.sula], ["Once Caldas"]],
  santafe: ["Independiente Santa Fe", "Santa Fe", null, "Colômbia", "club", [C.liber, C.sula], ["Santa Fe", "Independiente Santa Fe"]],

  // ---------- Peru ----------
  alianzalima: ["Alianza Lima", "Alianza Lima", null, "Peru", "club", [C.liber, C.sula], ["Alianza Lima"]],
  atleticograu: ["Atlético Grau", "Atlético Grau", null, "Peru", "club", [C.sula], ["Atletico Grau"]],
  cienciano: ["Cienciano", "Cienciano", null, "Peru", "club", [C.sula], ["Cienciano"]],
  melgar: ["Melgar", "Melgar", null, "Peru", "club", [C.sula], ["Melgar", "FBC Melgar"]],
  sptcristal: ["Sporting Cristal", "Sporting Cristal", null, "Peru", "club", [C.liber, C.sula], ["Sporting Cristal"]],
  universitario: ["Universitario", "Universitario", null, "Peru", "club", [C.liber], ["Universitario", "Universitario de Deportes"]],

  // ---------- Equador ----------
  barcelonaeqd: ["Barcelona de Guayaquil", "Barcelona SC", null, "Equador", "club", [C.liber], ["Barcelona SC", "Barcelona Guayaquil", "Barcelona (ECU)"]],
  inddelvalle: ["Independiente del Valle", "Ind. del Valle", null, "Equador", "club", [C.liber, C.sula], ["Independiente del Valle"]],
  ldu: ["LDU Quito", "LDU", null, "Equador", "club", [C.liber], ["LDU Quito", "Liga de Quito", "Liga Deportiva Universitaria"]],
  mushucruna: ["Mushuc Runa", "Mushuc Runa", null, "Equador", "club", [C.sula], ["Mushuc Runa"]],
  univcatolicaeqd: ["Universidad Católica (EQU)", "U. Católica", null, "Equador", "club", [C.sula], ["Universidad Catolica", "U. Católica (ECU)"]],

  // ---------- Bolívia ----------
  bolivar: ["Bolívar", "Bolívar", null, "Bolívia", "club", [C.liber], ["Bolivar", "Club Bolívar"]],
  sanjose: ["San José", "San José", null, "Bolívia", "club", [C.sula], ["San Jose", "Club San José", "San José (BOL)"]],

  // ---------- Venezuela ----------
  carabobo: ["Carabobo", "Carabobo", null, "Venezuela", "club", [C.liber], ["Carabobo", "Carabobo FC"]],
  caracas: ["Caracas", "Caracas", null, "Venezuela", "club", [C.sula], ["Caracas", "Caracas FC"]],
  deptachira: ["Deportivo Táchira", "Dep. Táchira", null, "Venezuela", "club", [C.liber, C.sula], ["Deportivo Tachira", "Dep. Táchira"]],
  puertocabello: ["Puerto Cabello", "Puerto Cabello", null, "Venezuela", "club", [C.sula], ["Academia Puerto Cabello", "Puerto Cabello"]],

  // ---------- Inglaterra (Premier League) ----------
  arsenal: ["Arsenal", "Arsenal", "ARS", "Inglaterra", "club", [C.epl, C.ucl], ["Arsenal", "Arsenal FC"]],
  astonvilla: ["Aston Villa", "Aston Villa", "AVL", "Inglaterra", "club", [C.epl, C.ucl], ["Aston Villa"]],
  bournemouth: ["Bournemouth", "Bournemouth", "BOU", "Inglaterra", "club", [C.epl], ["Bournemouth", "AFC Bournemouth"]],
  brentford: ["Brentford", "Brentford", "BRE", "Inglaterra", "club", [C.epl], ["Brentford", "Brentford FC"]],
  brighton: ["Brighton", "Brighton", "BHA", "Inglaterra", "club", [C.epl], ["Brighton", "Brighton & Hove Albion"]],
  burnley: ["Burnley", "Burnley", "BUR", "Inglaterra", "club", [C.epl], ["Burnley", "Burnley FC"]],
  chelsea: ["Chelsea", "Chelsea", "CHE", "Inglaterra", "club", [C.epl, C.ucl], ["Chelsea", "Chelsea FC"]],
  crystalpalace: ["Crystal Palace", "Crystal Palace", "CRY", "Inglaterra", "club", [C.epl, C.uel], ["Crystal Palace"]],
  everton: ["Everton", "Everton", "EVE", "Inglaterra", "club", [C.epl], ["Everton", "Everton FC"]],
  forest: ["Nottingham Forest", "Nottm Forest", "NFO", "Inglaterra", "club", [C.epl, C.uel], ["Nottingham Forest", "Nott'm Forest"]],
  fulham: ["Fulham", "Fulham", "FUL", "Inglaterra", "club", [C.epl], ["Fulham", "Fulham FC"]],
  ipswich: ["Ipswich Town", "Ipswich", "IPS", "Inglaterra", "club", [C.epl], ["Ipswich Town", "Ipswich"]],
  leicester: ["Leicester City", "Leicester", "LEI", "Inglaterra", "club", [C.epl], ["Leicester City", "Leicester"]],
  liverpool: ["Liverpool", "Liverpool", "LIV", "Inglaterra", "club", [C.epl, C.ucl], ["Liverpool", "Liverpool FC"]],
  mancity: ["Manchester City", "Man City", "MCI", "Inglaterra", "club", [C.epl, C.ucl], ["Manchester City", "Man City"]],
  manunited: ["Manchester United", "Man United", "MUN", "Inglaterra", "club", [C.epl, C.uel], ["Manchester United", "Man Utd", "Man United"]],
  newcastle: ["Newcastle", "Newcastle", "NEW", "Inglaterra", "club", [C.epl, C.ucl], ["Newcastle United", "Newcastle"]],
  sheffieldunited: ["Sheffield United", "Sheffield Utd", "SHU", "Inglaterra", "club", [C.epl], ["Sheffield United", "Sheffield Utd"]],
  southampton: ["Southampton", "Southampton", "SOU", "Inglaterra", "club", [C.epl], ["Southampton", "Southampton FC"]],
  sunderland: ["Sunderland", "Sunderland", "SUN", "Inglaterra", "club", [C.epl], ["Sunderland", "Sunderland AFC"]],
  tottenham: ["Tottenham", "Tottenham", "TOT", "Inglaterra", "club", [C.epl, C.ucl], ["Tottenham Hotspur", "Tottenham", "Spurs"]],
  westham: ["West Ham", "West Ham", "WHU", "Inglaterra", "club", [C.epl], ["West Ham United", "West Ham"]],
  wolves: ["Wolverhampton", "Wolves", "WOL", "Inglaterra", "club", [C.epl], ["Wolverhampton Wanderers", "Wolves"]],

  // ---------- Espanha (La Liga) ----------
  alaves: ["Alavés", "Alavés", "ALA", "Espanha", "club", [C.laliga], ["Alaves", "Deportivo Alavés"]],
  athleticbilbao: ["Athletic Bilbao", "Athletic", "ATH", "Espanha", "club", [C.laliga, C.ucl], ["Athletic Club", "Athletic Bilbao"]],
  atleticomadrid: ["Atlético de Madrid", "Atlético", "ATM", "Espanha", "club", [C.laliga, C.ucl], ["Atletico Madrid", "Atlético de Madrid", "Atleti"]],
  barcelona: ["Barcelona", "Barcelona", "BAR", "Espanha", "club", [C.laliga, C.ucl], ["Barcelona", "FC Barcelona", "Barça"]],
  celta: ["Celta de Vigo", "Celta", "CEL", "Espanha", "club", [C.laliga], ["Celta Vigo", "Celta de Vigo"]],
  espanyol: ["Espanyol", "Espanyol", "ESP", "Espanha", "club", [C.laliga], ["Espanyol", "RCD Espanyol"]],
  getafe: ["Getafe", "Getafe", "GET", "Espanha", "club", [C.laliga], ["Getafe", "Getafe CF"]],
  girona: ["Girona", "Girona", "GIR", "Espanha", "club", [C.laliga], ["Girona", "Girona FC"]],
  laspalmas: ["Las Palmas", "Las Palmas", "LPA", "Espanha", "club", [C.laliga], ["Las Palmas", "UD Las Palmas"]],
  leganes: ["Leganés", "Leganés", "LEG", "Espanha", "club", [C.laliga], ["Leganes", "CD Leganés"]],
  levante: ["Levante", "Levante", "LEV", "Espanha", "club", [C.laliga], ["Levante", "Levante UD"]],
  mallorca: ["Mallorca", "Mallorca", "MLL", "Espanha", "club", [C.laliga], ["Mallorca", "RCD Mallorca"]],
  osasuna: ["Osasuna", "Osasuna", "OSA", "Espanha", "club", [C.laliga], ["Osasuna", "CA Osasuna"]],
  rayovallecano: ["Rayo Vallecano", "Rayo", "RAY", "Espanha", "club", [C.laliga], ["Rayo Vallecano"]],
  realbetis: ["Real Betis", "Betis", "BET", "Espanha", "club", [C.laliga, C.uel], ["Real Betis", "Betis"]],
  realmadrid: ["Real Madrid", "Real Madrid", "RMA", "Espanha", "club", [C.laliga, C.ucl], ["Real Madrid", "Real Madrid CF"]],
  realoviedo: ["Real Oviedo", "Oviedo", null, "Espanha", "club", [C.laliga], ["Real Oviedo", "Oviedo"]],
  realsociedad: ["Real Sociedad", "Real Sociedad", "RSO", "Espanha", "club", [C.laliga, C.uel], ["Real Sociedad", "La Real"]],
  sevilla: ["Sevilla", "Sevilla", "SEV", "Espanha", "club", [C.laliga], ["Sevilla", "Sevilla FC"]],
  valencia: ["Valencia", "Valencia", "VAL", "Espanha", "club", [C.laliga], ["Valencia", "Valencia CF"]],
  valladolid: ["Valladolid", "Valladolid", "VLL", "Espanha", "club", [C.laliga], ["Real Valladolid", "Valladolid"]],
  villarreal: ["Villarreal", "Villarreal", "VIL", "Espanha", "club", [C.laliga, C.ucl], ["Villarreal", "Villarreal CF"]],

  // ---------- Itália (Serie A) ----------
  atalanta: ["Atalanta", "Atalanta", "ATA", "Itália", "club", [C.itaA, C.ucl], ["Atalanta", "Atalanta BC"]],
  bologna: ["Bologna", "Bologna", "BOL", "Itália", "club", [C.itaA, C.ucl], ["Bologna", "Bologna FC"]],
  cagliari: ["Cagliari", "Cagliari", "CAG", "Itália", "club", [C.itaA], ["Cagliari", "Cagliari Calcio"]],
  como: ["Como", "Como", "COM", "Itália", "club", [C.itaA], ["Como", "Como 1907"]],
  empoli: ["Empoli", "Empoli", "EMP", "Itália", "club", [C.itaA], ["Empoli", "Empoli FC"]],
  fiorentina: ["Fiorentina", "Fiorentina", "FIO", "Itália", "club", [C.itaA], ["Fiorentina", "ACF Fiorentina"]],
  genoa: ["Genoa", "Genoa", "GEN", "Itália", "club", [C.itaA], ["Genoa", "Genoa CFC"]],
  inter: ["Inter de Milão", "Inter", "INT", "Itália", "club", [C.itaA, C.ucl], ["Inter Milan", "Internazionale", "Inter"]],
  juventus: ["Juventus", "Juventus", "JUV", "Itália", "club", [C.itaA, C.ucl], ["Juventus", "Juventus FC", "Juve"]],
  lazio: ["Lazio", "Lazio", "LAZ", "Itália", "club", [C.itaA], ["Lazio", "SS Lazio"]],
  lecce: ["Lecce", "Lecce", "LEC", "Itália", "club", [C.itaA], ["Lecce", "US Lecce"]],
  milan: ["Milan", "Milan", "MIL", "Itália", "club", [C.itaA], ["AC Milan", "Milan"]],
  monza: ["Monza", "Monza", "MON", "Itália", "club", [C.itaA], ["Monza", "AC Monza"]],
  napoli: ["Napoli", "Napoli", "NAP", "Itália", "club", [C.itaA, C.ucl], ["Napoli", "SSC Napoli"]],
  parma: ["Parma", "Parma", "PAR", "Itália", "club", [C.itaA], ["Parma", "Parma Calcio"]],
  roma: ["Roma", "Roma", "ROM", "Itália", "club", [C.itaA, C.uel], ["AS Roma", "Roma"]],
  torino: ["Torino", "Torino", "TOR", "Itália", "club", [C.itaA], ["Torino", "Torino FC"]],
  udinese: ["Udinese", "Udinese", "UDI", "Itália", "club", [C.itaA], ["Udinese", "Udinese Calcio"]],
  venezia: ["Venezia", "Venezia", "VEN", "Itália", "club", [C.itaA], ["Venezia", "Venezia FC"]],
  verona: ["Hellas Verona", "Verona", "VER", "Itália", "club", [C.itaA], ["Hellas Verona", "Verona"]],

  // ---------- Alemanha (Bundesliga) ----------
  augsburg: ["Augsburg", "Augsburg", "FCA", "Alemanha", "club", [C.bundes], ["FC Augsburg", "Augsburg"]],
  bayern: ["Bayern de Munique", "Bayern", "FCB", "Alemanha", "club", [C.bundes, C.ucl], ["Bayern Munich", "Bayern München", "Bayern"]],
  bielefeld: ["Arminia Bielefeld", "Bielefeld", null, "Alemanha", "club", [C.bundes], ["Arminia Bielefeld", "Bielefeld"]],
  bochum: ["Bochum", "Bochum", "BOC", "Alemanha", "club", [C.bundes], ["VfL Bochum", "Bochum"]],
  bremen: ["Werder Bremen", "Bremen", "SVW", "Alemanha", "club", [C.bundes], ["Werder Bremen", "Bremen"]],
  dortmund: ["Borussia Dortmund", "Dortmund", "BVB", "Alemanha", "club", [C.bundes, C.ucl], ["Borussia Dortmund", "Dortmund", "BVB"]],
  frankfurt: ["Eintracht Frankfurt", "Frankfurt", "SGE", "Alemanha", "club", [C.bundes, C.ucl], ["Eintracht Frankfurt", "Frankfurt"]],
  freiburg: ["Freiburg", "Freiburg", "SCF", "Alemanha", "club", [C.bundes], ["SC Freiburg", "Freiburg"]],
  heidenheim: ["Heidenheim", "Heidenheim", null, "Alemanha", "club", [C.bundes], ["1. FC Heidenheim", "Heidenheim"]],
  hoffenheim: ["Hoffenheim", "Hoffenheim", "TSG", "Alemanha", "club", [C.bundes], ["TSG Hoffenheim", "Hoffenheim"]],
  kiel: ["Holstein Kiel", "Kiel", null, "Alemanha", "club", [C.bundes], ["Holstein Kiel", "Kiel"]],
  leverkusen: ["Bayer Leverkusen", "Leverkusen", "B04", "Alemanha", "club", [C.bundes, C.ucl], ["Bayer Leverkusen", "Leverkusen"]],
  mainz: ["Mainz 05", "Mainz", "M05", "Alemanha", "club", [C.bundes], ["Mainz 05", "Mainz"]],
  mgladbach: ["Borussia M'gladbach", "M'gladbach", "BMG", "Alemanha", "club", [C.bundes], ["Borussia Monchengladbach", "Gladbach", "M'gladbach"]],
  rbleipzig: ["RB Leipzig", "RB Leipzig", "RBL", "Alemanha", "club", [C.bundes, C.ucl], ["RB Leipzig", "Leipzig"]],
  stpauli: ["St. Pauli", "St. Pauli", null, "Alemanha", "club", [C.bundes], ["FC St. Pauli", "St Pauli"]],
  stuttgart: ["Stuttgart", "Stuttgart", "VFB", "Alemanha", "club", [C.bundes, C.ucl], ["VfB Stuttgart", "Stuttgart"]],
  unionberlin: ["Union Berlin", "Union Berlin", "FCU", "Alemanha", "club", [C.bundes], ["Union Berlin", "1. FC Union Berlin"]],
  wolfsburg: ["Wolfsburg", "Wolfsburg", "WOB", "Alemanha", "club", [C.bundes], ["VfL Wolfsburg", "Wolfsburg"]],

  // ---------- França (Ligue 1) ----------
  nice: ["Nice", "Nice", "NIC", "França", "club", [C.ligue1, C.uel], ["OGC Nice", "Nice"]],
  psg: ["Paris Saint-Germain", "PSG", "PSG", "França", "club", [C.ligue1, C.ucl], ["Paris Saint-Germain", "PSG", "Paris SG"]],
  stadedereims: ["Reims", "Reims", "REI", "França", "club", [C.ligue1], ["Stade de Reims", "Reims"]],

  // ---------- Portugal ----------
  benfica: ["Benfica", "Benfica", "SLB", "Portugal", "club", [C.ucl], ["Benfica", "SL Benfica"]],
  braga: ["Braga", "Braga", "SCB", "Portugal", "club", [C.uel], ["SC Braga", "Braga", "Sporting Braga"]],
  porto: ["Porto", "Porto", "FCP", "Portugal", "club", [C.ucl, C.uel], ["FC Porto", "Porto"]],
  sporting: ["Sporting", "Sporting", "SCP", "Portugal", "club", [C.ucl], ["Sporting CP", "Sporting Lisbon", "Sporting"]],

  // ---------- Outros europeus ----------
  ajax: ["Ajax", "Ajax", "AJA", "Holanda", "club", [C.ucl], ["Ajax", "AFC Ajax", "Ajax Amsterdam"]],
  bodglimt: ["Bodø/Glimt", "Bodø/Glimt", null, "Noruega", "club", [C.ucl, C.uel], ["Bodo/Glimt", "FK Bodø/Glimt"]],
  djurgarden: ["Djurgården", "Djurgården", null, "Suécia", "club", [C.uel], ["Djurgarden", "Djurgårdens IF"]],
  olympiacos: ["Olympiacos", "Olympiacos", null, "Grécia", "club", [C.ucl, C.uel], ["Olympiacos", "Olympiacos FC", "Olympiakos"]],
  rbsalzburg: ["RB Salzburg", "Salzburg", null, "Áustria", "club", [C.ucl], ["Red Bull Salzburg", "RB Salzburg", "Salzburg"]],

  // ---------- Ásia / África / América (clubes; sem competição rastreada no app) ----------
  alahli: ["Al Ahli", "Al Ahli", null, "Arábia Saudita", "club", [], ["Al Ahli", "Al-Ahli Saudi", "Al Ahli SFC"]],
  alahly: ["Al Ahly", "Al Ahly", null, "Egito", "club", [], ["Al Ahly", "Al Ahly SC"]],
  alain: ["Al Ain", "Al Ain", null, "Emirados Árabes Unidos", "club", [], ["Al Ain", "Al Ain FC"]],
  alhilal: ["Al Hilal", "Al Hilal", null, "Arábia Saudita", "club", [], ["Al Hilal", "Al-Hilal"]],
  alittihad: ["Al Ittihad", "Al Ittihad", null, "Arábia Saudita", "club", [], ["Al Ittihad", "Al-Ittihad Club"]],
  alnassr: ["Al Nassr", "Al Nassr", null, "Arábia Saudita", "club", [], ["Al Nassr", "Al-Nassr"]],
  alqadsiah: ["Al Qadsiah", "Al Qadsiah", null, "Arábia Saudita", "club", [], ["Al Qadsiah", "Al-Qadsiah"]],
  esperance: ["Espérance", "Espérance", null, "Tunísia", "club", [], ["Esperance", "Espérance de Tunis", "ES Tunis"]],
  mamelodi: ["Mamelodi Sundowns", "Sundowns", null, "África do Sul", "club", [], ["Mamelodi Sundowns", "Sundowns"]],
  pyramids: ["Pyramids", "Pyramids", null, "Egito", "club", [], ["Pyramids FC"]],
  wydadcasab: ["Wydad Casablanca", "Wydad", null, "Marrocos", "club", [], ["Wydad Casablanca", "Wydad AC", "WAC"]],
  kawasaki: ["Kawasaki Frontale", "Kawasaki", null, "Japão", "club", [], ["Kawasaki Frontale"]],
  ulsan: ["Ulsan HD", "Ulsan", null, "Coreia do Sul", "club", [], ["Ulsan HD", "Ulsan Hyundai"]],
  urawareds: ["Urawa Red Diamonds", "Urawa Reds", null, "Japão", "club", [], ["Urawa Red Diamonds", "Urawa Reds"]],
  aucklandcity: ["Auckland City", "Auckland City", null, "Nova Zelândia", "club", [], ["Auckland City FC"]],
  intermiami: ["Inter Miami", "Inter Miami", null, "Estados Unidos", "club", [], ["Inter Miami", "Inter Miami CF"]],
  lafc: ["Los Angeles FC", "LAFC", null, "Estados Unidos", "club", [], ["Los Angeles FC", "LAFC"]],
  seattlesounders: ["Seattle Sounders", "Seattle", null, "Estados Unidos", "club", [], ["Seattle Sounders", "Seattle Sounders FC"]],
  vancouver: ["Vancouver Whitecaps", "Vancouver", null, "Canadá", "club", [], ["Vancouver Whitecaps", "Whitecaps"]],
  americamexico: ["Club América", "América (MEX)", null, "México", "club", [], ["Club America", "America", "Club América (MEX)"]],
  cruzazul: ["Cruz Azul", "Cruz Azul", null, "México", "club", [], ["Cruz Azul"]],
  monterrey: ["Monterrey", "Monterrey", null, "México", "club", [], ["CF Monterrey", "Rayados", "Monterrey"]],
  pachuca: ["Pachuca", "Pachuca", null, "México", "club", [], ["CF Pachuca", "Pachuca"]],

  // ---------- Seleções já com escudo no repo ----------
  albania: ["Albânia", "Albânia", "ALB", "Albânia", "national", [], ["Albania"]],
  alemanha: ["Alemanha", "Alemanha", "GER", "Alemanha", "national", [C.wc], ["Germany", "Deutschland"]],
  andorra: ["Andorra", "Andorra", "AND", "Andorra", "national", [], ["Andorra"]],
  argentina: ["Argentina", "Argentina", "ARG", "Argentina", "national", [C.wc, C.america], ["Argentina"]],
  belgica: ["Bélgica", "Bélgica", "BEL", "Bélgica", "national", [C.wc], ["Belgium"]],
  bolivia: ["Bolívia", "Bolívia", "BOL", "Bolívia", "national", [C.america], ["Bolivia"]],
  brasil: ["Brasil", "Brasil", "BRA", "Brasil", "national", [C.wc, C.america], ["Brazil"]],
  chile: ["Chile", "Chile", "CHI", "Chile", "national", [C.america], ["Chile"]],
  colombia: ["Colômbia", "Colômbia", "COL", "Colômbia", "national", [C.wc, C.america], ["Colombia"]],
  croacia: ["Croácia", "Croácia", "CRO", "Croácia", "national", [C.wc], ["Croatia", "Hrvatska"]],
  dinamarca: ["Dinamarca", "Dinamarca", "DEN", "Dinamarca", "national", [], ["Denmark", "Danmark"]],
  equador: ["Equador", "Equador", "ECU", "Equador", "national", [C.wc, C.america], ["Ecuador"]],
  espanha: ["Espanha", "Espanha", "ESP", "Espanha", "national", [C.wc], ["Spain", "España"]],
  eua: ["Estados Unidos", "EUA", "USA", "Estados Unidos", "national", [C.wc], ["United States", "USA", "United States of America"]],
  finlandia: ["Finlândia", "Finlândia", "FIN", "Finlândia", "national", [], ["Finland", "Suomi"]],
  franca: ["França", "França", "FRA", "França", "national", [C.wc], ["France"]],
  gibraltar: ["Gibraltar", "Gibraltar", "GIB", "Gibraltar", "national", [], ["Gibraltar"]],
  holanda: ["Holanda", "Holanda", "NED", "Holanda", "national", [C.wc], ["Netherlands", "Holland"]],
  inglaterra: ["Inglaterra", "Inglaterra", "ENG", "Inglaterra", "national", [C.wc], ["England"]],
  irlandadonorte: ["Irlanda do Norte", "Irl. Norte", "NIR", "Irlanda do Norte", "national", [], ["Northern Ireland"]],
  italia: ["Itália", "Itália", "ITA", "Itália", "national", [], ["Italy", "Italia"]],
  lituania: ["Lituânia", "Lituânia", "LTU", "Lituânia", "national", [], ["Lithuania"]],
  macedonia: ["Macedônia do Norte", "Macedônia", "MKD", "Macedônia do Norte", "national", [], ["North Macedonia", "Macedonia"]],
  malta: ["Malta", "Malta", "MLT", "Malta", "national", [], ["Malta"]],
  mexico: ["México", "México", "MEX", "México", "national", [C.wc], ["Mexico"]],
  moldavia: ["Moldávia", "Moldávia", "MDA", "Moldávia", "national", [], ["Moldova"]],
  noruega: ["Noruega", "Noruega", "NOR", "Noruega", "national", [C.wc], ["Norway", "Norge"]],
  paisdegales: ["País de Gales", "Gales", "WAL", "País de Gales", "national", [], ["Wales"]],
  paraguai: ["Paraguai", "Paraguai", "PAR", "Paraguai", "national", [C.wc, C.america], ["Paraguay"]],
  peru: ["Peru", "Peru", "PER", "Peru", "national", [C.america], ["Peru"]],
  polonia: ["Polônia", "Polônia", "POL", "Polônia", "national", [], ["Poland", "Polska"]],
  portugal: ["Portugal", "Portugal", "POR", "Portugal", "national", [C.wc], ["Portugal"]],
  senegal: ["Senegal", "Senegal", "SEN", "Senegal", "national", [C.wc], ["Senegal"]],
  servia: ["Sérvia", "Sérvia", "SRB", "Sérvia", "national", [], ["Serbia", "Srbija"]],
  suica: ["Suíça", "Suíça", "SUI", "Suíça", "national", [C.wc], ["Switzerland", "Schweiz"]],
  tchequia: ["Tchéquia", "Tchéquia", "CZE", "Tchéquia", "national", [C.wc], ["Czechia", "Czech Republic"]],
  turquia: ["Turquia", "Turquia", "TUR", "Turquia", "national", [C.wc], ["Turkey", "Türkiye", "Turkiye"]],
  uruguai: ["Uruguai", "Uruguai", "URU", "Uruguai", "national", [C.wc, C.america], ["Uruguay"]],
  venezuela: ["Venezuela", "Venezuela", "VEN", "Venezuela", "national", [C.america], ["Venezuela"]],
};

// Seleções da Copa 2026 SEM escudo no repo: serão emitidas com crest_file null
// e crest_source apontando pra bandeira no Wikimedia Commons (Special:FilePath).
const FILEPATH = (f) => "https://commons.wikimedia.org/wiki/Special:FilePath/" + encodeURIComponent(f);
const WC_MISSING = [
  ["Argélia", "Argélia", "ALG", "Argélia", ["Algeria"], "Flag of Algeria.svg"],
  ["Austrália", "Austrália", "AUS", "Austrália", ["Australia", "Socceroos"], "Flag of Australia.svg"],
  ["Áustria", "Áustria", "AUT", "Áustria", ["Austria", "Österreich"], "Flag of Austria.svg"],
  ["Bósnia e Herzegovina", "Bósnia", "BIH", "Bósnia e Herzegovina", ["Bosnia and Herzegovina", "Bosnia & Herzegovina", "Bosnia"], "Flag of Bosnia and Herzegovina.svg"],
  ["Canadá", "Canadá", "CAN", "Canadá", ["Canada"], "Flag of Canada (Pantone).svg"],
  ["Cabo Verde", "Cabo Verde", "CPV", "Cabo Verde", ["Cape Verde", "Cabo Verde"], "Flag of Cape Verde.svg"],
  ["Curaçao", "Curaçao", "CUW", "Curaçao", ["Curacao", "Curaçao", "CUR"], "Flag of Curaçao.svg"],
  ["Congo (RD)", "Congo RD", "COD", "Congo (RD)", ["DR Congo", "Congo DR", "DRC", "Democratic Republic of the Congo"], "Flag of the Democratic Republic of the Congo.svg"],
  ["Egito", "Egito", "EGY", "Egito", ["Egypt"], "Flag of Egypt.svg"],
  ["Gana", "Gana", "GHA", "Gana", ["Ghana"], "Flag of Ghana.svg"],
  ["Haiti", "Haiti", "HAI", "Haiti", ["Haiti"], "Flag of Haiti.svg"],
  ["Irã", "Irã", "IRN", "Irã", ["Iran", "IR Iran"], "Flag of Iran.svg"],
  ["Iraque", "Iraque", "IRQ", "Iraque", ["Iraq"], "Flag of Iraq.svg"],
  ["Costa do Marfim", "C. Marfim", "CIV", "Costa do Marfim", ["Ivory Coast", "Cote d'Ivoire", "Côte d'Ivoire"], "Flag of Ivory Coast.svg"],
  ["Japão", "Japão", "JPN", "Japão", ["Japan"], "Flag of Japan.svg"],
  ["Jordânia", "Jordânia", "JOR", "Jordânia", ["Jordan"], "Flag of Jordan.svg"],
  ["Marrocos", "Marrocos", "MAR", "Marrocos", ["Morocco"], "Flag of Morocco.svg"],
  ["Nova Zelândia", "N. Zelândia", "NZL", "Nova Zelândia", ["New Zealand"], "Flag of New Zealand.svg"],
  ["Panamá", "Panamá", "PAN", "Panamá", ["Panama"], "Flag of Panama.svg"],
  ["Catar", "Catar", "QAT", "Catar", ["Qatar"], "Flag of Qatar.svg"],
  ["Arábia Saudita", "Arábia S.", "KSA", "Arábia Saudita", ["Saudi Arabia"], "Flag of Saudi Arabia.svg"],
  ["Escócia", "Escócia", "SCO", "Escócia", ["Scotland"], "Flag of Scotland.svg"],
  ["África do Sul", "Á. do Sul", "RSA", "África do Sul", ["South Africa"], "Flag of South Africa.svg"],
  ["Coreia do Sul", "Coreia", "KOR", "Coreia do Sul", ["South Korea", "Korea Republic"], "Flag of South Korea.svg"],
  ["Suécia", "Suécia", "SWE", "Suécia", ["Sweden", "Sverige"], "Flag of Sweden.svg"],
  ["Tunísia", "Tunísia", "TUN", "Tunísia", ["Tunisia"], "Flag of Tunisia.svg"],
  ["Uzbequistão", "Uzbequistão", "UZB", "Uzbequistão", ["Uzbekistan"], "Flag of Uzbekistan.svg"],
];

// ---------- montagem ----------
const files = readdirSync(TEAMS_DIR).filter((f) => /\.(png|webp|svg|jpg|jpeg)$/i.test(f));
const byFileSlug = new Map();
for (const f of files.sort()) {
  const base = f.replace(/\.(png|webp|svg|jpg|jpeg)$/i, "");
  const k = slug(base);
  if (!byFileSlug.has(k)) byFileSlug.set(k, f); // 1º vence (igual ao gen-team-crests)
}

const catalog = [];
const unresolved = []; // crest existe mas nome não resolve por slug(name)/slug(short)
const uncovered = [];
const dupFound = [];

for (const [fileSlug, file] of byFileSlug) {
  if (DUP[fileSlug]) { dupFound.push({ file, sugerido: DUP[fileSlug] }); continue; }
  const m = M[fileSlug];
  if (!m) { uncovered.push(file); continue; }
  const [name_pt, short_pt, tla, country, kind, competitions, aliases] = m;
  // Identidade = slug do ARQUIVO (já é a chave única do manifest e casa com o escudo).
  // Sinaliza só quando NEM name NEM short resolvem pelo slug (aí o app cairia nas
  // iniciais; o seed deve então linkar o escudo via crest_file -> local_crest).
  if (slug(name_pt) !== fileSlug && slug(short_pt) !== fileSlug) {
    unresolved.push(`${file} (${name_pt})`);
  }
  catalog.push({
    slug: fileSlug,
    name_pt, short_pt,
    tla: tla ?? null,
    country, kind,
    competitions,
    aliases,
    crest_file: file,
    crest_source: "repo (public/teams)",
  });
}

// Seleções da Copa sem escudo
const existing = new Set(catalog.map((t) => t.slug));
for (const [name_pt, short_pt, tla, country, aliases, flag] of WC_MISSING) {
  const s = slug(name_pt) || slug(short_pt);
  if (existing.has(s)) continue;
  catalog.push({
    slug: s, name_pt, short_pt, tla, country, kind: "national",
    competitions: [C.wc], aliases,
    crest_file: null,
    crest_source: FILEPATH(flag),
  });
}

catalog.sort((a, b) => a.slug.localeCompare(b.slug));

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(OUT_FILE, JSON.stringify(catalog, null, 2) + "\n");

// ---------- relatório ----------
const withCrest = catalog.filter((t) => t.crest_file).length;
const missing = catalog.filter((t) => !t.crest_file);
const byComp = {};
for (const t of catalog) for (const c of t.competitions) byComp[c] = (byComp[c] || 0) + 1;

console.log("== teams-catalog.json gerado ==");
console.log("arquivo:", OUT_FILE);
console.log("total de times:", catalog.length, "| com escudo:", withCrest, "| sem escudo:", missing.length);
console.log("\nfaltando escudo (crest_file null):");
console.log(missing.map((t) => `${t.slug} (${t.name_pt})`).join(", ") || "(nenhum)");
console.log("\narquivos suspeitos/duplicados (NÃO entraram no catálogo):");
console.log(dupFound.length ? dupFound.map((d) => `${d.file} -> ${d.sugerido}`).join("\n") : "(nenhum)");
console.log("\nescudos que NÃO resolvem pelo nome (seed deve linkar via crest_file):");
console.log(unresolved.length ? unresolved.join("\n") : "(nenhum)");
console.log("\narquivos SEM metadado (preciso cobrir):");
console.log(uncovered.length ? uncovered.join(", ") : "(nenhum)");
console.log("\nentradas por competição:");
console.log(Object.entries(byComp).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`).join("\n"));
