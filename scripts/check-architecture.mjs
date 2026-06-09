#!/usr/bin/env node
// ============================================================================
// Resultadismo · Verificador de estrutura de dependências (camadas)
// ----------------------------------------------------------------------------
// Regra: camada INTERNA não pode "conhecer" (importar) camada mais EXTERNA.
// Camadas (interna → externa) e o que cada uma PODE importar:
//
//   kernel      (lib, types, data)           → nada interno
//   ui          (components/ui)              → kernel
//   components  (components/* exceto ui/layout) → kernel, ui
//   shared      (features/auth — transversal) → kernel, ui, components
//   feature     (features/* exceto auth)     → kernel, ui, components, shared, chrome
//   chrome      (components/layout)          → camada-PONTE: compõe o app (importa
//               features) E oferece primitivas de página (Page) usadas pelas
//               features. Neutra nas duas direções; só não importa o root `app`.
//   app         (src raiz: App/main/sw)      → tudo (composição final; ninguém importa)
//
// VIOLAÇÃO DURA (falha, exit 1): núcleo vazando pra fora — ex.: ui importando
//   feature, kernel importando qualquer coisa interna, qualquer um importando o
//   shell/app. É o invariante que NUNCA pode quebrar no código futuro.
// AVISO (advisory, exit 0): acoplamento lateral entre features e leitura de
//   metadado fora do src (package.json/CHANGELOG). É o backlog de otimização.
// ============================================================================
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..", "src");

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(e)) files.push(p);
  }
})(SRC);

function layerOf(abs) {
  const r = relative(SRC, abs).replace(/\\/g, "/");
  if (/^(lib|types|data)\//.test(r)) return "kernel";
  if (/^components\/ui\//.test(r)) return "ui";
  if (/^components\/layout\//.test(r)) return "chrome";
  if (/^components\//.test(r)) return "components";
  if (/^features\/auth\//.test(r)) return "shared";
  const mf = r.match(/^features\/([^/]+)\//);
  if (mf) return "feature:" + mf[1];
  return "app";
}
const baseCat = (l) => (l.startsWith("feature:") ? "feature" : l);
const ALLOWED = {
  kernel: new Set([]),
  ui: new Set(["kernel"]),
  components: new Set(["kernel", "ui"]),
  shared: new Set(["kernel", "ui", "components"]),
  feature: new Set(["kernel", "ui", "components", "shared", "chrome"]),
  chrome: new Set(["kernel", "ui", "components", "shared", "feature", "chrome"]),
  app: new Set(["kernel", "ui", "components", "shared", "feature", "chrome", "app"]),
};

function resolveImport(fromAbs, spec) {
  let base = null;
  if (spec.startsWith("@/")) base = resolve(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(fromAbs), spec);
  else return { kind: "external" }; // node_modules
  // fora do src? (ex.: ../package.json, ../.claude/CHANGELOG.md)
  if (!base.startsWith(SRC + "/") && base !== SRC) return { kind: "repo-root", path: base };
  return { kind: "internal", path: base };
}

const importRe =
  /(?:import|export)[\s\S]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
const hard = [];
const soft = [];

for (const f of files) {
  const sLayer = layerOf(f);
  const sBase = baseCat(sLayer);
  const rf = relative(SRC, f).replace(/\\/g, "/");
  const src = readFileSync(f, "utf8");
  let m;
  while ((m = importRe.exec(src))) {
    const spec = m[1] || m[2];
    if (!spec) continue;
    const r = resolveImport(f, spec);
    if (r.kind === "external") continue;
    if (r.kind === "repo-root") {
      soft.push({ kind: "metadado-fora-do-src", from: rf, to: spec });
      continue;
    }
    const tLayer = layerOf(r.path);
    const tBase = baseCat(tLayer);
    if (sLayer === tLayer) continue; // mesma camada/mesma feature → ok
    if (sBase === "feature" && tBase === "feature") {
      soft.push({ kind: "acoplamento-lateral", from: rf, fromL: sLayer, to: spec, toL: tLayer });
      continue;
    }
    if (ALLOWED[sBase].has(tBase)) continue; // direção permitida
    hard.push({ from: rf, fromL: sLayer, to: spec, toL: tLayer });
  }
}

const C = { red: "\x1b[31m", yellow: "\x1b[33m", green: "\x1b[32m", dim: "\x1b[2m", reset: "\x1b[0m" };
console.log("Resultadismo · estrutura de dependências (camadas)\n");

console.log(`${hard.length ? C.red : C.green}VIOLAÇÕES DURAS (núcleo vazando pra fora): ${hard.length}${C.reset}`);
for (const v of hard) console.log(`  ✗ ${v.fromL} → ${v.toL}\n      ${v.from}  importa  ${v.to}`);
if (!hard.length) console.log("  nenhuma ✅");

console.log(`\n${C.yellow}AVISOS — acoplamento lateral entre features: ${soft.filter((s) => s.kind === "acoplamento-lateral").length}${C.reset}`);
for (const v of soft.filter((s) => s.kind === "acoplamento-lateral"))
  console.log(`  ${C.dim}•${C.reset} ${v.from}  →  ${v.to}`);

const meta = soft.filter((s) => s.kind === "metadado-fora-do-src");
if (meta.length) {
  console.log(`\n${C.yellow}AVISOS — leitura de metadado fora do src: ${meta.length}${C.reset}`);
  for (const v of meta) console.log(`  ${C.dim}•${C.reset} ${v.from}  →  ${v.to}`);
}

console.log(
  `\nResumo: ${hard.length} dura(s) · ${soft.length} aviso(s). ` +
    (hard.length ? `${C.red}REPROVADO${C.reset}` : `${C.green}APROVADO${C.reset} (avisos não bloqueiam)`),
);
process.exit(hard.length ? 1 : 0);
