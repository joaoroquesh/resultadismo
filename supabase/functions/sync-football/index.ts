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
  for (const [pid, t] of teamsSeen) {
    const pt = ptTeam(t);
    const { data: up, error } = await supabase
      .from("teams")
      .upsert(
        {
          provider: "football_data",
          provider_ref: String(pid),
          name: pt.name,
          short_name: pt.short,
          tla: t.tla ?? null,
          crest_url: t.crest ?? null,
        },
        { onConflict: "provider,provider_ref" },
      )
      .select("id")
      .single();
    if (error) throw error;
    teamMap.set(pid, up!.id);
  }

  // upsert jogos
  let count = 0;
  for (const m of matches) {
    const status = mapFootballDataStatus(m.status);
    const ft = m.score?.fullTime ?? {};
    const pens = m.score?.penalties ?? {};
    const homeId = m.homeTeam?.id ? teamMap.get(m.homeTeam.id) : null;
    const awayId = m.awayTeam?.id ? teamMap.get(m.awayTeam.id) : null;

    const { error } = await supabase.from("matches").upsert(
      {
        competition_id: comp.id,
        provider: "football_data",
        provider_ref: String(m.id),
        stage: m.stage ?? null,
        group_name: m.group ?? null,
        round: m.matchday ? `Rodada ${m.matchday}` : (m.stage ?? null),
        matchday: m.matchday ?? null,
        home_team_id: homeId,
        away_team_id: awayId,
        home_team_name: m.homeTeam ? ptTeam(m.homeTeam).short : "A definir",
        away_team_name: m.awayTeam ? ptTeam(m.awayTeam).short : "A definir",
        kickoff_at: m.utcDate ?? null,
        status,
        home_score: status === "finished" ? (ft.home ?? null) : (status === "live" ? (ft.home ?? null) : null),
        away_score: status === "finished" ? (ft.away ?? null) : (status === "live" ? (ft.away ?? null) : null),
        home_pen: pens.home ?? null,
        away_pen: pens.away ?? null,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_ref" },
    );
    if (error) throw error;
    count++;
  }

  return { teams: teamMap.size, matches: count };
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
  const season = comp.provider_season ?? "";
  const url = `https://www.thesportsdb.com/api/v1/json/${key}/eventsseason.php?id=${comp.provider_code}${season ? `&s=${season}` : ""}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`thesportsdb ${res.status}`);
  const data = await res.json();
  const events: any[] = data.events ?? [];

  let count = 0;
  for (const e of events) {
    const finished = e.strStatus === "Match Finished" || e.strStatus === "FT";
    const kickoff = e.strTimestamp ?? (e.dateEvent && e.strTime ? `${e.dateEvent}T${e.strTime}Z` : null);
    const { error } = await supabase.from("matches").upsert(
      {
        competition_id: comp.id,
        provider: "thesportsdb",
        provider_ref: String(e.idEvent),
        round: e.intRound ? `Rodada ${e.intRound}` : null,
        home_team_name: e.strHomeTeam ?? "A definir",
        away_team_name: e.strAwayTeam ?? "A definir",
        kickoff_at: kickoff,
        status: finished ? "finished" : "scheduled",
        home_score: finished ? Number(e.intHomeScore ?? null) : null,
        away_score: finished ? Number(e.intAwayScore ?? null) : null,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: "provider,provider_ref" },
    );
    if (error) throw error;
    count++;
  }
  return { teams: 0, matches: count };
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
