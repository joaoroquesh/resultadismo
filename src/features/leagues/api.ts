import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { rpcCall } from "@/lib/rpc";
import { track } from "@/lib/analytics";
import { useAuth } from "@/features/auth/AuthProvider";
import type {
  League,
  LeagueCompetition,
  LeagueMode,
  MemberRole,
  MemberStatus,
  Profile,
  StandingRow,
} from "@/lib/types";

export type MyLeague = League & { my_role: MemberRole; my_status: MemberStatus };

export function useMyLeagues() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["my-leagues", user?.id],
    queryFn: async (): Promise<MyLeague[]> => {
      const { data, error } = await supabase
        .from("league_members")
        .select("role, status, league:leagues(*)")
        .eq("user_id", user!.id);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((r) => r.league && !(r.league as { deleted_at?: string | null }).deleted_at)
        .map((r) => ({
          ...(r.league as unknown as League),
          my_role: r.role as MemberRole,
          my_status: r.status as MemberStatus,
        }));
    },
  });
}

export function useLeague(slug: string | undefined) {
  return useQuery({
    enabled: !!slug,
    queryKey: ["league", slug],
    queryFn: async (): Promise<League | null> => {
      const { data, error } = await supabase
        .from("leagues")
        .select("*")
        .eq("slug", slug!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      // grupo excluído (soft) não abre pra ninguém (admin restaura pela Lixeira)
      if (data?.deleted_at) return null;
      return data;
    },
  });
}

export type MemberWithProfile = {
  id: string;
  role: MemberRole;
  status: MemberStatus;
  joined_at: string;
  profile: Pick<Profile, "id" | "display_name" | "avatar_url"> | null;
};

export function useLeagueMembers(leagueId: string | undefined) {
  return useQuery({
    enabled: !!leagueId,
    queryKey: ["league-members", leagueId],
    queryFn: async (): Promise<MemberWithProfile[]> => {
      const { data, error } = await supabase
        .from("league_members")
        .select("id, role, status, joined_at, profile:profiles(id, display_name, avatar_url)")
        .eq("league_id", leagueId!)
        .order("joined_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as MemberWithProfile[];
    },
  });
}

export function useLeagueCompetitions(leagueId: string | undefined) {
  return useQuery({
    enabled: !!leagueId,
    queryKey: ["league-competitions", leagueId],
    queryFn: async (): Promise<(LeagueCompetition & { competition: { name: string; emblem_url: string | null } | null })[]> => {
      const { data, error } = await supabase
        .from("league_competitions")
        .select("*, competition:competitions(name, emblem_url)")
        .eq("league_id", leagueId!)
        .order("created_at");
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as (LeagueCompetition & {
        competition: { name: string; emblem_url: string | null } | null;
      })[];
    },
  });
}

export function useStandings(lcId: string | undefined) {
  return useQuery({
    enabled: !!lcId,
    queryKey: ["standings", lcId],
    queryFn: async (): Promise<StandingRow[]> => {
      const { data, error } = await supabase.rpc("get_league_standings", { p_lc_id: lcId! });
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

/** Inicia o checkout (modo Mercado Pago). Devolve {url} ou {free:true} (100% de desconto). */
export async function startLeagueCheckout(
  leagueId: string,
  discountCode?: string,
): Promise<{ url?: string; free?: boolean }> {
  const { data, error } = await supabase.functions.invoke("create-league-checkout", {
    body: { leagueId, discountCode: discountCode || undefined },
  });
  if (error) throw error;
  const res = (data as { url?: string; free?: boolean } | null) ?? {};
  if (!res.url && !res.free) throw new Error("Não foi possível iniciar o pagamento.");
  return res;
}

export function useCreateLeague() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      description?: string;
      visibility: "public" | "private";
      joinPolicy: "open" | "approval" | "invite";
      competitionId?: string;
      mode?: LeagueMode;
      /** recorte do bolão: null/ausente = todas as seleções; senão slugs EXPANDIDOS. */
      followedTeamSlugs?: string[] | null;
    }) => {
      const slug = `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`;
      const { data: league, error } = await supabase
        .from("leagues")
        .insert({
          name: input.name,
          slug,
          description: input.description ?? null,
          owner_id: user!.id,
          visibility: input.visibility,
          join_policy: input.joinPolicy,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      if (input.competitionId) {
        const { error: lcErr } = await supabase.from("league_competitions").insert({
          league_id: league.id,
          competition_id: input.competitionId,
          name: `Bolão · ${input.name}`,
          mode: input.mode ?? "table",
          followed_team_slugs: input.followedTeamSlugs ?? null,
        });
        if (lcErr) throw lcErr;
      }
      return league;
    },
    onSuccess: (_league, input) => {
      track("create_group", { visibility: input.visibility });
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
    },
  });
}

/** Reabre o checkout de um grupo pendente (botão "Pagar agora", modo Mercado Pago). */
export function useLeagueCheckout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leagueId: string) => {
      const res = await startLeagueCheckout(leagueId);
      if (res.url) window.location.href = res.url;
      return res;
    },
    onSuccess: (res) => {
      if (res.free) {
        qc.invalidateQueries({ queryKey: ["league"] });
        qc.invalidateQueries({ queryKey: ["my-leagues"] });
      }
    },
  });
}

export function useJoinByCode() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc("join_league_by_code", { p_code: code });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      track("join_group", { method: "code" });
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
    },
  });
}

/**
 * Prévia dos escudos de membros de vários grupos numa só query (pra empilhar
 * nos cards de "Seus grupos"). Retorna mapa league_id → {avatars[], count}.
 */
export type MemberAvatar = { id: string; name: string | null; avatar_url: string | null };

export function useLeaguesMembersPreview(leagueIds: string[]) {
  const key = [...leagueIds].sort().join(",");
  return useQuery({
    enabled: leagueIds.length > 0,
    queryKey: ["leagues-members-preview", key],
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, { avatars: MemberAvatar[]; count: number }>> => {
      const { data, error } = await supabase
        .from("league_members")
        .select("league_id, joined_at, profile:profiles(id, display_name, avatar_url)")
        .in("league_id", leagueIds)
        .eq("status", "active")
        .order("joined_at");
      if (error) throw new Error(error.message);
      const out: Record<string, { avatars: MemberAvatar[]; count: number }> = {};
      for (const row of (data ?? []) as unknown as {
        league_id: string;
        profile: MemberAvatar | null;
      }[]) {
        const bucket = (out[row.league_id] ??= { avatars: [], count: 0 });
        bucket.count += 1;
        if (bucket.avatars.length < 6 && row.profile) bucket.avatars.push(row.profile);
      }
      return out;
    },
  });
}

/** Vitrine de grupos públicos (descobríveis por qualquer Resultadista). */
export type PublicLeague = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  join_policy: "open" | "approval" | "invite";
  member_count: number;
  is_member: boolean;
  created_at: string;
};

export function usePublicLeagues(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: ["public-leagues", term],
    staleTime: 30_000,
    queryFn: async (): Promise<PublicLeague[]> => {
      const { data, error } = await rpcCall<PublicLeague[]>("list_public_leagues", {
        p_search: term || undefined,
        p_limit: 30,
        p_offset: 0,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
}

/** Entrar num grupo público (aberto → ativo na hora; aprovação → fica pendente). */
export function useJoinPublicLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leagueId: string) => {
      const { data, error } = await supabase.rpc("join_public_league", {
        p_league_id: leagueId,
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      track("join_group", { method: "public" });
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
      qc.invalidateQueries({ queryKey: ["public-leagues"] });
    },
  });
}

/**
 * Minha posição em cada grupo (batch), exata porque o RPC delega ao
 * get_league_standings. Retorna um mapa league_id → {rank, total, pontos}.
 */
export type LeaguePosition = { rank: number; total: number; pontos: number };

export function useMyLeaguePositions(leagueIds: string[]) {
  const { user } = useAuth();
  const key = [...leagueIds].sort().join(",");
  return useQuery({
    enabled: !!user && leagueIds.length > 0,
    queryKey: ["my-league-positions", user?.id, key],
    staleTime: 30_000,
    queryFn: async (): Promise<Record<string, LeaguePosition>> => {
      const { data, error } = await rpcCall<
        { league_id: string; rank: number; total: number; pontos: number }[]
      >("get_my_league_positions", { p_league_ids: leagueIds });
      if (error) throw new Error(error.message);
      const out: Record<string, LeaguePosition> = {};
      for (const r of data ?? []) {
        out[r.league_id] = { rank: r.rank, total: r.total, pontos: r.pontos };
      }
      return out;
    },
  });
}

export function useAddLeagueCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      leagueId: string;
      competitionId: string;
      name: string;
      mode: LeagueMode;
      /** Confronto: como os participantes entram ('admin' seleciona | 'optin' cada um aceita). */
      participantMode?: "admin" | "optin";
      /** Liga: 'partial' (turno) ou 'swiss' (progressivo). */
      ligaFormat?: "partial" | "swiss";
    }) => {
      const { data, error } = await supabase
        .from("league_competitions")
        .insert({
          league_id: input.leagueId,
          competition_id: input.competitionId,
          name: input.name,
          mode: input.mode,
          ...(input.participantMode ? { participant_mode: input.participantMode } : {}),
          ...(input.ligaFormat ? { liga_format: input.ligaFormat } : {}),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (_d, v) =>
      qc.invalidateQueries({ queryKey: ["league-competitions", v.leagueId] }),
  });
}

export function useUpdateLeagueLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leagueId: string; logoUrl: string | null }) => {
      // Escudo gerado vai como "gen:shield:cor1-cor2:rotação" em leagues.logo_url.
      // RLS já garante: só dono/admin do grupo consegue gravar.
      const { error } = await supabase
        .from("leagues")
        .update({ logo_url: input.logoUrl })
        .eq("id", input.leagueId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
      qc.invalidateQueries({ queryKey: ["league-members", v.leagueId] });
    },
  });
}

/** Edita nome + descrição do grupo (RPC update_group_info; re-modera o nome). */
export function useUpdateGroupInfo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leagueId: string; name: string; description: string | null }) => {
      // RPC nova, ainda fora dos tipos gerados — cast contido.
      const { error } = await (
        supabase.rpc as unknown as (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ error: { message: string } | null }>
      )("update_group_info", {
        p_league_id: input.leagueId,
        p_name: input.name,
        p_description: input.description,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
      qc.invalidateQueries({ queryKey: ["league-members", v.leagueId] });
    },
  });
}

export function useDeleteLeagueCompetition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leagueId: string; lcId: string }) => {
      // RLS já enforça: só admin do grupo (ou app_admin) consegue deletar.
      // cascade nos predictions/cup_ties/etc. cuida do resto.
      const { error } = await supabase
        .from("league_competitions")
        .delete()
        .eq("id", input.lcId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["league-competitions", v.leagueId] });
      qc.invalidateQueries({ queryKey: ["standings"] });
    },
  });
}

/** Recortes dos bolões dos MEUS grupos ativos (pra aba "Grupos" da página de
 * jogos): por competição, quais seleções valem ponto (null = todas). */
export function useMyGroupScopes() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["my-group-scopes", user?.id],
    queryFn: async (): Promise<{ competition_id: string; followed_team_slugs: string[] | null }[]> => {
      const { data: memberships, error: e1 } = await supabase
        .from("league_members")
        .select("league_id, status, league:leagues(status, deleted_at)")
        .eq("user_id", user!.id)
        .eq("status", "active");
      if (e1) throw new Error(e1.message);
      const leagueIds = (memberships ?? [])
        .filter((m) => {
          const l = m.league as { status: string; deleted_at: string | null } | null;
          // pending conta: o grupo recém-criado aguarda aprovação, mas a pessoa
          // já está nele e os palpites valem quando ele ativar.
          return l && (l.status === "active" || l.status === "pending") && !l.deleted_at;
        })
        .map((m) => m.league_id as string);
      if (leagueIds.length === 0) return [];
      const { data, error } = await supabase
        .from("league_competitions")
        .select("competition_id, followed_team_slugs, mode, status")
        .in("league_id", leagueIds)
        .eq("status", "active")
        .in("mode", ["points", "table"]);
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => ({
        competition_id: r.competition_id as string,
        followed_team_slugs: (r.followed_team_slugs as string[] | null) ?? null,
      }));
    },
  });
}

/** Janela de edição do recorte de seleções: aberta até o 1º jogo da competição
 * começar (RPC team_scope_window; o trigger no banco é quem manda). */
export function useTeamScopeWindow(lcId: string | undefined) {
  return useQuery({
    enabled: !!lcId,
    queryKey: ["team-scope-window", lcId],
    queryFn: async (): Promise<{ editable: boolean; reason: string | null }> => {
      const { data, error } = await supabase.rpc("team_scope_window", { p_lc_id: lcId! });
      if (error) throw new Error(error.message);
      const row = (data as { editable: boolean; reason: string | null }[] | null)?.[0];
      return row ?? { editable: false, reason: null };
    },
  });
}

/** Atualiza o recorte de seleções do bolão (null = todas). RLS: admin do grupo;
 * trigger trava depois que a Copa começa. */
export function useUpdateTeamScope() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leagueId: string; lcId: string; slugs: string[] | null }) => {
      const { error } = await supabase
        .from("league_competitions")
        .update({ followed_team_slugs: input.slugs })
        .eq("id", input.lcId);
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["league-competitions", v.leagueId] });
      qc.invalidateQueries({ queryKey: ["standings"] });
    },
  });
}

export function useUpdateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      memberId: string;
      role?: MemberRole;
      status?: MemberStatus;
    }) => {
      const patch: { role?: MemberRole; status?: MemberStatus } = {};
      if (input.role) patch.role = input.role;
      if (input.status) patch.status = input.status;
      const { error } = await supabase
        .from("league_members")
        .update(patch)
        .eq("id", input.memberId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["league-members"] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase.from("league_members").delete().eq("id", memberId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["league-members"] }),
  });
}

export function useLeaveLeague() {
  const qc = useQueryClient();
  return useMutation({
    // RPC: remove o vínculo e aplica W.O. nos confrontos não resolvidos (se houver disputa sorteada).
    mutationFn: async (leagueId: string) => {
      const { error } = await supabase.rpc("leave_league", { p_league_id: leagueId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
      qc.invalidateQueries({ queryKey: ["confronto-ties"] });
      qc.invalidateQueries({ queryKey: ["confronto-standings"] });
    },
  });
}

/**
 * Liga/desliga o modo Confronto (Liga/Copa + sorteio) de um grupo.
 * Só o app admin executa — a RPC `admin_set_confronto_enabled` enforça no servidor.
 */
export function useSetConfrontoEnabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { leagueId: string; value: boolean }) => {
      const { error } = await supabase.rpc("admin_set_confronto_enabled", {
        p_league_id: input.leagueId,
        p_value: input.value,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["league"] });
      qc.invalidateQueries({ queryKey: ["my-leagues"] });
    },
  });
}
