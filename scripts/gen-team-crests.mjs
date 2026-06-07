// Gera src/lib/teamCrests.ts a partir dos arquivos em public/teams.
// Decisão #2: os escudos versionados no repo (servidos pela CDN da Vercel, custo
// zero no Supabase, imutáveis) são a fonte PRIMÁRIA; o crest_url externo é só
// fallback. Este manifest mapeia slug-do-nome -> nome-do-arquivo real.
//
// Rode após adicionar/renomear escudos:  node scripts/gen-team-crests.mjs
import { readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "public", "teams");

const slug = (s) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const files = readdirSync(dir).filter((f) => /\.(png|webp|svg|jpg|jpeg)$/i.test(f));
const map = {};
for (const f of files.sort()) {
  const base = f.replace(/\.(png|webp|svg|jpg|jpeg)$/i, "");
  const key = slug(base);
  if (key && !(key in map)) map[key] = f; // primeiro vence (ordem alfabética estável)
}

const body = `// AUTO-GERADO por scripts/gen-team-crests.mjs — NÃO editar à mão.
// Escudos versionados em public/teams (fonte primária; CDN Vercel, custo zero).
export const TEAM_CRESTS: Record<string, string> = ${JSON.stringify(map, null, 0)};

/** Normaliza um nome de time para a chave de escudo (minúsculo, sem acento/ruído). */
export function teamCrestSlug(s: string | null | undefined): string {
  return (s ?? "").normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Caminho do escudo local (/teams/arquivo) pro 1º nome que existir no repo, senão null. */
export function teamCrestPath(...names: (string | null | undefined)[]): string | null {
  for (const n of names) {
    const k = teamCrestSlug(n);
    if (k && TEAM_CRESTS[k]) return "/teams/" + TEAM_CRESTS[k];
  }
  return null;
}
`;

writeFileSync(join(root, "src", "lib", "teamCrests.ts"), body);
console.log(`teamCrests.ts gerado: ${Object.keys(map).length} escudos.`);
