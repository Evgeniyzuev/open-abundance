import { type UserProfile } from "@/components/UserProvider";
import type { FeedWish as PublicWish } from "@/lib/socialFeed";
import { type ProfileVisibility, type ProfileVisibilitySettings } from "@/lib/socialProfile";

export type SocialTab = "feed" | "people" | "blog" | "profile" | "teams";
export type SocialTabChange = (tab: SocialTab) => void;
export type ReferralLink = { code: string; url: string };
export type TeamTask = {
  id: string;
  leader_user_id: string;
  member_user_id: string;
  challenge_id: string | null;
  task_kind: "manual" | "challenge";
  title: string;
  description: string;
  goal_context: string | null;
  expected_result: string | null;
  first_step: string | null;
  estimated_minutes: number | null;
  verification_criteria: string | null;
  due_at: string | null;
  leader_review_due_at: string | null;
  status: "proposed" | "accepted" | "submitted" | "completed" | "returned" | "declined" | "cancelled";
  submission: string | null;
  review_feedback: string | null;
  reviewed_at: string | null;
  reviewer_user_id: string | null;
  newcomer_eligible: boolean;
  version: number;
  accepted_at: string | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  help_requests: TeamTaskHelpRequest[];
  revisions: TeamTaskRevision[];
};
export type TeamTaskHelpRequest = {
  id: string;
  task_id: string;
  requester_user_id: string;
  reason: "blocked" | "clarification" | "feedback" | "other";
  comment: string;
  status: "open" | "resolved";
  resolved_by_user_id: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};
export type TeamTaskRevision = {
  id: string;
  task_id: string;
  proposer_user_id: string;
  base_version: number;
  changes: Record<string, unknown>;
  status: "open" | "accepted" | "declined" | "superseded";
  response_user_id: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};
export type TeamChallengeOption = { id: string; title: Record<string, string>; verification_logic?: string | null };
export type TeamProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_position?: string;
  level: number;
  created_at: string;
};
export type TeamContext = {
  membership: {
    member_user_id: string;
    leader_user_id: string | null;
    assigned_at: string;
    is_active: boolean;
  } | null;
  leader: { type: "system"; profile: null } | { type: "user"; profile: TeamProfile | null };
  directMembers: Array<{ userId: string; assignedAt: string; profile: TeamProfile | null; leadershipCost: number }>;
  assignment: {
    status: "assigned" | "queued" | "system" | "missing";
    reason: string | null;
    attemptCount: number;
    queuedAt: string | null;
    lastAttemptAt: string | null;
  };
  leadership: {
    base_points: number;
    bonus_points: number;
    total_points: number;
    used_points: number;
    free_points: number;
    overcommitted: boolean;
  };
  taskCounts?: {
    memberOpen: number;
    memberSubmitted: number;
    leaderReview: number;
    leaderOpen: number;
    total: number;
  };
  nextAction?: string;
  leaderPath?: {
    firstResultCompleted: boolean;
    inviteUnlocked: boolean;
    referralRegistered: boolean;
    newcomerHelpCompleted: boolean;
    next: "publish_result" | "invite_participant" | "help_newcomer" | "complete";
  } | null;
  referralQuality?: { registered: number; activated: number; retainedD7: number };
  error?: string;
};
export type TeamRewardDay = {
  bonus_date: string;
  reward_amount: number;
  wallet_amount?: number;
  core_amount?: number;
  source_count: number;
  created_at: string;
};
export type CoreNotificationRow = {
  accrual_date: string;
  core_amount: number;
  wallet_amount: number;
  created_at: string;
};
export type PayoutNotification = {
  id: string;
  title: string;
  body: string;
  readAt?: string | null;
  createdAt?: string;
  deep_link?: string;
};
export type ProfileLinkRow = {
  id: string;
  user_id: string;
  link_type: string;
  label: string | null;
  url: string;
  visibility: string;
  sort_order: number;
};
export type ContactRow = {
  owner_user_id: string;
  contact_user_id: string;
  source: string;
  status: string;
  is_required: boolean;
  profile: TeamProfile | null;
};
export type TrustConfirmationType = "help_given" | "help_received" | "deal_completed" | "challenge_confirmed" | "proof_added" | "contact_confirmed";
export type TrustConfirmationStatus = "pending" | "confirmed" | "declined" | "expired";
export type TrustConfirmationRow = {
  id: string;
  requester_user_id: string;
  counterparty_user_id: string;
  confirmation_type: TrustConfirmationType;
  source_type: string;
  source_id: string | null;
  message: string | null;
  status: TrustConfirmationStatus;
  trust_event_id: string | null;
  expires_at: string;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};
export type TrustConfirmationsPayload = {
  confirmations: TrustConfirmationRow[];
  profiles?: TeamProfile[];
  trustUnavailable?: boolean;
  error?: string;
};
export type SocialProfilePayload = {
  profile: UserProfile | null;
  visibilitySettings: ProfileVisibilitySettings;
  links: ProfileLinkRow[];
  error?: string;
};
export type PublicProfilePayload = {
  profile: {
    user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
    avatar_position?: string;
    level: number;
    bio: string | null;
    created_at: string;
  };
  links: ProfileLinkRow[];
  publicWishes: PublicWish[];
  relation: { isSelf: boolean; isContact: boolean; isTeam: boolean; isFollower: boolean };
  visibleBlocks: Record<string, boolean>;
  error?: string;
};
export type ReviewEditPayload = {
  body: string;
  overallRating: number;
  missionRating: number;
  attitude: string;
  mostUsefulArea: string;
};
export type PeopleFilter = "nearby" | "team" | "referrals" | "same_level" | "active";
export type PeopleRow = {
  profile: TeamProfile & { bio: string | null };
  headline: string | null;
  relation: { isSelf: boolean; isContact: boolean; isTeam: boolean; isReferral: boolean };
  publicStats: {
    level: number;
    trust: { confirmed: number; helped: number; deals: number; recent: number; label: "new" | "confirmed" | "trusted" };
    team: { strength: number; members: number };
    influence: { label: "new" | "active" | "creator"; publicPosts: number; referrals: number };
  };
  lastPublicActivityAt: string | null;
};
export type PeoplePayload = {
  people: PeopleRow[];
  filter: PeopleFilter | "search";
  query: string;
  error?: string;
};
export type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  content_post_id?: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
export type DirectConversationPayload = {
  targetProfile: TeamProfile;
  conversation: {
    id: string;
    conversation_key: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  messages: DirectMessage[];
  error?: string;
};
export type ProfileEditorState = {
  displayName: string;
  bio: string;
  linkLabel: string;
  linkUrl: string;
  linkVisibility: ProfileVisibility;
  visibilitySettings: ProfileVisibilitySettings;
  avatarUrl: string;
  avatarPosition: string;
  avatarRemoved: boolean;
};

export type ProfileAction = "edit" | "settings" | "skills" | "activity" | null;
export type PeopleSection = "discover" | "contacts" | "confirmations";
