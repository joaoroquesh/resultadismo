export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      competitions: {
        Row: {
          area: string | null
          created_at: string
          current_round: string | null
          emblem_url: string | null
          id: string
          is_featured: boolean
          last_synced_at: string | null
          jokers_per_week: number
          max_jokers: number
          name: string
          provider: Database["public"]["Enums"]["data_provider"]
          provider_code: string | null
          provider_season: string | null
          season_end: string | null
          season_start: string | null
          short_name: string | null
          slug: string
          status: string
          sync_enabled: boolean
          type: string
          updated_at: string
        }
        Insert: {
          area?: string | null
          created_at?: string
          current_round?: string | null
          emblem_url?: string | null
          id?: string
          is_featured?: boolean
          last_synced_at?: string | null
          jokers_per_week?: number
          max_jokers?: number
          name: string
          provider?: Database["public"]["Enums"]["data_provider"]
          provider_code?: string | null
          provider_season?: string | null
          season_end?: string | null
          season_start?: string | null
          short_name?: string | null
          slug: string
          status?: string
          sync_enabled?: boolean
          type?: string
          updated_at?: string
        }
        Update: {
          area?: string | null
          created_at?: string
          current_round?: string | null
          emblem_url?: string | null
          id?: string
          is_featured?: boolean
          last_synced_at?: string | null
          jokers_per_week?: number
          max_jokers?: number
          name?: string
          provider?: Database["public"]["Enums"]["data_provider"]
          provider_code?: string | null
          provider_season?: string | null
          season_end?: string | null
          season_start?: string | null
          short_name?: string | null
          slug?: string
          status?: string
          sync_enabled?: boolean
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      cup_ties: {
        Row: {
          created_at: string
          id: string
          league_competition_id: string
          member_a: string | null
          member_b: string | null
          points_a: number
          points_b: number
          round_label: string
          round_order: number
          slot: number
          status: string
          updated_at: string
          window_end: string | null
          window_start: string | null
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          league_competition_id: string
          member_a?: string | null
          member_b?: string | null
          points_a?: number
          points_b?: number
          round_label: string
          round_order: number
          slot: number
          status?: string
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          league_competition_id?: string
          member_a?: string | null
          member_b?: string | null
          points_a?: number
          points_b?: number
          round_label?: string
          round_order?: number
          slot?: number
          status?: string
          updated_at?: string
          window_end?: string | null
          window_start?: string | null
          winner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cup_ties_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "league_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_ties_member_a_fkey"
            columns: ["member_a"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_ties_member_b_fkey"
            columns: ["member_b"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cup_ties_winner_id_fkey"
            columns: ["winner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_competitions: {
        Row: {
          competition_id: string
          created_at: string
          id: string
          league_id: string
          mode: Database["public"]["Enums"]["league_mode"]
          name: string
          settings: Json
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          competition_id: string
          created_at?: string
          id?: string
          league_id: string
          mode?: Database["public"]["Enums"]["league_mode"]
          name: string
          settings?: Json
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          competition_id?: string
          created_at?: string
          id?: string
          league_id?: string
          mode?: Database["public"]["Enums"]["league_mode"]
          name?: string
          settings?: Json
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_competitions_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_competitions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          id: string
          joined_at: string
          league_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          league_id: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          league_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          description: string | null
          id: string
          join_code: string | null
          join_policy: Database["public"]["Enums"]["join_policy"]
          logo_url: string | null
          max_members: number | null
          name: string
          owner_id: string
          slug: string
          status: Database["public"]["Enums"]["league_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["league_visibility"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          join_code?: string | null
          join_policy?: Database["public"]["Enums"]["join_policy"]
          logo_url?: string | null
          max_members?: number | null
          name: string
          owner_id: string
          slug: string
          status?: Database["public"]["Enums"]["league_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["league_visibility"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          description?: string | null
          id?: string
          join_code?: string | null
          join_policy?: Database["public"]["Enums"]["join_policy"]
          logo_url?: string | null
          max_members?: number | null
          name?: string
          owner_id?: string
          slug?: string
          status?: Database["public"]["Enums"]["league_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["league_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "leagues_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          away_pen: number | null
          away_score: number | null
          away_team_id: string | null
          away_team_name: string | null
          competition_id: string
          created_at: string
          group_name: string | null
          home_pen: number | null
          home_score: number | null
          home_team_id: string | null
          home_team_name: string | null
          id: string
          kickoff_at: string | null
          last_synced_at: string | null
          matchday: number | null
          provider: Database["public"]["Enums"]["data_provider"]
          provider_ref: string | null
          round: string | null
          stage: string | null
          status: Database["public"]["Enums"]["match_status"]
          updated_at: string
          winner: string | null
        }
        Insert: {
          away_pen?: number | null
          away_score?: number | null
          away_team_id?: string | null
          away_team_name?: string | null
          competition_id: string
          created_at?: string
          group_name?: string | null
          home_pen?: number | null
          home_score?: number | null
          home_team_id?: string | null
          home_team_name?: string | null
          id?: string
          kickoff_at?: string | null
          last_synced_at?: string | null
          matchday?: number | null
          provider?: Database["public"]["Enums"]["data_provider"]
          provider_ref?: string | null
          round?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner?: string | null
        }
        Update: {
          away_pen?: number | null
          away_score?: number | null
          away_team_id?: string | null
          away_team_name?: string | null
          competition_id?: string
          created_at?: string
          group_name?: string | null
          home_pen?: number | null
          home_score?: number | null
          home_team_id?: string | null
          home_team_name?: string | null
          id?: string
          kickoff_at?: string | null
          last_synced_at?: string | null
          matchday?: number | null
          provider?: Database["public"]["Enums"]["data_provider"]
          provider_ref?: string | null
          round?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["match_status"]
          updated_at?: string
          winner?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "matches_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      predictions: {
        Row: {
          away_pred: number
          created_at: string
          home_pred: number
          id: string
          is_joker: boolean
          match_id: string
          points: number | null
          score_type: Database["public"]["Enums"]["score_type"] | null
          scored_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          away_pred: number
          created_at?: string
          home_pred: number
          id?: string
          is_joker?: boolean
          match_id: string
          points?: number | null
          score_type?: Database["public"]["Enums"]["score_type"] | null
          scored_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          away_pred?: number
          created_at?: string
          home_pred?: number
          id?: string
          is_joker?: boolean
          match_id?: string
          points?: number | null
          score_type?: Database["public"]["Enums"]["score_type"] | null
          scored_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "predictions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          email: string | null
          favorite_team: string | null
          id: string
          is_app_admin: boolean
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          favorite_team?: string | null
          id: string
          is_app_admin?: boolean
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          email?: string | null
          favorite_team?: string | null
          id?: string
          is_app_admin?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          country: string | null
          created_at: string
          crest_url: string | null
          id: string
          local_crest: string | null
          name: string
          provider: Database["public"]["Enums"]["data_provider"]
          provider_ref: string | null
          short_name: string | null
          tla: string | null
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          crest_url?: string | null
          id?: string
          local_crest?: string | null
          name: string
          provider?: Database["public"]["Enums"]["data_provider"]
          provider_ref?: string | null
          short_name?: string | null
          tla?: string | null
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          crest_url?: string | null
          id?: string
          local_crest?: string | null
          name?: string
          provider?: Database["public"]["Enums"]["data_provider"]
          provider_ref?: string | null
          short_name?: string | null
          tla?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_league: {
        Args: { p_league_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          description: string | null
          id: string
          join_code: string | null
          join_policy: Database["public"]["Enums"]["join_policy"]
          logo_url: string | null
          max_members: number | null
          name: string
          owner_id: string
          slug: string
          status: Database["public"]["Enums"]["league_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["league_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      compute_score_type: {
        Args: { pa: number; ph: number; ra: number; rh: number }
        Returns: Database["public"]["Enums"]["score_type"]
      }
      create_deadline_reminders: { Args: never; Returns: number }
      gen_join_code: { Args: never; Returns: string }
      get_league_standings: {
        Args: { p_lc_id: string }
        Returns: {
          acertividade: number
          acertos: number
          aproveitamento: number
          avatar_url: string
          cravadas: number
          display_name: string
          erros: number
          jogos: number
          pontos: number
          rank: number
          saldos: number
          user_id: string
        }[]
      }
      is_app_admin: { Args: never; Returns: boolean }
      is_league_admin: { Args: { p_league_id: string }; Returns: boolean }
      is_league_member: { Args: { p_league_id: string }; Returns: boolean }
      join_league_by_code: {
        Args: { p_code: string }
        Returns: {
          id: string
          joined_at: string
          league_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "league_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      join_public_league: {
        Args: { p_league_id: string }
        Returns: {
          id: string
          joined_at: string
          league_id: string
          role: Database["public"]["Enums"]["member_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "league_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      match_is_locked: { Args: { p_match_id: string }; Returns: boolean }
      nudge_member: {
        Args: { p_league_id: string; p_to_user: string }
        Returns: undefined
      }
      reject_league: {
        Args: { p_league_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          description: string | null
          id: string
          join_code: string | null
          join_policy: Database["public"]["Enums"]["join_policy"]
          logo_url: string | null
          max_members: number | null
          name: string
          owner_id: string
          slug: string
          status: Database["public"]["Enums"]["league_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["league_visibility"]
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      run_football_sync: { Args: never; Returns: undefined }
      score_points: {
        Args: { st: Database["public"]["Enums"]["score_type"] }
        Returns: number
      }
      seed_user: {
        Args: { p_email: string; p_name: string; p_password: string }
        Returns: string
      }
      set_app_admin: {
        Args: { p_user_id: string; p_value: boolean }
        Returns: undefined
      }
    }
    Enums: {
      data_provider: "manual" | "football_data" | "thesportsdb"
      join_policy: "open" | "approval" | "invite"
      league_mode: "table" | "cup" | "points"
      league_status: "pending" | "active" | "rejected" | "archived"
      league_visibility: "public" | "private"
      match_status:
        | "scheduled"
        | "live"
        | "finished"
        | "postponed"
        | "cancelled"
      member_role: "owner" | "admin" | "member"
      member_status: "active" | "pending" | "banned"
      score_type: "cravada" | "saldo" | "acerto" | "erro"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      data_provider: ["manual", "football_data", "thesportsdb"],
      join_policy: ["open", "approval", "invite"],
      league_mode: ["table", "cup", "points"],
      league_status: ["pending", "active", "rejected", "archived"],
      league_visibility: ["public", "private"],
      match_status: ["scheduled", "live", "finished", "postponed", "cancelled"],
      member_role: ["owner", "admin", "member"],
      member_status: ["active", "pending", "banned"],
      score_type: ["cravada", "saldo", "acerto", "erro"],
    },
  },
} as const

