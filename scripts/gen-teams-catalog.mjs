// Builder do teams-catalog.json (Resultadismo) — a partir do REGISTRO editável.
//
// FONTE ÚNICA editável à mão:  data/teams-registry.json
//   (uma linha por time: slug, name_pt, short_pt, tla, country, kind,
//    competitions[], aliases[], crest_file). Edite ESSE arquivo.
//
// Este script:
//   1. lê data/teams-registry.json
//   2. resolve o escudo de cada time pelo manifesto (public/teams via teamCrests)
//      — se crest_file no registro estiver vazio mas existir arquivo casável, usa-o
//   3. escreve o catálogo em data/ E em src/data/ (mata a divergência das cópias)
//   4. reporta times sem escudo / sem nome / aliases vazios
//
// Uso:  node scripts/gen-teams-catalog.mjs   (ou: npm run gen:teams)
import { readdirSync, writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const TEAMS_DIR = join(ROOT, "public", "teams");
const REGISTRY = join(ROOT, "data", "teams-registry.json");
const OUTS = [join(ROOT, "data", "teams-catalog.json"), join(ROOT, "src", "data", "teams-catalog.json")];

// Slug IDÊNTICO ao do repo (gen-team-crests.mjs / teamCrests.ts).
const slug = (s) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Manifesto de escudos: slug do arquivo -> nome do arquivo (1º vence).
const crestBySlug = new Map();
for (const f of readdirSync(TEAMS_DIR).filter((f) => /\.(png|webp|svg|jpg|jpeg)$/i.test(f)).sort()) {
  const k = slug(f.replace(/\.(png|webp|svg|jpg|jpeg)$/i, ""));
  if (!crestBySlug.has(k)) crestBySlug.set(k, f);
}
// Acha o escudo de um time tentando slug + nome + aliases (igual ao runtime).
function resolveCrest(t) {
  for (const cand of [t.crest_file?.replace(/\.[^.]+$/, ""), t.slug, t.name_pt, ...(t.aliases ?? [])]) {
    const k = slug(cand);
    if (k && crestBySlug.has(k)) return crestBySlug.get(k);
  }
  return null;
}

if (!existsSync(REGISTRY)) {
  console.error("FALTA o registro:", REGISTRY, "\nRode primeiro a conversão (data/teams-registry.json).");
  process.exit(1);
}
const registry = JSON.parse(readFileSync(REGISTRY, "utf8"));

const catalog = [];
const noCrest = [];
const noAlias = [];
const seen = new Set();
for (const t of registry) {
  if (!t.slug || seen.has(t.slug)) { if (seen.has(t.slug)) console.warn("slug duplicado:", t.slug); continue; }
  seen.add(t.slug);
  const crest_file = resolveCrest(t);
  if (!crest_file) noCrest.push(`${t.slug} (${t.name_pt})`);
  if (!(t.aliases?.length)) noAlias.push(t.slug);
  catalog.push({
    slug: t.slug,
    name_pt: t.name_pt,
    short_pt: t.short_pt ?? t.name_pt,
    tla: t.tla ?? null,
    country: t.country ?? null,
    kind: t.kind === "national" ? "national" : "club",
    competitions: t.competitions ?? [],
    aliases: t.aliases ?? [],
    crest_file,
    crest_source: crest_file ? "repo (public/teams)" : (t.crest_source ?? null),
  });
}
catalog.sort((a, b) => a.slug.localeCompare(b.slug));

const json = JSON.stringify(catalog, null, 2) + "\n";
for (const out of OUTS) {
  if (!existsSync(dirname(out))) mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, json);
}

// ---- mapa canônico p/ o SYNC (Edge Function) -------------------------------
// exact: slug completo (sem remoção de sufixo) → tradução; loose: normName (com
// remoção de fc/ec/atletico…, igual ao sync) — chaves ambíguas ficam FORA do
// loose (reportadas) pra nunca traduzir errado.
// TLA NÃO vira chave: a sigla de 3 letras colide entre clube e país na ESPN
// (CAM = Camboja, não Atlético-MG; COM/GRE/BOT/BAH idem). Sigla só serve aos
// fallbacks TEAM_PT/COUNTRY_EN_PT do sync, depois que o canônico não casou.
const syncNorm = (s) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/\b(fc|ec|sc|cf|ac|afc|cd|clube|futebol|esporte|atletico)\b/g, "")
    .replace(/[^a-z0-9]+/g, "").trim();
const exact = {}; const looseRaw = new Map(); const ambiguous = new Set();
for (const t of catalog) {
  const entry = { name: t.name_pt, short: t.short_pt ?? t.name_pt, crest: t.crest_file ? "/teams/" + t.crest_file : null };
  for (const cand of [t.slug, t.name_pt, t.short_pt, ...(t.aliases ?? [])]) {
    const ke = slug(cand); if (ke && !(ke in exact)) exact[ke] = entry;
    const kl = syncNorm(cand);
    if (!kl) continue;
    const prev = looseRaw.get(kl);
    if (prev && prev.name !== entry.name) ambiguous.add(kl);
    else looseRaw.set(kl, entry);
  }
}
const loose = {}; for (const [k, v] of looseRaw) if (!ambiguous.has(k)) loose[k] = v;
const CANON_OUT = join(ROOT, "supabase", "functions", "_shared", "teams-canonical.json");
writeFileSync(CANON_OUT, JSON.stringify({ exact, loose }, null, 1) + "\n");
console.log(`canônico p/ sync: ${Object.keys(exact).length} exact / ${Object.keys(loose).length} loose` +
  (ambiguous.size ? ` | ambíguas fora do loose: ${[...ambiguous].join(", ")}` : ""));

console.log("== teams-catalog.json gerado (data/ + src/data/) ==");
console.log(`times: ${catalog.length} | clubes: ${catalog.filter((t) => t.kind === "club").length} | seleções: ${catalog.filter((t) => t.kind === "national").length}`);
console.log(`com escudo: ${catalog.length - noCrest.length} | SEM escudo: ${noCrest.length}`);
if (noCrest.length) console.log("  sem escudo:", noCrest.join(", "));
if (noAlias.length) console.log("  sem alias:", noAlias.join(", "));
