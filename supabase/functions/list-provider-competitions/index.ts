// Resultadismo · Edge Function · list-provider-competitions
// Lista o catálogo de competições liberadas no plano da chave de cada provedor
// (football-data.org e TheSportsDB). Roda no servidor para não expor o token
// no navegador. Apenas app_admin pode chamar.

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/security.ts";

type ProviderCompetition = {
  provider: "football_data" | "thesportsdb" | "espn";
  code: string;
  name: string;
  area: string | null;
  country: string | null;
  emblem: string | null;
  type: string | null;
  season: string | null;
};

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
        console.error("football-data list error", res.status, await res.text());
        return json({ error: `Provedor indisponível (${res.status}).` }, 502);
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
        }));

      // Curadoria: ligas que respondem fixtures/eventos com a key free mas
      // não aparecem em all_leagues.php (verificado por consulta direta a
      // eventsseason.php). Mescla sem duplicar por ID.
      const CURATED: ProviderCompetition[] = [
        {
          provider: "thesportsdb",
          code: "4351",
          name: "Brazilian Serie A",
          area: "Brazil",
          country: "Brazil",
          emblem: null,
          type: null,
          season: null,
        },
        {
          provider: "thesportsdb",
          code: "4562",
          name: "International Friendlies",
          area: "World",
          country: "World",
          emblem: null,
          type: null,
          season: null,
        },
      ];
      for (const cur of CURATED) {
        if (!competitions.some((c) => c.code === cur.code)) competitions.push(cur);
      }

      competitions.sort((a, b) => {
        const c = (a.country ?? "").localeCompare(b.country ?? "");
        return c !== 0 ? c : a.name.localeCompare(b.name);
      });
      return json({ competitions });
    }

    if (provider === "espn") {
      // ESPN não tem "listar tudo" limpo; curadoria dos slugs de scoreboard.
      // O code é o slug ESPN (ex.: fifa.friendly). season não se aplica.
      const competitions: ProviderCompetition[] = [
        { provider: "espn", code: "fifa.friendly", name: "Amistosos Internacionais", area: "Mundo", country: "Mundo", emblem: null, type: null, season: null },
        { provider: "espn", code: "fifa.world", name: "Copa do Mundo FIFA", area: "Mundo", country: "Mundo", emblem: null, type: null, season: null },
        { provider: "espn", code: "fifa.worldq.conmebol", name: "Eliminatórias (América do Sul)", area: "Mundo", country: "Mundo", emblem: null, type: null, season: null },
        { provider: "espn", code: "bra.1", name: "Brasileirão Série A", area: "Brasil", country: "Brasil", emblem: null, type: null, season: null },
        { provider: "espn", code: "bra.2", name: "Brasileirão Série B", area: "Brasil", country: "Brasil", emblem: null, type: null, season: null },
        { provider: "espn", code: "bra.copa_do_brazil", name: "Copa do Brasil", area: "Brasil", country: "Brasil", emblem: null, type: null, season: null },
        { provider: "espn", code: "conmebol.libertadores", name: "Libertadores", area: "América do Sul", country: "América do Sul", emblem: null, type: null, season: null },
        { provider: "espn", code: "conmebol.sudamericana", name: "Sul-Americana", area: "América do Sul", country: "América do Sul", emblem: null, type: null, season: null },
        { provider: "espn", code: "uefa.champions", name: "Champions League", area: "Europa", country: "Europa", emblem: null, type: null, season: null },
        { provider: "espn", code: "eng.1", name: "Premier League", area: "Inglaterra", country: "Inglaterra", emblem: null, type: null, season: null },
        { provider: "espn", code: "esp.1", name: "La Liga", area: "Espanha", country: "Espanha", emblem: null, type: null, season: null },
        { provider: "espn", code: "ita.1", name: "Serie A (Itália)", area: "Itália", country: "Itália", emblem: null, type: null, season: null },
        { provider: "espn", code: "ger.1", name: "Bundesliga", area: "Alemanha", country: "Alemanha", emblem: null, type: null, season: null },
        { provider: "espn", code: "fra.1", name: "Ligue 1", area: "França", country: "França", emblem: null, type: null, season: null },
      ];
      return json({ competitions });
    }

    return json({ error: "provider inválido (use football_data, thesportsdb ou espn)" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
