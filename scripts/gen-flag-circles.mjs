#!/usr/bin/env node
/**
 * gen-flag-circles.mjs — padroniza bandeiras SVG de public/teams/ no formato
 * CÍRCULO (padrão dos escudos de seleção PNG do Sofascore, 150x150 circular):
 * envelopa o SVG retangular num clip circular com corte centralizado (cover).
 *
 * Idempotente: pula arquivos já convertidos (marcador data-rd-circle).
 * Uso: node scripts/gen-flag-circles.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DIR = path.resolve(import.meta.dirname, "..", "public", "teams");

let done = 0, skipped = 0, failed = [];
for (const file of readdirSync(DIR).filter((f) => f.endsWith(".svg")).sort()) {
  const p = path.join(DIR, file);
  let src = readFileSync(p, "utf8");
  if (src.includes("data-rd-circle")) { skipped++; continue; }

  // limpa prólogo XML / doctype / comentários iniciais
  src = src.replace(/<\?xml[^>]*\?>/g, "").replace(/<!DOCTYPE[^>]*>/g, "").trim();

  const open = src.match(/<svg\b[^>]*>/s);
  if (!open) { failed.push([file, "sem tag <svg>"]); continue; }
  const attrs = open[0];

  // viewBox do original (ou sintetiza de width/height)
  let viewBox = attrs.match(/viewBox\s*=\s*"([^"]+)"/)?.[1];
  if (!viewBox) {
    const w = attrs.match(/width\s*=\s*"([\d.]+)/)?.[1];
    const h = attrs.match(/height\s*=\s*"([\d.]+)/)?.[1];
    if (!w || !h) { failed.push([file, "sem viewBox nem width/height"]); continue; }
    viewBox = `0 0 ${w} ${h}`;
  }
  const inner = src.slice(src.indexOf(open[0]) + open[0].length, src.lastIndexOf("</svg>"));
  const clipId = `rd-c-${file.replace(/\W/g, "")}`;

  const out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-rd-circle="1">
<defs><clipPath id="${clipId}"><circle cx="50" cy="50" r="50"/></clipPath></defs>
<g clip-path="url(#${clipId})">
<svg viewBox="${viewBox}" width="100" height="100" preserveAspectRatio="xMidYMid slice">${inner}</svg>
</g>
</svg>
`;
  writeFileSync(p, out);
  done++;
}
console.log(`convertidas: ${done} · já circulares: ${skipped} · falhas: ${failed.length}`);
for (const [f, why] of failed) console.log("  FALHOU:", f, "—", why);
if (failed.length) process.exit(1);
