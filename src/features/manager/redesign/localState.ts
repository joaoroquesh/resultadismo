// Estado local do Maneiger reformulado (client-side, sem conta). Segue as
// convenções do managerLocal.ts do no ar: chaves versionadas, try/catch em toda
// leitura/escrita, validação de shape ao carregar (save velho/corrompido = ignora,
// sem crashar). Aqui vivem dois estados:
//   · o SORTEIO da "Sua seleção" (3 seleções por tier + reroll + mundo da campanha);
//   · a IDENTIDADE de treinador (arquétipo) escolhida no quiz.
// localStorage é a fonte da verdade client-side; a persistência no Supabase (logado)
// é um espelho best-effort feito na camada de dados, nunca um requisito pra jogar.
import type { WorldMode } from "../types";
import type { ArchetypeKey } from "./archetypes.ts";

// ================================================================ arquétipo
const ARCHETYPE_KEY = "rd_manager_v2_archetype";
const VALID_ARCHETYPES = new Set<ArchetypeKey>([
  "posicional", "reativo", "intenso", "equilibrista", "relacional", "copeiro",
]);

export function loadArchetype(): ArchetypeKey | null {
  try {
    const raw = localStorage.getItem(ARCHETYPE_KEY);
    if (raw && VALID_ARCHETYPES.has(raw as ArchetypeKey)) return raw as ArchetypeKey;
  } catch {
    /* sem storage: sem perfil salvo */
  }
  return null;
}

export function saveArchetype(k: ArchetypeKey | null): void {
  try {
    if (!k) localStorage.removeItem(ARCHETYPE_KEY);
    else localStorage.setItem(ARCHETYPE_KEY, k);
  } catch {
    /* ignora falha de escrita */
  }
}

// ================================================================ sorteio (draft)
// O sorteio da "Sua seleção" guarda: o ano da Copa escolhida, os slugs das 3 seleções
// sorteadas (Favorita / Média / Zebra), quantas vezes o jogador já ressorteou (limite 1)
// e o mundo da campanha (real / alternativo). Guardamos SLUGS (não o Team inteiro): o
// Team é reidratado do engine na carga, então o save sobrevive a mudanças de notas.
const DRAFT_KEY = "rd_manager_v2_draft";
const MAX_REROLLS = 1;

export interface DraftState {
  year: number;        // ano da edição sorteada
  slugs: [string, string, string]; // Favorita, Média, Zebra (nessa ordem)
  rerolls: number;     // quantas vezes ressorteou (0..MAX_REROLLS)
  world: WorldMode;    // "real" (Seguir a História) | "alt" (Mundo Alternativo)
}

export const DRAFT_MAX_REROLLS = MAX_REROLLS;

function isValidDraft(raw: unknown): raw is DraftState {
  if (!raw || typeof raw !== "object") return false;
  const d = raw as Record<string, unknown>;
  return (
    typeof d.year === "number" &&
    Array.isArray(d.slugs) &&
    d.slugs.length === 3 &&
    d.slugs.every((s) => typeof s === "string") &&
    typeof d.rerolls === "number" &&
    (d.world === "real" || d.world === "alt")
  );
}

export function loadDraft(): DraftState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null");
    if (isValidDraft(raw)) return raw;
  } catch {
    /* sem storage ou save corrompido: sem sorteio salvo */
  }
  return null;
}

export function saveDraft(d: DraftState | null): void {
  try {
    if (!d) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* ignora falha de escrita */
  }
}

export function clearDraft(): void {
  saveDraft(null);
}
