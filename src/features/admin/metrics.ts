import { useQuery } from "@tanstack/react-query";
import { rpcCall } from "@/lib/rpc";

export type MetricsProduct = "all" | "app" | "retro" | "manager";

export type MetricsSummary = {
  days: number;
  product: MetricsProduct;
  start_day: string;
  end_day: string;
  active_total: number;
  active_logged: number;
  active_anon: number;
  sessions_total: number;
  page_views_total: number;
  screen_seconds_total: number;
  avg_daily_active: number;
  avg_sessions_per_active_day: number;
  avg_seconds_per_active_day: number;
  new_accounts: number;
  total_accounts: number;
  predictions_total: number;
  active_groups_total: number;
  groups_with_predictions: number;
  paid_leagues: number;
  pot_enabled_leagues: number;
  retro_runs_total: number;
  retro_logged_players: number;
  manager_matches_total: number;
  manager_logged_players: number;
  inactive_2d: number;
  inactive_7d: number;
  inactive_30d: number;
};

export type MetricsDaily = {
  day: string;
  active_total: number;
  active_logged: number;
  active_anon: number;
  sessions: number;
  page_views: number;
  screen_seconds: number;
  new_accounts: number;
  predictions: number;
  groups_created: number;
  manager_matches: number;
};

export type MetricsPageDaily = {
  day: string;
  views: number;
  visitors: number;
  sessions: number;
  screen_seconds: number;
  manager_matches: number;
};

export type MetricsPage = {
  product: "app" | "retro" | "manager";
  route: string;
  views: number;
  visitors: number;
  sessions: number;
  screen_seconds: number;
  manager_matches: number;
  best_day: string | null;
  best_day_views: number;
  daily: MetricsPageDaily[];
};

export type MetricsProductRow = {
  product: "app" | "retro" | "manager";
  active_total: number;
  active_logged: number;
  active_anon: number;
  page_views: number;
  screen_seconds: number;
  sessions: number;
  matches: number;
};

export type AdminMetricsResponse = {
  summary: MetricsSummary;
  daily: MetricsDaily[];
  pages: MetricsPage[];
  products: MetricsProductRow[];
};

export type AdminPlayerProductRow = {
  product: "app" | "retro" | "manager";
  sessions: number;
  page_views: number;
  screen_seconds: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  manager_matches: number;
};

export type AdminPlayerGroup = {
  id: string;
  name: string;
  slug: string;
  role: string;
  status: string;
  joined_at: string;
  owner_id: string;
  owner_name: string;
};

export type AdminPlayerPredictionDay = {
  day: string;
  predictions: number;
};

export type AdminPlayerMetrics = {
  user: {
    id: string;
    display_name: string;
    email: string | null;
    is_app_admin: boolean;
    created_at: string;
  };
  products: AdminPlayerProductRow[];
  groups: AdminPlayerGroup[];
  predictions: {
    total_all: number;
    total_30d: number;
    active_days_30d: number;
    avg_per_active_day: number;
    max_in_10m: number;
    max_in_1h: number;
    first_at: string | null;
    last_at: string | null;
    daily: AdminPlayerPredictionDay[];
  };
  mini_games: {
    retro_runs_total: number;
    retro_runs_30d: number;
    retro_champions: number;
    retro_last_run_at: string | null;
    manager_matches_30d: number;
    manager_last_match_at: string | null;
  };
};

export function useAdminMetrics(startDay: string, endDay: string, product: MetricsProduct) {
  return useQuery({
    queryKey: ["admin", "app-metrics", startDay, endDay, product],
    refetchInterval: 60_000,
    placeholderData: (previousData) => previousData,
    queryFn: async (): Promise<AdminMetricsResponse> => {
      const { data, error } = await rpcCall<AdminMetricsResponse>("admin_app_metrics_range", {
        p_start_day: startDay,
        p_end_day: endDay,
        p_product: product,
      });
      if (error) throw new Error(error.message);
      return data as AdminMetricsResponse;
    },
  });
}

export function useAdminPlayerMetrics(userId: string | undefined, enabled: boolean) {
  return useQuery({
    enabled: !!userId && enabled,
    queryKey: ["admin", "player-metrics", userId],
    queryFn: async (): Promise<AdminPlayerMetrics | null> => {
      const { data, error } = await rpcCall<AdminPlayerMetrics | null>("admin_player_metrics", {
        p_user_id: userId!,
      });
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });
}
