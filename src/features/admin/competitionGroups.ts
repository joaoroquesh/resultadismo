import compsRegistry from "@/data/competitions-registry.json";

// Os 4 grupos colapsáveis — MESMA taxonomia da personalização
// (src/features/onboarding/PersonalizationPage.tsx). A curadoria (grupo + ordem)
// vem do REGISTRO editável data/competitions-registry.json (ordem = posição no
// array; ver .claude/13-TIMES-E-ESCUDOS §competições). Código fora do registro
// cai no fallback por tipo (LEAGUE → Ligas e estaduais, senão Copas).
export const COMP_GROUPS = ["Seleções", "Ligas e estaduais", "Copas", "Alternativos"] as const;
export type CompGroup = (typeof COMP_GROUPS)[number];

type CompRegistryEntry = {
  code: string;
  aliases?: string[];
  name: string;
  group: CompGroup;
  type: string;
  area: string;
  in_personalization: boolean;
};

const REGISTRY = compsRegistry as CompRegistryEntry[];
const INFO = new Map<string, { group: CompGroup; order: number }>();
// KEY: qualquer code/alias → code canônico do campeonato no registro. É o que
// permite cruzar "mesmo campeonato com nomes/códigos diferentes" entre provedores.
const KEY = new Map<string, string>();
const NAME = new Map<string, string>();
REGISTRY.forEach((c, i) => {
  INFO.set(c.code, { group: c.group, order: i });
  KEY.set(c.code, c.code);
  NAME.set(c.code, c.name);
  (c.aliases ?? []).forEach((a) => {
    INFO.set(a, { group: c.group, order: i });
    KEY.set(a, c.code);
  });
});

/** Code canônico do campeonato (mesmo p/ códigos diferentes do mesmo torneio). */
export function registryKey(code: string | null): string | null {
  return code ? (KEY.get(code) ?? null) : null;
}
/** Nome curado do campeonato a partir de qualquer code/alias. */
export function registryName(code: string | null): string | null {
  const k = registryKey(code);
  return k ? (NAME.get(k) ?? null) : null;
}

/** Bucket de um campeonato pelo provider_code (com fallback por tipo). */
export function compGroupOf(providerCode: string | null, type: string | null): CompGroup {
  const info = INFO.get(providerCode ?? "");
  if (info) return info.group;
  return type === "LEAGUE" ? "Ligas e estaduais" : "Copas";
}

/** Ordem de exibição (posição no registro; 999 p/ não-curados). */
export function compOrderIdx(providerCode: string | null): number {
  return INFO.get(providerCode ?? "")?.order ?? 999;
}

/** Está no registro curado? (false = caiu no bucket por fallback de tipo). */
export function isCurated(providerCode: string | null): boolean {
  return INFO.has(providerCode ?? "");
}
