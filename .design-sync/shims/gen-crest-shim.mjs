// Gera .design-sync/shims/crest.ts a partir de src/lib/crest.ts, trocando os
// dois import.meta.glob (macro exclusiva do Vite, que quebra o esbuild do
// design-sync — vira undefined e joga TypeError na carga do IIFE, matando o
// bundle inteiro) por imports ESTÁTICOS dos 20 SVGs. O esbuild do conversor
// tem loader .svg='dataurl', então cada SVG entra inline como data-URL e os
// escudos renderizam de verdade nos previews (Escudo/CrestMask/Avatar/CrestEditor).
//
// Reprodutível: rode de novo se os SVGs em src/assets/{escudos,grupos} mudarem.
//   node .design-sync/shims/gen-crest-shim.mjs
// Ver .design-sync/NOTES.md.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "..", "..");
const src = readFileSync(resolve(repo, "src/lib/crest.ts"), "utf8");

function svgs(dir) {
  return readdirSync(resolve(repo, dir))
    .filter((f) => f.endsWith(".svg"))
    .sort();
}
const escudos = svgs("src/assets/escudos");
const grupos = svgs("src/assets/grupos");

let imports = "";
let escMap = [];
let flaMap = [];
escudos.forEach((f, i) => {
  imports += `import __e${i} from "@/assets/escudos/${f}";\n`;
  escMap.push(`  "../assets/escudos/${f}": __e${i},`);
});
grupos.forEach((f, i) => {
  imports += `import __f${i} from "@/assets/grupos/${f}";\n`;
  flaMap.push(`  "../assets/grupos/${f}": __f${i},`);
});

const escBlock =
  `const ESCUDO_FILES: Record<string, string> = {\n${escMap.join("\n")}\n};`;
const flaBlock =
  `const FLAMULA_FILES: Record<string, string> = {\n${flaMap.join("\n")}\n};`;

let out = src
  // avatar mora em src/lib; do shim (.design-sync/shims) o caminho relativo muda.
  .replace(/from "\.\/avatar"/, 'from "@/lib/avatar"')
  // troca os dois import.meta.glob por mapas estáticos.
  .replace(/const ESCUDO_FILES = import\.meta\.glob\([\s\S]*?\}\) as Record<string, string>;/, escBlock)
  .replace(/const FLAMULA_FILES = import\.meta\.glob\([\s\S]*?\}\) as Record<string, string>;/, flaBlock);

const header =
  "// GERADO por .design-sync/shims/gen-crest-shim.mjs — NÃO editar à mão.\n" +
  "// Espelho de src/lib/crest.ts com import.meta.glob → imports estáticos.\n\n";

out = header + imports + "\n" + out;
writeFileSync(resolve(here, "crest.ts"), out);
console.log(`crest shim: ${escudos.length} escudos + ${grupos.length} grupos → .design-sync/shims/crest.ts`);
