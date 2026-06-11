// Pós-build: gera dist/retro.html a partir do dist/index.html com o SEO/OG do
// RETRÔ (título, descrição, canonical e og-retro.jpg). O vercel.json reescreve
// /retro* para esse arquivo — assim WhatsApp/Twitter mostram o card do mini-jogo,
// não o do bolão. A SPA continua intacta (mesmos bundles; o router lê a URL).
import { readFileSync, writeFileSync } from "node:fs";

const SRC = new URL("../dist/index.html", import.meta.url);
const OUT = new URL("../dist/retro.html", import.meta.url);

const TITLE = "Resultadismo Retrô — Você lembra desse placar?";
const DESC =
  "7 placares históricos de Copa do Mundo, poucos segundos pra cravar cada um. Monte a sua própria Copa, vire campeão e desafie os amigos. Grátis, sem cadastro. 🕹️";
const URL_RETRO = "https://www.resultadismo.com/retro";
const IMG = "https://www.resultadismo.com/og-retro.jpg";
const IMG_ALT = "Resultadismo Retrô — Você lembra desse placar? 7 jogos de Copas antigas.";

let html = readFileSync(SRC, "utf8");
const before = html;

// [regex, substituição] — tolerantes a quebras de linha dentro da tag
const swaps = [
  [/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`],
  [/(name="description"[^>]*?content=")[^"]*(")/, `$1${DESC}$2`],
  [/(rel="canonical"\s+href=")[^"]*(")/, `$1${URL_RETRO}$2`],
  [/(property="og:url"\s+content=")[^"]*(")/, `$1${URL_RETRO}$2`],
  [/(property="og:title"\s+content=")[^"]*(")/, `$1${TITLE}$2`],
  [/(property="og:description"[^>]*?content=")[^"]*(")/, `$1${DESC}$2`],
  [/(property="og:image"\s+content=")[^"]*(")/, `$1${IMG}$2`],
  [/(property="og:image:secure_url"\s+content=")[^"]*(")/, `$1${IMG}$2`],
  [/(property="og:image:alt"[^>]*?content=")[^"]*(")/, `$1${IMG_ALT}$2`],
  [/(name="twitter:title"\s+content=")[^"]*(")/, `$1${TITLE}$2`],
  [/(name="twitter:description"[^>]*?content=")[^"]*(")/, `$1${DESC}$2`],
  [/(name="twitter:image"\s+content=")[^"]*(")/, `$1${IMG}$2`],
  [/(name="twitter:image:alt"[^>]*?content=")[^"]*(")/, `$1${IMG_ALT}$2`],
];

for (const [re, sub] of swaps) {
  if (!re.test(html)) {
    console.error(`build-retro-html: padrão não encontrado no index.html: ${re}`);
    process.exit(1); // quebra o build — melhor que subir og errado em silêncio
  }
  html = html.replace(re, sub);
}

if (html === before) {
  console.error("build-retro-html: nada substituído — index.html mudou de formato?");
  process.exit(1);
}
writeFileSync(OUT, html);
console.log(`build-retro-html: dist/retro.html gerado (${html.length} bytes)`);
