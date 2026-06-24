// Estado local do Manager (sem conta) — tudo client-side nesta fase:
//  · tática PERSISTIDA entre jogos (o jogador não remonta do zero a cada partida);
//  · campanha em andamento (retomada após fechar a aba);
//  · troféus/conquistas LOCAIS (gamificação client-side, sem ranking cross-user);
//  · intro vista (manager-intro-v1) fica no useFirstSeen do React.
//
// IMPORTANTE: a campanha guarda um PRNG (closure `rnd`) que não serializa. Ao salvar,
// removemos `rnd`; ao carregar, recriamos `rnd = rngFrom(seed)`. O resto do estado é
// dado puro (snake/standings/pairs) e sobrevive ao JSON.stringify.

import type { Campaign, Tactic } from "./types";
import { rngFrom } from "./engine";

const TAC_KEY = "rd_manager_tactic_v1";
const CAMP_KEY = "rd_manager_campaign_v1";
const TROPHY_KEY = "rd_manager_trophies_v1";

// ---------- tática persistida ----------
const VALID_FORM = new Set(["433", "442", "352", "4231", "532", "4312", "343", "424"]);
const VALID_ESTILO = new Set(["passes", "meio", "lados", "longas", "contra"]);
const VALID_POSTURA = new Set(["all_in", "atk", "eq", "def", "retranca"]);
const VALID_MARC = new Set(["alta", "media", "baixa"]);

export function defaultTactic(): Tactic {
  return { form: "442", estilo: "lados", postura: "eq", marcacao: "media" };
}

export function loadTactic(): Tactic {
  try {
    const raw = JSON.parse(localStorage.getItem(TAC_KEY) ?? "null");
    if (
      raw &&
      VALID_FORM.has(raw.form) &&
      VALID_ESTILO.has(raw.estilo) &&
      VALID_POSTURA.has(raw.postura) &&
      VALID_MARC.has(raw.marcacao)
    ) {
      return { form: raw.form, estilo: raw.estilo, postura: raw.postura, marcacao: raw.marcacao };
    }
  } catch {
    /* sem storage: cai no default */
  }
  return defaultTactic();
}

export function saveTactic(tac: Tactic): void {
  try {
    localStorage.setItem(TAC_KEY, JSON.stringify(tac));
  } catch {
    /* ignora falha de escrita */
  }
}

// ---------- campanha em andamento (retomada) ----------
type SavedCampaign = Omit<Campaign, "rnd">;

export function saveCampaign(camp: Campaign | null): void {
  try {
    if (!camp) {
      localStorage.removeItem(CAMP_KEY);
      return;
    }
    // descarta a closure `rnd` (não serializa) — recriamos do seed ao carregar
    const { rnd: _rnd, ...rest } = camp;
    void _rnd;
    localStorage.setItem(CAMP_KEY, JSON.stringify(rest));
  } catch {
    /* ignora falha de escrita */
  }
}

export function loadCampaign(): Campaign | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CAMP_KEY) ?? "null") as SavedCampaign | null;
    if (!raw || typeof raw.seed !== "number" || !raw.myTeam || !Array.isArray(raw.stages)) {
      return null;
    }
    // recria o PRNG determinístico a partir do seed salvo
    return { ...raw, rnd: rngFrom(raw.seed) } as Campaign;
  } catch {
    return null;
  }
}

export function clearCampaign(): void {
  try {
    localStorage.removeItem(CAMP_KEY);
  } catch {
    /* ignora */
  }
}

// ---------- troféus / conquistas locais ----------
// Cada conquista é registrada 1x; a Sala de Troféus persistente cross-user fica
// DEFERIDA pro servidor. Aqui é só o reconhecimento local (incentivo de retorno).
export interface Trophy {
  id: string; // ex.: "champion-1970", "zebra-grande", "first-campaign"
  label: string; // texto exibido
  emoji: string;
  at: number; // timestamp
}

export function loadTrophies(): Trophy[] {
  try {
    const raw = JSON.parse(localStorage.getItem(TROPHY_KEY) ?? "[]");
    return Array.isArray(raw) ? (raw as Trophy[]) : [];
  } catch {
    return [];
  }
}

// Concede uma conquista se ainda não houver outra com o mesmo id. Retorna `true`
// quando é INÉDITA (a UI pode comemorar só na primeira vez).
export function grantTrophy(t: Omit<Trophy, "at">): boolean {
  try {
    const cur = loadTrophies();
    if (cur.some((x) => x.id === t.id)) return false;
    const next = [{ ...t, at: Date.now() }, ...cur].slice(0, 200);
    localStorage.setItem(TROPHY_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

export function hasTrophy(id: string): boolean {
  return loadTrophies().some((x) => x.id === id);
}
