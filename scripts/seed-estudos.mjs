// Seed LOCAL da biblioteca de Estudos (admin). Sobe os HTMLs de docs/ para o
// bucket privado "estudos" e cria as linhas em public.study_docs. Usa a
// service_role key (ignora RLS) — SÓ PARA O SUPABASE LOCAL.
//
// Uso:
//   eval "$(supabase status -o env)"   # exporta SERVICE_ROLE_KEY etc.
//   SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
//     node scripts/seed-estudos.mjs
//
// (ou passe SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY você mesmo.)

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const URL = process.env.SUPABASE_URL || process.env.API_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

if (!URL || !KEY) {
  console.error(
    "Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.\n" +
      'Rode: eval "$(supabase status -o env)" e exporte API_URL/SERVICE_ROLE_KEY.',
  );
  process.exit(1);
}

const BUCKET = "estudos";

// fonte (no repo) → metadados do estudo
const DOCS = [
  {
    file: "docs/analise-gamificacao-octalysis.html",
    slug: "analise-gamificacao",
    title: "Análise de Gamificação (Octalysis) & UX",
    category: "Gamificação",
    description: "Bolão e Retrô pelos 8 Core Drives, jornada do usuário e roteiro de otimização.",
    sort: 0,
  },
  {
    file: "docs/planning/minijogo-historico/homologacao-fase1.html",
    slug: "retro-placares-niveis",
    title: "Retrô — Placares, níveis e regras",
    category: "Retrô",
    description: "Regras de negócio do Retrô: todos os placares, níveis de dificuldade e pontuação.",
    sort: 0,
  },
  {
    file: "docs/planning/minijogo-historico/plano-v1.html",
    slug: "retro-plano-v1",
    title: "Retrô — Plano v1",
    category: "Retrô",
    description: "Planejamento original do mini-jogo histórico.",
    sort: 1,
  },
  {
    file: "docs/planning/confrontos-v2.html",
    slug: "confrontos-v2",
    title: "Confrontos v2",
    category: "Confrontos",
    description: "Estudo de evolução dos confrontos (Liga/Copa) entre usuários.",
    sort: 0,
  },
  {
    file: "docs/planning/minijogo-historico/minijogo-historico-v1.html",
    slug: "minijogo-historico-v1",
    title: "Mini-jogo histórico — v1",
    category: "Planos",
    description: "Apresentação v1 do mini-jogo (antes pública em /planos).",
    sort: 0,
  },
];

const sb = createClient(URL, KEY, { auth: { persistSession: false } });

let ok = 0;
for (const d of DOCS) {
  try {
    const html = await readFile(resolve(ROOT, d.file), "utf8");
    const path = `${d.slug}.html`;
    const up = await sb.storage
      .from(BUCKET)
      .upload(path, new Blob([html], { type: "text/html" }), {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });
    if (up.error) throw up.error;
    const { error } = await sb.from("study_docs").upsert(
      {
        slug: d.slug,
        title: d.title,
        category: d.category,
        description: d.description,
        storage_path: path,
        sort: d.sort,
      },
      { onConflict: "slug" },
    );
    if (error) throw error;
    console.log(`✓ ${d.slug}  (${(html.length / 1024).toFixed(0)} KB)`);
    ok++;
  } catch (e) {
    console.error(`✗ ${d.slug}: ${e.message ?? e}`);
  }
}
console.log(`\n${ok}/${DOCS.length} estudos no acervo local.`);
