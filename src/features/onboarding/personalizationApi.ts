import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rpcCall } from "@/lib/rpc";
import { useAuth } from "@/features/auth/AuthProvider";

export type PersonalizationState = {
  favorite_team_id: string | null;
  national_team_id: string | null;
  favorite_competition_id: string | null;
  followed_competition_ids: string[];
  /** follow de time POR campeonato: { [competition_id]: team_id[] } */
  followed_teams: Record<string, string[]>;
  personalization_done: boolean;
  show_in_global_ranking: boolean;
};

export type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
  crest_url: string | null;
  local_crest: string | null;
  country?: string | null;
  /** campeonatos da personalização em que o time aparece (get_teams_by_competition) */
  in_competitions?: string[] | null;
};

export type PersoComp = {
  id: string;
  name: string;
  display_name: string | null;
  provider_code: string | null;
  type: string | null;
  area: string | null;
};

const PERSO_KEY = "personalization-state";

export function usePersonalizationState() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: [PERSO_KEY, user?.id],
    staleTime: 30_000,
    queryFn: async (): Promise<PersonalizationState | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "favorite_team_id, national_team_id, favorite_competition_id, followed_competition_ids, followed_teams, personalization_done, show_in_global_ranking",
        )
        .eq("id", user!.id)
        .single();
      if (error) throw new Error(error.message);
      return {
        favorite_team_id: data.favorite_team_id,
        national_team_id: data.national_team_id,
        favorite_competition_id: data.favorite_competition_id,
        followed_competition_ids: data.followed_competition_ids ?? [],
        followed_teams: (data.followed_teams as Record<string, string[]>) ?? {},
        personalization_done: data.personalization_done ?? false,
        show_in_global_ranking: data.show_in_global_ranking ?? true,
      };
    },
  });
}

/** Todos os times (pra "time do coração"). */
export function useAllTeams() {
  return useQuery({
    queryKey: ["all-teams"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TeamLite[]> => {
      const { data, error } = await supabase
        .from("teams")
        .select("id, name, short_name, crest_url, local_crest, country")
        .order("name");
      if (error) throw new Error(error.message);
      return (data ?? []) as TeamLite[];
    },
  });
}

/** Campeonatos do catálogo de personalização (inclui rascunhos). */
export function usePersonalizationCompetitions() {
  return useQuery({
    queryKey: ["personalization-competitions"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PersoComp[]> => {
      const { data, error } = await rpcCall<PersoComp[]>("list_personalization_competitions");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Times de um campeonato (lazy — só quando o acordeão abre). */
export function useTeamsByCompetition(competitionId: string | null) {
  return useQuery({
    enabled: !!competitionId,
    queryKey: ["teams-by-competition", competitionId],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TeamLite[]> => {
      const { data, error } = await rpcCall<TeamLite[]>("get_teams_by_competition", {
        p_competition_id: competitionId,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

export type PersonalizationPatch = {
  favoriteTeamId?: string | null;
  nationalTeamId?: string | null;
  favoriteCompetitionId?: string | null;
  followedCompetitionIds?: string[] | null;
  /** follow de time por campeonato: { [competition_id]: team_id[] } */
  followedTeams?: Record<string, string[]> | null;
  showInRanking?: boolean | null;
};

export function useSetPersonalization() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: PersonalizationPatch) => {
      const { error } = await rpcCall("set_personalization", {
        p_favorite_team_id: patch.favoriteTeamId ?? undefined,
        p_national_team_id: patch.nationalTeamId ?? undefined,
        p_favorite_competition_id: patch.favoriteCompetitionId ?? undefined,
        p_followed_competition_ids: patch.followedCompetitionIds ?? undefined,
        p_followed_teams: patch.followedTeams ?? undefined,
        p_show_in_ranking: patch.showInRanking ?? undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PERSO_KEY, user?.id] });
      qc.invalidateQueries({ queryKey: ["profile-me"] });
      qc.invalidateQueries({ queryKey: ["rtb-standings"] });
      qc.invalidateQueries({ queryKey: ["rtb-my-rank"] });
    },
  });
}

export function useSkipPersonalization() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("skip_personalization");
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [PERSO_KEY, user?.id] }),
  });
}

/** Salva nome / escudo / UF do perfil (self-update; cobre a tela 0 da personalização). */
export function useSaveProfileBasics() {
  const { user, refreshProfile } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: {
      display_name?: string;
      avatar_url?: string | null;
      uf?: string | null;
    }) => {
      if (!user) return;
      const { error } = await supabase
        .from("profiles")
        .update({
          ...(p.display_name !== undefined && { display_name: p.display_name }),
          ...(p.avatar_url !== undefined && { avatar_url: p.avatar_url }),
          ...(p.uf !== undefined && { uf: p.uf }),
        })
        .eq("id", user.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void refreshProfile();
      qc.invalidateQueries({ queryKey: [PERSO_KEY, user?.id] });
    },
  });
}
