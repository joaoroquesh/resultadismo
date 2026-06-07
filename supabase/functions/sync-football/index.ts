// Resultadismo · Edge Function · sync-football (multi-fonte / golden record)
// ----------------------------------------------------------------------------
// Sincroniza times, jogos e resultados de provedores gratuitos para o banco.
// Provedores: ESPN, football-data.org, TheSportsDB. manual = ignorado.
//
// MODELO MULTI-FONTE (competition_sources):
//   • Cada competição tem 1 fonte `primary` (dona da ESTRUTURA: insere/curador
//     o calendário) + 0..N `secondary` (só VALIDAM placar de jogos existentes,
//     casados por dia+nomes; nunca inserem). Cadeia de fallback: se a primary
//     falha, as secundárias ainda mantêm o placar fresco.
//   • Cada (jogo, fonte) vira uma observação em match_sources.
//   • GOLDEN por voto: o placar final é o que a MAIORIA das fontes reporta
//     (empate → mais recente). score_sources_count = quantas confirmam;
//     score_conflict = fontes divergem.
//   • FREEZE (decisão #3): jogo finalizado, confirmado por >=2 fontes e com >1h
//     do início é CONGELADO (frozen=true) e não é mais atualizado.
//   • OVERRIDE/LOCK (decisão #8): jogo com manual_lock=true não é tocado pela API.
//
// MODOS:
//   • scores  — placar/status frequente. Primary atualiza; secundárias só com
//               throttle (>=10min desde o último check, pra respeitar rate limit);
//               golden recalcula sempre (barato, no banco).
//   • catalog — reconcilia o calendário (primary) + roda TODAS as secundárias.
//
// Auth: cron (service key ou CRON_SECRET) ou usuário app_admin. verify_jwt=false.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, timingSafeEqual } from "../_shared/security.ts";

type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";
type Provider = "manual" | "football_data" | "thesportsdb" | "espn";
type SyncMode = "scores" | "catalog";

interface CompetitionRow {
  id: string;
  name: string;
  provider: Provider;
  provider_code: string | null;
  provider_season: string | null;
  catalog_seeded: boolean;
}

interface SourceRow {
  id: string;
  competition_id: string;
  provider: Provider;
  provider_code: string | null;
  provider_season: string | null;
  role: "primary" | "secondary";
  priority: number;
  enabled: boolean;
  last_sync_checked_at: string | null;
}

// Contexto que cada fetcher de provedor recebe (competição + fonte).
interface SourceCtx {
  competitionId: string;
  competitionName: string;
  provider: Provider;
  providerCode: string | null;
  providerSeason: string | null;
  catalogSeeded: boolean;
}

interface MatchRow {
  competition_id: string;
  provider: Provider;
  provider_ref: string;
  stage?: string | null;
  group_name?: string | null;
  round?: string | null;
  matchday?: number | null;
  home_team_id?: string | null;
  away_team_id?: string | null;
  home_team_name: string;
  away_team_name: string;
  kickoff_at: string | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  home_pen?: number | null;
  away_pen?: number | null;
}

const HOUR_MS = 3_600_000;
const SECONDARY_THROTTLE_MS = 10 * 60_000; // secundárias no modo scores: no máx 1x/10min

// Normaliza nome de time pra casar entre fontes (sem acento, minúsculo, sem ruído).
function normName(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\b(fc|ec|sc|cf|ac|afc|cd|clube|futebol|esporte|atletico|atlético)\b/g, "")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function dayKey(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.floor(t / 86_400_000) : null;
}

// ---------------------------------------------------------------------------
// Alertas (iguais à versão anterior)
// ---------------------------------------------------------------------------
async function alertNewMatchIfNew(admin: SupabaseClient, comp: CompetitionRow, row: MatchRow): Promise<boolean> {
  const { data: prev } = await admin.from("sync_alerts").select("id")
    .eq("competition_id", comp.id).eq("provider_ref", row.provider_ref)
    .eq("kind", "new_match").in("status", ["pending", "rejected"]).limit(1);
  if (prev && prev.length) return false;
  const { error } = await admin.from("sync_alerts").insert({
    competition_id: comp.id, provider_ref: row.provider_ref, kind: "new_match", status: "pending",
    message: `Jogo novo na API: ${row.home_team_name} x ${row.away_team_name}`,
    payload: row as unknown as Record<string, unknown>,
  });
  return !error;
}
async function alertCancelIfNew(admin: SupabaseClient, comp: CompetitionRow, matchId: string, ref: string, label: string): Promise<boolean> {
  const { data: prev } = await admin.from("sync_alerts").select("id")
    .eq("competition_id", comp.id).eq("provider_ref", ref).eq("kind", "cancelled")
    .in("status", ["pending", "rejected"]).limit(1);
  if (prev && prev.length) return false;
  const { error } = await admin.from("sync_alerts").insert({
    competition_id: comp.id, match_id: matchId, provider_ref: ref, kind: "cancelled", status: "pending",
    message: `Possível cancelamento na API: ${label}`, payload: {},
  });
  return !error;
}
async function alertInfo(admin: SupabaseClient, comp: CompetitionRow, matchId: string, ref: string,
  kind: "team_resolved" | "kickoff_changed", message: string, payload: Record<string, unknown>): Promise<void> {
  await admin.from("sync_alerts").insert({
    competition_id: comp.id, match_id: matchId, provider_ref: ref, kind, status: "applied", message, payload,
  });
}

// ---------------------------------------------------------------------------
// match_sources — grava a observação de uma fonte para um jogo
// ---------------------------------------------------------------------------
async function recordObservation(admin: SupabaseClient, matchId: string, row: MatchRow): Promise<void> {
  await admin.from("match_sources").upsert({
    match_id: matchId,
    provider: row.provider,
    provider_ref: row.provider_ref,
    status: row.status,
    home_score: row.home_score,
    away_score: row.away_score,
    home_pen: row.home_pen ?? null,
    away_pen: row.away_pen ?? null,
    kickoff_at: row.kickoff_at,
    fetched_at: new Date().toISOString(),
  }, { onConflict: "match_id,provider" });
}

// ---------------------------------------------------------------------------
// reconcile da fonte PRIMARY — estrutura do calendário (insere/atualiza).
// Respeita frozen e manual_lock (não toca jogo travado/congelado). Grava
// observação da primary em match_sources. Score final fica pro golden.
// ---------------------------------------------------------------------------
async function reconcilePrimary(
  admin: SupabaseClient, comp: CompetitionRow, rows: MatchRow[], mode: SyncMode,
): Promise<{ updated: number; inserted: number; alerted: number; touched: Set<string> }> {
  const ts = new Date().toISOString();
  const touched = new Set<string>();
  const { data: existing } = await admin.from("matches")
    .select("id, provider_ref, status, kickoff_at, home_team_name, away_team_name, home_team_id, away_team_id, frozen, manual_lock")
    .eq("competition_id", comp.id).eq("provider", comp.provider);
  const byRef = new Map((existing ?? []).map((m: Record<string, unknown>) => [String(m.provider_ref), m]));

  let updated = 0, inserted = 0, alerted = 0;

  for (const row of rows) {
    const cur = byRef.get(row.provider_ref) as Record<string, unknown> | undefined;

    if (cur) {
      const mid = String(cur.id);
      // Jogo travado/congelado: registra observação mas NÃO altera o jogo.
      if (cur.frozen === true || cur.manual_lock === true) {
        await recordObservation(admin, mid, row);
        touched.add(mid);
        continue;
      }
      const patch: Record<string, unknown> = { status: row.status, last_synced_at: ts };
      // score entra aqui só como ponto de partida; o golden decide no fim.
      patch.home_score = row.home_score;
      patch.away_score = row.away_score;
      if (row.home_pen !== undefined) patch.home_pen = row.home_pen;
      if (row.away_pen !== undefined) patch.away_pen = row.away_pen;

      if (mode === "catalog") {
        const wasPlaceholder = cur.home_team_name === "A definir" || cur.away_team_name === "A definir" || !cur.home_team_id || !cur.away_team_id;
        const nowReal = row.home_team_name !== "A definir" && row.away_team_name !== "A definir";
        if (row.home_team_id != null) patch.home_team_id = row.home_team_id;
        if (row.away_team_id != null) patch.away_team_id = row.away_team_id;
        patch.home_team_name = row.home_team_name;
        patch.away_team_name = row.away_team_name;
        if (row.stage !== undefined) patch.stage = row.stage;
        if (row.group_name !== undefined) patch.group_name = row.group_name;
        if (row.round !== undefined) patch.round = row.round;
        if (row.matchday !== undefined) patch.matchday = row.matchday;
        if (row.kickoff_at && cur.kickoff_at) {
          const diff = Math.abs(new Date(row.kickoff_at).getTime() - new Date(String(cur.kickoff_at)).getTime());
          if (diff > HOUR_MS) {
            await alertInfo(admin, comp, mid, row.provider_ref, "kickoff_changed",
              `Horário mudou: ${row.home_team_name} x ${row.away_team_name}`, { from: cur.kickoff_at, to: row.kickoff_at });
            alerted++;
          }
          patch.kickoff_at = row.kickoff_at;
        } else if (row.kickoff_at) {
          patch.kickoff_at = row.kickoff_at;
        }
        if (wasPlaceholder && nowReal) {
          await alertInfo(admin, comp, mid, row.provider_ref, "team_resolved",
            `Confronto definido: ${row.home_team_name} x ${row.away_team_name}`, {});
          alerted++;
        }
        if (row.status === "cancelled" && cur.status !== "cancelled") {
          patch.status = cur.status;
          if (await alertCancelIfNew(admin, comp, mid, row.provider_ref, `${row.home_team_name} x ${row.away_team_name}`)) alerted++;
        }
      }

      await admin.from("matches").update(patch).eq("id", mid);
      await recordObservation(admin, mid, row);
      touched.add(mid);
      updated++;
      continue;
    }

    // jogo não existe
    if (mode === "scores") continue;
    if (!comp.catalog_seeded) {
      const { data: ins, error } = await admin.from("matches").insert({ ...row, last_synced_at: ts }).select("id").single();
      if (!error && ins) {
        inserted++;
        await recordObservation(admin, String(ins.id), row);
        touched.add(String(ins.id));
      }
    } else {
      if (await alertNewMatchIfNew(admin, comp, row)) alerted++;
    }
  }

  if (mode === "catalog" && !comp.catalog_seeded) {
    await admin.from("competitions").update({ catalog_seeded: true }).eq("id", comp.id);
  }
  return { updated, inserted, alerted, touched };
}

// ---------------------------------------------------------------------------
// ingestSecondary — casa os jogos da fonte secundária com jogos existentes
// (mesmo dia ±1 + nomes normalizados) e grava observação. NUNCA insere.
// ---------------------------------------------------------------------------
async function ingestSecondary(
  admin: SupabaseClient, comp: CompetitionRow, rows: MatchRow[],
): Promise<{ matched: number; touched: Set<string> }> {
  const touched = new Set<string>();
  const { data: existing } = await admin.from("matches")
    .select("id, kickoff_at, home_team_name, away_team_name, frozen")
    .eq("competition_id", comp.id);
  // índice por par de nomes normalizados → lista de {id, day, frozen}
  const idx = new Map<string, { id: string; day: number | null; frozen: boolean }[]>();
  for (const m of existing ?? []) {
    const key = normName(m.home_team_name as string) + "|" + normName(m.away_team_name as string);
    const arr = idx.get(key) ?? [];
    arr.push({ id: String(m.id), day: dayKey(m.kickoff_at as string), frozen: m.frozen === true });
    idx.set(key, arr);
  }

  let matched = 0;
  for (const row of rows) {
    const key = normName(row.home_team_name) + "|" + normName(row.away_team_name);
    const cands = idx.get(key);
    if (!cands || !cands.length) continue;
    const rd = dayKey(row.kickoff_at);
    // melhor candidato: menor diferença de dia (tolerância ±1 dia p/ fuso)
    let best: { id: string; frozen: boolean } | null = null;
    let bestDiff = 2;
    for (const c of cands) {
      const diff = rd != null && c.day != null ? Math.abs(rd - c.day) : 0;
      if (diff <= 1 && diff < bestDiff) { best = { id: c.id, frozen: c.frozen }; bestDiff = diff; }
    }
    if (!best) continue;
    await recordObservation(admin, best.id, row); // observação mesmo se frozen (histórico)
    touched.add(best.id);
    matched++;
  }
  return { matched, touched };
}

// golden record + freeze agora vivem no banco (public.resolve_match_golden) —
// testável e rodável por cron. O handler chama via admin.rpc(...).

// ===========================================================================
// Fetchers de provedor (retornam MatchRow[]). writeTeams=false p/ secundárias
// (evita poluir a tabela teams com duplicatas — secundária só valida placar).
// ===========================================================================

// ----- football-data.org -----
function mapFootballDataStatus(s: string): MatchStatus {
  switch (s) {
    case "IN_PLAY": case "PAUSED": return "live";
    case "FINISHED": case "AWARDED": return "finished";
    case "POSTPONED": case "SUSPENDED": return "postponed";
    case "CANCELLED": return "cancelled";
    default: return "scheduled";
  }
}
const TEAM_PT: Record<string, { name: string; short?: string }> = {
  ALG: { name: "Argélia" }, ARG: { name: "Argentina" }, AUS: { name: "Austrália" }, AUT: { name: "Áustria" },
  BEL: { name: "Bélgica" }, BIH: { name: "Bósnia e Herzegovina", short: "Bósnia" }, BRA: { name: "Brasil" },
  CAN: { name: "Canadá" }, CPV: { name: "Cabo Verde" }, COL: { name: "Colômbia" }, COD: { name: "Congo (RD)", short: "Congo RD" },
  CRO: { name: "Croácia" }, CUR: { name: "Curaçao" }, CZE: { name: "Tchéquia" }, ECU: { name: "Equador" },
  EGY: { name: "Egito" }, ENG: { name: "Inglaterra" }, FRA: { name: "França" }, GER: { name: "Alemanha" },
  GHA: { name: "Gana" }, HAI: { name: "Haiti" }, IRN: { name: "Irã" }, IRQ: { name: "Iraque" },
  CIV: { name: "Costa do Marfim", short: "C. Marfim" }, JPN: { name: "Japão" }, JOR: { name: "Jordânia" },
  MEX: { name: "México" }, MAR: { name: "Marrocos" }, NED: { name: "Holanda" }, NZL: { name: "Nova Zelândia", short: "N. Zelândia" },
  NOR: { name: "Noruega" }, PAN: { name: "Panamá" }, PAR: { name: "Paraguai" }, POR: { name: "Portugal" },
  QAT: { name: "Catar" }, KSA: { name: "Arábia Saudita", short: "Arábia S." }, SCO: { name: "Escócia" },
  SEN: { name: "Senegal" }, RSA: { name: "África do Sul" }, KOR: { name: "Coreia do Sul", short: "Coreia" },
  ESP: { name: "Espanha" }, SWE: { name: "Suécia" }, SUI: { name: "Suíça" }, TUN: { name: "Tunísia" },
  TUR: { name: "Turquia" }, USA: { name: "Estados Unidos", short: "EUA" }, URY: { name: "Uruguai" }, URU: { name: "Uruguai" },
  UZB: { name: "Uzbequistão" },
};
function ptTeam(t: any): { name: string; short: string } {
  const tla: string | undefined = t?.tla ?? undefined;
  const pt = tla ? TEAM_PT[tla] : undefined;
  if (pt) return { name: pt.name, short: pt.short ?? pt.name };
  const name = t?.name ?? t?.shortName ?? "Time";
  return { name, short: t?.shortName ?? t?.tla ?? name };
}
async function syncFootballData(supabase: SupabaseClient, ctx: SourceCtx, token: string, writeTeams: boolean): Promise<MatchRow[]> {
  if (!ctx.providerCode) throw new Error("provider_code ausente");
  const url = new URL(`https://api.football-data.org/v4/competitions/${ctx.providerCode}/matches`);
  if (ctx.providerSeason) url.searchParams.set("season", ctx.providerSeason);
  const res = await fetch(url, { headers: { "X-Auth-Token": token } });
  if (!res.ok) throw new Error(`football-data indisponível (${res.status})`);
  const data = await res.json();
  if (!data || !Array.isArray(data.matches)) throw new Error("football-data: formato inesperado (a API pode ter mudado).");
  const matches: any[] = data.matches;

  const teamMap = new Map<number, string>();
  if (writeTeams) {
    const teamsSeen = new Map<number, any>();
    for (const m of matches) {
      if (m.homeTeam?.id) teamsSeen.set(m.homeTeam.id, m.homeTeam);
      if (m.awayTeam?.id) teamsSeen.set(m.awayTeam.id, m.awayTeam);
    }
    const teamRows = [...teamsSeen].map(([pid, t]) => {
      const pt = ptTeam(t);
      return { provider: "football_data" as const, provider_ref: String(pid), name: pt.name, short_name: pt.short, tla: t.tla ?? null, crest_url: t.crest ?? null };
    });
    if (teamRows.length) {
      const { data: up, error } = await supabase.from("teams").upsert(teamRows, { onConflict: "provider,provider_ref" }).select("id, provider_ref");
      if (error) throw error;
      for (const r of up ?? []) teamMap.set(Number(r.provider_ref), r.id);
    }
  }

  return matches.map((m): MatchRow => {
    const status = mapFootballDataStatus(m.status);
    const ft = m.score?.fullTime ?? {};
    const pens = m.score?.penalties ?? {};
    const hasLiveScore = status === "finished" || status === "live";
    return {
      competition_id: ctx.competitionId, provider: "football_data", provider_ref: String(m.id),
      stage: m.stage ?? null, group_name: m.group ?? null,
      round: m.matchday ? `Rodada ${m.matchday}` : (m.stage ?? null), matchday: m.matchday ?? null,
      home_team_id: m.homeTeam?.id ? teamMap.get(m.homeTeam.id) ?? null : null,
      away_team_id: m.awayTeam?.id ? teamMap.get(m.awayTeam.id) ?? null : null,
      home_team_name: m.homeTeam ? ptTeam(m.homeTeam).short : "A definir",
      away_team_name: m.awayTeam ? ptTeam(m.awayTeam).short : "A definir",
      kickoff_at: m.utcDate ?? null, status,
      home_score: hasLiveScore ? (ft.home ?? null) : null,
      away_score: hasLiveScore ? (ft.away ?? null) : null,
      home_pen: pens.home ?? null, away_pen: pens.away ?? null,
    };
  });
}

// ----- TheSportsDB (não escreve times: sem ids de time no free) -----
async function syncTheSportsDb(ctx: SourceCtx, key: string): Promise<MatchRow[]> {
  if (!ctx.providerCode) throw new Error("provider_code ausente (id da liga no TheSportsDB)");
  const base = `https://www.thesportsdb.com/api/v1/json/${key}`;
  const id = ctx.providerCode;
  const [pastRes, nextRes] = await Promise.all([
    fetch(`${base}/eventspastleague.php?id=${id}`), fetch(`${base}/eventsnextleague.php?id=${id}`),
  ]);
  if (!pastRes.ok && !nextRes.ok) throw new Error(`thesportsdb erro: past=${pastRes.status} next=${nextRes.status}`);
  const past = pastRes.ok ? ((await pastRes.json()).events ?? []) : [];
  const next = nextRes.ok ? ((await nextRes.json()).events ?? []) : [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const e of [...past, ...next]) if (e?.idEvent) byId.set(String(e.idEvent), e);
  return Array.from(byId.values()).map((e: Record<string, unknown>): MatchRow => {
    const status = String(e.strStatus ?? "");
    const finished = status === "Match Finished" || status === "FT";
    const live = !!status && !finished && status !== "Not Started";
    const dateEvent = e.dateEvent as string | undefined;
    const strTime = e.strTime as string | undefined;
    const kickoff = (e.strTimestamp as string | undefined) ?? (dateEvent && strTime ? `${dateEvent}T${strTime}Z` : null);
    const hs = e.intHomeScore, as_ = e.intAwayScore;
    return {
      competition_id: ctx.competitionId, provider: "thesportsdb", provider_ref: String(e.idEvent),
      round: e.intRound ? `Rodada ${e.intRound}` : null,
      home_team_name: (e.strHomeTeam as string | undefined) ?? "A definir",
      away_team_name: (e.strAwayTeam as string | undefined) ?? "A definir",
      kickoff_at: kickoff, status: finished ? "finished" : live ? "live" : "scheduled",
      home_score: (finished || live) && hs != null ? Number(hs) : null,
      away_score: (finished || live) && as_ != null ? Number(as_) : null,
    };
  });
}

// ----- ESPN -----
const COUNTRY_EN_PT: Record<string, { name: string; short?: string }> = {
  Argentina: { name: "Argentina" }, Bolivia: { name: "Bolívia" }, Brazil: { name: "Brasil" }, Chile: { name: "Chile" },
  Colombia: { name: "Colômbia" }, Ecuador: { name: "Equador" }, Paraguay: { name: "Paraguai" }, Peru: { name: "Peru" },
  Uruguay: { name: "Uruguai" }, Venezuela: { name: "Venezuela" }, "United States": { name: "Estados Unidos", short: "EUA" },
  USA: { name: "Estados Unidos", short: "EUA" }, Mexico: { name: "México" }, Canada: { name: "Canadá" },
  "Costa Rica": { name: "Costa Rica" }, Panama: { name: "Panamá" }, Honduras: { name: "Honduras" }, Jamaica: { name: "Jamaica" },
  Curacao: { name: "Curaçao" }, Haiti: { name: "Haiti" }, England: { name: "Inglaterra" }, France: { name: "França" },
  Germany: { name: "Alemanha" }, Spain: { name: "Espanha" }, Portugal: { name: "Portugal" }, Italy: { name: "Itália" },
  Netherlands: { name: "Holanda" }, Belgium: { name: "Bélgica" }, Croatia: { name: "Croácia" }, Switzerland: { name: "Suíça" },
  Scotland: { name: "Escócia" }, Wales: { name: "País de Gales", short: "Gales" }, Poland: { name: "Polônia" },
  Denmark: { name: "Dinamarca" }, Sweden: { name: "Suécia" }, Norway: { name: "Noruega" }, Austria: { name: "Áustria" },
  Serbia: { name: "Sérvia" }, Turkey: { name: "Turquia" }, "Türkiye": { name: "Turquia" }, Ukraine: { name: "Ucrânia" },
  "Czech Republic": { name: "Tchéquia" }, Czechia: { name: "Tchéquia" }, Hungary: { name: "Hungria" }, Romania: { name: "Romênia" },
  Greece: { name: "Grécia" }, Ireland: { name: "Irlanda" }, "Republic of Ireland": { name: "Irlanda" },
  "Northern Ireland": { name: "Irlanda do Norte", short: "Irl. Norte" }, Russia: { name: "Rússia" }, Albania: { name: "Albânia" },
  Israel: { name: "Israel" }, Luxembourg: { name: "Luxemburgo" }, Gibraltar: { name: "Gibraltar" }, Morocco: { name: "Marrocos" },
  Algeria: { name: "Argélia" }, Tunisia: { name: "Tunísia" }, Egypt: { name: "Egito" }, Senegal: { name: "Senegal" },
  Nigeria: { name: "Nigéria" }, Ghana: { name: "Gana" }, Cameroon: { name: "Camarões" },
  "Ivory Coast": { name: "Costa do Marfim", short: "C. Marfim" }, "Cote d'Ivoire": { name: "Costa do Marfim", short: "C. Marfim" },
  Mali: { name: "Mali" }, "South Africa": { name: "África do Sul", short: "Á. do Sul" }, Kenya: { name: "Quênia" },
  "DR Congo": { name: "Congo (RD)", short: "Congo RD" }, "Congo DR": { name: "Congo (RD)", short: "Congo RD" },
  "Cape Verde": { name: "Cabo Verde" }, Madagascar: { name: "Madagascar" }, Japan: { name: "Japão" },
  "South Korea": { name: "Coreia do Sul", short: "Coreia" }, "Korea Republic": { name: "Coreia do Sul", short: "Coreia" },
  "Saudi Arabia": { name: "Arábia Saudita", short: "Arábia S." }, Iran: { name: "Irã" }, "IR Iran": { name: "Irã" },
  Iraq: { name: "Iraque" }, Qatar: { name: "Catar" }, Australia: { name: "Austrália" },
  "New Zealand": { name: "Nova Zelândia", short: "N. Zelândia" }, China: { name: "China" }, "China PR": { name: "China" },
  Uzbekistan: { name: "Uzbequistão" }, Jordan: { name: "Jordânia" }, Philippines: { name: "Filipinas" },
  Indonesia: { name: "Indonésia" }, Malaysia: { name: "Malásia" }, Vietnam: { name: "Vietnã" }, Thailand: { name: "Tailândia" },
  India: { name: "Índia" },
};
function ptEspnTeam(team: any): { name: string; short: string } {
  const abbr = String(team?.abbreviation ?? "").toUpperCase();
  const byAbbr = abbr ? TEAM_PT[abbr] : undefined;
  if (byAbbr) return { name: byAbbr.name, short: byAbbr.short ?? byAbbr.name };
  const dn: string = team?.displayName ?? team?.shortDisplayName ?? "Time";
  const byName = COUNTRY_EN_PT[dn];
  if (byName) return { name: byName.name, short: byName.short ?? byName.name };
  return { name: dn, short: team?.shortDisplayName ?? dn };
}
function mapEspnStatus(state: string, name: string): MatchStatus {
  const n = (name ?? "").toUpperCase();
  if (n.includes("CANCEL") || n.includes("ABANDON") || n.includes("FORFEIT")) return "cancelled";
  if (n.includes("POSTPON") || n.includes("DELAY")) return "postponed";
  if (state === "post") return "finished";
  if (state === "in") return "live";
  return "scheduled";
}
async function syncEspn(supabase: SupabaseClient, ctx: SourceCtx, writeTeams: boolean): Promise<MatchRow[]> {
  if (!ctx.providerCode) throw new Error("provider_code ausente (slug ESPN)");
  const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/${ctx.providerCode}/scoreboard`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const today = new Date();
  const seedRes = await fetch(`${base}?dates=${ymd(today)}`);
  if (!seedRes.ok) throw new Error(`espn indisponível (${seedRes.status})`);
  const seed = await seedRes.json();
  if (!seed || (!Array.isArray(seed.leagues) && !Array.isArray(seed.events))) throw new Error("ESPN: formato inesperado (a API pode ter mudado).");
  const lo = new Date(today); lo.setUTCDate(lo.getUTCDate() - 3);
  const hi = new Date(today); hi.setUTCDate(hi.getUTCDate() + 28);
  const cal: string[] = ((seed?.leagues?.[0]?.calendar ?? []) as unknown[]).map((c) => String(c).slice(0, 10))
    .filter((iso) => { const d = new Date(`${iso}T00:00:00Z`); return d >= lo && d <= hi; });
  const seedISO = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;
  const dates = (cal.length ? cal : [seedISO]).slice(0, 30);
  const byId = new Map<string, any>();
  const collect = (data: any) => { for (const e of data?.events ?? []) if (e?.id) byId.set(String(e.id), e); };
  collect(seed);
  for (const iso of dates) {
    if (iso === seedISO) continue;
    const r = await fetch(`${base}?dates=${iso.replaceAll("-", "")}`);
    if (r.ok) collect(await r.json());
  }
  const events = [...byId.values()];

  const teamMap = new Map<string, string>();
  if (writeTeams) {
    const teamSeen = new Map<string, any>();
    for (const e of events) for (const c of e?.competitions?.[0]?.competitors ?? []) if (c?.team?.id) teamSeen.set(String(c.team.id), c.team);
    const teamRows = [...teamSeen].map(([pid, t]) => {
      const pt = ptEspnTeam(t);
      return { provider: "espn" as const, provider_ref: String(pid), name: pt.name, short_name: pt.short, tla: t.abbreviation ?? null, crest_url: t.logo ?? null };
    });
    if (teamRows.length) {
      const { data: up, error } = await supabase.from("teams").upsert(teamRows, { onConflict: "provider,provider_ref" }).select("id, provider_ref");
      if (error) throw error;
      for (const r of up ?? []) teamMap.set(String(r.provider_ref), r.id);
    }
  }

  return events.map((e: any): MatchRow => {
    const c0 = e?.competitions?.[0] ?? {};
    const cs = c0.competitors ?? [];
    const home = cs.find((c: any) => c.homeAway === "home") ?? cs[0] ?? {};
    const away = cs.find((c: any) => c.homeAway === "away") ?? cs[1] ?? {};
    const stType = c0.status?.type ?? e?.status?.type ?? {};
    const status = mapEspnStatus(String(stType.state ?? ""), String(stType.name ?? ""));
    const live = status === "finished" || status === "live";
    const num = (v: unknown) => (v != null && v !== "" ? Number(v) : null);
    return {
      competition_id: ctx.competitionId, provider: "espn", provider_ref: String(e.id),
      home_team_id: writeTeams && home.team?.id ? teamMap.get(String(home.team.id)) ?? null : null,
      away_team_id: writeTeams && away.team?.id ? teamMap.get(String(away.team.id)) ?? null : null,
      home_team_name: home.team ? ptEspnTeam(home.team).short : "A definir",
      away_team_name: away.team ? ptEspnTeam(away.team).short : "A definir",
      kickoff_at: e.date ?? null, status,
      home_score: live ? num(home.score) : null, away_score: live ? num(away.score) : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Saúde / alertas de API (igual à versão anterior)
// ---------------------------------------------------------------------------
async function markSyncResult(admin: SupabaseClient, compId: string, ok: boolean, error: string | null): Promise<void> {
  await admin.from("competitions").update({
    last_sync_ok: ok, last_sync_error: ok ? null : (error ?? "erro desconhecido").slice(0, 500),
    last_sync_checked_at: new Date().toISOString(),
  }).eq("id", compId);
}
async function notifyAdmins(admin: SupabaseClient, title: string, body: string): Promise<void> {
  const { data: admins } = await admin.from("profiles").select("id").eq("is_app_admin", true);
  if (!admins?.length) return;
  await admin.from("notifications").insert(admins.map((a: { id: string }) => ({
    user_id: a.id, type: "admin_sync", title, body, data: { url: "/admin" },
  })));
}
async function alertApiError(admin: SupabaseClient, comp: CompetitionRow, message: string): Promise<boolean> {
  const { data: prev } = await admin.from("sync_alerts").select("id")
    .eq("competition_id", comp.id).eq("kind", "api_error").eq("status", "pending").limit(1);
  if (prev && prev.length) return false;
  await admin.from("sync_alerts").insert({
    competition_id: comp.id, kind: "api_error", status: "pending",
    message: `Sincronização falhando em ${comp.name}: ${message}`.slice(0, 300), payload: { provider: comp.provider },
  });
  await notifyAdmins(admin, "⚠️ Sincronização com problema", `${comp.name}: ${message}`.slice(0, 180));
  return true;
}
async function clearApiErrors(admin: SupabaseClient, compId: string): Promise<void> {
  await admin.from("sync_alerts").update({ status: "approved", resolved_at: new Date().toISOString() })
    .eq("competition_id", compId).eq("kind", "api_error").eq("status", "pending");
}

// Roda um fetcher de fonte (primary ou secundária) e devolve as linhas.
async function fetchSource(
  admin: SupabaseClient, ctx: SourceCtx, src: SourceRow,
  secrets: { footballDataToken: string; theSportsDbKey: string }, writeTeams: boolean,
): Promise<MatchRow[]> {
  if (src.provider === "football_data") {
    if (!secrets.footballDataToken) throw new Error("FOOTBALL_DATA_TOKEN não configurado");
    return await syncFootballData(admin, ctx, secrets.footballDataToken, writeTeams);
  }
  if (src.provider === "thesportsdb") return await syncTheSportsDb(ctx, secrets.theSportsDbKey);
  if (src.provider === "espn") return await syncEspn(admin, ctx, writeTeams);
  return [];
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const secrets = {
    footballDataToken: Deno.env.get("FOOTBALL_DATA_TOKEN") ?? "",
    theSportsDbKey: Deno.env.get("THESPORTSDB_KEY") ?? "3",
  };
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  let authorized = (!!jwt && timingSafeEqual(jwt, serviceKey)) || (!!cronSecret && !!jwt && timingSafeEqual(jwt, cronSecret));
  if (!authorized && jwt) {
    const { data: userData } = await admin.auth.getUser(jwt);
    if (userData.user) {
      const { data: profile } = await admin.from("profiles").select("is_app_admin").eq("id", userData.user.id).maybeSingle();
      authorized = !!profile?.is_app_admin;
    }
  }
  if (!authorized) return json({ error: "Não autorizado" }, 403);

  let body: { competitionId?: string; mode?: string } = {};
  try { body = await req.json(); } catch { /* sem body = catalog em todas */ }
  const mode: SyncMode = body.mode === "scores" ? "scores" : "catalog";

  let query = admin.from("competitions")
    .select("id, name, provider, provider_code, provider_season, catalog_seeded")
    .eq("sync_enabled", true);
  if (body.competitionId) query = query.eq("id", body.competitionId);
  const { data: comps, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, unknown>[] = [];

  for (const comp of (comps ?? []) as CompetitionRow[]) {
    // fontes desta competição (primary primeiro, depois prioridade)
    const { data: srcData } = await admin.from("competition_sources")
      .select("id, competition_id, provider, provider_code, provider_season, role, priority, enabled, last_sync_checked_at")
      .eq("competition_id", comp.id).eq("enabled", true)
      .order("role", { ascending: true }).order("priority", { ascending: true });
    let sources = (srcData ?? []) as SourceRow[];
    // Compat: competição sem fontes cadastradas mas não-manual → usa a própria.
    if (!sources.length && comp.provider !== "manual") {
      sources = [{
        id: "self", competition_id: comp.id, provider: comp.provider, provider_code: comp.provider_code,
        provider_season: comp.provider_season, role: "primary", priority: 0, enabled: true, last_sync_checked_at: null,
      }];
    }
    if (!sources.length) continue;

    const touched = new Set<string>();
    let primaryOk = false;
    let primaryErr: string | null = null;
    let inserted = 0, updated = 0, alerted = 0, secMatched = 0;
    const nowMs = Date.now();

    for (const src of sources) {
      const isPrimary = src.role === "primary";
      // throttle de secundária no modo scores (respeita rate limit)
      if (!isPrimary && mode === "scores") {
        const last = src.last_sync_checked_at ? new Date(src.last_sync_checked_at).getTime() : 0;
        if (nowMs - last < SECONDARY_THROTTLE_MS) continue;
      }
      const ctx: SourceCtx = {
        competitionId: comp.id, competitionName: comp.name, provider: src.provider,
        providerCode: src.provider_code, providerSeason: src.provider_season, catalogSeeded: comp.catalog_seeded,
      };
      try {
        const rows = await fetchSource(admin, ctx, src, secrets, isPrimary);
        if (isPrimary) {
          // a primary "é" a competição (mesmo provider) → reconcile estrutural
          const compForPrimary: CompetitionRow = { ...comp, provider: src.provider, provider_code: src.provider_code, provider_season: src.provider_season };
          const r = await reconcilePrimary(admin, compForPrimary, rows, mode);
          updated += r.updated; inserted += r.inserted; alerted += r.alerted;
          r.touched.forEach((id) => touched.add(id));
          primaryOk = true;
        } else {
          const r = await ingestSecondary(admin, comp, rows);
          secMatched += r.matched;
          r.touched.forEach((id) => touched.add(id));
        }
        if (src.id !== "self") {
          await admin.from("competition_sources").update({
            last_sync_ok: true, last_sync_error: null, last_sync_checked_at: new Date().toISOString(),
          }).eq("id", src.id);
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isPrimary) primaryErr = msg;
        if (src.id !== "self") {
          await admin.from("competition_sources").update({
            last_sync_ok: false, last_sync_error: msg.slice(0, 500), last_sync_checked_at: new Date().toISOString(),
          }).eq("id", src.id);
        }
      }
    }

    // golden + freeze nos jogos tocados — lógica no banco (RPC testável + cron)
    let goldenUpdated = 0;
    try {
      const { data: gu } = await admin.rpc("resolve_match_golden", { p_match_ids: [...touched] });
      goldenUpdated = (gu as number) ?? 0;
    } catch (e) { console.error("golden", e); }

    // saúde da competição: ok se a primary funcionou; senão alerta (degradação:
    // secundárias podem ter mantido o placar fresco mesmo com a primary fora).
    if (primaryOk) {
      await admin.from("competitions").update({ last_synced_at: new Date().toISOString() }).eq("id", comp.id);
      await markSyncResult(admin, comp.id, true, null);
      await clearApiErrors(admin, comp.id);
      results.push({ competition: comp.name, ok: true, mode, updated, inserted, alerted, secMatched, golden: goldenUpdated });
    } else {
      const msg = primaryErr ?? "fonte primária indisponível";
      await markSyncResult(admin, comp.id, false, msg);
      await alertApiError(admin, comp, msg);
      results.push({ competition: comp.name, ok: false, error: msg, secMatched, golden: goldenUpdated });
    }
  }

  return json({ synced: results.length, results });
});
