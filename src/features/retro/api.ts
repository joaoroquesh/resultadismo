import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/features/auth/AuthProvider";
import type { ScoreType } from "@/lib/types";
import { retroAnonToken, retroSeen } from "./retroLocal";

// ---------- tipos dos payloads jsonb das RPCs do motor (migration 20260610000002/3) ----------

export type RetroMode = "acerto" | "cravada";
export type RetroPace = "resultadista" | "classico" | "sempressa";

export type RetroMatchInfo = {
  wc_year: number;
  wc_host: string;
  stage_label_pt: string;
  is_knockout: boolean;
  difficulty: number;
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
  mode: RetroMode;
  pace: RetroPace;
  ranked?: boolean;
  resumed: boolean;
  points: number;
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
  };
  run: {
    id: string;
    status: "playing" | "eliminated" | "champion";
    points: number;
    stage_reached: string | null;
    stage_rank: number | null;
    total_ms: number | null;
    share_code: string;
    slot: number;
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
  mode: RetroMode;
  pace: RetroPace;
  status: "eliminated" | "champion";
  stage_reached: string;
  points: number;
  total_ms: number;
  is_daily: boolean;
  daily_date: string | null;
  finished_at: string;
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
  mode: RetroMode;
  rows: RetroBoardRow[];
  me: { pos: number; stage_reached: string; points: number; total_ms: number } | null;
};

export type RetroMyStats = {
  streak: number;
  played_today: boolean;
  best: {
    stage_reached: string;
    stage_rank: number;
    points: number;
    total_ms: number;
    daily_date: string;
  } | null;
};

// ---------- hooks ----------

function anonTokenFor(userId: string | undefined): string | undefined {
  return userId ? undefined : retroAnonToken();
}

export function useRetroStart() {
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (input: { mode: RetroMode; pace: RetroPace; daily: boolean }) => {
      const { data, error } = await supabase.rpc("retro_start_run", {
        p_mode: input.mode,
        p_pace: input.pace,
        p_daily: input.daily,
        p_anon_token: anonTokenFor(user?.id),
        p_seen: input.daily ? [] : retroSeen(),
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

export function useRetroLeaderboard(mode: RetroMode, dailyDate?: string) {
  return useQuery({
    queryKey: ["retro-board", mode, dailyDate ?? "hoje"],
    queryFn: async (): Promise<RetroBoard> => {
      const { data, error } = await supabase.rpc("retro_leaderboard", {
        p_daily_date: dailyDate ?? undefined,
        p_mode: mode,
        p_limit: 50,
      });
      if (error) throw new Error(error.message);
      return data as unknown as RetroBoard;
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
