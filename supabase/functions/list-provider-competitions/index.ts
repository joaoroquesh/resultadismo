// Resultadismo · Edge Function · list-provider-competitions
// Lista o catálogo de competições liberadas no plano da chave de cada provedor
// (football-data.org e TheSportsDB). Roda no servidor para não expor o token
// no navegador. Apenas app_admin pode chamar.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

type ProviderCompetition = {
  provider: "football_data" | "thesportsdb";
  code: string;
  name: string;
  area: string | null;
  country: string | null;
  emblem: string | null;
  type: string | null;
  season: string | null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const fdToken = Deno.env.get("FOOTBALL_DATA_TOKEN") ?? "";
  const tsdbKey = Deno.env.get("THESPORTSDB_KEY") ?? "3";

  // Autoriza: precisa ser app_admin
  const auth = req.headers.get("Authorization") ?? "";
  const jwt = auth.replace("Bearer ", "");
  if (!jwt) return json({ error: "Não autorizado" }, 401);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: userData } = await admin.auth.getUser(jwt);
  if (!userData?.user) return json({ error: "Não autorizado" }, 401);
  const { data: profile } = await admin
    .from("profiles")
    .select("is_app_admin")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profile?.is_app_admin) return json({ error: "Acesso restrito a administradores" }, 403);

  let body: { provider?: string } = {};
  try {
    body = await req.json();
  } catch {
    // ignora
  }
  const provider = body.provider;

  try {
    if (provider === "football_data") {
      if (!fdToken) return json({ error: "FOOTBALL_DATA_TOKEN não configurado" }, 500);
      const res = await fetch("https://api.football-data.org/v4/competitions/", {
        headers: { "X-Auth-Token": fdToken },
      });
      if (!res.ok) {
        return json({ error: `football-data ${res.status}: ${await res.text()}` }, 502);
      }
      const data = await res.json();
      const competitions: ProviderCompetition[] = (data.competitions ?? []).map((c: {
        code?: string;
        name?: string;
        area?: { name?: string; code?: string };
        emblem?: string;
        type?: string;
        currentSeason?: { startDate?: string };
      }) => ({
        provider: "football_data",
        code: c.code ?? "",
        name: c.name ?? "",
        area: c.area?.name ?? null,
        country: c.area?.name ?? null,
        emblem: c.emblem ?? null,
        type: c.type ?? null,
        // football-data usa o ANO de início como "season" (ex.: "2024" para 2024/25)
        season: c.currentSeason?.startDate ? c.currentSeason.startDate.slice(0, 4) : null,
      }));
      return json({ competitions });
    }

    if (provider === "thesportsdb") {
      const res = await fetch(`https://www.thesportsdb.com/api/v1/json/${tsdbKey}/all_leagues.php`);
      if (!res.ok) return json({ error: `thesportsdb ${res.status}` }, 502);
      const data = await res.json();
      const competitions: ProviderCompetition[] = (data.leagues ?? [])
        .filter((l: { strSport?: string }) => l.strSport === "Soccer")
        .map((l: {
          idLeague?: string;
          strLeague?: string;
          strLeagueAlternate?: string;
          strCountry?: string;
          strBadge?: string;
        }) => ({
          provider: "thesportsdb",
          code: l.idLeague ?? "",
          name: l.strLeague ?? "",
          area: l.strCountry ?? null,
          country: l.strCountry ?? null,
          emblem: l.strBadge ?? null,
          type: null,
          season: null, // TheSportsDB exige consulta de search_all_seasons; o admin preenche
        }))
        .sort((a: ProviderCompetition, b: ProviderCompetition) => {
          const c = (a.country ?? "").localeCompare(b.country ?? "");
          return c !== 0 ? c : a.name.localeCompare(b.name);
        });
      return json({ competitions });
    }

    return json({ error: "provider inválido (use football_data ou thesportsdb)" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
