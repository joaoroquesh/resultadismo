import rawCatalog from "@/data/teams-catalog.json";
import { teamCrestPath } from "@/lib/teamCrests";
import type { TeamLite } from "./personalizationApi";

// Catálogo curado de times/seleções (data/teams-catalog.json, regenerável por
// scripts/gen-teams-catalog.mjs). É a FONTE das listas de personalização —
// client-side, desacoplado da tabela `teams` (que é do sync/jogos). Pra
// "encorpar": editar o catálogo + rodar os escudos. Escudos vêm do manifest
// teamCrests (public/teams).
export type CatalogTeam = {
  slug: string;
  name_pt: string;
  short_pt: string | null;
  tla: string | null;
  country: string | null;
  kind: "club" | "national";
  competitions: string[]; // provider_codes (ex.: bra.1, conmebol.libertadores)
  aliases: string[];
  crest_file: string | null;
};

const CATALOG = rawCatalog as CatalogTeam[];

// A Copa do Mundo é `WC` no banco e `fifa.world` no catálogo; Amistosos
// (fifa.friendly) e copas de seleção sem mapeamento próprio mostram seleções.
const INTERNATIONAL_CODES = new Set(["WC", "fifa.world", "fifa.friendly"]);
// Códigos que são a COPA em si: listam só as 48 classificadas (não o catálogo
// inteiro de seleções — Itália, por ex., não se classificou). Amistosos seguem
// com todas.
const WC_CODES = new Set(["WC", "fifa.world"]);

// As 48 seleções classificadas pra Copa 2026 — extraídas dos PRÓPRIOS jogos da
// competição em produção (104 partidas sincronizadas da ESPN, 2026-06-10) e
// mapeadas 48/48 pros slugs canônicos do catálogo. Fonte da verdade: o banco.
const WC2026_SLUGS = new Set([
  "africadosul", "alemanha", "arabiasaudita", "argelia", "argentina", "australia",
  "austria", "belgica", "bosniaeherzegovina", "brasil", "caboverde", "canada",
  "catar", "colombia", "congord", "coreiadosul", "costadomarfim", "croacia",
  "curacao", "egito", "equador", "escocia", "espanha", "eua", "franca", "gana",
  "haiti", "holanda", "inglaterra", "ira", "iraque", "japao", "jordania",
  "marrocos", "mexico", "noruega", "novazelandia", "panama", "paraguai",
  "portugal", "senegal", "suecia", "suica", "tchequia", "tunisia", "turquia",
  "uruguai", "uzbequistao",
]);

function crestOf(t: CatalogTeam): string | null {
  return (
    teamCrestPath(t.slug, t.name_pt, ...(t.aliases ?? [])) ??
    (t.crest_file ? "/teams/" + t.crest_file : null)
  );
}

function toLite(t: CatalogTeam, inCompetitions: string[] = []): TeamLite {
  return {
    id: t.slug,
    name: t.name_pt,
    short_name: t.short_pt,
    crest_url: null,
    local_crest: crestOf(t),
    country: t.country,
    in_competitions: inCompetitions,
  };
}

const byName = (a: CatalogTeam, b: CatalogTeam) => a.name_pt.localeCompare(b.name_pt, "pt-BR");
const brasilFirst = (a: CatalogTeam, b: CatalogTeam) => {
  const ab = /bra[sz]il/i.test(a.name_pt) ? 0 : 1;
  const bb = /bra[sz]il/i.test(b.name_pt) ? 0 : 1;
  return ab !== bb ? ab - bb : byName(a, b);
};

/** Clubes (time do coração), ordem alfabética. */
export function catalogClubs(): TeamLite[] {
  return CATALOG.filter((t) => t.kind === "club")
    .sort(byName)
    .map((t) => toLite(t));
}

/** Seleções (seleção que torce), Brasil primeiro depois alfabética. */
export function catalogNations(): TeamLite[] {
  return CATALOG.filter((t) => t.kind === "national")
    .sort(brasilFirst)
    .map((t) => toLite(t));
}

/** Só as 48 seleções classificadas pra Copa 2026 (recorte do grupo e listagens
 * da Copa). Brasil primeiro, depois alfabética. */
export function catalogWcNations(): TeamLite[] {
  return CATALOG.filter((t) => t.kind === "national" && WC2026_SLUGS.has(t.slug))
    .sort(brasilFirst)
    .map((t) => toLite(t));
}

/**
 * Times de um campeonato (por provider_code). `codeToId` mapeia provider_code →
 * id real da competição (das competições da personalização) pra resolver o
 * `in_competitions` (usado no "seguir em todos").
 */
export function teamsForCompetition(
  providerCode: string,
  codeToId: Map<string, string>,
): TeamLite[] {
  const intl = INTERNATIONAL_CODES.has(providerCode);
  const wcOnly = WC_CODES.has(providerCode);
  const match = (t: CatalogTeam) =>
    wcOnly
      ? t.kind === "national" && WC2026_SLUGS.has(t.slug)
      : intl
        ? t.kind === "national"
        : t.competitions.includes(providerCode);
  const resolveId = (code: string) =>
    codeToId.get(code) ?? (code === "fifa.world" ? codeToId.get("WC") : undefined);

  return CATALOG.filter(match)
    .sort(byName)
    .map((t) => {
      const ids = t.competitions.map(resolveId).filter(Boolean) as string[];
      const self = codeToId.get(providerCode);
      if (self && !ids.includes(self)) ids.push(self);
      return toLite(t, [...new Set(ids)]);
    });
}

/* ── Interesses → matcher de jogos ───────────────────────────────────────── */

import { teamCrestSlug } from "@/lib/teamCrests";

/**
 * Expande slugs do catálogo para TODAS as grafias casáveis (slug, nome, short,
 * TLA e aliases — slugificados). É o mesmo princípio do matching de escudos:
 * o jogo guarda o nome curto ("Coreia"), o catálogo indexa por "coreiadosul".
 */
export function expandTeamSlugs(slugs: Iterable<string>): Set<string> {
  const want = new Set(slugs);
  const out = new Set<string>();
  for (const t of CATALOG) {
    if (!want.has(t.slug)) continue;
    for (const cand of [t.slug, t.name_pt, t.short_pt, t.tla, ...(t.aliases ?? [])]) {
      const k = teamCrestSlug(cand);
      if (k) out.add(k);
    }
  }
  // slugs fora do catálogo entram como estão (degrada graciosamente)
  for (const s of want) if (!out.has(s)) out.add(s);
  return out;
}

/** true se o nome de time (como vem no jogo) bate com o conjunto expandido. */
export function teamNameMatches(expanded: Set<string>, name: string | null | undefined): boolean {
  const k = teamCrestSlug(name);
  return !!k && expanded.has(k);
}

/** Descreve o recorte de seleções de um bolão (followed_team_slugs) em
 * linguagem clara pro membro. Espelha a reconstrução do TeamScopeCard:
 * null/[] = todas; igual ao expandido de ["brasil"] = só o Brasil; senão =
 * conjunto escolhido (com os nomes). */
export function describeTeamScope(savedSlugs: string[] | null | undefined): {
  kind: "all" | "brasil" | "custom";
  label: string;
  names: string[];
} {
  if (!savedSlugs || savedSlugs.length === 0)
    return { kind: "all", label: "Todas as seleções", names: [] };
  const saved = new Set(savedSlugs);
  const brasilOnly = expandTeamSlugs(["brasil"]);
  const isBrasil =
    saved.size === brasilOnly.size && [...brasilOnly].every((s) => saved.has(s));
  if (isBrasil) return { kind: "brasil", label: "Só o Brasil", names: ["Brasil"] };
  const names = catalogWcNations()
    .filter((n) => saved.has(n.id))
    .map((n) => n.name);
  return {
    kind: "custom",
    label: names.length ? `${names.length} seleções` : "Seleções escolhidas",
    names,
  };
}
