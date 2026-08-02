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
      challenge_completion_snapshots: {
        Row: {
          challenge_category: string | null
          challenge_id: string
          challenge_title: Json
          completed_at: string
          created_at: string
          feed_post_id: string | null
          id: string
          metadata: Json
          user_id: string
          verification_type: string | null
        }
        Insert: {
          challenge_category?: string | null
          challenge_id: string
          challenge_title: Json
          completed_at: string
          created_at?: string
          feed_post_id?: string | null
          id?: string
          metadata?: Json
          user_id: string
          verification_type?: string | null
        }
        Update: {
          challenge_category?: string | null
          challenge_id?: string
          challenge_title?: Json
          completed_at?: string
          created_at?: string
          feed_post_id?: string | null
          id?: string
          metadata?: Json
          user_id?: string
          verification_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "challenge_completion_snapshots_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_completion_snapshots_feed_post_id_fkey"
            columns: ["feed_post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      challenge_feedback_submissions: {
        Row: {
          answers: Json
          attitude: string | null
          challenge_id: string
          context: Json
          created_at: string
          daily_use_intent: string | null
          feed_post_id: string | null
          id: string
          install_outcome: string | null
          main_concern: string | null
          main_difficulty: string | null
          mission_rating: number | null
          most_useful_area: string | null
          overall_rating: number | null
          platform: string | null
          private_comment: string | null
          public_consent_at: string | null
          public_consent_version: string | null
          public_review: string | null
          schema_version: number
          status: string
          strongest_area: string | null
          submitted_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          answers?: Json
          attitude?: string | null
          challenge_id: string
          context?: Json
          created_at?: string
          daily_use_intent?: string | null
          feed_post_id?: string | null
          id?: string
          install_outcome?: string | null
          main_concern?: string | null
          main_difficulty?: string | null
          mission_rating?: number | null
          most_useful_area?: string | null
          overall_rating?: number | null
          platform?: string | null
          private_comment?: string | null
          public_consent_at?: string | null
          public_consent_version?: string | null
          public_review?: string | null
          schema_version?: number
          status?: string
          strongest_area?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          answers?: Json
          attitude?: string | null
          challenge_id?: string
          context?: Json
          created_at?: string
          daily_use_intent?: string | null
          feed_post_id?: string | null
          id?: string
          install_outcome?: string | null
          main_concern?: string | null
          main_difficulty?: string | null
          mission_rating?: number | null
          most_useful_area?: string | null
          overall_rating?: number | null
          platform?: string | null
          private_comment?: string | null
          public_consent_at?: string | null
          public_consent_version?: string | null
          public_review?: string | null
          schema_version?: number
          status?: string
          strongest_area?: string | null
          submitted_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenge_feedback_submissions_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenge_feedback_submissions_feed_post_id_fkey"
            columns: ["feed_post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          action_view: string | null
          category: string
          created_at: string
          description: Json
          difficulty_level: number
          duration_days: number | null
          id: string
          image_url: string | null
          instructions: Json
          is_active: boolean
          prerequisite_challenge_id: string | null
          requirements: Json
          reward_label: Json
          sort_order: number
          title: Json
          track_key: string | null
          track_step: number | null
          verification_logic: string | null
          verification_type: string
        }
        Insert: {
          action_view?: string | null
          category?: string
          created_at?: string
          description?: Json
          difficulty_level?: number
          duration_days?: number | null
          id?: string
          image_url?: string | null
          instructions?: Json
          is_active?: boolean
          prerequisite_challenge_id?: string | null
          requirements?: Json
          reward_label?: Json
          sort_order?: number
          title?: Json
          track_key?: string | null
          track_step?: number | null
          verification_logic?: string | null
          verification_type?: string
        }
        Update: {
          action_view?: string | null
          category?: string
          created_at?: string
          description?: Json
          difficulty_level?: number
          duration_days?: number | null
          id?: string
          image_url?: string | null
          instructions?: Json
          is_active?: boolean
          prerequisite_challenge_id?: string | null
          requirements?: Json
          reward_label?: Json
          sort_order?: number
          title?: Json
          track_key?: string | null
          track_step?: number | null
          verification_logic?: string | null
          verification_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_prerequisite_challenge_id_fkey"
            columns: ["prerequisite_challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
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
      direct_conversation_participants: {
        Row: {
          archived_at: string | null
          conversation_id: string
          created_at: string
          last_read_at: string | null
          muted_at: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          conversation_id: string
          created_at?: string
          last_read_at?: string | null
          muted_at?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          conversation_id?: string
          created_at?: string
          last_read_at?: string | null
          muted_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "direct_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_conversations: {
        Row: {
          conversation_key: string
          conversation_type: string
          created_at: string
          created_by_user_id: string
          id: string
          last_message_at: string | null
          last_message_preview: string | null
          updated_at: string
        }
        Insert: {
          conversation_key: string
          conversation_type?: string
          created_at?: string
          created_by_user_id: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          updated_at?: string
        }
        Update: {
          conversation_key?: string
          conversation_type?: string
          created_at?: string
          created_by_user_id?: string
          id?: string
          last_message_at?: string | null
          last_message_preview?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_user_id: string
          status: string
          updated_at: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_user_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_user_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "direct_conversations"
            referencedColumns: ["id"]
          },
        ]
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
      feed_post_comments: {
        Row: {
          body: string
          client_idempotency_key: string
          created_at: string
          deleted_at: string | null
          id: string
          post_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          client_idempotency_key: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          client_idempotency_key?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_post_likes: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_post_likes_post_id_fkey"
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
      feed_post_media: {
        Row: {
          alt_text: Json
          created_at: string
          id: string
          media_type: string
          media_url: string | null
          metadata: Json
          post_id: string
          sort_order: number
          source_label: string | null
          source_url: string | null
          storage_path: string | null
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          alt_text?: Json
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string | null
          metadata?: Json
          post_id: string
          sort_order?: number
          source_label?: string | null
          source_url?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          alt_text?: Json
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          metadata?: Json
          post_id?: string
          sort_order?: number
          source_label?: string | null
          source_url?: string | null
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_post_media_post_id_fkey"
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
      feed_post_translations: {
        Row: {
          author_name: string
          body: string
          created_at: string
          id: string
          locale: string
          post_id: string
          updated_at: string
        }
        Insert: {
          author_name: string
          body: string
          created_at?: string
          id?: string
          locale: string
          post_id: string
          updated_at?: string
        }
        Update: {
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          locale?: string
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_post_translations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_posts: {
        Row: {
          author_label: string | null
          author_user_id: string | null
          body: string | null
          created_at: string
          deleted_at: string | null
          id: string
          post_type: string
          published_at: string | null
          repost_of_post_id: string | null
          snapshot_id: string | null
          source_key: string | null
          status: string
          system_verified: boolean
          updated_at: string
          visibility: string
        }
        Insert: {
          author_label?: string | null
          author_user_id?: string | null
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_type?: string
          published_at?: string | null
          repost_of_post_id?: string | null
          snapshot_id?: string | null
          source_key?: string | null
          status?: string
          system_verified?: boolean
          updated_at?: string
          visibility?: string
        }
        Update: {
          author_label?: string | null
          author_user_id?: string | null
          body?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_type?: string
          published_at?: string | null
          repost_of_post_id?: string | null
          snapshot_id?: string | null
          source_key?: string | null
          status?: string
          system_verified?: boolean
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
          {
            foreignKeyName: "feed_posts_repost_of_post_id_fkey"
            columns: ["repost_of_post_id"]
            isOneToOne: false
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_project_review_metadata: {
        Row: {
          attitude: string
          challenge_reward_amount: number
          created_at: string
          feedback_submission_id: string
          mission_rating: number
          most_useful_area: string
          overall_rating: number
          post_id: string
          updated_at: string
        }
        Insert: {
          attitude: string
          challenge_reward_amount?: number
          created_at?: string
          feedback_submission_id: string
          mission_rating: number
          most_useful_area: string
          overall_rating: number
          post_id: string
          updated_at?: string
        }
        Update: {
          attitude?: string
          challenge_reward_amount?: number
          created_at?: string
          feedback_submission_id?: string
          mission_rating?: number
          most_useful_area?: string
          overall_rating?: number
          post_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_project_review_metadata_feedback_submission_id_fkey"
            columns: ["feedback_submission_id"]
            isOneToOne: true
            referencedRelation: "challenge_feedback_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_project_review_metadata_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      feed_system_accounts: {
        Row: {
          account_key: string
          avatar_url: string | null
          bio: Json
          created_at: string
          display_name: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          account_key: string
          avatar_url?: string | null
          bio?: Json
          created_at?: string
          display_name: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          account_key?: string
          avatar_url?: string | null
          bio?: Json
          created_at?: string
          display_name?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      feed_system_story_metadata: {
        Row: {
          created_at: string
          evidence_status: string
          next_story_key: string | null
          post_id: string
          series_key: string
          series_order: number
          story_kind: string
          system_account_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_status: string
          next_story_key?: string | null
          post_id: string
          series_key: string
          series_order: number
          story_kind: string
          system_account_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_status?: string
          next_story_key?: string | null
          post_id?: string
          series_key?: string
          series_order?: number
          story_kind?: string
          system_account_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feed_system_story_metadata_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: true
            referencedRelation: "feed_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feed_system_story_metadata_system_account_key_fkey"
            columns: ["system_account_key"]
            isOneToOne: false
            referencedRelation: "feed_system_accounts"
            referencedColumns: ["account_key"]
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
      marketplace_deal_events: {
        Row: {
          actor_user_id: string
          created_at: string
          deal_id: string
          event_type: string
          id: string
          metadata: Json
        }
        Insert: {
          actor_user_id: string
          created_at?: string
          deal_id: string
          event_type: string
          id?: string
          metadata?: Json
        }
        Update: {
          actor_user_id?: string
          created_at?: string
          deal_id?: string
          event_type?: string
          id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_deal_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "marketplace_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_deals: {
        Row: {
          artifact_id: string
          buyer_accepted_at: string | null
          buyer_accepted_terms_hash: string | null
          buyer_user_id: string
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          currency_code: string
          escrow_held_at: string | null
          expires_at: string | null
          id: string
          listing_id: string
          metadata: Json
          price_amount: number
          seller_accepted_at: string | null
          seller_accepted_terms_hash: string | null
          seller_user_id: string
          status: string
          terms_hash: string
          terms_json: Json
          updated_at: string
        }
        Insert: {
          artifact_id: string
          buyer_accepted_at?: string | null
          buyer_accepted_terms_hash?: string | null
          buyer_user_id: string
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency_code?: string
          escrow_held_at?: string | null
          expires_at?: string | null
          id?: string
          listing_id: string
          metadata?: Json
          price_amount: number
          seller_accepted_at?: string | null
          seller_accepted_terms_hash?: string | null
          seller_user_id: string
          status?: string
          terms_hash: string
          terms_json?: Json
          updated_at?: string
        }
        Update: {
          artifact_id?: string
          buyer_accepted_at?: string | null
          buyer_accepted_terms_hash?: string | null
          buyer_user_id?: string
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          currency_code?: string
          escrow_held_at?: string | null
          expires_at?: string | null
          id?: string
          listing_id?: string
          metadata?: Json
          price_amount?: number
          seller_accepted_at?: string | null
          seller_accepted_terms_hash?: string | null
          seller_user_id?: string
          status?: string
          terms_hash?: string
          terms_json?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_deals_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "user_artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_deals_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
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
          rating_count: number
          rating_sum: number
          review_count: number
          sales_count: number
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
          rating_count?: number
          rating_sum?: number
          review_count?: number
          sales_count?: number
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
          rating_count?: number
          rating_sum?: number
          review_count?: number
          sales_count?: number
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
      product_events: {
        Row: {
          anonymous_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          event_name: string
          id: string
          occurred_at: string
          properties: Json
          source: string
          user_id: string | null
        }
        Insert: {
          anonymous_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name: string
          id?: string
          occurred_at?: string
          properties?: Json
          source?: string
          user_id?: string | null
        }
        Update: {
          anonymous_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          event_name?: string
          id?: string
          occurred_at?: string
          properties?: Json
          source?: string
          user_id?: string | null
        }
        Relationships: []
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
      project_applications: {
        Row: {
          applied_at: string
          id: string
          message: string | null
          project_id: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          id?: string
          message?: string | null
          project_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string
          id?: string
          message?: string | null
          project_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_applications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          created_at: string
          description: Json
          difficulty_level: number
          id: string
          is_active: boolean
          project_id: string
          reward_label: Json
          sort_order: number
          title: Json
          verification_type: string
        }
        Insert: {
          created_at?: string
          description?: Json
          difficulty_level?: number
          id?: string
          is_active?: boolean
          project_id: string
          reward_label?: Json
          sort_order?: number
          title?: Json
          verification_type?: string
        }
        Update: {
          created_at?: string
          description?: Json
          difficulty_level?: number
          id?: string
          is_active?: boolean
          project_id?: string
          reward_label?: Json
          sort_order?: number
          title?: Json
          verification_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          category: string
          created_at: string
          current_participants: number
          deadline: string | null
          description: Json
          id: string
          image_url: string | null
          instructions: Json
          is_active: boolean
          level: number
          max_participants: number
          owner_id: string | null
          owner_name: string
          priority: number
          requirements: Json
          title: Json
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          current_participants?: number
          deadline?: string | null
          description?: Json
          id?: string
          image_url?: string | null
          instructions?: Json
          is_active?: boolean
          level?: number
          max_participants?: number
          owner_id?: string | null
          owner_name?: string
          priority?: number
          requirements?: Json
          title?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          current_participants?: number
          deadline?: string | null
          description?: Json
          id?: string
          image_url?: string | null
          instructions?: Json
          is_active?: boolean
          level?: number
          max_participants?: number
          owner_id?: string | null
          owner_name?: string
          priority?: number
          requirements?: Json
          title?: Json
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          enabled: boolean
          endpoint: string
          id: string
          last_success_at: string | null
          owner_key: string
          p256dh: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          enabled?: boolean
          endpoint: string
          id?: string
          last_success_at?: string | null
          owner_key: string
          p256dh: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          enabled?: boolean
          endpoint?: string
          id?: string
          last_success_at?: string | null
          owner_key?: string
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
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
      reminder_jobs: {
        Row: {
          attempts: number
          client_reminder_id: string
          created_at: string
          deep_link: string
          due_at: string
          id: string
          kind: string
          last_error: string | null
          local_time: string | null
          locale: string
          recurring: boolean
          status: string
          subscription_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          client_reminder_id: string
          created_at?: string
          deep_link?: string
          due_at: string
          id?: string
          kind: string
          last_error?: string | null
          local_time?: string | null
          locale?: string
          recurring?: boolean
          status?: string
          subscription_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          client_reminder_id?: string
          created_at?: string
          deep_link?: string
          due_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          local_time?: string | null
          locale?: string
          recurring?: boolean
          status?: string
          subscription_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_jobs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "push_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      team_assignment_queue: {
        Row: {
          attempt_count: number
          created_at: string
          last_attempt_at: string | null
          member_user_id: string
          reason: string
          referrer_user_id: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          created_at?: string
          last_attempt_at?: string | null
          member_user_id: string
          reason?: string
          referrer_user_id?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          created_at?: string
          last_attempt_at?: string | null
          member_user_id?: string
          reason?: string
          referrer_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
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
      team_leadership: {
        Row: {
          bonus_points: number
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bonus_points?: number
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bonus_points?: number
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      team_membership_events: {
        Row: {
          assignment_source: string
          created_at: string
          event_type: string
          id: string
          member_user_id: string
          metadata: Json
          new_leader_user_id: string | null
          previous_leader_user_id: string | null
          reason: string | null
        }
        Insert: {
          assignment_source: string
          created_at?: string
          event_type: string
          id?: string
          member_user_id: string
          metadata?: Json
          new_leader_user_id?: string | null
          previous_leader_user_id?: string | null
          reason?: string | null
        }
        Update: {
          assignment_source?: string
          created_at?: string
          event_type?: string
          id?: string
          member_user_id?: string
          metadata?: Json
          new_leader_user_id?: string | null
          previous_leader_user_id?: string | null
          reason?: string | null
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
      today_progress_events: {
        Row: {
          amount_core: number
          created_at: string
          id: string
          source_id: string
          source_type: string
          today_instance_id: string
        }
        Insert: {
          amount_core: number
          created_at?: string
          id?: string
          source_id: string
          source_type: string
          today_instance_id: string
        }
        Update: {
          amount_core?: number
          created_at?: string
          id?: string
          source_id?: string
          source_type?: string
          today_instance_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "today_progress_events_today_instance_id_fkey"
            columns: ["today_instance_id"]
            isOneToOne: false
            referencedRelation: "user_today_instances"
            referencedColumns: ["id"]
          },
        ]
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
      user_core_growth_plans: {
        Row: {
          calculated_days_to_goal: number | null
          created_at: string
          daily_additions: number
          id: string
          is_active: boolean
          metadata: Json
          reinvest_percent: number
          start_core: number
          target_type: string
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calculated_days_to_goal?: number | null
          created_at?: string
          daily_additions?: number
          id?: string
          is_active?: boolean
          metadata?: Json
          reinvest_percent?: number
          start_core?: number
          target_type?: string
          target_value: number
          updated_at?: string
          user_id: string
        }
        Update: {
          calculated_days_to_goal?: number | null
          created_at?: string
          daily_additions?: number
          id?: string
          is_active?: boolean
          metadata?: Json
          reinvest_percent?: number
          start_core?: number
          target_type?: string
          target_value?: number
          updated_at?: string
          user_id?: string
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
          avatar_position: string
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
          avatar_position?: string
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
          avatar_position?: string
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
      user_today_instances: {
        Row: {
          completed_at: string | null
          core_growth_plan_id: string | null
          created_at: string
          first_seen_at: string
          id: string
          info_seen_at: string | null
          local_date: string
          progress_core: number
          status: string
          target_core: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          core_growth_plan_id?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          info_seen_at?: string | null
          local_date: string
          progress_core?: number
          status?: string
          target_core?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          core_growth_plan_id?: string | null
          created_at?: string
          first_seen_at?: string
          id?: string
          info_seen_at?: string | null
          local_date?: string
          progress_core?: number
          status?: string
          target_core?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_today_instances_core_growth_plan_id_fkey"
            columns: ["core_growth_plan_id"]
            isOneToOne: false
            referencedRelation: "user_core_growth_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_today_items: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          item_key: string
          sort_order: number
          source_id: string | null
          source_type: string
          status: string
          title: Json
          today_instance_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          item_key: string
          sort_order?: number
          source_id?: string | null
          source_type?: string
          status?: string
          title?: Json
          today_instance_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          item_key?: string
          sort_order?: number
          source_id?: string | null
          source_type?: string
          status?: string
          title?: Json
          today_instance_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_today_items_today_instance_id_fkey"
            columns: ["today_instance_id"]
            isOneToOne: false
            referencedRelation: "user_today_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      ton_chain_cursors: {
        Row: {
          deposit_address: string
          last_logical_time: string
          last_transaction_hash: string | null
          network: string
          updated_at: string
        }
        Insert: {
          deposit_address: string
          last_logical_time?: string
          last_transaction_hash?: string | null
          network: string
          updated_at?: string
        }
        Update: {
          deposit_address?: string
          last_logical_time?: string
          last_transaction_hash?: string | null
          network?: string
          updated_at?: string
        }
        Relationships: []
      }
      ton_chain_events: {
        Row: {
          amount_nano: string
          asset_code: string
          comment: string | null
          created_at: string
          finalized_at: string | null
          id: string
          invoice_code: string | null
          logical_time: string
          message_index: number
          network: string
          rate_metadata: Json
          rate_provider: string | null
          rate_source_timestamp: string | null
          raw_transaction: Json
          rejection_reason: string | null
          receiver_address: string
          sender_address: string | null
          settled_at: string | null
          settled_usd_amount: string | null
          settlement_ledger_id: string | null
          settlement_user_id: string | null
          status: string
          ton_usd_rate: string | null
          transaction_hash: string
          updated_at: string
        }
        Insert: {
          amount_nano: string
          asset_code?: string
          comment?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          invoice_code?: string | null
          logical_time: string
          message_index?: number
          network: string
          rate_metadata?: Json
          rate_provider?: string | null
          rate_source_timestamp?: string | null
          raw_transaction?: Json
          rejection_reason?: string | null
          receiver_address: string
          sender_address?: string | null
          settled_at?: string | null
          settled_usd_amount?: string | null
          settlement_ledger_id?: string | null
          settlement_user_id?: string | null
          status?: string
          ton_usd_rate?: string | null
          transaction_hash: string
          updated_at?: string
        }
        Update: {
          amount_nano?: string
          asset_code?: string
          comment?: string | null
          created_at?: string
          finalized_at?: string | null
          id?: string
          invoice_code?: string | null
          logical_time?: string
          message_index?: number
          network?: string
          rate_metadata?: Json
          rate_provider?: string | null
          rate_source_timestamp?: string | null
          raw_transaction?: Json
          rejection_reason?: string | null
          receiver_address?: string
          sender_address?: string | null
          settled_at?: string | null
          settled_usd_amount?: string | null
          settlement_ledger_id?: string | null
          settlement_user_id?: string | null
          status?: string
          ton_usd_rate?: string | null
          transaction_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      ton_deposit_config: {
        Row: {
          asset_code: string
          created_at: string
          deposit_address: string
          enabled: boolean
          id: string
          network: string
          toncenter_api_url: string
          updated_at: string
        }
        Insert: {
          asset_code?: string
          created_at?: string
          deposit_address: string
          enabled?: boolean
          id?: string
          network: string
          toncenter_api_url: string
          updated_at?: string
        }
        Update: {
          asset_code?: string
          created_at?: string
          deposit_address?: string
          enabled?: boolean
          id?: string
          network?: string
          toncenter_api_url?: string
          updated_at?: string
        }
        Relationships: []
      }
      ton_deposit_invoices: {
        Row: {
          asset_code: string
          created_at: string
          deposit_address: string
          expected_amount_nano: string | null
          expires_at: string
          id: string
          invoice_code: string
          network: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_code?: string
          created_at?: string
          deposit_address: string
          expected_amount_nano?: string | null
          expires_at: string
          id?: string
          invoice_code: string
          network: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_code?: string
          created_at?: string
          deposit_address?: string
          expected_amount_nano?: string | null
          expires_at?: string
          id?: string
          invoice_code?: string
          network?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ton_chain_scan_leases: {
        Row: {
          deposit_address: string
          lease_until: string
          network: string
          run_id: string
          updated_at: string
        }
        Insert: {
          deposit_address: string
          lease_until: string
          network: string
          run_id: string
          updated_at?: string
        }
        Update: {
          deposit_address?: string
          lease_until?: string
          network?: string
          run_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ton_deposit_settlement_retries: {
        Row: {
          attempt_count: number
          chain_event_id: string
          completed_at: string | null
          created_at: string
          error_code: string | null
          error_message: string | null
          invoice_id: string | null
          locked_at: string | null
          max_attempts: number
          next_attempt_at: string
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          chain_event_id: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          invoice_id?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          chain_event_id?: string
          completed_at?: string | null
          created_at?: string
          error_code?: string | null
          error_message?: string | null
          invoice_id?: string | null
          locked_at?: string | null
          max_attempts?: number
          next_attempt_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ton_deposit_settlement_retries_chain_event_id_fkey"
            columns: ["chain_event_id"]
            isOneToOne: true
            referencedRelation: "ton_chain_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ton_deposit_settlement_retries_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "ton_deposit_invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      ton_price_quotes: {
        Row: {
          asset_code: string
          captured_at: string
          id: string
          network: string
          provider: string
          source_timestamp: string | null
          usd_rate: string
        }
        Insert: {
          asset_code?: string
          captured_at?: string
          id?: string
          network: string
          provider: string
          source_timestamp?: string | null
          usd_rate: string
        }
        Update: {
          asset_code?: string
          captured_at?: string
          id?: string
          network?: string
          provider?: string
          source_timestamp?: string | null
          usd_rate?: string
        }
        Relationships: []
      }
      ton_user_wallets: {
        Row: {
          asset_code: string
          first_seen_at: string
          id: string
          metadata: Json
          network: string
          normalized_address: string
          user_id: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          asset_code?: string
          first_seen_at?: string
          id?: string
          metadata?: Json
          network: string
          normalized_address: string
          user_id: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          asset_code?: string
          first_seen_at?: string
          id?: string
          metadata?: Json
          network?: string
          normalized_address?: string
          user_id?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      ton_withdrawals: {
        Row: {
          amount_nano: string
          amount_ton: string
          asset_code: string
          broadcast_at: string | null
          confirmed_at: string | null
          created_at: string
          destination_address: string
          error_code: string | null
          error_message: string | null
          id: string
          idempotency_key: string
          message_hash: string | null
          network: string
          network_fee_estimate_ton: string
          network_fee_reserve_amount: string
          network_fee_reserve_ton: string
          normalized_destination_address: string
          payout_wallet_amount: string
          rate_provider: string
          rate_source_timestamp: string | null
          refunded_at: string | null
          seqno: number | null
          service_fee_amount: string
          service_fee_percent: string
          source_address: string | null
          status: string
          ton_usd_rate: string
          total_reserved_amount: string
          transaction_hash: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount_nano: string
          amount_ton: string
          asset_code?: string
          broadcast_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          destination_address: string
          error_code?: string | null
          error_message?: string | null
          id: string
          idempotency_key: string
          message_hash?: string | null
          network: string
          network_fee_estimate_ton: string
          network_fee_reserve_amount: string
          network_fee_reserve_ton: string
          normalized_destination_address: string
          payout_wallet_amount: string
          rate_provider: string
          rate_source_timestamp?: string | null
          refunded_at?: string | null
          seqno?: number | null
          service_fee_amount: string
          service_fee_percent: string
          source_address?: string | null
          status?: string
          ton_usd_rate: string
          total_reserved_amount: string
          transaction_hash?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount_nano?: string
          amount_ton?: string
          asset_code?: string
          broadcast_at?: string | null
          confirmed_at?: string | null
          created_at?: string
          destination_address?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string
          message_hash?: string | null
          network?: string
          network_fee_estimate_ton?: string
          network_fee_reserve_amount?: string
          network_fee_reserve_ton?: string
          normalized_destination_address?: string
          payout_wallet_amount?: string
          rate_provider?: string
          rate_source_timestamp?: string | null
          refunded_at?: string | null
          seqno?: number | null
          service_fee_amount?: string
          service_fee_percent?: string
          source_address?: string | null
          status?: string
          ton_usd_rate?: string
          total_reserved_amount?: string
          transaction_hash?: string | null
          updated_at?: string
          user_id?: string
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
      accept_marketplace_deal: {
        Args: { p_actor_user_id: string; p_deal_id: string }
        Returns: Json
      }
      assign_team_member: {
        Args: {
          p_allow_transition?: boolean
          p_member_user_id: string
          p_reason?: string
          p_referrer_user_id?: string
        }
        Returns: {
          assigned_leader_user_id: string
          assignment_source: string
          assignment_status: string
          queue_reason: string
        }[]
      }
      calculate_core_level: { Args: { core_balance: number }; Returns: number }
      begin_ton_withdrawal_broadcast: {
        Args: { p_withdrawal_id: string }
        Returns: {
          claimed: boolean
          withdrawal_status: string
        }[]
      }
      claim_ton_chain_scan: {
        Args: { p_deposit_address: string; p_network: string }
        Returns: string | null
      }
      claim_ton_deposit_settlement_retries: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          chain_event_id: string
        }[]
      }
      complete_ton_deposit_settlement_retry: {
        Args: { p_chain_event_id: string }
        Returns: undefined
      }
      enqueue_ton_deposit_settlement_retry: {
        Args: { p_chain_event_id: string }
        Returns: undefined
      }
      fail_ton_deposit_settlement_retry: {
        Args: {
          p_chain_event_id: string
          p_error_code: string
          p_error_message: string
        }
        Returns: undefined
      }
      can_be_team_leader: {
        Args: { p_leader_user_id: string; p_member_user_id: string }
        Returns: boolean
      }
      cancel_marketplace_deal: {
        Args: { p_actor_user_id: string; p_deal_id: string }
        Returns: Json
      }
      claim_due_reminder_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          client_reminder_id: string
          created_at: string
          deep_link: string
          due_at: string
          id: string
          kind: string
          last_error: string | null
          local_time: string | null
          locale: string
          recurring: boolean
          status: string
          subscription_id: string
          timezone: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "reminder_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_referral_and_assign_team: {
        Args: {
          p_captured_at?: string
          p_guest_id?: string
          p_member_user_id: string
          p_referral_code?: string
        }
        Returns: {
          assigned_leader_user_id: string
          assignment_source: string
          assignment_status: string
          queue_reason: string
        }[]
      }
      complete_marketplace_deal: {
        Args: { p_actor_user_id: string; p_deal_id: string }
        Returns: Json
      }
      complete_reminder_job: {
        Args: { p_error?: string; p_job_id: string; p_success: boolean }
        Returns: undefined
      }
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
      create_marketplace_deal: {
        Args: { p_buyer_user_id: string; p_listing_id: string }
        Returns: Json
      }
      create_or_reuse_ton_deposit_invoice: {
        Args: {
          p_asset_code: string
          p_deposit_address: string
          p_expected_amount_nano: string | null
          p_expires_at: string
          p_invoice_code: string
          p_network: string
          p_replace_active?: boolean
          p_user_id: string
        }
        Returns: {
          asset_code: string
          created_at: string
          deposit_address: string
          expected_amount_nano: string | null
          expires_at: string
          id: string
          invoice_code: string
          network: string
          reused: boolean
          status: string
          updated_at: string
          user_id: string
        }[]
      }
      create_verified_challenge_post: {
        Args: {
          p_challenge_category: string
          p_challenge_id: string
          p_challenge_title: Json
          p_user_id: string
          p_verification_type: string
        }
        Returns: Json
      }
      find_team_leader: {
        Args: {
          p_excluded_leader_user_id?: string
          p_member_user_id: string
          p_prefer_referrer?: boolean
          p_referrer_user_id?: string
        }
        Returns: {
          assignment_source: string
          leader_user_id: string
        }[]
      }
      get_project_review_summary: {
        Args: never
        Returns: {
          average_rating: number
          review_count: number
          star_1_count: number
          star_2_count: number
          star_3_count: number
          star_4_count: number
          star_5_count: number
        }[]
      }
      invoke_reflection_reminder_dispatch: { Args: never; Returns: undefined }
      invoke_reminder_dispatch: { Args: never; Returns: undefined }
      complete_ton_withdrawal_broadcast: {
        Args: {
          p_message_hash: string
          p_seqno: number
          p_source_address: string
          p_withdrawal_id: string
        }
        Returns: undefined
      }
      mark_ton_deposit_rejected: {
        Args: { p_chain_event_id: string; p_reason: string }
        Returns: undefined
      }
      mark_ton_withdrawal_manual_review: {
        Args: { p_error_code: string; p_error_message: string; p_withdrawal_id: string }
        Returns: undefined
      }
      preview_team_distribution: {
        Args: { p_limit?: number }
        Returns: {
          assignment_source: string
          member_level: number
          member_user_id: string
          proposed_leader_user_id: string
          reason: string
          referrer_user_id: string
        }[]
      }
      process_team_assignment_queue: {
        Args: { p_limit?: number }
        Returns: {
          assigned_count: number
          processed_count: number
          queued_count: number
        }[]
      }
      reconcile_team_distribution: {
        Args: { p_limit?: number }
        Returns: {
          assigned_count: number
          processed_count: number
          queued_count: number
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
      configure_ton_deposit_scanner: {
        Args: {
          p_project_url: string
          p_scanner_secret: string
        }
        Returns: undefined
      }
      dispatch_ton_deposit_scan: {
        Args: Record<PropertyKey, never>
        Returns: number | null
      }
      dispatch_ton_deposit_settlement: {
        Args: Record<PropertyKey, never>
        Returns: number | null
      }
      release_ton_chain_scan: {
        Args: { p_run_id: string }
        Returns: undefined
      }
      run_ton_deposit_pipeline: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      refund_ton_withdrawal: {
        Args: { p_error_code: string; p_error_message: string; p_withdrawal_id: string }
        Returns: undefined
      }
      reserve_ton_withdrawal: {
        Args: {
          p_amount_nano: string
          p_amount_ton: string
          p_destination_address: string
          p_idempotency_key: string
          p_network: string
          p_network_fee_estimate_ton: string
          p_network_fee_reserve_amount: string
          p_network_fee_reserve_ton: string
          p_normalized_destination_address: string
          p_payout_wallet_amount: string
          p_rate_provider: string
          p_rate_source_timestamp: string | null
          p_service_fee_amount: string
          p_service_fee_percent: string
          p_ton_usd_rate: string
          p_total_reserved_amount: string
          p_user_id: string
          p_withdrawal_id: string
        }
        Returns: {
          is_new: boolean
          total_reserved_amount: string
          wallet_balance: string
          withdrawal_id: string
          withdrawal_status: string
        }[]
      }
      schedule_ton_deposit_pipeline: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      settle_ton_deposit: {
        Args: { p_chain_event_id: string }
        Returns: {
          credited_user_id: string | null
          event_status: string
          ledger_id: string | null
          usd_amount: number
          wallet_balance: number | null
        }[]
      }
      ton_deposit_scanner_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          active: boolean
          active_scanner_leases: number
          job_id: number | null
          pending_settlements: number
          project_url_configured: boolean
          scanner_secret_configured: boolean
          schedule: string | null
        }[]
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
      submit_app_testing_feedback: {
        Args: {
          p_answers: Json
          p_attitude: string
          p_challenge_id: string
          p_consent_version: string
          p_context: Json
          p_daily_use_intent: string
          p_install_outcome: string
          p_main_concern: string
          p_main_difficulty: string
          p_mission_rating: number
          p_most_useful_area: string
          p_overall_rating: number
          p_platform: string
          p_private_comment: string
          p_public_review: string
          p_schema_version: number
          p_strongest_area: string
          p_user_id: string
        }
        Returns: {
          challenge_status: string
          core_balance: number
          feed_post_id: string
          reward_claimed: boolean
          rewarded_amount: number
          submission_id: string
        }[]
      }
      sync_team_contacts_for_member: {
        Args: { p_member_user_id: string }
        Returns: undefined
      }
      team_assignment_would_create_cycle: {
        Args: { p_leader_user_id: string; p_member_user_id: string }
        Returns: boolean
      }
      team_leader_level_rank: {
        Args: { p_leader_level: number; p_member_level: number }
        Returns: number
      }
      team_leadership_snapshot: {
        Args: { p_user_id: string }
        Returns: {
          base_points: number
          bonus_points: number
          free_points: number
          overcommitted: boolean
          total_points: number
          used_points: number
        }[]
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
