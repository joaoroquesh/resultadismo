// Sincroniza o registro de COMPETIÇÕES (data/competitions-registry.json) com o app.
//
// FONTE editável à mão: data/competitions-registry.json
//   - ordem do array = ordem de exibição na personalização
//   - group: "Seleções" | "Ligas e estaduais" | "Copas" | "Alternativos"
//   - in_personalization: aparece na personalização
//
// Este script:
//   1. valida o registro (códigos únicos, grupos válidos)
//   2. copia para src/data/competitions-registry.json (o que o front importa)
//   3. emite SQL de upsert idempotente em data/competitions-upsert.sql —
//      quando você EDITAR a lista, cole esse SQL numa migration nova pra
//      refletir no banco (o banco continua sendo a fonte dos ids).
//
// Uso: node scripts/gen-competitions.mjs   (ou: npm run gen:comps)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.env.REPO_ROOT || join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "data", "competitions-registry.json");
const OUT_FRONT = join(ROOT, "src", "data", "competitions-registry.json");
const OUT_SQL = join(ROOT, "data", "competitions-upsert.sql");

const GROUPS = new Set(["Seleções", "Ligas e estaduais", "Copas", "Alternativos"]);
const reg = JSON.parse(readFileSync(SRC, "utf8"));

const seen = new Set();
for (const c of reg) {
  if (!c.code) throw new Error("entrada sem code");
  if (seen.has(c.code)) throw new Error("code duplicado: " + c.code);
  seen.add(c.code);
  if (!GROUPS.has(c.group)) throw new Error(`grupo inválido em ${c.code}: ${c.group}`);
}

if (!existsSync(dirname(OUT_FRONT))) mkdirSync(dirname(OUT_FRONT), { recursive: true });
writeFileSync(OUT_FRONT, JSON.stringify(reg, null, 2) + "\n");

const esc = (s) => String(s).replaceAll("'", "''");
const slugify = (s) =>
  String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const sql = [
  "-- GERADO por scripts/gen-competitions.mjs a partir de data/competitions-registry.json.",
  "-- Ao editar o registro, cole este conteúdo numa MIGRATION nova (idempotente:",
  "-- atualiza as existentes por provider_code e insere só as que faltam).",
  ...reg.map((c) => {
    const vals = `display_name = '${esc(c.name)}', type = '${esc(c.type)}', area = '${esc(c.area)}', in_personalization = ${c.in_personalization ? "true" : "false"}`;
    return `update public.competitions set ${vals} where provider_code = '${esc(c.code)}';
insert into public.competitions (name, display_name, slug, provider_code, type, area, status, in_personalization)
select '${esc(c.name)}', '${esc(c.name)}', '${slugify(c.name)}', '${esc(c.code)}', '${esc(c.type)}', '${esc(c.area)}', 'active', ${c.in_personalization ? "true" : "false"}
 where not exists (select 1 from public.competitions where provider_code = '${esc(c.code)}');`;
  }),
].join("\n");
writeFileSync(OUT_SQL, sql + "\n");

console.log(`== competitions-registry ==`);
console.log(`competições: ${reg.length} | front: src/data/ | SQL: data/competitions-upsert.sql`);
for (const g of GROUPS) console.log(`  ${g}: ${reg.filter((c) => c.group === g).length}`);
