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
import { applyPreset, rngFrom } from "./engine";

// rev 4: o FORMATO da Tactic mudou (formação 9 + estilos atk/def + 4 sliders). As chaves
// sobem pra v2 — saves antigos (v1, formato incompatível) ficam IGNORADOS (fresh start;
// beta, aceitável). Nada de crash ao topar com um save velho.
const TAC_KEY = "rd_manager_tactic_v2";
const CAMP_KEY = "rd_manager_campaign_v2";
const TROPHY_KEY = "rd_manager_trophies_v1";
const SPEED_KEY = "rd_manager_speed_v1";

// ---------- velocidade da transmissão ao vivo (item 2 / melhoria 2.6) ----------
// 1 = ritmo normal (cada tempo dura ~45s reais), 2 = dobro, 4 = quádruplo.
// Persistida pra valer na próxima partida. "Pular tempo" é uma AÇÃO (não persiste).
export type LiveSpeed = 1 | 2 | 4;
const VALID_SPEED = new Set<LiveSpeed>([1, 2, 4]);

export function loadSpeed(): LiveSpeed {
  try {
    const n = Number(localStorage.getItem(SPEED_KEY)) as LiveSpeed;
    return VALID_SPEED.has(n) ? n : 1;
  } catch {
    return 1;
  }
}

export function saveSpeed(s: LiveSpeed): void {
  try {
    localStorage.setItem(SPEED_KEY, String(s));
  } catch {
    /* ignora falha de escrita */
  }
}

// ---------- tática persistida (formato rev 4) ----------
const VALID_FORM = new Set(["4-2-4", "3-4-3", "4-3-3", "4-4-2", "3-5-2", "4-5-1", "5-3-2", "5-4-1", "6-3-1"]);
const VALID_ATK = new Set(["posse", "vertical", "bolalonga", "contra", "drible"]);
const VALID_DEF = new Set(["zona", "individual", "mista", "libero", "dobra"]);
const isSlider = (v: unknown): v is number => typeof v === "number" && v >= 0 && v <= 100;

// default = preset Toque (coerente: 4-4-2 + Posse + Mista, sliders moderados).
export function defaultTactic(): Tactic {
  return applyPreset("toque");
}

export function loadTactic(): Tactic {
  try {
    const raw = JSON.parse(localStorage.getItem(TAC_KEY) ?? "null");
    if (
      raw &&
      VALID_FORM.has(raw.form) &&
      VALID_ATK.has(raw.atk) &&
      VALID_DEF.has(raw.def) &&
      isSlider(raw.postura) &&
      isSlider(raw.pressao) &&
      isSlider(raw.amplitude) &&
      isSlider(raw.agressividade)
    ) {
      return {
        form: raw.form,
        atk: raw.atk,
        def: raw.def,
        postura: raw.postura,
        pressao: raw.pressao,
        amplitude: raw.amplitude,
        agressividade: raw.agressividade,
      };
    }
  } catch {
    /* sem storage ou save velho (v1 incompatível): cai no default */
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
