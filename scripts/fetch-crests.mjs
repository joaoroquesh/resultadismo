// Baixa os escudos/bandeiras FALTANTES do catálogo (data/teams-catalog.json) para
// public/teams, usando a URL em `crest_source` (Wikimedia Commons Special:FilePath).
// Roda LOCALMENTE (precisa de rede). O agente não baixa imagens; este script sim.
//
// Uso:
//   node scripts/fetch-crests.mjs            # baixa só o que falta (crest_file: null)
//   node scripts/fetch-crests.mjs --force    # rebaixa mesmo se o arquivo já existir
//   node scripts/fetch-crests.mjs --only=catar,egito,gana
//
// Depois rode:  node scripts/gen-team-crests.mjs   (atualiza o manifest)
//
// Obs.: as seleções vêm como BANDEIRA .svg (retangular). Se preferir escudo da
// federação (quadrado), troque o crest_source no catálogo e rode com --force.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TEAMS_DIR = join(ROOT, "public", "teams");
const CATALOG = join(ROOT, "data", "teams-catalog.json");

const UA = "Resultadismo-crest-fetcher/1.0 (https://github.com/; estudio@sicoob.com.br)";
const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const onlyArg = args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? new Set(onlyArg.split("=")[1].split(",").map((s) => s.trim())) : null;

if (Number(process.versions.node.split(".")[0]) < 18) {
  console.error("Precisa de Node 18+ (fetch nativo). Versão atual:", process.versions.node);
  process.exit(1);
}
if (!existsSync(CATALOG)) {
  console.error("Catálogo não encontrado:", CATALOG, "\nGere antes:  node scripts/gen-teams-catalog.mjs");
  process.exit(1);
}
if (!existsSync(TEAMS_DIR)) mkdirSync(TEAMS_DIR, { recursive: true });

const catalog = JSON.parse(readFileSync(CATALOG, "utf8"));

// Extensão a partir do nome de arquivo embutido na URL (…/Flag of X.svg).
function extFromUrl(u) {
  try {
    const p = decodeURIComponent(new URL(u).pathname);
    const m = p.match(/\.(svg|png|webp|jpe?g)$/i);
    return m ? "." + m[1].toLowerCase() : ".svg";
  } catch { return ".svg"; }
}

async function download(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/*,*/*" }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (!/image\/|svg|octet-stream/i.test(ct)) throw new Error(`content-type inesperado: ${ct}`);
  return Buffer.from(await res.arrayBuffer());
}

const alvo = catalog.filter((t) => {
  if (ONLY && !ONLY.has(t.slug)) return false;
  if (!t.crest_source || !/^https?:/i.test(t.crest_source)) return false;
  return FORCE || !t.crest_file; // só os sem escudo, salvo --force
});

console.log(`Alvos: ${alvo.length}${ONLY ? " (filtrado por --only)" : ""}${FORCE ? " (--force)" : ""}\n`);

let ok = 0, skip = 0, fail = 0;
const falhas = [];
for (const t of alvo) {
  const ext = extFromUrl(t.crest_source);
  const fname = t.slug + ext;
  const dest = join(TEAMS_DIR, fname);
  if (!FORCE && existsSync(dest)) { console.log(`= ${fname} (já existe, pulando)`); skip++; continue; }
  try {
    const buf = await download(t.crest_source);
    if (!buf || buf.length < 200) throw new Error("arquivo muito pequeno/vazio");
    writeFileSync(dest, buf);
    console.log(`✓ ${fname}  (${(buf.length / 1024).toFixed(1)} kB)  ${t.name_pt}`);
    ok++;
  } catch (e) {
    console.log(`✗ ${fname}  FALHOU: ${e.message}  <- ${t.crest_source}`);
    falhas.push(`${t.slug} (${t.name_pt}): ${t.crest_source}`);
    fail++;
  }
  await new Promise((r) => setTimeout(r, 350)); // gentil com o Commons
}

console.log(`\nResumo: ${ok} baixados, ${skip} pulados, ${fail} falharam.`);
if (falhas.length) {
  console.log("\nFalhas (baixe manualmente e salve em public/teams/<slug>.png|svg):");
  console.log(falhas.join("\n"));
}
console.log("\nAgora rode:  node scripts/gen-team-crests.mjs");
