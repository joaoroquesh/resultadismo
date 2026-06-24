// Helpers de apresentação do Manager (sem JSX): bandeiras, estrelas, rótulos e
// bancos de texto boleiros. Tudo client-side, espelhando o protótipo v4.
import type { Estilo, Form, Marcacao, Postura, Tier } from "./types";

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

// rótulos de tática
export const FORM_OPTS: [Form, string][] = [
  ["433", "4-3-3"],
  ["442", "4-4-2"],
  ["352", "3-5-2"],
  ["4231", "4-2-3-1"],
  ["532", "5-3-2"],
  ["4312", "Losango"],
  ["343", "3-4-3"],
  ["424", "4-2-4"],
];
export const ESTILO_OPTS: [Estilo, string][] = [
  ["passes", "Troca de Passes"],
  ["meio", "Pelo Meio"],
  ["lados", "Pelos Lados"],
  ["longas", "Bolas Longas"],
  ["contra", "Contra-ataque"],
];
export const POSTURA_OPTS: [Postura, string][] = [
  ["all_in", "Todos ao Ataque"],
  ["atk", "Ofensiva"],
  ["eq", "Equilibrada"],
  ["def", "Defensiva"],
  ["retranca", "Retranca"],
];
export const MARC_OPTS: [Marcacao, string][] = [
  ["alta", "Pressão Alta"],
  ["media", "Bloco Médio"],
  ["baixa", "Bloco Baixo"],
];
export const FORM_NM: Record<Form, string> = {
  "433": "4-3-3",
  "442": "4-4-2",
  "352": "3-5-2",
  "4231": "4-2-3-1",
  "532": "5-3-2",
  "4312": "Losango (4-3-1-2)",
  "343": "3-4-3",
  "424": "4-2-4",
};
export const ESTILO_NM: Record<Estilo, string> = {
  passes: "Troca de Passes",
  meio: "Pelo Meio",
  lados: "Pelos Lados",
  longas: "Bolas Longas",
  contra: "Contra-ataque",
};
export const POSTURA_NM: Record<Postura, string> = {
  all_in: "Todos ao Ataque",
  atk: "Ofensiva",
  eq: "Equilibrada",
  def: "Defensiva",
  retranca: "Retranca",
};
export const MARC_NM: Record<Marcacao, string> = {
  alta: "Pressão Alta",
  media: "Bloco Médio",
  baixa: "Bloco Baixo",
};

export const TIER_LABEL: Record<Tier, string> = {
  S: "Lendária",
  A: "Favorita",
  B: "Forte",
  C: "Média",
  D: "Zebra",
};

// ===== BANCOS DE TEXTO BOLEIROS (v4) — [Time] vira o nome do time =====
export const TICKER_BUILDUP: Record<Estilo, string[]> = {
  passes: [
    "[Time] toca, toca, paciência total, rodando a bola de pé em pé…",
    "[Time] trança no meio-campo, vai construindo com calma a jogada…",
    "Roda a bola o [Time], tabela curta, procurando a brecha na defesa…",
    "[Time] no cadenciado, paredinha no meio, a bola não para de circular…",
    "Posse tranquila do [Time], passe pra cá, passe pra lá, esperando o espaço abrir…",
  ],
  meio: [
    "[Time] verticaliza pelo coração da defesa, lançamento pro meio…",
    "Rasgou pelo miolo o [Time], tabela rápida no eixo central…",
    "[Time] ataca pela espinha do campo, infiltração pelo meio…",
    "Pelo corredor central avança o [Time], um a um indo pra cima da zaga…",
    "[Time] busca o pivô no meio da área, jogada trabalhada no centro…",
  ],
  lados: [
    "[Time] abre o jogo na ponta direita, lateral subindo pra apoiar…",
    "Joga aberto o [Time], cruzamento se desenhando pela esquerda…",
    "[Time] estica pela linha de fundo, ponta encarando o marcador na ponta…",
    "Vai pela beirada o [Time], triangulação no lado pra puxar o cruzamento…",
    "[Time] explora a banda esquerda, bola na faixa pro lançador da área…",
  ],
  longas: [
    "[Time] já lança lá na frente, bola enfiada por cima da zaga…",
    "Direto o [Time], lançamento longo procurando o homem de área…",
    "[Time] estica a bola no chuveirinho, briga aérea se armando…",
    "Sem rodeio o [Time], chutão pra frente buscando a sobra…",
    "[Time] joga a bola na cabeça do centroavante, disputa lá na frente…",
  ],
  contra: [
    "Roubou e saiu rápido o [Time], contra-ataque em velocidade…",
    "[Time] sai na trinca, campo aberto, correria rumo ao gol…",
    "Puxou o contragolpe o [Time], dois contra um na frente…",
    "[Time] explode no contra-ataque, espaço nas costas da defesa…",
    "Recuperou e disparou o [Time], transição relâmpago pra cima do goleiro…",
  ],
};
export const TICKER_CONCLUSION: Record<string, string[]> = {
  gol: [
    "…e é GOOOOL do [Time]! Balançou a rede, explodiu a torcida!",
    "…CRAVOU! [Time] não perdoou e mandou pra dentro!",
    "…no fundo do barbante! Golaço do [Time], que jogada!",
    "…e o [Time] estufa a rede! Não teve pra ninguém!",
    "…GOL! O [Time] empurrou pra dentro e fez a festa!",
    "…e tira o goleiro da jogada! [Time] marca com categoria!",
    "…PEIXINHO certeiro! [Time] cabeceou pro gol e abriu o placar!",
  ],
  quase: [
    "…UUUUH! Tirou tinta da trave do [Time]! Por pouco!",
    "…na cara do gol o [Time] mandou rente à trave, assustou!",
    "…carimbou o travessão o [Time]! A bola gritou de dentro do gol!",
    "…QUASE! O [Time] passou raspando, a torcida levou a mão à cabeça!",
    "…por centímetros! O chute do [Time] beijou o poste e saiu!",
  ],
  defesa: [
    "…MILAGRE do goleiro! Espalmou o impossível do [Time]!",
    "…voou no ângulo e tirou a do [Time]! Que defesaça!",
    "…o arqueiro adivinhou a do [Time] e segurou firme!",
    "…defendeu com o pé o que era gol certo do [Time]! Inacreditável!",
    "…paredão! O goleiro fechou o gol e negou o do [Time]!",
  ],
  fora: [
    "…isolou! [Time] mandou lá na arquibancada, faltou pontaria.",
    "…pra fora! O [Time] mandou por cima do travessão.",
    "…mandou nas nuvens o [Time], a bola subiu demais.",
    "…errou o alvo o [Time], finalização sem perigo pro goleiro.",
    "…jogou fora o [Time], chute torto que morreu na linha de fundo.",
  ],
  bloqueio: [
    "…travou! Carrinho salvador parou o [Time] na hora H!",
    "…o xerife apareceu! Last man bloqueou o [Time]!",
    "…a zaga abafou o [Time]! Corpo na frente e bola pra escanteio.",
    "…interceptou! O defensor leu a jogada e cortou a do [Time].",
    "…bloqueou de peito o [Time]! A defesa se jogou inteira.",
  ],
};
export const TICKER_INTERRUPT: string[] = [
  "…mas a defesa adversária roubou no carrinho e cortou a jogada antes da finalização!",
  "…e o passe saiu errado! A bola escapou pela linha lateral, jogada perdida.",
  "…mas o bandeira levantou: impedimento marcado! A festa morreu na hora.",
  "…e veio a falta dura no meio-campo! O árbitro parou tudo, jogada interrompida.",
  "…mas a zaga interceptou o lançamento! Leu a intenção e matou o ataque no nascedouro.",
  "…e perdeu a bola na entrada da área! Desarme limpo, contragolpe na sequência.",
  "…mas escorregou na hora de finalizar! A chance se foi pela canela.",
  "…e o árbitro apita: impedimento na origem! A jogada toda foi anulada.",
  "…mas o goleiro saiu rápido e abafou antes do chute! Ataque desarmado.",
  "…e o atacante demorou, deu tempo da defesa voltar e fechar o espaço.",
  "…mas o cruzamento foi cortado de cabeça pela zaga! Aliviou o perigo.",
  "…e a marcação alta sufocou: roubada na saída, a jogada nem nasceu!",
];
// dicas táticas SUTIS e boleiras — só no FIM, sem número/jargão técnico.
export const TACTICAL_HINTS_SUBTLE: string[] = [
  "Sentiu como a barreira deles anulou nossas jogadas pelo meio? Pra próxima, abrir mais pelos lados pode soltar o time.",
  "Hoje a leitura do banco fez diferença: quando você fechou atrás na hora certa, o jogo deles emperrou de vez.",
  "Reparou que o adversário corria atrás o tempo todo? Seu jeito de propor o jogo encaixou direitinho com o que eles ofereciam.",
  "Faltou um plano pra furar aquela retranca — com mais paciência na troca de passes, aquele muro cai.",
  "Quando você mandou pressionar lá em cima, a bola passou a sobrar no nosso campo de ataque. Detalhe que pesou.",
  "A escolha de sair em velocidade castigou os espaços que eles deixaram nas costas. Casou como uma luva.",
  "Eles te empurraram pro campo de defesa e a sua postura não soube respirar — segurar a bola um pouco mais teria aliviado.",
  "Pequeno detalhe tático, grande resultado: você leu o que o adversário oferecia e jogou no contrapé deles o jogo inteiro.",
  "A formação deles tampou nosso corredor central — insistir por ali custou caro. Pelas pontas o caminho estava mais livre.",
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
    "Sufoco do início ao fim. Eles se fecharam, mas a represa estourou e foi gol atrás de gol — placar de números redondos.",
    "Foi quase treino. O rival não conseguiu sair do campo de defesa e a gente transformou superioridade em pendurada de bolas na rede.",
    "Bola pra cá, bola pra lá, e sempre terminando no fundo do gol deles. Goleada construída no peso do elenco.",
    "Domínio total. Eles tentaram aguentar, mas não tinha como — diferença de qualidade gritante e o placar só confirmou o óbvio.",
  ],
  vitoria_normal: [
    "Vitória suada, mas merecida. A gente propôs o jogo, segurou os nervos e levou os três pontos pra casa.",
    "Jogo de Copa é assim: ganhou, pronto. Não foi bonito o tempo todo, mas no detalhe o teu time foi superior e fez valer.",
    "Controlou, pressionou na hora certa e definiu. Vitória de time grande, daquelas que constroem campanha.",
    "Foi no sufoco no fim, mas a gente abriu o placar, soube administrar e carimbou o resultado. Três pontos importantíssimos.",
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
    "Um ponto que pode pesar lá na frente — pra bem ou pra mal. O jogo pediu um vencedor e não teve.",
  ],
  derrota_normal: [
    "Não foi o nosso dia. Criamos, batemos na trave do destino, mas saiu na frente quem aproveitou melhor. Cabeça erguida.",
    "Derrota dura de engolir. O adversário foi mais eficiente e a gente pagou caro pelas chances desperdiçadas.",
    "Levou a melhor quem foi mais frio. A gente até jogou, mas no detalhe que decide o time deles foi superior hoje.",
    "Perdemos por pouco, daquelas que doem porque o jogo estava ali pra ser empatado. Faltou o último passe, sobrou azar.",
    "Tomamos o gol na hora errada e não tivemos fôlego pra reagir. Derrota que ensina mais do que muita vitória.",
    "Não foi dessa vez. O rival soube sofrer, contou com a sorte na medida e levou os pontos. Vida que segue.",
    "Saiu derrotado o time que arriscou mais e não foi premiado. Doeu, mas tem próxima.",
  ],
  zebra_grande: [
    "ESCREVAM ESSE JOGO NA HISTÓRIA! Davi engoliu Golias! Ninguém apostava um centavo no teu time — e foi ele que calou o gigante!",
    "FEITO HISTÓRICO! O favoritão veio com toda a pompa e voltou pra casa de orelha murcha. Zebra das antigas, dessas que viram lenda!",
    "INACREDITÁVEL! O time que era pra ser atropelado virou o atropelador. Tirem o chapéu: a maior zebra da Copa!",
    "Caiu o coloso! Era a partida mais desigual da rodada no papel — e no gramado o teu time provou que papel não joga futebol. Épico!",
    "GUARDEM ESSA DATA! O azarão sem nenhuma chance derrubou o favorito absoluto. Isso não é resultado, é milagre de Copa do Mundo!",
    "O mundo inteiro torcia contra, os números riam do teu time — e vocês transformaram zombaria em festa. Zebra colossal!",
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
  vexame: [
    "QUE VERGONHA! Com toda a folga de elenco, o teu time se atrapalhou inteiro e deixou escapar o que era tranquilo.",
    "Vexame puro. Era favorito disparado e tratou o jogo com a barriga cheia — o azarão agradeceu e humilhou. Inadmissível.",
    "Tropeço feio, desses que mancham campanha. O time inferior fez a lição de casa e o teu, que tinha tudo, entregou de graça.",
    "Decepção total. A torcida veio ver baile e viu naufrágio. Perder assim cobra preço caro.",
    "Que papelão! Superioridade no papel, apatia no gramado. O adversário menor foi mais time, mais fome, mais tudo.",
    "Doeu no orgulho. Favorito não pode dar esse mole — relaxou, subestimou e foi pego de jeito por quem ninguém respeitava.",
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

// observação leiga do que o rival mostrou — SEM prescrever o contra-plano
export function aiReadHint(ai: { postura: Postura; marcacao: Marcacao }): string {
  if (ai.postura === "all_in") return "Eles vieram com tudo pra cima — o time inteiro acampado no nosso campo.";
  if (ai.postura === "retranca") return "Estacionaram o ônibus na frente do gol — só pensam em segurar.";
  if (ai.marcacao === "alta") return "Estão pressionando lá em cima, marcando em cima da nossa saída de bola.";
  if (ai.marcacao === "baixa") return "Recuaram o bloco e estão esperando a gente na própria área.";
  if (ai.postura === "atk") return "Soltaram os laterais e estão indo pra cima com gente no ataque.";
  if (ai.postura === "def") return "Estão jogando mais cautelosos, com as linhas baixas e compactas.";
  return "Time equilibrado, sem se abrir nem se fechar demais. O detalhe vai decidir.";
}
