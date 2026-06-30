import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { Competition, League, MatchStatus, DataProvider } from "@/lib/types";

// Invalida tudo que depende de placar/pontuação após uma edição de jogo: a lista
// do admin + os palpites + as classificações oficiais e AO VIVO (grupo e global)
// e os previews da aba Grupos. Centralizado p/ não divergir entre os hooks.
function invalidateScoringQueries(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["admin", "matches"] });
  qc.invalidateQueries({ queryKey: ["matches"] });
  qc.invalidateQueries({ queryKey: ["standings"] });
  qc.invalidateQueries({ queryKey: ["standings-live"] });
  qc.invalidateQueries({ queryKey: ["rtb-standings-live"] });
  qc.invalidateQueries({ queryKey: ["rtb-my-rank-live"] });
  qc.invalidateQueries({ queryKey: ["my-league-positions-live"] });
  qc.invalidateQueries({ queryKey: ["group-rank-window-live"] });
}

export function usePendingLeagues() {
  return useQuery({
    queryKey: ["admin", "pending-leagues"],
    queryFn: async (): Promise<(League & { owner: { display_name: string } | null })[]> => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*, owner:profiles!leagues_owner_id_fkey(display_name)")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as (League & { owner: { display_name: string } | null })[];
    },
  });
}

export function useApproveLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("approve_league", { p_league_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "pending-leagues"] }),
  });
}

export function useRejectLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("reject_league", { p_league_id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "pending-leagues"] }),
  });
}

export function useAdminCompetitions() {
  return useQuery({
    queryKey: ["admin", "competitions"],
    queryFn: async (): Promise<Competition[]> => {
      const { data, error } = await supabase
        .from("competitions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function useCreateCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      shortName?: string;
      provider: DataProvider;
      providerCode?: string;
      providerSeason?: string;
      type: "LEAGUE" | "CUP";
      isFeatured: boolean;
    }) => {
      const { data, error } = await supabase
        .from("competitions")
        .insert({
          name: input.name,
          slug: `${slugify(input.name)}-${Math.random().toString(36).slice(2, 5)}`,
          short_name: input.shortName || null,
          provider: input.provider,
          provider_code: input.providerCode || null,
          provider_season: input.providerSeason || null,
          type: input.type,
          is_featured: input.isFeatured,
        })
        .select()
        .single();
      // surfaceia a mensagem real (PostgrestError não é Error → o toast mostrava
      // só "Erro."). Ex.: 'invalid input value for enum data_provider: "espn"'.
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "competitions"] }),
  });
}

export function useSyncFootball() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (competitionId?: string) => {
      const { data, error } = await supabase.functions.invoke("sync-football", {
        body: competitionId ? { competitionId } : {},
      });
      if (error) throw new Error(error.message);
      return data as { synced: number; results: { competition: string; ok: boolean; error?: string }[] };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["matches"] });
      qc.invalidateQueries({ queryKey: ["admin"] });
    },
  });
}

export type AdminMatch = {
  id: string;
  competition_id: string;
  provider: string;
  round: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  home_team_id: string | null;
  away_team_id: string | null;
  home_team: { name: string | null; short_name: string | null; crest_url: string | null } | null;
  away_team: { name: string | null; short_name: string | null; crest_url: string | null } | null;
  kickoff_at: string | null;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  home_pen: number | null;
  away_pen: number | null;
  hidden: boolean;
  // mata-mata "quem passa" + situação ao vivo + travas de fonte (override manual).
  stage: string | null;
  is_knockout: boolean;
  advanced_team_id: string | null;
  live_phase: string | null;
  frozen: boolean;
  manual_lock: boolean;
  soft_lock: boolean;
};

const ADMIN_MATCH_SELECT =
  "id, competition_id, provider, round, home_team_name, away_team_name, home_team_id, away_team_id, kickoff_at, status, home_score, away_score, home_pen, away_pen, hidden, stage, is_knockout, advanced_team_id, live_phase, frozen, manual_lock, soft_lock, home_team:teams!matches_home_team_id_fkey(name,short_name,crest_url), away_team:teams!matches_away_team_id_fkey(name,short_name,crest_url)";

export function useAdminMatches(competitionId: string | undefined) {
  return useQuery({
    enabled: !!competitionId,
    queryKey: ["admin", "matches", competitionId],
    queryFn: async (): Promise<AdminMatch[]> => {
      const { data, error } = await supabase
        .from("matches")
        .select(ADMIN_MATCH_SELECT)
        .eq("competition_id", competitionId!)
        .order("kickoff_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as AdminMatch[];
    },
  });
}

export function useSetMatchHidden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { matchId: string; hidden: boolean }) => {
      const { error } = await supabase
        .from("matches")
        .update({ hidden: input.hidden })
        .eq("id", input.matchId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "matches"] });
      qc.invalidateQueries({ queryKey: ["matches"] });
    },
  });
}

export function useSaveMatchResult() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      matchId: string;
      home: number | null;
      away: number | null;
      status: MatchStatus;
      // Opcionais (mata-mata / situação): só entram no UPDATE quando definidos,
      // pra não sobrescrever quem não foi editado. Pênaltis e "quem avançou"
      // re-pontuam sozinhos (trigger matches_rescore reage a essas colunas).
      homePen?: number | null;
      awayPen?: number | null;
      advancedTeamId?: string | null;
      livePhase?: string | null;
    }) => {
      const patch = {
        home_score: input.home,
        away_score: input.away,
        status: input.status,
        ...(input.homePen !== undefined ? { home_pen: input.homePen } : {}),
        ...(input.awayPen !== undefined ? { away_pen: input.awayPen } : {}),
        ...(input.advancedTeamId !== undefined ? { advanced_team_id: input.advancedTeamId } : {}),
        ...(input.livePhase !== undefined ? { live_phase: input.livePhase } : {}),
      };
      const { error } = await supabase.from("matches").update(patch).eq("id", input.matchId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateScoringQueries(qc),
  });
}

// Toggle "é mata-mata" (matches.is_knockout). Atenção: o trigger
// matches_set_knockout DERIVA is_knockout da `stage` quando ela existe — então
// este override só PERSISTE em jogo sem fase (manual/W.O.). A UI só oferece o
// toggle nesse caso. Re-pontua via trigger matches_rescore.
export function useSetMatchKnockout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { matchId: string; isKnockout: boolean }) => {
      const { error } = await supabase
        .from("matches")
        .update({ is_knockout: input.isKnockout })
        .eq("id", input.matchId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateScoringQueries(qc),
  });
}

// Override do admin contra a API, em dois modos (+ destravar):
//  - "soft" (adiantar): grava o placar/pênaltis e SEGURA (manual_lock+soft_lock);
//    o cron release_soft_overrides libera sozinho quando a API trouxer o mesmo.
//  - "hard" (travar): fixa placar/pênaltis contra QUALQUER update da API
//    (manual_lock, sem soft). reconcilePrimary e resolve_match_golden já pulam
//    jogo travado — pênaltis inclusos.
//  - "off" (destravar): a API volta a mandar.
// soft/hard também limpam o congelamento (frozen) p/ o valor manual valer.
export function useSetMatchOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      matchId: string;
      mode: "soft" | "hard" | "off";
      home?: number | null;
      away?: number | null;
      homePen?: number | null;
      awayPen?: number | null;
      status?: MatchStatus;
    }) => {
      const patch =
        input.mode === "off"
          ? { manual_lock: false, soft_lock: false }
          : {
              ...(input.home !== undefined ? { home_score: input.home } : {}),
              ...(input.away !== undefined ? { away_score: input.away } : {}),
              ...(input.homePen !== undefined ? { home_pen: input.homePen } : {}),
              ...(input.awayPen !== undefined ? { away_pen: input.awayPen } : {}),
              ...(input.status !== undefined ? { status: input.status } : {}),
              manual_lock: true,
              soft_lock: input.mode === "soft",
              frozen: false,
            };
      const { error } = await supabase.from("matches").update(patch).eq("id", input.matchId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => invalidateScoringQueries(qc),
  });
}

export function useCreateMatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      competitionId: string;
      homeTeam: string;
      awayTeam: string;
      kickoffAt: string;
      round?: string;
      groupName?: string;
    }) => {
      const { error } = await supabase.from("matches").insert({
        competition_id: input.competitionId,
        provider: "manual",
        home_team_name: input.homeTeam,
        away_team_name: input.awayTeam,
        kickoff_at: input.kickoffAt,
        round: input.round || null,
        group_name: input.groupName || null,
        status: "scheduled",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "matches"] }),
  });
}

export type AdminUser = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_app_admin: boolean;
  email: string | null;
  created_at: string;
  is_online: boolean;
  usage_seconds: number;
  last_active_at: string | null;
};

export function useAllProfiles() {
  return useQuery({
    queryKey: ["admin", "profiles"],
    queryFn: async (): Promise<AdminUser[]> => {
      // E-mail não fica mais em public.profiles (PII). A RPC lê de auth.users
      // e só responde para app_admin.
      const { data, error } = await supabase.rpc("admin_list_users");
      if (error) throw new Error(error.message);
      return (data ?? []) as AdminUser[];
    },
  });
}

export function useSetAppAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { userId: string; value: boolean }) => {
      const { error } = await supabase.rpc("set_app_admin", {
        p_user_id: input.userId,
        p_value: input.value,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "profiles"] }),
  });
}
