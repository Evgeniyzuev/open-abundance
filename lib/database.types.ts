export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      challenges: {
        Row: {
          category: string
          created_at: string
          description: Json
          difficulty_level: number
          duration_days: number | null
          id: string
          image_url: string | null
          instructions: Json
          is_active: boolean
          requirements: Json
          reward_label: Json
          sort_order: number
          title: Json
          verification_logic: string | null
          verification_type: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: Json
          difficulty_level?: number
          duration_days?: number | null
          id?: string
          image_url?: string | null
          instructions?: Json
          is_active?: boolean
          requirements?: Json
          reward_label?: Json
          sort_order?: number
          title?: Json
          verification_logic?: string | null
          verification_type?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: Json
          difficulty_level?: number
          duration_days?: number | null
          id?: string
          image_url?: string | null
          instructions?: Json
          is_active?: boolean
          requirements?: Json
          reward_label?: Json
          sort_order?: number
          title?: Json
          verification_logic?: string | null
          verification_type?: string
        }
        Relationships: []
      }
      core_accounts: {
        Row: {
          balance: number
          created_at: string
          last_seen_level: number
          level: number
          reinvest_percent: number
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          last_seen_level?: number
          level?: number
          reinvest_percent?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          last_seen_level?: number
          level?: number
          reinvest_percent?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_core_accruals: {
        Row: {
          accrual_date: string
          core_after: number
          core_amount: number
          core_before: number
          created_at: string
          daily_rate: number
          gross_amount: number
          reinvest_percent: number
          user_id: string
          wallet_amount: number
        }
        Insert: {
          accrual_date: string
          core_after: number
          core_amount: number
          core_before: number
          created_at?: string
          daily_rate: number
          gross_amount: number
          reinvest_percent: number
          user_id: string
          wallet_amount: number
        }
        Update: {
          accrual_date?: string
          core_after?: number
          core_amount?: number
          core_before?: number
          created_at?: string
          daily_rate?: number
          gross_amount?: number
          reinvest_percent?: number
          user_id?: string
          wallet_amount?: number
        }
        Relationships: []
      }
      feed_post_entities: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          post_id: string
          relation: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          post_id: string
          relation?: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          post_id?: string
          relation?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_post_entities_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_post_external_links: {
        Row: {
          author_handle: string | null
          caption: string | null
          created_at: string
          embed_status: string
          external_post_id: string | null
          external_url: string
          fetched_at: string | null
          id: string
          post_id: string
          provider: string
          relation: string
          thumbnail_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          author_handle?: string | null
          caption?: string | null
          created_at?: string
          embed_status?: string
          external_post_id?: string | null
          external_url: string
          fetched_at?: string | null
          id?: string
          post_id: string
          provider: string
          relation?: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_handle?: string | null
          caption?: string | null
          created_at?: string
          embed_status?: string
          external_post_id?: string | null
          external_url?: string
          fetched_at?: string | null
          id?: string
          post_id?: string
          provider?: string
          relation?: string
          thumbnail_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_post_external_links_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_post_stat_blocks: {
        Row: {
          block_key: string
          created_at: string
          id: string
          label: string
          post_id: string
          snapshot_id: string
          sort_order: number
          updated_at: string
          value: Json
          visibility: string
        }
        Insert: {
          block_key: string
          created_at?: string
          id?: string
          label: string
          post_id: string
          snapshot_id: string
          sort_order?: number
          updated_at?: string
          value?: Json
          visibility?: string
        }
        Update: {
          block_key?: string
          created_at?: string
          id?: string
          label?: string
          post_id?: string
          snapshot_id?: string
          sort_order?: number
          updated_at?: string
          value?: Json
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_post_stat_blocks_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_post_stat_blocks_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "progress_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          author_user_id: string
          body: string | null
          created_at: string
          deleted_at: string | null
          id: string
          post_type: string
          published_at: string | null
          snapshot_id: string | null
          status: string
          updated_at: string
          visibility: string
        }
        Insert: {
          author_user_id: string
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_type?: string
          published_at?: string | null
          snapshot_id?: string | null
          status?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_user_id?: string
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_type?: string
          published_at?: string | null
          snapshot_id?: string | null
          status?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_posts_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "progress_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      level_thresholds: {
        Row: {
          core_required: number
          created_at: string
          level: number
          title: string | null
        }
        Insert: {
          core_required: number
          created_at?: string
          level: number
          title?: string | null
        }
        Update: {
          core_required?: number
          created_at?: string
          level?: number
          title?: string | null
        }
        Relationships: []
      }
      marketplace_listings: {
        Row: {
          artifact_id: string
          cancelled_at: string | null
          created_at: string
          currency_code: string
          description: string | null
          expires_at: string | null
          id: string
          metadata: Json
          price_amount: number
          seller_user_id: string
          sold_at: string | null
          status: string
          terms_hash: string
          terms_json: Json
          title: string
          updated_at: string
        }
        Insert: {
          artifact_id: string
          cancelled_at?: string | null
          created_at?: string
          currency_code?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          price_amount: number
          seller_user_id: string
          sold_at?: string | null
          status?: string
          terms_hash: string
          terms_json?: Json
          title: string
          updated_at?: string
        }
        Update: {
          artifact_id?: string
          cancelled_at?: string | null
          created_at?: string
          currency_code?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          metadata?: Json
          price_amount?: number
          seller_user_id?: string
          sold_at?: string | null
          status?: string
          terms_hash?: string
          terms_json?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "user_artifacts"
            referencedColumns: ["id"]
          },
        ]
      }
      mutual_confirmations: {
        Row: {
          confirmation_type: string
          counterparty_user_id: string
          created_at: string
          expires_at: string
          id: string
          message: string | null
          metadata: Json
          requester_user_id: string
          responded_at: string | null
          source_id: string | null
          source_type: string
          status: string
          trust_event_id: string | null
          updated_at: string
        }
        Insert: {
          confirmation_type: string
          counterparty_user_id: string
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          requester_user_id: string
          responded_at?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          trust_event_id?: string | null
          updated_at?: string
        }
        Update: {
          confirmation_type?: string
          counterparty_user_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          message?: string | null
          metadata?: Json
          requester_user_id?: string
          responded_at?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          trust_event_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mutual_confirmations_trust_event_id_fkey"
            columns: ["trust_event_id"]
            isOneToOne: false
            referencedRelation: "trust_events"
            referencedColumns: ["id"]
          },
        ]
      }
      progress_snapshots: {
        Row: {
          core_after: number | null
          core_amount: number | null
          core_before: number | null
          created_at: string
          daily_rate: number | null
          gross_amount: number | null
          id: string
          payload: Json
          reinvest_percent: number | null
          source_date: string
          source_type: string
          updated_at: string
          user_id: string
          wallet_amount: number | null
        }
        Insert: {
          core_after?: number | null
          core_amount?: number | null
          core_before?: number | null
          created_at?: string
          daily_rate?: number | null
          gross_amount?: number | null
          id?: string
          payload?: Json
          reinvest_percent?: number | null
          source_date: string
          source_type: string
          updated_at?: string
          user_id: string
          wallet_amount?: number | null
        }
        Update: {
          core_after?: number | null
          core_amount?: number | null
          core_before?: number | null
          created_at?: string
          daily_rate?: number | null
          gross_amount?: number | null
          id?: string
          payload?: Json
          reinvest_percent?: number | null
          source_date?: string
          source_type?: string
          updated_at?: string
          user_id?: string
          wallet_amount?: number | null
        }
        Relationships: []
      }
      reciprocity_balances: {
        Row: {
          confirmations_given_count: number
          confirmations_received_count: number
          deals_completed_count: number
          help_given_count: number
          help_received_count: number
          recent_positive_events: number
          reciprocity_score: number
          unresolved_pending_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmations_given_count?: number
          confirmations_received_count?: number
          deals_completed_count?: number
          help_given_count?: number
          help_received_count?: number
          recent_positive_events?: number
          reciprocity_score?: number
          unresolved_pending_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmations_given_count?: number
          confirmations_received_count?: number
          deals_completed_count?: number
          help_given_count?: number
          help_received_count?: number
          recent_positive_events?: number
          reciprocity_score?: number
          unresolved_pending_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recommended_wishes: {
        Row: {
          category: string
          created_at: string
          description: Json
          difficulty_level: number
          estimated_cost: string | null
          id: string
          image_url: string
          title: Json
        }
        Insert: {
          category: string
          created_at?: string
          description?: Json
          difficulty_level?: number
          estimated_cost?: string | null
          id?: string
          image_url: string
          title?: Json
        }
        Update: {
          category?: string
          created_at?: string
          description?: Json
          difficulty_level?: number
          estimated_cost?: string | null
          id?: string
          image_url?: string
          title?: Json
        }
        Relationships: []
      }
      referral_codes: {
        Row: {
          code: string
          created_at: string
          is_active: boolean
          retired_at: string | null
          user_id: string
        }
        Insert: {
          code: string
          created_at?: string
          is_active?: boolean
          retired_at?: string | null
          user_id: string
        }
        Update: {
          code?: string
          created_at?: string
          is_active?: boolean
          retired_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referral_edges: {
        Row: {
          captured_at: string | null
          claimed_at: string
          guest_id: string | null
          referral_code: string | null
          referral_user_id: string
          referrer_user_id: string
          source: string | null
        }
        Insert: {
          captured_at?: string | null
          claimed_at?: string
          guest_id?: string | null
          referral_code?: string | null
          referral_user_id: string
          referrer_user_id: string
          source?: string | null
        }
        Update: {
          captured_at?: string | null
          claimed_at?: string
          guest_id?: string | null
          referral_code?: string | null
          referral_user_id?: string
          referrer_user_id?: string
          source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_edges_referral_code_fkey"
            columns: ["referral_code"]
            isOneToOne: false
            referencedRelation: "referral_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      team_core_growth_rewards: {
        Row: {
          batch_id: string | null
          bonus_date: string
          created_at: string
          depth: number
          id: string
          leader_user_id: string
          reward_amount: number
          settlement_kind: string
          source_core_after: number
          source_core_before: number
          source_core_delta: number
          source_user_id: string
        }
        Insert: {
          batch_id?: string | null
          bonus_date: string
          created_at?: string
          depth?: number
          id?: string
          leader_user_id: string
          reward_amount: number
          settlement_kind?: string
          source_core_after: number
          source_core_before: number
          source_core_delta: number
          source_user_id: string
        }
        Update: {
          batch_id?: string | null
          bonus_date?: string
          created_at?: string
          depth?: number
          id?: string
          leader_user_id?: string
          reward_amount?: number
          settlement_kind?: string
          source_core_after?: number
          source_core_before?: number
          source_core_delta?: number
          source_user_id?: string
        }
        Relationships: []
      }
      team_memberships: {
        Row: {
          assigned_at: string
          is_active: boolean
          leader_user_id: string | null
          member_user_id: string
          team_bonus_base_at: string | null
          team_bonus_base_balance: number
        }
        Insert: {
          assigned_at?: string
          is_active?: boolean
          leader_user_id?: string | null
          member_user_id: string
          team_bonus_base_at?: string | null
          team_bonus_base_balance?: number
        }
        Update: {
          assigned_at?: string
          is_active?: boolean
          leader_user_id?: string | null
          member_user_id?: string
          team_bonus_base_at?: string | null
          team_bonus_base_balance?: number
        }
        Relationships: []
      }
      trust_events: {
        Row: {
          actor_user_id: string
          confirmed_at: string | null
          confirmed_by_user_id: string | null
          created_at: string
          created_by_user_id: string
          event_type: string
          id: string
          metadata: Json
          source_id: string | null
          source_type: string
          status: string
          target_user_id: string | null
          updated_at: string
        }
        Insert: {
          actor_user_id: string
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          event_type: string
          id?: string
          metadata?: Json
          source_id?: string | null
          source_type: string
          status?: string
          target_user_id?: string | null
          updated_at?: string
        }
        Update: {
          actor_user_id?: string
          confirmed_at?: string | null
          confirmed_by_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          event_type?: string
          id?: string
          metadata?: Json
          source_id?: string | null
          source_type?: string
          status?: string
          target_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_artifacts: {
        Row: {
          artifact_type: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          locked_by_deal_id: string | null
          metadata: Json
          rarity: string
          source_id: string | null
          source_type: string
          title: string
          transferable: boolean
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          artifact_type: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          locked_by_deal_id?: string | null
          metadata?: Json
          rarity?: string
          source_id?: string | null
          source_type?: string
          title: string
          transferable?: boolean
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          artifact_type?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          locked_by_deal_id?: string | null
          metadata?: Json
          rarity?: string
          source_id?: string | null
          source_type?: string
          title?: string
          transferable?: boolean
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      user_challenges: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          status: string
          updated_at: string
          user_id: string
          verification_data: Json
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          verification_data?: Json
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          verification_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "user_challenges_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_contacts: {
        Row: {
          contact_user_id: string
          created_at: string
          is_required: boolean
          owner_user_id: string
          removed_at: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          contact_user_id: string
          created_at?: string
          is_required?: boolean
          owner_user_id: string
          removed_at?: string | null
          source: string
          status?: string
          updated_at?: string
        }
        Update: {
          contact_user_id?: string
          created_at?: string
          is_required?: boolean
          owner_user_id?: string
          removed_at?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profile_links: {
        Row: {
          created_at: string
          id: string
          label: string | null
          link_type: string
          sort_order: number
          updated_at: string
          url: string
          user_id: string
          visibility: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          link_type?: string
          sort_order?: number
          updated_at?: string
          url: string
          user_id: string
          visibility?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          link_type?: string
          sort_order?: number
          updated_at?: string
          url?: string
          user_id?: string
          visibility?: string
        }
        Relationships: []
      }
      user_profile_visibility_settings: {
        Row: {
          created_at: string
          settings: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          settings?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          settings?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          default_locale: string
          deleted_at: string | null
          display_name: string | null
          first_name: string | null
          last_name: string | null
          level: number
          onboarding_state: Json
          phone_verified_at: string | null
          timezone: string | null
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_locale?: string
          deleted_at?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          level?: number
          onboarding_state?: Json
          phone_verified_at?: string | null
          timezone?: string | null
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          default_locale?: string
          deleted_at?: string | null
          display_name?: string | null
          first_name?: string | null
          last_name?: string | null
          level?: number
          onboarding_state?: Json
          phone_verified_at?: string | null
          timezone?: string | null
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      wallet_accounts: {
        Row: {
          balance: number
          created_at: string
          currency_code: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency_code?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency_code?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      wallet_ledger: {
        Row: {
          amount: number
          balance_after: number
          counterparty_user_id: string | null
          created_at: string
          currency_code: string
          direction: string
          id: string
          idempotency_key: string | null
          metadata: Json
          operation_type: string
          source_id: string | null
          source_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          counterparty_user_id?: string | null
          created_at?: string
          currency_code?: string
          direction: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          operation_type: string
          source_id?: string | null
          source_type?: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          counterparty_user_id?: string | null
          created_at?: string
          currency_code?: string
          direction?: string
          id?: string
          idempotency_key?: string | null
          metadata?: Json
          operation_type?: string
          source_id?: string | null
          source_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "wallet_accounts"
            referencedColumns: ["user_id"]
          },
        ]
      }
      wishes: {
        Row: {
          category: string | null
          cloned_from_wish_id: string | null
          completed_at: string | null
          copied_count: number
          created_at: string
          deleted_at: string | null
          description: string
          difficulty_level: number
          id: string
          image_url: string | null
          original_wish_id: string | null
          owner_user_id: string
          source_recommended_wish_id: string | null
          status: string
          target_amount: number | null
          target_currency: string
          title: string
          updated_at: string
          visibility: string
        }
        Insert: {
          category?: string | null
          cloned_from_wish_id?: string | null
          completed_at?: string | null
          copied_count?: number
          created_at?: string
          deleted_at?: string | null
          description?: string
          difficulty_level?: number
          id?: string
          image_url?: string | null
          original_wish_id?: string | null
          owner_user_id: string
          source_recommended_wish_id?: string | null
          status?: string
          target_amount?: number | null
          target_currency?: string
          title: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          category?: string | null
          cloned_from_wish_id?: string | null
          completed_at?: string | null
          copied_count?: number
          created_at?: string
          deleted_at?: string | null
          description?: string
          difficulty_level?: number
          id?: string
          image_url?: string | null
          original_wish_id?: string | null
          owner_user_id?: string
          source_recommended_wish_id?: string | null
          status?: string
          target_amount?: number | null
          target_currency?: string
          title?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishes_cloned_from_wish_id_fkey"
            columns: ["cloned_from_wish_id"]
            isOneToOne: false
            referencedRelation: "wishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishes_original_wish_id_fkey"
            columns: ["original_wish_id"]
            isOneToOne: false
            referencedRelation: "wishes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishes_source_recommended_wish_id_fkey"
            columns: ["source_recommended_wish_id"]
            isOneToOne: false
            referencedRelation: "recommended_wishes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_core_level: { Args: { core_balance: number }; Returns: number }
      complete_user_challenge: {
        Args: {
          p_challenge_id: string
          p_reward_account: string
          p_reward_amount: number
          p_user_id: string
        }
        Returns: {
          challenge_status: string
          reward_claimed: boolean
          rewarded_account: string
          rewarded_amount: number
        }[]
      }
      revalidate_team_membership_for_level_change: {
        Args: { p_member_level?: number; p_member_user_id: string }
        Returns: undefined
      }
      run_daily_core_accrual: {
        Args: { p_accrual_date?: string }
        Returns: undefined
      }
      run_daily_core_and_team_bonus: {
        Args: { p_run_date?: string }
        Returns: undefined
      }
      run_daily_team_bonus: {
        Args: { p_bonus_date?: string }
        Returns: undefined
      }
      settle_team_bonus_for_member: {
        Args: {
          p_batch_id?: string
          p_bonus_date?: string
          p_member_user_id: string
          p_settlement_kind?: string
        }
        Returns: undefined
      }
      sync_team_contacts_for_member: {
        Args: { p_member_user_id: string }
        Returns: undefined
      }
      wallet_core_topup: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_source_id?: string
          p_user_id: string
        }
        Returns: {
          wallet_ledger_id: string
        }[]
      }
      wallet_transfer: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_recipient_user_id: string
          p_sender_user_id: string
          p_source_id?: string
          p_source_type?: string
        }
        Returns: {
          recipient_wallet_ledger_id: string
          sender_wallet_ledger_id: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
