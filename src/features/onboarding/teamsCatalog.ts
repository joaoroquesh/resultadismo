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
  const match = (t: CatalogTeam) =>
    intl ? t.kind === "national" : t.competitions.includes(providerCode);
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
