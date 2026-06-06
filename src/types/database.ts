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
      access_control: {
        Row: {
          enabled: boolean
          id: number
          max_active: number
          poll_seconds: number
          session_ttl_seconds: number
          updated_at: string
        }
        Insert: {
          enabled?: boolean
          id?: number
          max_active?: number
          poll_seconds?: number
          session_ttl_seconds?: number
          updated_at?: string
        }
        Update: {
          enabled?: boolean
          id?: number
          max_active?: number
          poll_seconds?: number
          session_ttl_seconds?: number
          updated_at?: string
        }
        Relationships: []
      }
      access_sessions: {
        Row: {
          admitted_at: string | null
          enqueued_at: string
          last_seen_at: string
          priority: number
          state: string
          token: string
          user_id: string | null
        }
        Insert: {
          admitted_at?: string | null
          enqueued_at?: string
          last_seen_at?: string
          priority?: number
          state?: string
          token?: string
          user_id?: string | null
        }
        Update: {
          admitted_at?: string | null
          enqueued_at?: string
          last_seen_at?: string
          priority?: number
          state?: string
          token?: string
          user_id?: string | null
        }
        Relationships: []
      }
      admin_audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          detail: Json
          entity_id: string | null
          entity_type: string | null
          id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          detail?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_settings: {
        Row: {
          id: number
          league_price_cents: number
          maintenance_message: string | null
          maintenance_mode: boolean
          name_prefix_cup: string
          name_prefix_liga: string
          name_prefix_points: string
          online_alert_threshold: number
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          promo_price_cents: number | null
          promo_until: string | null
          updated_at: string
        }
        Insert: {
          id?: number
          league_price_cents?: number
          maintenance_message?: string | null
          maintenance_mode?: boolean
          name_prefix_cup?: string
          name_prefix_liga?: string
          name_prefix_points?: string
          online_alert_threshold?: number
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          promo_price_cents?: number | null
          promo_until?: string | null
          updated_at?: string
        }
        Update: {
          id?: number
          league_price_cents?: number
          maintenance_message?: string | null
          maintenance_mode?: boolean
          name_prefix_cup?: string
          name_prefix_liga?: string
          name_prefix_points?: string
          online_alert_threshold?: number
          payment_mode?: Database["public"]["Enums"]["payment_mode"]
          promo_price_cents?: number | null
          promo_until?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      blocked_emails: {
        Row: {
          blocked_by: string | null
          created_at: string
          email: string
          reason: string | null
        }
        Insert: {
          blocked_by?: string | null
          created_at?: string
          email: string
          reason?: string | null
        }
        Update: {
          blocked_by?: string | null
          created_at?: string
          email?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocked_emails_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      competitions: {
        Row: {
          area: string | null
          catalog_seeded: boolean
          created_at: string
          current_round: string | null
          display_name: string | null
          emblem_url: string | null
          id: string
          is_featured: boolean
          is_published: boolean
          jokers_per_week: number
          last_sync_checked_at: string | null
          last_sync_error: string | null
          last_sync_ok: boolean | null
          last_synced_at: string | null
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
          catalog_seeded?: boolean
          created_at?: string
          current_round?: string | null
          display_name?: string | null
          emblem_url?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          jokers_per_week?: number
          last_sync_checked_at?: string | null
          last_sync_error?: string | null
          last_sync_ok?: boolean | null
          last_synced_at?: string | null
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
          catalog_seeded?: boolean
          created_at?: string
          current_round?: string | null
          display_name?: string | null
          emblem_url?: string | null
          id?: string
          is_featured?: boolean
          is_published?: boolean
          jokers_per_week?: number
          last_sync_checked_at?: string | null
          last_sync_error?: string | null
          last_sync_ok?: boolean | null
          last_synced_at?: string | null
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
      confronto_optins: {
        Row: {
          created_at: string
          id: string
          league_competition_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_competition_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          league_competition_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "confronto_optins_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "league_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confronto_optins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      confronto_participants: {
        Row: {
          created_at: string
          id: string
          league_competition_id: string
          seed: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_competition_id: string
          seed?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          league_competition_id?: string
          seed?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "confronto_participants_league_competition_id_fkey"
            columns: ["league_competition_id"]
            isOneToOne: false
            referencedRelation: "league_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "confronto_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cup_ties: {
        Row: {
          created_at: string
          id: string
          league_competition_id: string
          matchday: number | null
          member_a: string | null
          member_b: string | null
          period_kind: string | null
          period_value: string | null
          points_a: number
          points_b: number
          round_label: string
          round_order: number
          slot: number
          status: string
          updated_at: string
          walkover_user: string | null
          window_end: string | null
          window_start: string | null
          winner_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          league_competition_id: string
          matchday?: number | null
          member_a?: string | null
          member_b?: string | null
          period_kind?: string | null
          period_value?: string | null
          points_a?: number
          points_b?: number
          round_label: string
          round_order: number
          slot: number
          status?: string
          updated_at?: string
          walkover_user?: string | null
          window_end?: string | null
          window_start?: string | null
          winner_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          league_competition_id?: string
          matchday?: number | null
          member_a?: string | null
          member_b?: string | null
          period_kind?: string | null
          period_value?: string | null
          points_a?: number
          points_b?: number
          round_label?: string
          round_order?: number
          slot?: number
          status?: string
          updated_at?: string
          walkover_user?: string | null
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
      discount_codes: {
        Row: {
          active: boolean
          amount_off_cents: number | null
          code: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          percent_off: number | null
          used_count: number
        }
        Insert: {
          active?: boolean
          amount_off_cents?: number | null
          code: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          percent_off?: number | null
          used_count?: number
        }
        Update: {
          active?: boolean
          amount_off_cents?: number | null
          code?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          percent_off?: number | null
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_competitions: {
        Row: {
          competition_id: string
          confronto_state: string
          created_at: string
          drawn_at: string | null
          id: string
          league_id: string
          liga_format: string
          mode: Database["public"]["Enums"]["league_mode"]
          name: string
          participant_mode: string
          period_kind: string
          scheduled_draw_at: string | null
          settings: Json
          starts_on: string | null
          status: string
          updated_at: string
        }
        Insert: {
          competition_id: string
          confronto_state?: string
          created_at?: string
          drawn_at?: string | null
          id?: string
          league_id: string
          liga_format?: string
          mode?: Database["public"]["Enums"]["league_mode"]
          name: string
          participant_mode?: string
          period_kind?: string
          scheduled_draw_at?: string | null
          settings?: Json
          starts_on?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          competition_id?: string
          confronto_state?: string
          created_at?: string
          drawn_at?: string | null
          id?: string
          league_id?: string
          liga_format?: string
          mode?: Database["public"]["Enums"]["league_mode"]
          name?: string
          participant_mode?: string
          period_kind?: string
          scheduled_draw_at?: string | null
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
      league_payments: {
        Row: {
          amount_cents: number
          created_at: string
          currency: string
          discount_code: string | null
          discount_counted: boolean
          external_reference: string | null
          id: string
          league_id: string
          payment_id: string | null
          preference_id: string | null
          provider: string
          raw: Json | null
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_cents?: number
          created_at?: string
          currency?: string
          discount_code?: string | null
          discount_counted?: boolean
          external_reference?: string | null
          id?: string
          league_id: string
          payment_id?: string | null
          preference_id?: string | null
          provider?: string
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          currency?: string
          discount_code?: string | null
          discount_counted?: boolean
          external_reference?: string | null
          id?: string
          league_id?: string
          payment_id?: string | null
          preference_id?: string | null
          provider?: string
          raw?: Json | null
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_payments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_payments_user_id_fkey"
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
          confronto_enabled: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          join_code: string | null
          join_policy: Database["public"]["Enums"]["join_policy"]
          logo_url: string | null
          max_members: number | null
          name: string
          name_approved: boolean
          owner_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          slug: string
          status: Database["public"]["Enums"]["league_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["league_visibility"]
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          confronto_enabled?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          join_code?: string | null
          join_policy?: Database["public"]["Enums"]["join_policy"]
          logo_url?: string | null
          max_members?: number | null
          name: string
          name_approved?: boolean
          owner_id: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          slug: string
          status?: Database["public"]["Enums"]["league_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["league_visibility"]
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          confronto_enabled?: boolean
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          join_code?: string | null
          join_policy?: Database["public"]["Enums"]["join_policy"]
          logo_url?: string | null
          max_members?: number | null
          name?: string
          name_approved?: boolean
          owner_id?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
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
            foreignKeyName: "leagues_deleted_by_fkey"
            columns: ["deleted_by"]
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
          hidden: boolean
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
          hidden?: boolean
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
          hidden?: boolean
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
      notification_broadcasts: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          id: string
          segment: string | null
          segment_lc_id: string | null
          segment_league_id: string | null
          segment_top_n: number | null
          sent_count: number | null
          title: string | null
          url: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          segment?: string | null
          segment_lc_id?: string | null
          segment_league_id?: string | null
          segment_top_n?: number | null
          sent_count?: number | null
          title?: string | null
          url?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          segment?: string | null
          segment_lc_id?: string | null
          segment_league_id?: string | null
          segment_top_n?: number | null
          sent_count?: number | null
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_broadcasts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_broadcasts_segment_lc_id_fkey"
            columns: ["segment_lc_id"]
            isOneToOne: false
            referencedRelation: "league_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_broadcasts_segment_league_id_fkey"
            columns: ["segment_league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
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
          favorite_team: string | null
          id: string
          is_app_admin: boolean
          last_active_at: string | null
          notif_prefs: Json
          show_in_global_ranking: boolean
          updated_at: string
          usage_seconds: number
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          favorite_team?: string | null
          id: string
          is_app_admin?: boolean
          last_active_at?: string | null
          notif_prefs?: Json
          show_in_global_ranking?: boolean
          updated_at?: string
          usage_seconds?: number
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          favorite_team?: string | null
          id?: string
          is_app_admin?: boolean
          last_active_at?: string | null
          notif_prefs?: Json
          show_in_global_ranking?: boolean
          updated_at?: string
          usage_seconds?: number
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
      rate_limits: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start?: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      sync_alerts: {
        Row: {
          competition_id: string | null
          created_at: string
          id: string
          kind: string
          match_id: string | null
          message: string | null
          payload: Json
          provider_ref: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          competition_id?: string | null
          created_at?: string
          id?: string
          kind: string
          match_id?: string | null
          message?: string | null
          payload?: Json
          provider_ref?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          competition_id?: string | null
          created_at?: string
          id?: string
          kind?: string
          match_id?: string | null
          message?: string | null
          payload?: Json
          provider_ref?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_alerts_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_alerts_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_alerts_resolved_by_fkey"
            columns: ["resolved_by"]
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
      admin_approve_league_name: {
        Args: { p_league_id: string }
        Returns: undefined
      }
      admin_block_email: {
        Args: { p_reason?: string; p_user_id: string }
        Returns: undefined
      }
      admin_broadcast_preview: {
        Args: { p_arg?: Json; p_segment: string }
        Returns: number
      }
      admin_comp_league: {
        Args: { p_league_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          confronto_enabled: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          join_code: string | null
          join_policy: Database["public"]["Enums"]["join_policy"]
          logo_url: string | null
          max_members: number | null
          name: string
          name_approved: boolean
          owner_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
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
      admin_delete_competition: { Args: { p_id: string }; Returns: undefined }
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      admin_list_broadcasts: {
        Args: { p_limit?: number }
        Returns: {
          author_name: string
          body: string
          created_at: string
          id: string
          segment: string
          segment_label: string
          sent_count: number
          title: string
          url: string
        }[]
      }
      admin_list_deleted_leagues: {
        Args: never
        Returns: {
          deleted_at: string
          id: string
          name: string
          owner_name: string
          slug: string
        }[]
      }
      admin_list_group_targets: {
        Args: never
        Returns: {
          competition_name: string
          lc_id: string
          league_id: string
          league_name: string
        }[]
      }
      admin_list_sync_alerts: {
        Args: { p_limit?: number }
        Returns: {
          competition_id: string
          competition_name: string
          competition_provider: string
          created_at: string
          id: string
          kind: string
          match_id: string
          message: string
          payload: Json
          resolved_at: string
          status: string
        }[]
      }
      admin_list_users: {
        Args: never
        Returns: {
          avatar_url: string
          created_at: string
          display_name: string
          email: string
          id: string
          is_app_admin: boolean
          is_online: boolean
          last_active_at: string
          usage_seconds: number
        }[]
      }
      admin_recent_audit: {
        Args: { p_limit?: number }
        Returns: {
          action: string
          actor_name: string
          created_at: string
          detail: Json
          entity_id: string
          entity_label: string
          entity_type: string
          id: string
        }[]
      }
      admin_rename_competition: {
        Args: { p_display_name: string; p_id: string }
        Returns: undefined
      }
      admin_reopen_match: {
        Args: { p_match_id: string; p_minutes?: number }
        Returns: undefined
      }
      admin_resolve_sync_alert: {
        Args: { p_action: string; p_id: string }
        Returns: undefined
      }
      admin_restore_league: {
        Args: { p_league_id: string }
        Returns: undefined
      }
      admin_send_broadcast: {
        Args: {
          p_arg?: Json
          p_body: string
          p_segment: string
          p_title: string
          p_url: string
        }
        Returns: number
      }
      admin_set_competition_published: {
        Args: { p_id: string; p_value: boolean }
        Returns: undefined
      }
      admin_set_competition_sync: {
        Args: { p_id: string; p_value: boolean }
        Returns: undefined
      }
      admin_set_confronto_enabled: {
        Args: { p_league_id: string; p_value: boolean }
        Returns: undefined
      }
      admin_set_maintenance: {
        Args: { p_message?: string; p_on: boolean }
        Returns: undefined
      }
      admin_set_name_prefixes: {
        Args: { p_cup: string; p_liga: string; p_points: string }
        Returns: undefined
      }
      admin_set_online_threshold: {
        Args: { p_value: number }
        Returns: undefined
      }
      admin_set_promo: {
        Args: { p_promo_price_cents?: number; p_promo_until?: string }
        Returns: {
          id: number
          league_price_cents: number
          maintenance_message: string | null
          maintenance_mode: boolean
          name_prefix_cup: string
          name_prefix_liga: string
          name_prefix_points: string
          online_alert_threshold: number
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          promo_price_cents: number | null
          promo_until: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "app_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_user_suspended: {
        Args: { p_suspended: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_soft_delete_league: {
        Args: { p_league_id: string }
        Returns: undefined
      }
      admin_system_health: { Args: never; Returns: Json }
      admin_update_access: {
        Args: { p_enabled: boolean; p_max_active: number }
        Returns: undefined
      }
      admin_update_payment_settings: {
        Args: {
          p_mode: Database["public"]["Enums"]["payment_mode"]
          p_price_cents: number
        }
        Returns: {
          id: number
          league_price_cents: number
          maintenance_message: string | null
          maintenance_mode: boolean
          name_prefix_cup: string
          name_prefix_liga: string
          name_prefix_points: string
          online_alert_threshold: number
          payment_mode: Database["public"]["Enums"]["payment_mode"]
          promo_price_cents: number | null
          promo_until: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "app_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_user_moderation: { Args: { p_user_id: string }; Returns: Json }
      advance_confronto_cup: { Args: { p_lc_id: string }; Returns: number }
      append_confronto_ties: {
        Args: { p_lc_id: string; p_ties: Json }
        Returns: number
      }
      approve_league: {
        Args: { p_league_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          confronto_enabled: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          join_code: string | null
          join_policy: Database["public"]["Enums"]["join_policy"]
          logo_url: string | null
          max_members: number | null
          name: string
          name_approved: boolean
          owner_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
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
      can_settle_leagues: { Args: never; Returns: boolean }
      compute_score_type: {
        Args: { pa: number; ph: number; ra: number; rh: number }
        Returns: Database["public"]["Enums"]["score_type"]
      }
      confirm_league_payment: {
        Args: {
          p_amount_cents?: number
          p_league_id: string
          p_payment_id: string
          p_preference_id?: string
          p_raw?: Json
          p_status: Database["public"]["Enums"]["payment_status"]
        }
        Returns: undefined
      }
      create_deadline_reminders: { Args: never; Returns: number }
      draw_confronto: {
        Args: {
          p_lc_id: string
          p_liga_format?: string
          p_participants: Json
          p_period_kind?: string
          p_scheduled_draw_at?: string
          p_ties: Json
        }
        Returns: undefined
      }
      fan_notify_admins: {
        Args: {
          p_body: string
          p_kind: string
          p_ref: string
          p_title: string
          p_url: string
        }
        Returns: undefined
      }
      gen_join_code: { Args: never; Returns: string }
      get_competition_periods: {
        Args: { p_competition_id: string; p_kind: string }
        Returns: {
          ends_on: string
          games: number
          kind: string
          label: string
          period_index: number
          starts_on: string
          value: string
        }[]
      }
      get_confronto_standings: {
        Args: { p_lc_id: string }
        Returns: {
          avatar_url: string
          derrotas: number
          display_name: string
          empates: number
          gols_contra: number
          gols_pro: number
          jogos: number
          pontos: number
          rank: number
          user_id: string
          vitorias: number
        }[]
      }
      get_confronto_ties: {
        Args: { p_lc_id: string }
        Returns: {
          avatar_a: string
          avatar_b: string
          id: string
          matchday: number
          member_a: string
          member_b: string
          name_a: string
          name_b: string
          pa: number
          pb: number
          resolved: boolean
          round_label: string
          round_order: number
          slot: number
          walkover: boolean
          winner: string
        }[]
      }
      get_global_standings: {
        Args: {
          p_competition_id?: string
          p_limit?: number
          p_team_id?: string
          p_year?: number
        }
        Returns: {
          acertos: number
          avatar_url: string
          cravadas: number
          display_name: string
          jogos: number
          pontos: number
          rank: number
          saldos: number
          user_id: string
        }[]
      }
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
      get_match_predict_status: {
        Args: { p_match_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          league_id: string
          predicted: boolean
          user_id: string
        }[]
      }
      get_my_global_rank: {
        Args: { p_competition_id?: string; p_year?: number }
        Returns: {
          jogos: number
          pontos: number
          rank: number
          total_resultadistas: number
        }[]
      }
      get_my_notifications: {
        Args: { p_limit?: number }
        Returns: {
          body: string | null
          created_at: string
          data: Json
          id: string
          read_at: string | null
          title: string
          type: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_notification_prefs: { Args: never; Returns: Json }
      get_player_profile: { Args: { p_user_id: string }; Returns: Json }
      get_tie_detail: {
        Args: { p_tie_id: string }
        Returns: {
          a_away: number
          a_home: number
          a_joker: boolean
          a_palpitou: boolean
          a_pts: number
          away_name: string
          away_score: number
          b_away: number
          b_home: number
          b_joker: boolean
          b_palpitou: boolean
          b_pts: number
          home_name: string
          home_score: number
          kickoff_at: string
          match_id: string
          status: Database["public"]["Enums"]["match_status"]
        }[]
      }
      get_unread_count: { Args: never; Returns: number }
      heartbeat_access: { Args: { p_token: string }; Returns: Json }
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
      leave_league: { Args: { p_league_id: string }; Returns: undefined }
      match_in_period: {
        Args: {
          m_kickoff: string
          m_matchday: number
          m_stage: string
          p_fallback_matchday: number
          p_kind: string
          p_value: string
        }
        Returns: boolean
      }
      match_is_locked: { Args: { p_match_id: string }; Returns: boolean }
      nudge_for_match: {
        Args: { p_match_id: string; p_to_user: string }
        Returns: undefined
      }
      rate_limit_hit: {
        Args: { p_bucket: string; p_max: number; p_window_seconds: number }
        Returns: boolean
      }
      refund_league: { Args: { p_league_id: string }; Returns: boolean }
      reject_league: {
        Args: { p_league_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          confronto_enabled: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          join_code: string | null
          join_policy: Database["public"]["Enums"]["join_policy"]
          logo_url: string | null
          max_members: number | null
          name: string
          name_approved: boolean
          owner_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
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
      release_access: { Args: { p_token: string }; Returns: undefined }
      release_confronto_if_due: { Args: { p_lc_id: string }; Returns: boolean }
      release_scheduled_confrontos: { Args: never; Returns: number }
      request_access: { Args: { p_token?: string }; Returns: Json }
      run_football_sync:
        | { Args: never; Returns: undefined }
        | { Args: { p_mode?: string }; Returns: undefined }
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
      set_global_ranking_visibility: {
        Args: { p_value: boolean }
        Returns: boolean
      }
      set_notification_pref: {
        Args: { p_enabled: boolean; p_type: string }
        Returns: Json
      }
      should_sync_scores: { Args: never; Returns: boolean }
      simulate_league_payment: {
        Args: { p_discount_code?: string; p_league_id: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          confronto_enabled: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          join_code: string | null
          join_policy: Database["public"]["Enums"]["join_policy"]
          logo_url: string | null
          max_members: number | null
          name: string
          name_approved: boolean
          owner_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
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
      toggle_confronto_optin: { Args: { p_lc_id: string }; Returns: boolean }
      touch_presence: { Args: never; Returns: undefined }
      undo_confronto_draw: { Args: { p_lc_id: string }; Returns: undefined }
      update_group_info: {
        Args: { p_description: string; p_league_id: string; p_name: string }
        Returns: {
          approved_at: string | null
          approved_by: string | null
          confronto_enabled: boolean
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          join_code: string | null
          join_policy: Database["public"]["Enums"]["join_policy"]
          logo_url: string | null
          max_members: number | null
          name: string
          name_approved: boolean
          owner_id: string
          payment_status: Database["public"]["Enums"]["payment_status"]
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
      validate_discount_code: { Args: { p_code: string }; Returns: Json }
      wants_notification: {
        Args: { p_type: string; p_user: string }
        Returns: boolean
      }
    }
    Enums: {
      data_provider: "manual" | "football_data" | "thesportsdb" | "espn"
      join_policy: "open" | "approval" | "invite"
      league_mode: "table" | "cup" | "points" | "liga"
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
      payment_mode: "disabled" | "test" | "live"
      payment_status: "none" | "pending" | "paid" | "failed" | "refunded"
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
      data_provider: ["manual", "football_data", "thesportsdb", "espn"],
      join_policy: ["open", "approval", "invite"],
      league_mode: ["table", "cup", "points", "liga"],
      league_status: ["pending", "active", "rejected", "archived"],
      league_visibility: ["public", "private"],
      match_status: ["scheduled", "live", "finished", "postponed", "cancelled"],
      member_role: ["owner", "admin", "member"],
      member_status: ["active", "pending", "banned"],
      payment_mode: ["disabled", "test", "live"],
      payment_status: ["none", "pending", "paid", "failed", "refunded"],
      score_type: ["cravada", "saldo", "acerto", "erro"],
    },
  },
} as const

