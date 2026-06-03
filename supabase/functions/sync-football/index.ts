// Resultadismo · Edge Function · sync-football
// Sincroniza times, jogos e resultados de provedores gratuitos para o banco.
// Provedores: football-data.org (primário), TheSportsDB (extra), manual (ignorado).
//
// Chamada manual (admin): supabase.functions.invoke("sync-football", { body: { competitionId } })
// Chamada agendada (cron): POST com a service_role key no Authorization.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

interface CompetitionRow {
  id: string;
  name: string;
  provider: "manual" | "football_data" | "thesportsdb";
  provider_code: string | null;
  provider_season: string | null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
    throw new Error(`football-data ${res.status}: ${await res.text()}`);
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
// Handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

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
  let authorized = jwt === serviceKey || (!!cronSecret && jwt === cronSecret);
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
