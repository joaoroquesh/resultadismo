// Helpers de apresentação do Manager (sem JSX): bandeiras, estrelas, rótulos e
// bancos de texto boleiros. Tudo client-side, espelhando o protótipo v4.
import type { AtkStyle, DefStyle, Form, Tier } from "./types";

// PRNG só pra variedade de TEXTO da narração (não afeta o placar; o motor é o
// dono do resultado). Semeado pela partida pra a transmissão ser reproduzível.
export function mulberryUi(a: number): () => number {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const FLAG_EMOJI: Record<string, string> = {
  Brasil: "🇧🇷",
  Argentina: "🇦🇷",
  Uruguai: "🇺🇾",
  Itália: "🇮🇹",
  Alemanha: "🇩🇪",
  "Alemanha Ocidental": "🇩🇪",
  França: "🇫🇷",
  Inglaterra: "🏴",
  Espanha: "🇪🇸",
  Holanda: "🇳🇱",
  Portugal: "🇵🇹",
  Bélgica: "🇧🇪",
  Croácia: "🇭🇷",
  México: "🇲🇽",
  Chile: "🇨🇱",
  Colômbia: "🇨🇴",
  Suécia: "🇸🇪",
  Suíça: "🇨🇭",
  Hungria: "🇭🇺",
  Áustria: "🇦🇹",
  "União Soviética": "🇷🇺",
  Rússia: "🇷🇺",
  Polônia: "🇵🇱",
  Dinamarca: "🇩🇰",
  EUA: "🇺🇸",
  Japão: "🇯🇵",
  "Coreia do Sul": "🇰🇷",
  Nigéria: "🇳🇬",
  Camarões: "🇨🇲",
  Gana: "🇬🇭",
  Senegal: "🇸🇳",
  Marrocos: "🇲🇦",
  Tunísia: "🇹🇳",
  Argélia: "🇩🇿",
  Egito: "🇪🇬",
  Peru: "🇵🇪",
  Paraguai: "🇵🇾",
  Bolívia: "🇧🇴",
  Equador: "🇪🇨",
  "Costa Rica": "🇨🇷",
  Austrália: "🇦🇺",
  Escócia: "🏴",
  Romênia: "🇷🇴",
  Bulgária: "🇧🇬",
  Iugoslávia: "🇷🇸",
  Tchecoslováquia: "🇨🇿",
  Tchéquia: "🇨🇿",
  Noruega: "🇳🇴",
  Irlanda: "🇮🇪",
  Turquia: "🇹🇷",
  "Arábia Saudita": "🇸🇦",
  Irã: "🇮🇷",
  China: "🇨🇳",
  Catar: "🇶🇦",
  Canadá: "🇨🇦",
  Curaçao: "🇨🇼",
  "Cabo Verde": "🇨🇻",
  "Costa do Marfim": "🇨🇮",
  "África do Sul": "🇿🇦",
  "País de Gales": "🏴",
  Eslovênia: "🇸🇮",
  Ucrânia: "🇺🇦",
  Grécia: "🇬🇷",
  Jamaica: "🇯🇲",
  Honduras: "🇭🇳",
  Kuwait: "🇰🇼",
  "Nova Zelândia": "🇳🇿",
  "El Salvador": "🇸🇻",
  "Coreia do Norte": "🇰🇵",
  Iraque: "🇮🇶",
  Angola: "🇦🇴",
  Togo: "🇹🇬",
  "Trinidad e Tobago": "🇹🇹",
  Haiti: "🇭🇹",
  Zaire: "🇨🇩",
  Cuba: "🇨🇺",
  "Emirados Árabes Unidos": "🇦🇪",
  "Sérvia e Montenegro": "🇷🇸",
  Eslováquia: "🇸🇰",
  "Irlanda do Norte": "🇬🇧",
  "Alemanha Oriental": "🇩🇪",
  "Índias Orientais Holandesas": "🇮🇩",
  Uzbequistão: "🇺🇿",
  Jordânia: "🇯🇴",
  Panamá: "🇵🇦",
};

export function flagEmoji(name: string): string {
  return FLAG_EMOJI[name] ?? "";
}
export function flagSigla(name: string): string {
  return name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 3).toUpperCase();
}

// 0..99 -> 0.5..5 estrelas (meia em meia). Devolve {full, half, empty} pra a UI.
export function starsFor(o: number): { full: number; half: boolean; n: number } {
  const n = Math.round((o / 99) * 10) / 2;
  const full = Math.floor(n);
  const half = n - full >= 0.5;
  return { full, half, n };
}
export function barPct(v: number): number {
  return Math.max(4, Math.min(100, ((v - 30) / (99 - 30)) * 100));
}

// ===== rótulos de tática (estudo-taticas-v3 · rev 4) =====
// 9 FORMAÇÕES (grid 3×3) na ORDEM do grid (linha ATA → MEI → DEF).
export const FORM_OPTS: [Form, string][] = [
  ["4-2-4", "4-2-4"],
  ["3-4-3", "3-4-3"],
  ["4-3-3", "4-3-3"],
  ["4-4-2", "4-4-2"],
  ["3-5-2", "3-5-2"],
  ["4-5-1", "4-5-1"],
  ["5-3-2", "5-3-2"],
  ["5-4-1", "5-4-1"],
  ["6-3-1", "6-3-1"],
];
export const FORM_NM: Record<Form, string> = {
  "4-2-4": "4-2-4",
  "3-4-3": "3-4-3",
  "4-3-3": "4-3-3",
  "4-4-2": "4-4-2",
  "3-5-2": "3-5-2",
  "4-5-1": "4-5-1",
  "5-3-2": "5-3-2",
  "5-4-1": "5-4-1",
  "6-3-1": "6-3-1",
};
// 5 ESTILOS de ATAQUE.
export const ATK_OPTS: [AtkStyle, string][] = [
  ["posse", "Posse"],
  ["vertical", "Vertical"],
  ["bolalonga", "Bola longa"],
  ["contra", "Contra-ataque"],
  ["drible", "Drible"],
];
export const ATK_NM: Record<AtkStyle, string> = {
  posse: "Posse",
  vertical: "Vertical",
  bolalonga: "Bola longa",
  contra: "Contra-ataque",
  drible: "Drible",
};
// 5 ESTILOS de DEFESA.
export const DEF_OPTS: [DefStyle, string][] = [
  ["zona", "Zona"],
  ["individual", "Individual"],
  ["mista", "Mista"],
  ["libero", "Líbero"],
  ["dobra", "Dobra"],
];
export const DEF_NM: Record<DefStyle, string> = {
  zona: "Zona",
  individual: "Individual",
  mista: "Mista",
  libero: "Líbero",
  dobra: "Dobra",
};

// 1 LINHA de identidade por estilo (§3) — pro picker (ataque/defesa) explicar a escolha
// sem jargão de motor. Curtas, escaneáveis, sem em dash.
export const ATK_IDENTITY: Record<AtkStyle, string> = {
  posse: "Toque e paciência: fura defesa fechada na circulação.",
  vertical: "Verticaliza em 2 ou 3 toques, antes da defesa postar.",
  bolalonga: "Chuveirinho e segunda bola. Ignora a pressão.",
  contra: "Cede a bola e explode no espaço. Premia o azarão.",
  drible: "No pé do craque. Brilha no time mais forte.",
};
export const DEF_IDENTITY: Record<DefStyle, string> = {
  zona: "Cada um cobre um espaço, bloco coletivo.",
  individual: "Cada um cola no seu homem.",
  mista: "Zona com vigias de marcação.",
  libero: "Recuo com um varredor atrás.",
  dobra: "Sempre dois homens na bola.",
};
// ITEM 5: descrições CURTÍSSIMAS (poucas palavras) pros pickers de ataque/defesa lado a
// lado (2 colunas) — cabem no mobile estreito sem quebrar. A identidade completa segue
// em ATK_IDENTITY/DEF_IDENTITY (usada em outros pontos).
export const ATK_IDENTITY_SHORT: Record<AtkStyle, string> = {
  posse: "toque e paciência",
  vertical: "rápido e direto",
  bolalonga: "chuveirinho na área",
  contra: "explode no espaço",
  drible: "no pé do craque",
};
export const DEF_IDENTITY_SHORT: Record<DefStyle, string> = {
  zona: "cobre o espaço",
  individual: "cola no homem",
  mista: "zona com vigias",
  libero: "varredor atrás",
  dobra: "dois na bola",
};

// ===== FORMAÇÃO — grid 3×3 (§2): a LINHA é a afinidade primária ATA/MEI/DEF =====
// rótulo + tom de cada linha do grid, pra deixar legível qual faixa é ofensiva /
// equilíbrio / defensiva. As 3 formações de cada linha vêm na ordem do FORM_OPTS.
export type FormRowKey = "ata" | "mei" | "def";
export const FORM_ROWS: { key: FormRowKey; label: string; hint: string; forms: Form[] }[] = [
  { key: "ata", label: "Ofensiva", hint: "no ataque", forms: ["4-2-4", "3-4-3", "4-3-3"] },
  { key: "mei", label: "Equilíbrio", hint: "no meio", forms: ["4-4-2", "3-5-2", "4-5-1"] },
  { key: "def", label: "Defensiva", hint: "na defesa", forms: ["5-3-2", "5-4-1", "6-3-1"] },
];
// micro-rótulo da coluna do grid (tendência secundária ATA→MEI→DEF, §2).
export const FORM_COL_LABEL = ["mais ofensiva", "equilíbrio", "mais defensiva"] as const;

// ===== 4 SLIDERS 0–100 (extremos = rótulo das pontas + valor descritivo) =====
export type SliderKey = "postura" | "pressao" | "amplitude" | "agressividade";
export const SLIDER_META: Record<
  SliderKey,
  { label: string; lo: string; hi: string; hint: string }
> = {
  postura: { label: "Postura", lo: "Recuada", hi: "Ofensiva", hint: "Aloca a força entre defesa e ataque." },
  pressao: { label: "Pressão", lo: "Bloco baixo", hi: "Pressão alta", hint: "Onde o time espera a bola: lá em cima ou recuado." },
  amplitude: { label: "Amplitude", lo: "Pelo meio", hi: "Pelas alas", hint: "Por onde o time ataca: miolo ou pontas." },
  agressividade: { label: "Pegada", lo: "Suave", hi: "Forte", hint: "Intensidade no duelo (e risco de cartão)." },
};
export const SLIDER_ORDER: SliderKey[] = ["postura", "pressao", "amplitude", "agressividade"];
// rótulo curto do valor de um slider (3 zonas) — pro resumo do plano / chips.
export function sliderZone(key: SliderKey, v: number): string {
  const m = SLIDER_META[key];
  if (v >= 67) return m.hi;
  if (v <= 33) return m.lo;
  return "Equilíbrio";
}

// 5 PRESETS — rótulo + uma linha boleira (modo simples, ajustável na mão).
export const PRESET_OPTS: [import("./engine").PresetKey, string][] = [
  ["pressao", "Pressão"],
  ["craque", "Craque"],
  ["toque", "Toque"],
  ["direto", "Direto"],
  ["ferrolho", "Ferrolho"],
];
export const PRESET_DESC: Record<import("./engine").PresetKey, string> = {
  pressao: "Sufoca lá em cima, vertical e marcação individual.",
  craque: "No pé do craque: drible e dobra de marcação atrás.",
  toque: "Troca de passes paciente, domina a bola pelo meio.",
  direto: "Bola longa e jogo pelas alas, sem rodeio.",
  ferrolho: "Ferrolho: bloco baixo, contra-ataque e pegada forte.",
};

export const TIER_LABEL: Record<Tier, string> = {
  S: "Lendária",
  A: "Favorita",
  B: "Forte",
  C: "Média",
  D: "Zebra",
};

// ===== BANCOS DE TEXTO (item 6) — curtos, humanos e escaneáveis =====
// O escudo do time e o ícone do desfecho viram PREFIXO visual (renderizados na
// linha do ticker), então o texto aqui é SÓ a frase — curta, sem artigo antes do
// país (item 11), sem reticências longas. [Time] = nome do time em negrito.

// Ícones do desfecho por categoria (matriz rica; o ticker sorteia 1 por linha).
export const TICKER_ICON: Record<"goal" | "quase" | "defesa" | "fora" | "bloqueio" | "interrupt", string[]> = {
  goal: ["⚽"],
  quase: ["🎯", "🪵", "😱"],
  defesa: ["🧤", "🙌", "🧱"],
  fora: ["❌", "🎈", "🌪️"],
  bloqueio: ["🥾", "🛑", "🦵"],
  interrupt: ["🚩", "🟨", "✋", "🔁", "↩️"],
};

export const TICKER_BUILDUP: Record<AtkStyle, string[]> = {
  posse: [
    "[Time] roda a bola, paciência total.",
    "[Time] troca passes, busca a brecha.",
    "[Time] tabela curta no meio.",
    "[Time] cadência, bola circulando.",
    "[Time] paredinha, esperando o espaço.",
    "[Time] domina a posse, sem pressa.",
  ],
  vertical: [
    "[Time] verticaliza pelo miolo.",
    "[Time] rasga pelo centro.",
    "[Time] infiltra em 2 toques.",
    "[Time] enfia a bola no eixo.",
    "[Time] busca o pivô na entrada.",
    "[Time] tabela rápida no coração da área.",
  ],
  bolalonga: [
    "[Time] lança lá na frente.",
    "[Time] joga o bolão por cima.",
    "[Time] arma o chuveirinho.",
    "[Time] chutão pra disputa.",
    "[Time] bola na cabeça do centroavante.",
    "[Time] aposta na bola aérea.",
  ],
  contra: [
    "[Time] sai no contra-ataque.",
    "[Time] dispara em velocidade.",
    "[Time] dois contra um na frente.",
    "[Time] explode pelo espaço.",
    "[Time] transição relâmpago.",
    "[Time] roubou e saiu voando.",
  ],
  drible: [
    "[Time] no pé do craque.",
    "[Time] tira o marcador no drible.",
    "[Time] caneta e segue.",
    "[Time] individual genial pela frente.",
    "[Time] encara e parte pra cima.",
    "[Time] o camisa 10 conduz e arrisca.",
  ],
};
export const TICKER_CONCLUSION: Record<string, string[]> = {
  gol: [
    "GOOOOL de [Time]! Estufou a rede!",
    "[Time] cravou! No fundo do gol!",
    "Golaço de [Time]!",
    "[Time] empurrou pra dentro!",
    "GOL de [Time]! Que jogada!",
    "[Time] tirou o goleiro e marcou!",
    "[Time] de cabeça, no canto!",
    "[Time] no contrapé do goleiro!",
    "Pintura de [Time]! Sem chance!",
  ],
  quase: [
    "[Time] na trave!",
    "[Time] rente ao poste!",
    "[Time] carimbou o travessão!",
    "Por centímetros de [Time]!",
    "[Time] tirou tinta da trave!",
    "Passou raspando de [Time]!",
  ],
  defesa: [
    "Defesaça no chute de [Time]!",
    "Goleiro espalmou [Time]!",
    "Milagre na bola de [Time]!",
    "Pegou firme o de [Time]!",
    "Voou no ângulo de [Time]!",
    "Salvou o chute de [Time]!",
  ],
  fora: [
    "[Time] mandou pra fora.",
    "[Time] isolou.",
    "[Time] por cima do gol.",
    "[Time] errou o alvo.",
    "[Time] jogou nas nuvens.",
    "Finalização torta de [Time].",
  ],
  bloqueio: [
    "Zaga bloqueou [Time]!",
    "Carrinho salvador em [Time]!",
    "Travaram o chute de [Time]!",
    "Defensor cortou [Time]!",
    "Corpo na frente, parou [Time]!",
    "Último homem barrou [Time]!",
  ],
};
export const TICKER_INTERRUPT: string[] = [
  "Impedimento marcado!",
  "Bandeira levantada!",
  "Falta no meio-campo, parou tudo.",
  "Passe errado, bola pela linha.",
  "Desarme limpo na entrada.",
  "Zaga interceptou o lançamento.",
  "Escorregou na hora do chute.",
  "Cruzamento cortado de cabeça.",
  "Roubada na saída de bola.",
  "Goleiro saiu e abafou.",
  "Demorou e a defesa voltou.",
  "Cortado antes da finalização.",
];
// dicas táticas SUTIS e boleiras — só no FIM, sem número/jargão técnico.
export const TACTICAL_HINTS_SUBTLE: string[] = [
  "Sentiu como a barreira deles anulou nossas jogadas pelo meio? Pra próxima, abrir mais pelos lados pode soltar o time.",
  "Hoje a leitura do banco fez diferença: quando você fechou atrás na hora certa, o jogo deles emperrou de vez.",
  "Reparou que o adversário corria atrás o tempo todo? Seu jeito de propor o jogo encaixou direitinho com o que eles ofereciam.",
  "Faltou um plano pra furar aquela retranca. Com mais paciência na troca de passes, aquele muro cai.",
  "Quando você mandou pressionar lá em cima, a bola passou a sobrar no nosso campo de ataque. Detalhe que pesou.",
  "A escolha de sair em velocidade castigou os espaços que eles deixaram nas costas. Casou como uma luva.",
  "Eles te empurraram pro campo de defesa e a sua postura não soube respirar. Segurar a bola um pouco mais teria aliviado.",
  "Pequeno detalhe tático, grande resultado: você leu o que o adversário oferecia e jogou no contrapé deles o jogo inteiro.",
  "A formação deles tampou nosso corredor central, e insistir por ali custou caro. Pelas pontas o caminho estava mais livre.",
  "O time encaixou quando você ajustou a marcação: o adversário perdeu as referências e a gente cresceu na partida.",
  "Deu pra notar que a tática certa rendeu mais que o talento bruto hoje. No detalhe do plano você ganhou o duelo.",
  "Quando você recuou e cedeu o campo, eles esbarraram na sua muralha e a gente saiu mortal no contragolpe.",
];

// ===== pós-jogo boleiro, por placar × diferença de força =====
export const POSTMATCH: Record<string, string[]> = {
  goleada_esperada_favorito: [
    "Era pra ser passeio e foi passeio. O time deles nunca achou onde se segurar e a gente fez a festa do começo ao fim.",
    "Aula. Cada bola que sobrava virava chance, cada chance virava gol. O adversário entrou pra cumprir tabela e saiu atropelado.",
    "Quando o teu time é muito melhor e ainda joga concentrado, dá nisso: baile de bola, goleada e torcida cantando antes do apito final.",
    "Sufoco do início ao fim. Eles se fecharam, mas a represa estourou e foi gol atrás de gol, num placar de números redondos.",
    "Foi quase treino. O rival não conseguiu sair do campo de defesa e a gente transformou superioridade em pendurada de bolas na rede.",
    "Bola pra cá, bola pra lá, e sempre terminando no fundo do gol deles. Goleada construída no peso do elenco.",
    "Domínio total. Eles tentaram aguentar, mas não tinha como: diferença de qualidade gritante e o placar só confirmou o óbvio.",
  ],
  vitoria_normal: [
    "Vitória suada, mas merecida. A gente propôs o jogo, segurou os nervos e carimbou o resultado.",
    "Jogo de Copa é assim: ganhou, pronto. Não foi bonito o tempo todo, mas no detalhe o teu time foi superior e fez valer.",
    "Controlou, pressionou na hora certa e definiu. Vitória de time grande, daquelas que constroem campanha.",
    "Foi no sufoco no fim, mas a gente abriu o placar, soube administrar e segurou. Vitória importantíssima.",
    "O adversário deu trabalho, mas a gente teve mais paciência e mais qualidade na hora de finalizar. Vitória justa.",
    "Não deu pra relaxar nenhum minuto, e foi exatamente essa entrega que separou os dois times. Ganhamos no esforço e no talento.",
    "Time soube sofrer quando precisou e atacar quando deu. Vitória madura, dessas que valem ouro num mata-mata.",
  ],
  empate: [
    "Os dois se anularam e o ponto ficou dividido. Equilíbrio do começo ao fim.",
    "Empate que tem gosto de pouco. Dava pra ganhar, faltou capricho na hora de empurrar pra dentro.",
    "Jogo travado, duas defesas mandando bem e ninguém querendo arriscar demais. Um ponto pra cada e segue o baile.",
    "Empatou e a sensação é de gol perdido. A gente teve as chances, eles tiveram as deles, e no fim ninguém balançou a rede.",
    "Dividiram os pontos num duelo de marca-marca. Foi mais luta do que futebol, mas ponto fora não é ruim.",
    "Equilíbrio do início ao fim. Cada time mandou no seu pedaço e o empate acabou sendo o retrato fiel da partida.",
    "Um ponto que pode pesar lá na frente, pra bem ou pra mal. O jogo pediu um vencedor e não teve.",
  ],
  derrota_normal: [
    "Não foi o nosso dia. Criamos, batemos na trave do destino, mas saiu na frente quem aproveitou melhor. Cabeça erguida.",
    "Derrota dura de engolir. O adversário foi mais eficiente e a gente pagou caro pelas chances desperdiçadas.",
    "Levou a melhor quem foi mais frio. A gente até jogou, mas no detalhe que decide o time deles foi superior hoje.",
    "Perdemos por pouco, daquelas que doem porque o jogo estava ali pra ser empatado. Faltou o último passe, sobrou azar.",
    "Tomamos o gol na hora errada e não tivemos fôlego pra reagir. Derrota que ensina mais do que muita vitória.",
    "Não foi dessa vez. O rival soube sofrer, contou com a sorte na medida e levou a melhor. Vida que segue.",
    "Saiu derrotado o time que arriscou mais e não foi premiado. Doeu, mas tem próxima.",
  ],
  zebra_grande: [
    "ESCREVAM ESSE JOGO NA HISTÓRIA! Davi engoliu Golias! Ninguém apostava um centavo no teu time, e foi ele que calou o gigante!",
    "FEITO HISTÓRICO! O favoritão veio com toda a pompa e voltou pra casa de orelha murcha. Zebra das antigas, dessas que viram lenda!",
    "INACREDITÁVEL! O time que era pra ser atropelado virou o atropelador. Tirem o chapéu: a maior zebra da Copa!",
    "Caiu o coloso! Era a partida mais desigual da rodada no papel, e no gramado o teu time provou que papel não joga futebol. Épico!",
    "GUARDEM ESSA DATA! O azarão sem nenhuma chance derrubou o favorito absoluto. Isso não é resultado, é milagre de Copa do Mundo!",
    "O mundo inteiro torcia contra, os números riam do teu time, e vocês transformaram zombaria em festa. Zebra colossal!",
    "Davi não só enfrentou Golias: pendurou a cabeça dele na parede. Vitória impossível, improvável, inesquecível.",
  ],
  zebra_media: [
    "ZEBRA! O favorito tropeçou e o teu time aproveitou cada brecha. Ninguém esperava, e é por isso que é tão gostoso!",
    "Surpresa boa! Era pra perder no papel, mas a entrega e a malandragem viraram o jogo. Resultado que cala muita gente.",
    "Deu zebra e dela bem saborosa. O favorito subestimou, relaxou, e o teu time não perdoou. Vitória de quem acreditou.",
    "Quem diria! O azarão segurou o tranco, esperou a hora e cravou. Vitória que vale por dez pelo tamanho da façanha.",
    "O gigante esperava passeio e encontrou um espinho. Zebra construída na raça e na coragem de propor o jogo.",
    "Não estava nos planos de ninguém, mas estava no coração do teu time. Surpreendeu o favorito e levou um resultado de respeito.",
    "Time pequeno, jogo grande. A zebra apareceu porque alguém teve a ousadia de não baixar a cabeça pro favorito.",
  ],
  ko_passou_penaltis: [
    "Empate no tempo normal, decisão nos pênaltis, e a gente teve sangue frio na hora H. Classificou no sufoco!",
    "Não saiu do zero a zero do peito, foi pro mano a mano da marca da cal e o goleiro virou herói. Passou de fase!",
    "Jogo travado, ninguém cedeu, e a sorte sorriu pra quem teve coragem de bater. Avançou nos pênaltis!",
    "Coração na boca até a última cobrança, mas no fim foi a gente que estourou a rede e seguiu vivo na Copa.",
  ],
  ko_caiu_penaltis: [
    "Empatou no tempo normal e a decisão cruel dos pênaltis não sorriu pra gente. Eliminado de cabeça erguida.",
    "Foi até onde dava, segurou o empate, mas na loteria da marca da cal faltou pouco. Adeus à Copa.",
    "Jogo equilibrado, decisão nos pênaltis e o destino bateu na trave. Caiu lutando, sem nada a lamentar.",
    "Aguentou o tranco os 90 minutos, mas a cobrança decisiva não entrou. Dói, mas a campanha foi digna.",
  ],
  vexame: [
    "QUE VERGONHA! Com toda a folga de elenco, o teu time se atrapalhou inteiro e deixou escapar o que era tranquilo.",
    "Vexame puro. Era favorito disparado e tratou o jogo com a barriga cheia. O azarão agradeceu e humilhou. Inadmissível.",
    "Tropeço feio, desses que mancham campanha. O time inferior fez a lição de casa e o teu, que tinha tudo, entregou de graça.",
    "Decepção total. A torcida veio ver baile e viu naufrágio. Perder assim cobra preço caro.",
    "Que papelão! Superioridade no papel, apatia no gramado. O adversário menor foi mais time, mais fome, mais tudo.",
    "Doeu no orgulho. Favorito não pode dar esse mole: relaxou, subestimou e foi pego de jeito por quem ninguém respeitava.",
    "O gigante dormiu e levou o troco. Esse resultado não tem desculpa: era pra ganhar fácil e virou motivo de chacota.",
  ],
  goleada_sofrida: [
    "Foi um massacre e não tem como suavizar. O adversário passou por cima e o teu time não achou onde se agarrar.",
    "Apanhou feio. Cada ataque deles virava perigo, cada erro nosso virava gol. Goleada das doloridas.",
    "Levou baile e baile pesado. O rival foi muito superior do primeiro ao último minuto e o placar escancarou a diferença.",
    "Naufrágio completo. A defesa virou peneira, o meio sumiu e o ataque nem existiu. Goleada que vai doer um bom tempo.",
    "Atropelado sem dó. Quando o adversário é melhor e ainda está inspirado, sobra essa lavada. Engole o choro e levanta a cabeça.",
    "Foi um vendaval e o teu time ficou na chuva. Tomou de todos os jeitos. Derrota acachapante, sem atenuantes.",
    "Goleada amarga: dominados, expostos e sem resposta. O placar é cruel, mas foi o retrato honesto do que rolou em campo.",
  ],
};
export function postMatchBank(gf: number, ga: number, myO: number, oppO: number): string {
  const diff = myO - oppO;
  const gd = gf - ga;
  const favorito = diff >= 8;
  const azarao = diff <= -8;
  if (gf > ga) {
    if (azarao && gd >= 2) return "zebra_grande";
    if (azarao) return "zebra_media";
    if (favorito && gd >= 3) return "goleada_esperada_favorito";
    return "vitoria_normal";
  }
  if (gf === ga) return "empate";
  if (favorito && gd <= -2) return "vexame";
  if (gd <= -3) return "goleada_sofrida";
  return "derrota_normal";
}

// observação leiga do que o rival mostrou — SEM prescrever o contra-plano. Lê os sliders
// do novo formato (postura/pressão 0–100) + o estilo de ataque.
export function aiReadHint(ai: { postura: number; pressao: number; atk: AtkStyle }): string {
  if (ai.postura >= 82) return "Eles vieram com tudo pra cima, o time inteiro acampado no nosso campo.";
  if (ai.postura <= 22) return "Estacionaram o ônibus na frente do gol: só pensam em segurar.";
  if (ai.pressao >= 70) return "Estão pressionando lá em cima, marcando em cima da nossa saída de bola.";
  if (ai.pressao <= 30) return "Recuaram o bloco e estão esperando a gente na própria área.";
  if (ai.atk === "contra") return "Cederam a bola de propósito: estão à espreita pra sair no contra-ataque.";
  if (ai.postura >= 62) return "Soltaram os laterais e estão indo pra cima com gente no ataque.";
  if (ai.postura <= 38) return "Estão jogando mais cautelosos, com as linhas baixas e compactas.";
  return "Time equilibrado, sem se abrir nem se fechar demais. O detalhe vai decidir.";
}
