#!/usr/bin/env node
/**
 * gen-retro-seed.mjs — Fase 1 do mini-jogo Resultadismo Retrô.
 *
 * Lê os 22 JSONs do openfootball (CC0) em data/retro-sources/ + a curadoria
 * (data/retro-sources/curadoria.json: nomes PT, slugs, tiers, extintas, jogos-lenda)
 * e gera a migration do seed: supabase/migrations/<NUM>_retro_matches.sql
 * (tabela retro_matches + RLS sem policy + 964 jogos com dificuldade 1–7).
 *
 * Heurística de dificuldade: docs/planning/minijogo-historico/decisoes-fechadas.md (D9).
 * Portões de qualidade (decisão D10): contagem oficial por edição, total 964,
 * pênaltis só em empate, prorrogação só em mata-mata, walkover excluído.
 *
 * Uso: node scripts/gen-retro-seed.mjs [--dry-run]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const SRC = path.join(ROOT, "data", "retro-sources");
const MIGRATION = path.join(ROOT, "supabase", "migrations", "20260610000001_retro_matches.sql");
const DRY = process.argv.includes("--dry-run");

const YEARS = [1930, 1934, 1938, 1950, 1954, 1958, 1962, 1966, 1970, 1974, 1978, 1982, 1986, 1990, 1994, 1998, 2002, 2006, 2010, 2014, 2018, 2022];
const OFICIAL = { 1930: 18, 1934: 17, 1938: 18, 1950: 22, 1954: 26, 1958: 35, 1962: 32, 1966: 32, 1970: 32, 1974: 38, 1978: 38, 1982: 52, 1986: 52, 1990: 52, 1994: 52, 1998: 64, 2002: 64, 2006: 64, 2010: 64, 2014: 64, 2018: 64, 2022: 64 };
const HOSTS = { 1930: "Uruguai", 1934: "Itália", 1938: "França", 1950: "Brasil", 1954: "Suíça", 1958: "Suécia", 1962: "Chile", 1966: "Inglaterra", 1970: "México", 1974: "Alemanha", 1978: "Argentina", 1982: "Espanha", 1986: "México", 1990: "Itália", 1994: "Estados Unidos", 1998: "França", 2002: "Coreia e Japão", 2006: "Alemanha", 2010: "África do Sul", 2014: "Brasil", 2018: "Rússia", 2022: "Catar" };
// Início da 2ª fase de grupos (edições com 2 fases de grupos)
const GROUP2_FROM = { 1974: "1974-06-26", 1978: "1978-06-14", 1982: "1982-06-28" };

const fail = (msg) => { console.error(`✗ GATE FALHOU: ${msg}`); process.exit(1); };

// ---------- curadoria ----------
const curPath = path.join(SRC, "curadoria.json");
if (!existsSync(curPath)) fail(`curadoria.json não encontrado em ${curPath}`);
const cur = JSON.parse(readFileSync(curPath, "utf8"));
const teamMap = new Map(cur.teams.map((t) => [t.name_en, t]));
const TIER_RANK = { A: 3, B: 2, C: 1 };

// ---------- fase ----------
function stageOf(round, year, date) {
  const r = round.toLowerCase();
  const replay = r.includes("replay");
  if (r === "final") return { code: "final", label: "Final", ko: true, replay };
  if (r === "final round") return { code: "final_round", label: "Quadrangular final", ko: false, replay };
  if (r.startsWith("third") || r.startsWith("match for third")) return { code: "third", label: "Decisão de 3º lugar", ko: true, replay };
  if (r.startsWith("semi")) return { code: "sf", label: "Semifinal", ko: true, replay };
  if (r.startsWith("quarter")) return { code: "qf", label: replay ? "Quartas de final (replay)" : "Quartas de final", ko: true, replay };
  if (r === "round of 16") return { code: "r16", label: "Oitavas de final", ko: true, replay };
  if (r === "preliminary round" && year === 1934) return { code: "r16", label: "Oitavas de final", ko: true, replay };
  if (r.startsWith("first round") && (year === 1934 || year === 1938))
    return { code: "r16", label: replay ? "Oitavas de final (replay)" : "Oitavas de final", ko: true, replay };
  if (r === "first round" && year === 1950) return { code: "group", label: "Fase de grupos", ko: false, replay };
  if (/^group \d+ play-off$/.test(r)) return { code: "group_playoff", label: "Desempate de grupo", ko: true, replay };
  if (r.startsWith("matchday")) {
    if (GROUP2_FROM[year] && date >= GROUP2_FROM[year]) return { code: "group2", label: "2ª fase de grupos", ko: false, replay };
    return { code: "group", label: "Fase de grupos", ko: false, replay };
  }
  fail(`round desconhecido: "${round}" (${year})`);
}

// ---------- dificuldade (D9 + ajustes do PO) ----------
function rawDifficulty(m) {
  let s = 0;
  // idade da Copa
  s += m.year >= 2014 ? 0 : m.year >= 1994 ? 1 : m.year >= 1970 ? 2 : 3;
  // fama (por seleção) + extintas (ajuste do PO)
  for (const t of [m.home, m.away]) {
    s += t.tier === "A" ? 0 : t.tier === "B" ? 0.5 : 1;
    if (t.extinct) s += 1;
  }
  // jogo do Brasil
  if (m.home.slug === "brasil" || m.away.slug === "brasil") s -= 1.5;
  // fase do jogo real (3º lugar +1 = ajuste do PO)
  const PHASE = { final: -1, sf: -0.5, third: 1, group: 1, group2: 0.5, final_round: 0, r16: 0, qf: 0, group_playoff: 0.5 };
  s += PHASE[m.stage.code];
  if (m.stage.replay) s += 1;
  // placar raro
  const total = m.hs + m.as, diff = Math.abs(m.hs - m.as);
  if (total >= 7 || diff >= 4) s += 2;
  else if (total >= 5) s += 1;
  // zebra (vencedor de tier menor)
  if (m.hs !== m.as) {
    const w = m.hs > m.as ? m.home : m.away, l = m.hs > m.as ? m.away : m.home;
    if (TIER_RANK[w.tier] < TIER_RANK[l.tier]) s += 1.5;
  }
  return s;
}
const bucket = (s) => (s <= 0 ? 1 : s <= 1.5 ? 2 : s <= 3 ? 3 : s <= 4.5 ? 4 : s <= 6 ? 5 : s <= 7.5 ? 6 : 7);

// ---------- parse ----------
const rows = [];
let skipped = 0;
const legendKey = (y, t1, t2) => `${y}|${t1}|${t2}`;
const legends = new Map((cur.legends ?? []).map((l) => [legendKey(l.year, l.team1_en, l.team2_en), l]));
const legendsSeen = new Set();

for (const year of YEARS) {
  const data = JSON.parse(readFileSync(path.join(SRC, `${year}.json`), "utf8"));
  let n = 0;
  for (const m of data.matches) {
    const sc = m.score ?? {};
    if (m.status || sc.ft == null) {
      skipped++;
      if (!(year === 1938 && m.team1 === "Sweden")) fail(`anomalia inesperada: ${year} ${m.team1}x${m.team2}`);
      continue;
    }
    const home = teamMap.get(m.team1), away = teamMap.get(m.team2);
    if (!home) fail(`seleção sem curadoria: "${m.team1}"`);
    if (!away) fail(`seleção sem curadoria: "${m.team2}"`);
    const fin = sc.et ?? sc.ft; // placar final = prorrogação se houve, senão 90'
    const stage = stageOf(m.round, year, m.date);
    const row = {
      year, host: HOSTS[year], stage,
      home, away, hs: fin[0], as: fin[1],
      et: !!sc.et, ph: sc.p ? sc.p[0] : null, pa: sc.p ? sc.p[1] : null,
    };
    // gates por jogo
    if (row.ph != null && row.hs !== row.as) fail(`pênaltis sem empate: ${year} ${m.team1} ${row.hs}x${row.as} ${m.team2}`);
    // Exceção histórica: na Copa de 1954, jogos de GRUPO empatados iam para prorrogação.
    if (row.et && !stage.ko && year !== 1954) fail(`prorrogação fora de mata-mata: ${year} ${m.team1}x${m.team2} (${m.round})`);
    // lenda (override de dificuldade) — casa por (ano, times, PLACAR), porque o mesmo
    // confronto pode se repetir na edição (ex.: 1962 Brasil×Tchecoslováquia: 0x0 no grupo
    // E 3x1 na final — a lenda é só a final).
    const direta = legends.get(legendKey(year, m.team1, m.team2));
    const invertida = legends.get(legendKey(year, m.team2, m.team1));
    const got = `${row.hs}x${row.as}`, gotInv = `${row.as}x${row.hs}`;
    let leg = null;
    if (direta && direta.score.replace("×", "x") === got) leg = direta;
    else if (invertida && invertida.score.replace("×", "x") === gotInv) leg = invertida;
    if (leg) {
      row.difficulty = Math.min(leg.difficulty, 2);
      legendsSeen.add(leg);
    } else {
      row.difficulty = bucket(rawDifficulty(row));
    }
    rows.push(row);
    n++;
  }
  if (n !== OFICIAL[year]) fail(`${year}: ${n} jogos ≠ oficial ${OFICIAL[year]}`);
}
if (rows.length !== 964) fail(`total ${rows.length} ≠ 964`);
if (skipped !== 1) fail(`esperado exatamente 1 walkover excluído, veio ${skipped}`);
const legendsMissing = (cur.legends ?? []).filter((l) => !legendsSeen.has(l));
if (legendsMissing.length) fail(`lendas não encontradas no dataset: ${legendsMissing.map((l) => `${l.year} ${l.team1_en}x${l.team2_en}`).join("; ")}`);

// ---------- estatísticas ----------
const dist = {};
for (const r of rows) dist[r.difficulty] = (dist[r.difficulty] ?? 0) + 1;
console.log("✓ 964 jogos · 22 edições OK · walkover excluído · lendas:", legendsSeen.size);
console.log("Distribuição de dificuldade:", Object.entries(dist).map(([d, n]) => `${d}:${n}`).join("  "));
const porFase = {};
for (const r of rows) porFase[r.stage.code] = (porFase[r.stage.code] ?? 0) + 1;
console.log("Por fase:", Object.entries(porFase).map(([f, n]) => `${f}:${n}`).join("  "));

// ---------- SQL ----------
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const vals = rows.map((r) =>
  `(${r.year},${q(r.host)},${q(r.stage.code)},${q(r.stage.label)},${r.stage.replay},${r.stage.ko},` +
  `${q(r.home.name_pt)},${q(r.away.name_pt)},${q(r.home.slug)},${q(r.away.slug)},` +
  `${r.hs},${r.as},${r.et},${r.ph ?? "null"},${r.pa ?? "null"},${r.difficulty})`
);
const chunks = [];
for (let i = 0; i < vals.length; i += 100) chunks.push(vals.slice(i, i + 100));

const sql = `-- Mini-jogo Resultadismo Retrô — Fase 1: jogos históricos das Copas (1930–2022).
-- Seed one-off gerado por scripts/gen-retro-seed.mjs a partir do openfootball
-- world-cup.json (CC0 / domínio público — https://github.com/openfootball/world-cup.json),
-- validado contra a contagem oficial por edição (964 jogos; replays de 1934/38 incluídos,
-- walkover Suécia×Áustria 1938 excluído). Placar = final com prorrogação, SEM pênaltis
-- (pênaltis ficam como campo informativo). Dificuldade 1–7 pela heurística de
-- docs/planning/minijogo-historico/decisoes-fechadas.md (D9).
-- RLS LIGADO SEM POLICY: o gabarito nunca desce ao client — acesso só via RPCs do jogo (Fase 2).

create table public.retro_matches (
  id uuid primary key default gen_random_uuid(),
  wc_year int not null,
  wc_host text not null,
  stage_code text not null,
  stage_label_pt text not null,
  is_replay boolean not null default false,
  is_knockout boolean not null default false,
  home_name_pt text not null,
  away_name_pt text not null,
  home_slug text not null,
  away_slug text not null,
  home_score int not null check (home_score between 0 and 99),
  away_score int not null check (away_score between 0 and 99),
  went_extra_time boolean not null default false,
  pens_home int,
  pens_away int,
  difficulty int not null check (difficulty between 1 and 7),
  shown_count int not null default 0,
  scored_count int not null default 0,
  fact_pt text,
  source text not null default 'openfootball',
  created_at timestamptz not null default now()
);

comment on table public.retro_matches is
  'Jogos históricos de Copas p/ o mini-jogo Retrô. Fonte: openfootball world-cup.json (CC0). Sem policies de leitura por design (anti-cheat).';

create index retro_matches_difficulty_idx on public.retro_matches (difficulty);
create index retro_matches_year_idx on public.retro_matches (wc_year);

alter table public.retro_matches enable row level security;
-- (sem policies: nenhum acesso direto via PostgREST; só RPCs SECURITY DEFINER da Fase 2)

${chunks.map((c) =>
  `insert into public.retro_matches (wc_year,wc_host,stage_code,stage_label_pt,is_replay,is_knockout,home_name_pt,away_name_pt,home_slug,away_slug,home_score,away_score,went_extra_time,pens_home,pens_away,difficulty) values\n${c.join(",\n")};`
).join("\n\n")}
`;

if (DRY) {
  console.log(`(dry-run) migration NÃO escrita; seria ${MIGRATION} (${(sql.length / 1024).toFixed(0)} KB)`);
} else {
  writeFileSync(MIGRATION, sql);
  console.log(`✓ migration escrita: ${MIGRATION} (${(sql.length / 1024).toFixed(0)} KB)`);
}
