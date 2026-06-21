import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { ScoreType } from "@/lib/types";
import { retroAnonToken, retroSeen } from "./retroLocal";

// ---------- tipos dos payloads jsonb das RPCs do motor (migration 20260610150001/3) ----------

// "pontos" é legado (rodada 18 removeu o modo da entrada; links/runs antigos seguem lendo)
export type RetroFormat = "copa" | "pontos";
export type RetroPace = "resultadista" | "classico" | "sempressa";
// Os modos do Jogo livre (rodada 18). Os níveis 1-7 dos jogos não aparecem na UI.
export type RetroLevel = "amistoso" | "classico" | "lenda";

export const LEVEL_LABEL: Record<RetroLevel, string> = {
  amistoso: "Amistoso",
  classico: "Clássico",
  lenda: "Lenda",
};
export const LEVEL_EMOJI: Record<RetroLevel, string> = {
  amistoso: "🤝",
  classico: "⚽",
  lenda: "🐐",
};

export type RetroToday = { daily_date: string; team_slug: string; team_name_pt: string };
export type RetroConfig = { enforce_knockout_bar: boolean; semi_min: string; final_min: string };
export type RetroRunStatus = "playing" | "eliminated" | "champion" | "finished";

export type RetroMatchInfo = {
  wc_year: number;
  wc_host: string;
  stage_label_pt: string;
  is_knockout: boolean;
  difficulty: number;
  fact: string | null; // curiosidade do jogo (só de contexto, sem spoiler) — pode ser null
  home_name_pt: string;
  away_name_pt: string;
  home_slug: string;
  away_slug: string;
};

export type RetroCurrent = {
  slot: number;
  slot_label: string;
  timer_seconds: number | null;
  deadline_at: string | null;
  served_at: string;
  match_id: string;
  match: RetroMatchInfo;
};

export type RetroStart = {
  run_id: string;
  share_code: string;
  level: RetroLevel;
  pace: RetroPace;
  ranked?: boolean;
  resumed: boolean;
  points: number;
  rerolls: number;
  current: RetroCurrent | null;
};

export type RetroAnswerResult = {
  result: {
    home_score: number;
    away_score: number;
    pens_home: number | null;
    pens_away: number | null;
    went_extra_time: boolean;
    score_type: ScoreType;
    points: number;
    timeout: boolean;
    passed: boolean;
    reroll_earned: boolean;
  };
  run: {
    id: string;
    status: RetroRunStatus;
    format: RetroFormat;
    level: RetroLevel;
    points: number;
    stage_reached: string | null;
    stage_rank: number | null;
    total_ms: number | null;
    share_code: string;
    slot: number;
    rerolls: number;
  };
  next: RetroCurrent | null;
};

export type RetroSlotSummary = {
  slot: number;
  slot_label: string;
  score_type: ScoreType;
  points: number;
  timeout: boolean;
};

export type RetroSummary = {
  format: RetroFormat;
  level: RetroLevel;
  pace: RetroPace;
  status: "eliminated" | "champion" | "finished";
  stage_reached: string;
  points: number;
  total_ms: number;
  is_daily: boolean;
  daily_date: string | null;
  finished_at: string;
  team_name_pt: string | null;
  team_slug: string | null;
  player: { display_name: string; avatar_url: string | null } | null;
  slots: RetroSlotSummary[];
};

export type RetroBoardRow = {
  pos: number;
  display_name: string;
  avatar_url: string | null;
  stage_reached: string;
  points: number;
  total_ms: number;
  is_me: boolean;
};

export type RetroBoard = {
  daily_date: string;
  level?: RetroLevel;
  rows: RetroBoardRow[];
  me: { pos: number; stage_reached: string; points: number; total_ms: number } | null;
};

export type RetroMyStats = {
  streak: number;
  played_today: boolean;
  best: {
    stage_reached: string | null;
    points: number;
    total_ms: number;
    level: RetroLevel;
    daily_date: string;
  } | null;
  best_streak?: number;
  xp?: number;
  title?: string;
  runs?: number;
  champions?: number;
  cravadas?: number;
};

export type RetroAchievement = {
  code: string;
  label: string;
  emoji: string;
  description: string;
  earned: boolean;
  earned_at?: string | null;
};
export type RetroCollection = { total: number; jogadas: number; vencidas: string[] };

// ---------- hooks ----------

function anonTokenFor(userId: string | undefined): string | undefined {
  return userId ? undefined : retroAnonToken();
}

export function useRetroStart() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { pace: RetroPace; daily: boolean; level: RetroLevel }) => {
      const { data, error } = await supabase.rpc("retro_start_run", {
        p_pace: input.pace,
        p_daily: input.daily,
        p_anon_token: anonTokenFor(user?.id),
        p_seen: input.daily ? [] : retroSeen(),
        p_level: input.level,
      });
      if (error) throw new Error(error.message);
      return data as unknown as RetroStart;
    },
  });
}

export function useRetroAnswer() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string; home: number | null; away: number | null }) => {
      const { data, error } = await supabase.rpc("retro_answer", {
        p_run_id: input.runId,
        p_home: input.home ?? undefined,
        p_away: input.away ?? undefined,
        p_anon_token: anonTokenFor(user?.id),
        p_seen: retroSeen(),
      });
      if (error) throw new Error(error.message);
      return data as unknown as RetroAnswerResult;
    },
    onSuccess: (ans) => {
      if (ans.run.status !== "playing") {
        qc.invalidateQueries({ queryKey: ["retro-board"] });
        qc.invalidateQueries({ queryKey: ["retro-my-stats"] });
      }
    },
  });
}

// Sair no meio = encerra a run (W.O. no resto — decisão do PO, rodada 7)
export function useRetroAbandon() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { runId: string }) => {
      const { data, error } = await supabase.rpc("retro_abandon", {
        p_run_id: input.runId,
        p_anon_token: anonTokenFor(user?.id),
      });
      if (error) throw new Error(error.message);
      return data as unknown as { status: string; stage_reached: string; points: number };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["retro-board"] });
      qc.invalidateQueries({ queryKey: ["retro-my-stats"] });
    },
  });
}

// 🎲 troca o jogo atual (gasta 1 ficha ganha por cravada — rodada 5)
export function useRetroReroll() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { runId: string }) => {
      const { data, error } = await supabase.rpc("retro_reroll", {
        p_run_id: input.runId,
        p_anon_token: anonTokenFor(user?.id),
        p_seen: retroSeen(),
      });
      if (error) throw new Error(error.message);
      // random_fallback (daily): a seleção do dia esgotou os jogos → veio um aleatório
      return data as unknown as RetroCurrent & { rerolls: number; random_fallback?: boolean };
    },
  });
}

// Serve o próximo jogo SOB DEMANDA (o cronômetro só nasce quando o jogador pede —
// correção do bug "tempo correndo durante o reveal", migration 004).
export function useRetroNext() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { runId: string }) => {
      const { data, error } = await supabase.rpc("retro_next", {
        p_run_id: input.runId,
        p_anon_token: anonTokenFor(user?.id),
        p_seen: retroSeen(),
      });
      if (error) throw new Error(error.message);
      return data as unknown as RetroCurrent;
    },
  });
}

export function useRetroLeaderboard(level: RetroLevel, board: "daily" | "treino" = "daily") {
  return useQuery({
    queryKey: ["retro-board", board, level],
    queryFn: async (): Promise<RetroBoard> => {
      const { data, error } = await supabase.rpc("retro_leaderboard", {
        p_level: level,
        p_limit: 50,
        p_board: board,
      });
      if (error) throw new Error(error.message);
      return data as unknown as RetroBoard;
    },
  });
}

// Config pública (mostra/esconde a regra de saldo/cravada nas finais)
export function useRetroConfig() {
  return useQuery({
    queryKey: ["retro-config"],
    queryFn: async (): Promise<RetroConfig> => {
      const { data, error } = await supabase.rpc("retro_get_config");
      if (error) throw new Error(error.message);
      return data as unknown as RetroConfig;
    },
    staleTime: 5 * 60_000,
  });
}

export type RetroAdminStats = {
  online_retro: number;
  online_main: number;
  retro_seconds_total: number;
  main_seconds_total: number;
  retro_seconds_today: number;
  retro_anon_runs_today: number;
  retro_players_total: number;
};

// Admin: presença online + tempo de uso, Retrô vs app-mãe
export function useRetroAdminStats() {
  return useQuery({
    queryKey: ["retro-admin-stats"],
    queryFn: async (): Promise<RetroAdminStats> => {
      const { data, error } = await supabase.rpc("retro_admin_stats");
      if (error) throw new Error(error.message);
      return data as unknown as RetroAdminStats;
    },
    refetchInterval: 30_000,
  });
}

// ---------- Admin: curadoria de DICAS por jogo (modelo híbrido IA→revisão) ----------
export type FactFilter = "todos" | "sem_dica" | "rascunho" | "publicada";
export type AdminMatchFact = {
  id: string;
  wc_year: number;
  stage_label_pt: string;
  home_name_pt: string;
  away_name_pt: string;
  home_slug: string;
  away_slug: string;
  score: string; // só o admin vê o placar (pra conferir anti-spoiler)
  difficulty: number;
  fact_pt: string | null;
  fact_source: "manual" | "ia" | null;
  fact_reviewed: boolean;
};

export function useRetroFactCoverage() {
  return useQuery({
    queryKey: ["retro-fact-coverage"],
    queryFn: async (): Promise<{ total: number; publicadas: number; rascunhos: number }> => {
      const { data, error } = await supabase.rpc("admin_fact_coverage");
      if (error) throw new Error(error.message);
      return data as unknown as { total: number; publicadas: number; rascunhos: number };
    },
  });
}

export function useRetroMatchFacts(filter: FactFilter, search: string) {
  return useQuery({
    queryKey: ["retro-match-facts", filter, search],
    queryFn: async (): Promise<AdminMatchFact[]> => {
      const { data, error } = await supabase.rpc("admin_list_match_facts", {
        p_filter: filter,
        p_search: search || undefined,
      });
      if (error) throw new Error(error.message);
      return (data as unknown as AdminMatchFact[]) ?? [];
    },
  });
}

export function useSetMatchFact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { matchId: string; fact: string | null; reviewed: boolean }) => {
      const { error } = await supabase.rpc("admin_set_match_fact", {
        p_match_id: input.matchId,
        p_fact: input.fact ?? "", // "" → a RPC trata como null (limpa a dica)
        p_reviewed: input.reviewed,
        p_source: "manual",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["retro-match-facts"] });
      qc.invalidateQueries({ queryKey: ["retro-fact-coverage"] });
    },
  });
}

// Admin: gravar a config (toggle da barra nas finais)
export function useRetroSetConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { enforce: boolean; semiMin: string; finalMin: string }) => {
      const { data, error } = await supabase.rpc("retro_admin_set_config", {
        p_enforce: input.enforce,
        p_semi_min: input.semiMin,
        p_final_min: input.finalMin,
      });
      if (error) throw new Error(error.message);
      return data as unknown as RetroConfig;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retro-config"] }),
  });
}

// "Você seria ~Nº no ranking de hoje" (gancho de login pro anônimo no fim da run)
export function useRetroRankEstimate(
  campaign: { stageRank: number | null; points: number; totalMs: number | null } | null,
) {
  return useQuery({
    enabled: !!campaign,
    queryKey: ["retro-rank-estimate", campaign?.stageRank, campaign?.points, campaign?.totalMs],
    queryFn: async (): Promise<{ pos: number; total: number }> => {
      const { data, error } = await supabase.rpc("retro_rank_estimate", {
        p_stage_rank: campaign?.stageRank ?? 0,
        p_points: campaign?.points ?? 0,
        p_total_ms: campaign?.totalMs ?? 0,
      });
      if (error) throw new Error(error.message);
      return data as unknown as { pos: number; total: number };
    },
  });
}

// Campeão da Seleção do Dia de ONTEM (coroação na home) + quantos jogaram hoje
export function useRetroDailyExtras() {
  return useQuery({
    queryKey: ["retro-daily-extras"],
    queryFn: async () => {
      const [champ, count] = await Promise.all([
        supabase.rpc("retro_yesterday_champion"),
        supabase.rpc("retro_daily_count"),
      ]);
      return {
        champion: (champ.data as unknown as {
          display_name: string;
          avatar_url: string | null;
          team_name_pt: string | null;
          points: number;
        } | null) ?? null,
        playedToday: (count.data as unknown as number) ?? 0,
      };
    },
    staleTime: 5 * 60_000,
  });
}

// A Copa do Dia de hoje é de qual seleção?
export function useRetroToday() {
  return useQuery({
    queryKey: ["retro-today"],
    queryFn: async (): Promise<RetroToday> => {
      const { data, error } = await supabase.rpc("retro_today");
      if (error) throw new Error(error.message);
      return data as unknown as RetroToday;
    },
  });
}

export function useRetroMyStats() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["retro-my-stats", user?.id],
    queryFn: async (): Promise<RetroMyStats> => {
      const { data, error } = await supabase.rpc("retro_my_stats");
      if (error) throw new Error(error.message);
      return data as unknown as RetroMyStats;
    },
  });
}

// Concede as conquistas merecidas e devolve a estante + as recém-conquistadas.
export function useClaimAchievements() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<{ all: RetroAchievement[]; new: string[] }> => {
      const { data, error } = await supabase.rpc("retro_claim_achievements");
      if (error) throw new Error(error.message);
      return data as unknown as { all: RetroAchievement[]; new: string[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["retro-achievements"] }),
  });
}

// Estante de conquistas (pra página de perfil) — claim idempotente, então pode ler aqui.
export function useRetroAchievements(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["retro-achievements"],
    queryFn: async (): Promise<{ all: RetroAchievement[]; new: string[] }> => {
      const { data, error } = await supabase.rpc("retro_claim_achievements");
      if (error) throw new Error(error.message);
      return data as unknown as { all: RetroAchievement[]; new: string[] };
    },
  });
}

export function useRetroCollection(enabled = true) {
  return useQuery({
    enabled,
    queryKey: ["retro-collection"],
    queryFn: async (): Promise<RetroCollection> => {
      const { data, error } = await supabase.rpc("retro_my_collection");
      if (error) throw new Error(error.message);
      return data as unknown as RetroCollection;
    },
  });
}

export function useRetroRunRecords(shareCode: string | null, enabled: boolean) {
  return useQuery({
    enabled: enabled && !!shareCode,
    queryKey: ["retro-run-records", shareCode],
    queryFn: async (): Promise<{ record: boolean; best_points?: boolean }> => {
      const { data, error } = await supabase.rpc("retro_run_records", { p_share_code: shareCode ?? "" });
      if (error) throw new Error(error.message);
      return data as unknown as { record: boolean; best_points?: boolean };
    },
  });
}

export function useRetroSummary(shareCode: string | undefined) {
  return useQuery({
    enabled: !!shareCode,
    queryKey: ["retro-summary", shareCode],
    queryFn: async (): Promise<RetroSummary | null> => {
      const { data, error } = await supabase.rpc("retro_run_summary", {
        p_share_code: shareCode ?? "",
      });
      if (error) throw new Error(error.message);
      return (data as unknown as RetroSummary | null) ?? null;
    },
  });
}

// Tempo de uso de ANÔNIMOS (D14): batida de 30s só com a aba visível; logado já é
// coberto pelo PresenceTracker do AppShell. Best-effort: nunca quebra a UI.
export function useRetroAnonHeartbeat() {
  const { user } = useAuth();
  useEffect(() => {
    if (user) return;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      void supabase.rpc("retro_touch_anon", { p_seconds: 30 }).then(undefined, () => {});
    };
    const id = window.setInterval(beat, 30_000);
    return () => window.clearInterval(id);
  }, [user]);
}
