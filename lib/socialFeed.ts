import type { Json } from "@/lib/database.types";

export type FeedAuthor = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_position?: string;
  level: number;
  created_at: string;
};

export type FeedWish = {
  id: string;
  owner_user_id: string;
  title: string;
  description: string;
  category: string | null;
  image_url: string | null;
  target_amount: number | null;
  target_currency: string;
  difficulty_level: number;
  status: string;
  visibility: string;
  cloned_from_wish_id: string | null;
  original_wish_id: string | null;
  copied_count: number;
  completed_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  viewer_has_copy: boolean;
};

export type FeedStatBlock = {
  id: string;
  post_id: string;
  snapshot_id: string;
  block_key: string;
  label: string;
  value: unknown;
  visibility: string;
  sort_order: number;
};

export type FeedExternalLink = {
  id: string;
  post_id: string;
  provider: string;
  external_url: string;
  external_post_id: string | null;
  author_handle: string | null;
  title: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  embed_status: string;
  relation: string;
  created_at: string;
  updated_at: string;
};

export type FeedMedia = {
  id: string;
  post_id: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  storage_path?: string | null;
  alt_text: unknown;
  source_url: string | null;
  source_label: string | null;
  sort_order: number;
  metadata: unknown;
  created_at: string;
  updated_at: string;
};

export type FeedSystemAccount = {
  account_key: string;
  avatar_url: string | null;
  bio: unknown;
  display_name: string;
  is_active: boolean;
};

export type FeedSystemStory = {
  post_id: string;
  system_account_key: string;
  series_key: string;
  series_order: number;
  story_kind: string;
  evidence_status: string;
  next_story_key: string | null;
  account: FeedSystemAccount | null;
};

export type FeedAbundanceStory = FeedSystemStory;

export type FeedProjectReview = {
  post_id: string;
  feedback_submission_id: string;
  overall_rating: number;
  mission_rating: number;
  attitude: string;
  most_useful_area: string;
  challenge_reward_amount: number;
  created_at: string;
  updated_at: string;
};

export type FeedReviewSummary = {
  average: number;
  count: number;
  distribution: Record<string, number>;
};

export type FeedVerifiedChallenge = {
  snapshot_id: string;
  challenge_id: string;
  challenge_title: Json;
  challenge_category: string | null;
  verification_type: string | null;
  completed_at: string;
};

export type FeedPost = {
  id: string;
  author_user_id: string | null;
  author_label: string | null;
  authorName: string | null;
  source_key: string | null;
  snapshot_id: string | null;
  system_verified?: boolean;
  post_type: "daily_progress" | "level_up" | "manual" | "external_link" | "wish" | "wish_completed" | "reality_demo" | "abundance_story" | "challenge" | "project_review" | string;
  status: "draft" | "published" | "archived";
  visibility: string;
  body: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  deleted_at: string | null;
  author: FeedAuthor | null;
  statBlocks: FeedStatBlock[];
  externalLinks: FeedExternalLink[];
  media: FeedMedia[];
  wish: FeedWish | null;
  projectReview: FeedProjectReview | null;
  systemStory: FeedSystemStory | null;
  verifiedChallenge?: FeedVerifiedChallenge | null;
};

export type FeedPayload = {
  scope: "feed" | "blog" | "system";
  category?: "all" | "stories" | "system" | "reviews";
  postType?: "project_review" | null;
  author: FeedAuthor | null;
  systemAccount: FeedSystemAccount | null;
  posts: FeedPost[];
  nextCursor?: string | null;
  reviewSummary?: FeedReviewSummary | null;
  error?: string;
};
