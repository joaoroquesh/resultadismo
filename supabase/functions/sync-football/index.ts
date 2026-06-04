// Resultadismo · Edge Function · sync-football
// Sincroniza times, jogos e resultados de provedores gratuitos para o banco.
// Provedores: football-data.org (primário), TheSportsDB (extra), manual (ignorado).
//
// Chamada manual (admin): supabase.functions.invoke("sync-football", { body: { competitionId } })
// Chamada agendada (cron): POST com a service_role key no Authorization.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, timingSafeEqual } from "../_shared/security.ts";

type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

interface CompetitionRow {
  id: string;
  name: string;
  provider: "manual" | "football_data" | "thesportsdb" | "espn";
  provider_code: string | null;
  provider_season: string | null;
}

// ---------------------------------------------------------------------------
// football-data.org (v4)
// ---------------------------------------------------------------------------
function mapFootballDataStatus(s: string): MatchStatus {
  switch (s) {
    case "IN_PLAY":
    case "PAUSED":
      return "live";
    case "FINISHED":
    case "AWARDED":
      return "finished";
    case "POSTPONED":
    case "SUSPENDED":
      return "postponed";
    case "CANCELLED":
      return "cancelled";
    default:
      return "scheduled";
  }
}

// Tradução PT-BR dos nomes das seleções (chaveado pela TLA, estável no provedor).
// name = nome completo exibido; short = versão curta p/ os cards de jogo.
const TEAM_PT: Record<string, { name: string; short?: string }> = {
  ALG: { name: "Argélia" },
  ARG: { name: "Argentina" },
  AUS: { name: "Austrália" },
  AUT: { name: "Áustria" },
  BEL: { name: "Bélgica" },
  BIH: { name: "Bósnia e Herzegovina", short: "Bósnia" },
  BRA: { name: "Brasil" },
  CAN: { name: "Canadá" },
  CPV: { name: "Cabo Verde" },
  COL: { name: "Colômbia" },
  COD: { name: "Congo (RD)", short: "Congo RD" },
  CRO: { name: "Croácia" },
  CUR: { name: "Curaçao" },
  CZE: { name: "Tchéquia" },
  ECU: { name: "Equador" },
  EGY: { name: "Egito" },
  ENG: { name: "Inglaterra" },
  FRA: { name: "França" },
  GER: { name: "Alemanha" },
  GHA: { name: "Gana" },
  HAI: { name: "Haiti" },
  IRN: { name: "Irã" },
  IRQ: { name: "Iraque" },
  CIV: { name: "Costa do Marfim", short: "C. Marfim" },
  JPN: { name: "Japão" },
  JOR: { name: "Jordânia" },
  MEX: { name: "México" },
  MAR: { name: "Marrocos" },
  NED: { name: "Holanda" },
  NZL: { name: "Nova Zelândia", short: "N. Zelândia" },
  NOR: { name: "Noruega" },
  PAN: { name: "Panamá" },
  PAR: { name: "Paraguai" },
  POR: { name: "Portugal" },
  QAT: { name: "Catar" },
  KSA: { name: "Arábia Saudita", short: "Arábia S." },
  SCO: { name: "Escócia" },
  SEN: { name: "Senegal" },
  RSA: { name: "África do Sul" },
  KOR: { name: "Coreia do Sul", short: "Coreia" },
  ESP: { name: "Espanha" },
  SWE: { name: "Suécia" },
  SUI: { name: "Suíça" },
  TUN: { name: "Tunísia" },
  TUR: { name: "Turquia" },
  USA: { name: "Estados Unidos", short: "EUA" },
  URY: { name: "Uruguai" },
  URU: { name: "Uruguai" },
  UZB: { name: "Uzbequistão" },
};

function ptTeam(t: any): { name: string; short: string } {
  const tla: string | undefined = t?.tla ?? undefined;
  const pt = tla ? TEAM_PT[tla] : undefined;
  if (pt) return { name: pt.name, short: pt.short ?? pt.name };
  const name = t?.name ?? t?.shortName ?? "Time";
  const short = t?.shortName ?? t?.tla ?? name;
  return { name, short };
}

async function syncFootballData(
  supabase: SupabaseClient,
  comp: CompetitionRow,
  token: string,
): Promise<{ teams: number; matches: number }> {
  if (!comp.provider_code) throw new Error("provider_code ausente");
  const url = new URL(`https://api.football-data.org/v4/competitions/${comp.provider_code}/matches`);
  if (comp.provider_season) url.searchParams.set("season", comp.provider_season);

  const res = await fetch(url, { headers: { "X-Auth-Token": token } });
  if (!res.ok) {
    console.error("football-data sync error", res.status, await res.text());
    throw new Error(`football-data indisponível (${res.status})`);
  }
  const data = await res.json();
  const matches: any[] = data.matches ?? [];

  // upsert times
  const teamMap = new Map<number, string>(); // provider id -> uuid
  const teamsSeen = new Map<number, any>();
  for (const m of matches) {
    if (m.homeTeam?.id) teamsSeen.set(m.homeTeam.id, m.homeTeam);
    if (m.awayTeam?.id) teamsSeen.set(m.awayTeam.id, m.awayTeam);
  }
  // upsert de times em LOTE (1 ida ao banco em vez de N)
  const teamRows = [...teamsSeen].map(([pid, t]) => {
    const pt = ptTeam(t);
    return {
      provider: "football_data" as const,
      provider_ref: String(pid),
      name: pt.name,
      short_name: pt.short,
      tla: t.tla ?? null,
      crest_url: t.crest ?? null,
    };
  });
  if (teamRows.length > 0) {
    const { data: upTeams, error } = await supabase
      .from("teams")
      .upsert(teamRows, { onConflict: "provider,provider_ref" })
      .select("id, provider_ref");
    if (error) throw error;
    for (const r of upTeams ?? []) teamMap.set(Number(r.provider_ref), r.id);
  }

  // upsert de jogos em LOTE
  const ts = new Date().toISOString();
  const matchRows = matches.map((m) => {
    const status = mapFootballDataStatus(m.status);
    const ft = m.score?.fullTime ?? {};
    const pens = m.score?.penalties ?? {};
    const homeId = m.homeTeam?.id ? teamMap.get(m.homeTeam.id) : null;
    const awayId = m.awayTeam?.id ? teamMap.get(m.awayTeam.id) : null;
    const hasLiveScore = status === "finished" || status === "live";
    return {
      competition_id: comp.id,
      provider: "football_data" as const,
      provider_ref: String(m.id),
      stage: m.stage ?? null,
      group_name: m.group ?? null,
      round: m.matchday ? `Rodada ${m.matchday}` : (m.stage ?? null),
      matchday: m.matchday ?? null,
      home_team_id: homeId ?? null,
      away_team_id: awayId ?? null,
      home_team_name: m.homeTeam ? ptTeam(m.homeTeam).short : "A definir",
      away_team_name: m.awayTeam ? ptTeam(m.awayTeam).short : "A definir",
      kickoff_at: m.utcDate ?? null,
      status,
      home_score: hasLiveScore ? (ft.home ?? null) : null,
      away_score: hasLiveScore ? (ft.away ?? null) : null,
      home_pen: pens.home ?? null,
      away_pen: pens.away ?? null,
      last_synced_at: ts,
    };
  });
  if (matchRows.length > 0) {
    const { error } = await supabase
      .from("matches")
      .upsert(matchRows, { onConflict: "provider,provider_ref" });
    if (error) throw error;
  }

  return { teams: teamMap.size, matches: matchRows.length };
}

// ---------------------------------------------------------------------------
// TheSportsDB (v1, gratuito)
// ---------------------------------------------------------------------------
async function syncTheSportsDb(
  supabase: SupabaseClient,
  comp: CompetitionRow,
  key: string,
): Promise<{ teams: number; matches: number }> {
  if (!comp.provider_code) throw new Error("provider_code ausente (id da liga no TheSportsDB)");

  // eventsseason.php no Free CORTA em 15 eventos (ex.: pegava só jan/fev de uma temporada inteira).
  // PAST + NEXT cobrem a janela atual da liga (até 15 últimos finalizados + 15 próximos agendados).
  const base = `https://www.thesportsdb.com/api/v1/json/${key}`;
  const id = comp.provider_code;
  const [pastRes, nextRes] = await Promise.all([
    fetch(`${base}/eventspastleague.php?id=${id}`),
    fetch(`${base}/eventsnextleague.php?id=${id}`),
  ]);
  if (!pastRes.ok && !nextRes.ok) {
    throw new Error(`thesportsdb erro: past=${pastRes.status} next=${nextRes.status}`);
  }
  const past = pastRes.ok ? ((await pastRes.json()).events ?? []) : [];
  const next = nextRes.ok ? ((await nextRes.json()).events ?? []) : [];

  // dedup por idEvent (raramente sobrepõe past+next, mas garante)
  const byId = new Map<string, Record<string, unknown>>();
  for (const e of [...past, ...next]) {
    if (e?.idEvent) byId.set(String(e.idEvent), e);
  }
  const events = Array.from(byId.values());

  const ts = new Date().toISOString();
  const rows = events.map((e: Record<string, unknown>) => {
    const status = String(e.strStatus ?? "");
    const finished = status === "Match Finished" || status === "FT";
    const live = !!status && !finished && status !== "Not Started";
    const dateEvent = e.dateEvent as string | undefined;
    const strTime = e.strTime as string | undefined;
    const kickoff = (e.strTimestamp as string | undefined)
      ?? (dateEvent && strTime ? `${dateEvent}T${strTime}Z` : null);
    const hs = e.intHomeScore;
    const as_ = e.intAwayScore;
    return {
      competition_id: comp.id,
      provider: "thesportsdb" as const,
      provider_ref: String(e.idEvent),
      round: e.intRound ? `Rodada ${e.intRound}` : null,
      home_team_name: (e.strHomeTeam as string | undefined) ?? "A definir",
      away_team_name: (e.strAwayTeam as string | undefined) ?? "A definir",
      kickoff_at: kickoff,
      status: finished ? ("finished" as const) : live ? ("live" as const) : ("scheduled" as const),
      home_score: (finished || live) && hs != null ? Number(hs) : null,
      away_score: (finished || live) && as_ != null ? Number(as_) : null,
      last_synced_at: ts,
    };
  });
  if (rows.length > 0) {
    const { error } = await supabase
      .from("matches")
      .upsert(rows, { onConflict: "provider,provider_ref" });
    if (error) throw error;
  }
  return { teams: 0, matches: rows.length };
}

// ---------------------------------------------------------------------------
// ESPN (JSON público de scoreboard) — grátis, com status ao vivo + escudos
// ---------------------------------------------------------------------------
// Nomes em PT por nome em inglês (seleções). Sigla (TLA) também é tentada via
// TEAM_PT antes disto. Sem match → cai no nome em inglês.
const COUNTRY_EN_PT: Record<string, { name: string; short?: string }> = {
  Argentina: { name: "Argentina" },
  Bolivia: { name: "Bolívia" },
  Brazil: { name: "Brasil" },
  Chile: { name: "Chile" },
  Colombia: { name: "Colômbia" },
  Ecuador: { name: "Equador" },
  Paraguay: { name: "Paraguai" },
  Peru: { name: "Peru" },
  Uruguay: { name: "Uruguai" },
  Venezuela: { name: "Venezuela" },
  "United States": { name: "Estados Unidos", short: "EUA" },
  USA: { name: "Estados Unidos", short: "EUA" },
  Mexico: { name: "México" },
  Canada: { name: "Canadá" },
  "Costa Rica": { name: "Costa Rica" },
  Panama: { name: "Panamá" },
  Honduras: { name: "Honduras" },
  Jamaica: { name: "Jamaica" },
  Curacao: { name: "Curaçao" },
  Haiti: { name: "Haiti" },
  England: { name: "Inglaterra" },
  France: { name: "França" },
  Germany: { name: "Alemanha" },
  Spain: { name: "Espanha" },
  Portugal: { name: "Portugal" },
  Italy: { name: "Itália" },
  Netherlands: { name: "Holanda" },
  Belgium: { name: "Bélgica" },
  Croatia: { name: "Croácia" },
  Switzerland: { name: "Suíça" },
  Scotland: { name: "Escócia" },
  Wales: { name: "País de Gales", short: "Gales" },
  Poland: { name: "Polônia" },
  Denmark: { name: "Dinamarca" },
  Sweden: { name: "Suécia" },
  Norway: { name: "Noruega" },
  Austria: { name: "Áustria" },
  Serbia: { name: "Sérvia" },
  Turkey: { name: "Turquia" },
  "Türkiye": { name: "Turquia" },
  Ukraine: { name: "Ucrânia" },
  "Czech Republic": { name: "Tchéquia" },
  Czechia: { name: "Tchéquia" },
  Hungary: { name: "Hungria" },
  Romania: { name: "Romênia" },
  Greece: { name: "Grécia" },
  Ireland: { name: "Irlanda" },
  "Republic of Ireland": { name: "Irlanda" },
  "Northern Ireland": { name: "Irlanda do Norte", short: "Irl. Norte" },
  Russia: { name: "Rússia" },
  Albania: { name: "Albânia" },
  Israel: { name: "Israel" },
  Luxembourg: { name: "Luxemburgo" },
  Gibraltar: { name: "Gibraltar" },
  Morocco: { name: "Marrocos" },
  Algeria: { name: "Argélia" },
  Tunisia: { name: "Tunísia" },
  Egypt: { name: "Egito" },
  Senegal: { name: "Senegal" },
  Nigeria: { name: "Nigéria" },
  Ghana: { name: "Gana" },
  Cameroon: { name: "Camarões" },
  "Ivory Coast": { name: "Costa do Marfim", short: "C. Marfim" },
  "Cote d'Ivoire": { name: "Costa do Marfim", short: "C. Marfim" },
  Mali: { name: "Mali" },
  "South Africa": { name: "África do Sul", short: "Á. do Sul" },
  Kenya: { name: "Quênia" },
  "DR Congo": { name: "Congo (RD)", short: "Congo RD" },
  "Congo DR": { name: "Congo (RD)", short: "Congo RD" },
  "Cape Verde": { name: "Cabo Verde" },
  Madagascar: { name: "Madagascar" },
  Japan: { name: "Japão" },
  "South Korea": { name: "Coreia do Sul", short: "Coreia" },
  "Korea Republic": { name: "Coreia do Sul", short: "Coreia" },
  "Saudi Arabia": { name: "Arábia Saudita", short: "Arábia S." },
  Iran: { name: "Irã" },
  "IR Iran": { name: "Irã" },
  Iraq: { name: "Iraque" },
  Qatar: { name: "Catar" },
  Australia: { name: "Austrália" },
  "New Zealand": { name: "Nova Zelândia", short: "N. Zelândia" },
  China: { name: "China" },
  "China PR": { name: "China" },
  Uzbekistan: { name: "Uzbequistão" },
  Jordan: { name: "Jordânia" },
  Philippines: { name: "Filipinas" },
  Indonesia: { name: "Indonésia" },
  Malaysia: { name: "Malásia" },
  Vietnam: { name: "Vietnã" },
  Thailand: { name: "Tailândia" },
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

async function syncEspn(
  supabase: SupabaseClient,
  comp: CompetitionRow,
): Promise<{ teams: number; matches: number }> {
  if (!comp.provider_code) {
    throw new Error("provider_code ausente (slug ESPN, ex.: fifa.friendly, bra.1)");
  }
  const base = `https://site.api.espn.com/apis/site/v2/sports/soccer/${comp.provider_code}/scoreboard`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  const today = new Date();

  // 1) seed (hoje) → traz o calendar (datas com jogo)
  const seedRes = await fetch(`${base}?dates=${ymd(today)}`);
  if (!seedRes.ok) {
    console.error("espn sync error", seedRes.status, await seedRes.text());
    throw new Error(`espn indisponível (${seedRes.status})`);
  }
  const seed = await seedRes.json();

  // janela: -3 a +28 dias, dentro do calendar (teto de 30 requisições)
  const lo = new Date(today);
  lo.setUTCDate(lo.getUTCDate() - 3);
  const hi = new Date(today);
  hi.setUTCDate(hi.getUTCDate() + 28);
  const cal: string[] = ((seed?.leagues?.[0]?.calendar ?? []) as unknown[])
    .map((c) => String(c).slice(0, 10))
    .filter((iso) => {
      const d = new Date(`${iso}T00:00:00Z`);
      return d >= lo && d <= hi;
    });
  const dates = (cal.length ? cal : [`${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`]).slice(0, 30);

  const byId = new Map<string, any>();
  const collect = (data: any) => {
    for (const e of data?.events ?? []) if (e?.id) byId.set(String(e.id), e);
  };
  collect(seed);
  const seedISO = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;
  for (const iso of dates) {
    if (iso === seedISO) continue;
    const r = await fetch(`${base}?dates=${iso.replaceAll("-", "")}`);
    if (r.ok) collect(await r.json());
  }
  const events = [...byId.values()];

  // times (escudos)
  const teamSeen = new Map<string, any>();
  for (const e of events) {
    for (const c of e?.competitions?.[0]?.competitors ?? []) {
      if (c?.team?.id) teamSeen.set(String(c.team.id), c.team);
    }
  }
  const teamMap = new Map<string, string>();
  const teamRows = [...teamSeen].map(([pid, t]) => {
    const pt = ptEspnTeam(t);
    return {
      provider: "espn" as const,
      provider_ref: String(pid),
      name: pt.name,
      short_name: pt.short,
      tla: t.abbreviation ?? null,
      crest_url: t.logo ?? null,
    };
  });
  if (teamRows.length) {
    const { data: up, error } = await supabase
      .from("teams")
      .upsert(teamRows, { onConflict: "provider,provider_ref" })
      .select("id, provider_ref");
    if (error) throw error;
    for (const r of up ?? []) teamMap.set(String(r.provider_ref), r.id);
  }

  // jogos
  const ts = new Date().toISOString();
  const rows = events.map((e: any) => {
    const c0 = e?.competitions?.[0] ?? {};
    const cs = c0.competitors ?? [];
    const home = cs.find((c: any) => c.homeAway === "home") ?? cs[0] ?? {};
    const away = cs.find((c: any) => c.homeAway === "away") ?? cs[1] ?? {};
    const stType = c0.status?.type ?? e?.status?.type ?? {};
    const status = mapEspnStatus(String(stType.state ?? ""), String(stType.name ?? ""));
    const live = status === "finished" || status === "live";
    const num = (v: unknown) => (v != null && v !== "" ? Number(v) : null);
    return {
      competition_id: comp.id,
      provider: "espn" as const,
      provider_ref: String(e.id),
      home_team_id: home.team?.id ? teamMap.get(String(home.team.id)) ?? null : null,
      away_team_id: away.team?.id ? teamMap.get(String(away.team.id)) ?? null : null,
      home_team_name: home.team ? ptEspnTeam(home.team).short : "A definir",
      away_team_name: away.team ? ptEspnTeam(away.team).short : "A definir",
      kickoff_at: e.date ?? null,
      status,
      home_score: live ? num(home.score) : null,
      away_score: live ? num(away.score) : null,
      last_synced_at: ts,
    };
  });
  if (rows.length) {
    const { error } = await supabase
      .from("matches")
      .upsert(rows, { onConflict: "provider,provider_ref" });
    if (error) throw error;
  }
  return { teams: teamMap.size, matches: rows.length };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const footballDataToken = Deno.env.get("FOOTBALL_DATA_TOKEN") ?? "";
  const theSportsDbKey = Deno.env.get("THESPORTSDB_KEY") ?? "3";

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  // Autorização: cron (service key ou CRON_SECRET) ou usuário app_admin
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace("Bearer ", "");
  let authorized =
    (!!jwt && timingSafeEqual(jwt, serviceKey)) ||
    (!!cronSecret && !!jwt && timingSafeEqual(jwt, cronSecret));
  if (!authorized && jwt) {
    const { data: userData } = await admin.auth.getUser(jwt);
    if (userData.user) {
      const { data: profile } = await admin
        .from("profiles")
        .select("is_app_admin")
        .eq("id", userData.user.id)
        .maybeSingle();
      authorized = !!profile?.is_app_admin;
    }
  }
  if (!authorized) return json({ error: "Não autorizado" }, 403);

  let body: { competitionId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // sem body = sincroniza todas
  }

  let query = admin
    .from("competitions")
    .select("id, name, provider, provider_code, provider_season")
    .neq("provider", "manual")
    .eq("sync_enabled", true);
  if (body.competitionId) query = query.eq("id", body.competitionId);

  const { data: comps, error } = await query;
  if (error) return json({ error: error.message }, 500);

  const results: Record<string, unknown>[] = [];
  for (const comp of (comps ?? []) as CompetitionRow[]) {
    try {
      let r: { teams: number; matches: number };
      if (comp.provider === "football_data") {
        if (!footballDataToken) throw new Error("FOOTBALL_DATA_TOKEN não configurado");
        r = await syncFootballData(admin, comp, footballDataToken);
      } else if (comp.provider === "thesportsdb") {
        r = await syncTheSportsDb(admin, comp, theSportsDbKey);
      } else if (comp.provider === "espn") {
        r = await syncEspn(admin, comp);
      } else {
        continue;
      }
      await admin
        .from("competitions")
        .update({ last_synced_at: new Date().toISOString() })
        .eq("id", comp.id);
      results.push({ competition: comp.name, ok: true, ...r });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "object"
            ? JSON.stringify(e)
            : String(e);
      results.push({ competition: comp.name, ok: false, error: msg });
    }
  }

  return json({ synced: results.length, results });
});
