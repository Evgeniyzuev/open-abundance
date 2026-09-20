"use client";

import { ArrowLeft, ArrowRight, Bell, BookOpen, Check, ChevronDown, ChevronUp, Copy, Edit3, ExternalLink, Eye, EyeOff, Heart, Link, MessageCircle, Newspaper, Play, QrCode, Save, Search, Send, Settings, Share2, Sparkles, Star, Trash2, UserPlus, UserRound, Users, Volume2, VolumeX, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode, SetStateAction } from "react";
import FeedPostGallery, { getFeedPostCover } from "@/components/FeedPostGallery";
import FeedPostInteractions from "@/components/FeedPostInteractions";
import LegalDisclosure from "@/components/LegalDisclosure";
import BlogWorkspace from "@/components/BlogWorkspace";
import MediaUrlHelp from "@/components/MediaUrlHelp";
import CurrencyDisplayHelp from "@/components/CurrencyDisplayHelp";
import { UserNameWithLevel } from "@/components/UserLevelBadge";
import SkillPassportApp from "@/components/SkillPassportApp";
import { useUserContext, type UserProfile } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney as formatMoney } from "@/lib/moneyFormat";
import type { FeedCategory, FeedExternalLink, FeedMedia, FeedPayload, FeedPost, FeedProjectReview, FeedReviewSummary, FeedStatBlock, FeedSystemAccount, FeedSystemStory, FeedWish as PublicWish } from "@/lib/socialFeed";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { fetchWithSupabaseAuth } from "@/lib/supabaseAuthFetch";
import { DEFAULT_PROFILE_VISIBILITY_SETTINGS, PROFILE_VISIBILITY_KEYS, PROFILE_VISIBILITY_LEVELS, type ProfileVisibility, type ProfileVisibilityKey, type ProfileVisibilitySettings } from "@/lib/socialProfile";
import { ACCENT_THEMES, COLOR_THEMES, UI_SCALES, type AccentTheme, type ColorTheme, type UiScale } from "@/lib/appearance";
import { DISPLAY_CURRENCIES, DISPLAY_CURRENCY_SYMBOLS, type DisplayCurrency } from "@/lib/displayCurrency";
import { APP_TESTING_ATTITUDES, APP_TESTING_USEFUL_AREAS } from "@/lib/appTestingFeedback";
import { recommendedWishIdForStory } from "@/lib/wishJourney";
import { getSoundsEnabled, playUiSound, setSoundsEnabled } from "@/lib/ui/sound";

type SocialTab = "feed" | "people" | "blog" | "profile" | "teams";
type SocialTabChange = (tab: SocialTab) => void;
type ReferralLink = { code: string; url: string };
type TeamTask = {
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
type TeamTaskHelpRequest = {
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
type TeamTaskRevision = {
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
type TeamChallengeOption = { id: string; title: Record<string, string>; verification_logic?: string | null };
type TeamProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  avatar_position?: string;
  level: number;
  created_at: string;
};
type TeamContext = {
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
type TeamRewardDay = {
  bonus_date: string;
  reward_amount: number;
  source_count: number;
  created_at: string;
};
type CoreNotificationRow = {
  accrual_date: string;
  core_amount: number;
  wallet_amount: number;
  created_at: string;
};
type PayoutNotification = {
  id: string;
  title: string;
  body: string;
  readAt?: string | null;
  createdAt?: string;
  deep_link?: string;
};
type ProfileLinkRow = {
  id: string;
  user_id: string;
  link_type: string;
  label: string | null;
  url: string;
  visibility: string;
  sort_order: number;
};
type ContactRow = {
  owner_user_id: string;
  contact_user_id: string;
  source: string;
  status: string;
  is_required: boolean;
  profile: TeamProfile | null;
};
type TrustConfirmationType = "help_given" | "help_received" | "deal_completed" | "challenge_confirmed" | "proof_added" | "contact_confirmed";
type TrustConfirmationStatus = "pending" | "confirmed" | "declined" | "expired";
type TrustConfirmationRow = {
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
type TrustConfirmationsPayload = {
  confirmations: TrustConfirmationRow[];
  profiles?: TeamProfile[];
  trustUnavailable?: boolean;
  error?: string;
};
type SocialProfilePayload = {
  profile: UserProfile | null;
  visibilitySettings: ProfileVisibilitySettings;
  links: ProfileLinkRow[];
  error?: string;
};
type PublicProfilePayload = {
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
type FeedFilter = FeedCategory;
type FeedCacheEntry = {
  payload: FeedPayload;
  fetchedAt: number;
  locale: AppLocale;
};
type FeedCache = Record<FeedFilter, FeedCacheEntry | null>;

const FEED_CACHE_TTL_MS = 60_000;

function createFeedCache(): FeedCache {
  return { all: null, stories: null, opportunities: null, system: null, reviews: null };
}

function createFeedCursors(): Record<FeedFilter, string | null> {
  return { all: null, stories: null, opportunities: null, system: null, reviews: null };
}

function createFeedRequestIds(): Record<FeedFilter, number> {
  return { all: 0, stories: 0, opportunities: 0, system: 0, reviews: 0 };
}
type ReviewEditPayload = {
  body: string;
  overallRating: number;
  missionRating: number;
  attitude: string;
  mostUsefulArea: string;
};
type PeopleFilter = "nearby" | "team" | "referrals" | "same_level" | "active";
type PeopleRow = {
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
type PeoplePayload = {
  people: PeopleRow[];
  filter: PeopleFilter | "search";
  query: string;
  error?: string;
};
type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  status: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type DirectConversationPayload = {
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
type ProfileEditorState = {
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

type ProfileAction = "edit" | "settings" | "skills" | "activity" | null;
type PeopleSection = "discover" | "contacts" | "confirmations";

export default function SocialApp({
  active,
  activeTab,
  openFeedDraftsNonce,
  refreshNonce,
  onTabChange,
  onOpenChallenge,
  onOpenWishJourney
}: {
  active: boolean;
  activeTab: SocialTab;
  openFeedDraftsNonce: number;
  refreshNonce: number;
  onTabChange: SocialTabChange;
  onOpenChallenge: () => void;
  onOpenWishJourney: (wishId: string) => void;
}) {
  const {
    user,
    profile,
    core,
    loading,
    error,
    locale,
    displayCurrency,
    uiScale,
    colorTheme,
    accentTheme,
    setLocale,
    setDisplayCurrency,
    setUiScale,
    setColorTheme,
    setAccentTheme,
    t,
    applyServerData
  } = useUserContext();
  const [referralLink, setReferralLink] = useState<ReferralLink | null>(null);
  const [referralLocked, setReferralLocked] = useState(false);
  const [teamContext, setTeamContext] = useState<TeamContext | null>(null);
  const [teamTasks, setTeamTasks] = useState<TeamTask[]>([]);
  const [teamChallenges, setTeamChallenges] = useState<TeamChallengeOption[]>([]);
  const [teamTasksLoading, setTeamTasksLoading] = useState(false);
  const [teamTaskSavingId, setTeamTaskSavingId] = useState<string | null>(null);
  const [teamTaskSubmission, setTeamTaskSubmission] = useState<Record<string, string>>({});
  const [teamTaskReviewFeedback, setTeamTaskReviewFeedback] = useState<Record<string, string>>({});
  const [teamTaskHelpDraft, setTeamTaskHelpDraft] = useState<Record<string, string>>({});
  const [teamTaskHelpReason, setTeamTaskHelpReason] = useState<Record<string, TeamTaskHelpRequest["reason"]>>({});
  const [teamTaskRevisionTaskId, setTeamTaskRevisionTaskId] = useState<string | null>(null);
  const [teamTaskRevisionDraft, setTeamTaskRevisionDraft] = useState({ firstStep: "", expectedResult: "", dueAt: "" });
  const [teamTaskTitle, setTeamTaskTitle] = useState("");
  const [teamTaskDescription, setTeamTaskDescription] = useState("");
  const [teamTaskGoalContext, setTeamTaskGoalContext] = useState("");
  const [teamTaskExpectedResult, setTeamTaskExpectedResult] = useState("");
  const [teamTaskFirstStep, setTeamTaskFirstStep] = useState("");
  const [teamTaskEstimatedMinutes, setTeamTaskEstimatedMinutes] = useState("");
  const [teamTaskVerificationCriteria, setTeamTaskVerificationCriteria] = useState("");
  const [teamTaskLeaderReviewDueAt, setTeamTaskLeaderReviewDueAt] = useState("");
  const [teamTaskDueAt, setTeamTaskDueAt] = useState("");
  const [teamTaskMemberId, setTeamTaskMemberId] = useState("");
  const [teamTaskKind, setTeamTaskKind] = useState<"manual" | "challenge">("manual");
  const [teamTaskChallengeId, setTeamTaskChallengeId] = useState("");
  const [teamTaskCreating, setTeamTaskCreating] = useState(false);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [storyWishError, setStoryWishError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [referralQrOpen, setReferralQrOpen] = useState(false);
  const [teamRewardsOpen, setTeamRewardsOpen] = useState(false);
  const [teamRewards, setTeamRewards] = useState<TeamRewardDay[] | null>(null);
  const [teamRewardsLoading, setTeamRewardsLoading] = useState(false);
  const [teamRewardsError, setTeamRewardsError] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PayoutNotification[] | null>(null);
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [socialProfile, setSocialProfile] = useState<SocialProfilePayload | null>(null);
  const [profileAction, setProfileAction] = useState<ProfileAction>(null);
  const [profileEditor, setProfileEditor] = useState<ProfileEditorState>(() => createProfileEditorState(null));
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [trustConfirmations, setTrustConfirmations] = useState<TrustConfirmationRow[] | null>(null);
  const [trustProfiles, setTrustProfiles] = useState<Record<string, TeamProfile>>({});
  const [trustSavingId, setTrustSavingId] = useState<string | null>(null);
  const [trustCreatingForId, setTrustCreatingForId] = useState<string | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfilePayload | null>(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [copyingWishId, setCopyingWishId] = useState<string | null>(null);
  const [addingStoryWishKey, setAddingStoryWishKey] = useState<string | null>(null);
  const [contactSavingId, setContactSavingId] = useState<string | null>(null);
  const [peoplePayload, setPeoplePayload] = useState<PeoplePayload | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleSearchText, setPeopleSearchText] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>("nearby");
  const [peopleSection, setPeopleSection] = useState<PeopleSection>("discover");
  const [contacts, setContacts] = useState<ContactRow[] | null>(null);
  const [directPayload, setDirectPayload] = useState<DirectConversationPayload | null>(null);
  const [directTargetUserId, setDirectTargetUserId] = useState<string | null>(null);
  const [directMessageBody, setDirectMessageBody] = useState("");
  const [directLoading, setDirectLoading] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [feedPayload, setFeedPayload] = useState<FeedPayload | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("stories");
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [systemPayload, setSystemPayload] = useState<FeedPayload | null>(null);
  const [feedLoading, setFeedLoading] = useState(false);
  const [systemLoading, setSystemLoading] = useState(false);
  const [feedSaving, setFeedSaving] = useState(false);
  const [dailyDraft, setDailyDraft] = useState<FeedPost | null>(null);
  const [systemDrafts, setSystemDrafts] = useState<FeedPost[]>([]);
  const [externalLinkUrl, setExternalLinkUrl] = useState("");
  const [linkComposerOpen, setLinkComposerOpen] = useState(false);
  const [selectedBlogAuthorId, setSelectedBlogAuthorId] = useState<string | null>(null);
  const [selectedSystemAccountKey, setSelectedSystemAccountKey] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const feedScrollPositionRef = useRef(0);
  const feedFilterRef = useRef<FeedFilter>("all");
  const feedCacheRef = useRef<FeedCache>(createFeedCache());
  const feedCursorRef = useRef<Record<FeedFilter, string | null>>(createFeedCursors());
  const feedRequestIdsRef = useRef<Record<FeedFilter, number>>(createFeedRequestIds());
  const feedLoadInFlightRef = useRef(new Map<string, Promise<void>>());
  const feedLoadGenerationRef = useRef(0);
  const systemDraftsLoadedRef = useRef(false);
  const systemDraftsLoadingRef = useRef(false);
  const systemDraftsLocaleRef = useRef<AppLocale | null>(null);
  const dailyDraftEnsuredRef = useRef(false);
  const feedRefreshNonceRef = useRef(refreshNonce);
  feedFilterRef.current = feedFilter;

  useEffect(() => {
    if (!openFeedDraftsNonce) return;
    setSelectedBlogAuthorId(null);
  }, [openFeedDraftsNonce]);

  useEffect(() => {
    setSocialError(null);
    setCopied(false);
    setReferralLink(null);
    setReferralLocked(false);
    setTeamContext(null);
    setTeamTasks([]);
    setTeamChallenges([]);
    setTeamTasksLoading(false);
    setTeamTaskSavingId(null);
    setTeamTaskSubmission({});
    setTeamTaskReviewFeedback({});
    setTeamTaskHelpDraft({});
    setTeamTaskHelpReason({});
    setTeamTaskRevisionTaskId(null);
    setTeamTaskRevisionDraft({ firstStep: "", expectedResult: "", dueAt: "" });
    setTeamTaskTitle("");
    setTeamTaskDescription("");
    setTeamTaskGoalContext("");
    setTeamTaskExpectedResult("");
    setTeamTaskFirstStep("");
    setTeamTaskEstimatedMinutes("");
    setTeamTaskVerificationCriteria("");
    setTeamTaskLeaderReviewDueAt("");
    setTeamTaskDueAt("");
    setTeamTaskMemberId("");
    setTeamTaskKind("manual");
    setTeamTaskChallengeId("");
    setTeamTaskCreating(false);
    setTeamRewards(null);
    setTeamRewardsOpen(false);
    setTeamRewardsLoading(false);
    setTeamRewardsError(null);
    setNotifications(null);
    setNotificationUnreadCount(0);
    setNotificationsLoading(false);
    setSocialProfile(null);
    setProfileAction(null);
    setProfileEditor(createProfileEditorState(null));
    setProfileSaving(false);
    setAvatarUploading(false);
    setTrustConfirmations(null);
    setTrustProfiles({});
    setTrustSavingId(null);
    setTrustCreatingForId(null);
    setPublicProfile(null);
    setPublicProfileLoading(false);
    setCopyingWishId(null);
    setContactSavingId(null);
    setPeoplePayload(null);
    setPeopleLoading(false);
    setPeopleSearchText("");
    setPeopleQuery("");
    setPeopleFilter("nearby");
    setPeopleSection("discover");
    setContacts(null);
    setDirectPayload(null);
    setDirectTargetUserId(null);
    setDirectMessageBody("");
    setDirectLoading(false);
    setDirectSending(false);
    setFeedPayload(null);
    setFeedFilter("stories");
    setFeedLoadingMore(false);
    setSystemPayload(null);
    setFeedLoading(false);
    setSystemLoading(false);
    setFeedSaving(false);
    setDailyDraft(null);
    setSystemDrafts([]);
    setExternalLinkUrl("");
    setSelectedBlogAuthorId(null);
    setSelectedSystemAccountKey(null);
    setSelectedPost(null);
    feedCacheRef.current = createFeedCache();
    feedCursorRef.current = createFeedCursors();
    feedRequestIdsRef.current = createFeedRequestIds();
    feedLoadInFlightRef.current.clear();
    feedLoadGenerationRef.current += 1;
    systemDraftsLoadedRef.current = false;
    systemDraftsLoadingRef.current = false;
    systemDraftsLocaleRef.current = null;
    dailyDraftEnsuredRef.current = false;
  }, [user?.id]);

  const loadReferralLink = useCallback(async () => {
    if (!user) return;
    const session = await getAccessToken();
    const response = await fetch(`/api/referrals/me?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session}`,
        "Cache-Control": "no-cache"
      }
    });
    const payload = (await response.json()) as ReferralLink & { available?: boolean; reason?: string | null; error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load referral link.");
    setReferralLocked(payload.available === false || payload.reason === "first_result_required");
    setReferralLink(payload.available === false || !payload.code || !payload.url ? null : { code: payload.code, url: payload.url });
  }, [user]);

  const loadTeamContext = useCallback(async () => {
    if (!user) return;
    const session = await getAccessToken();
    const response = await fetch(`/api/teams/me?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${session}`,
        "Cache-Control": "no-cache"
      }
    });
    const payload = (await response.json()) as TeamContext;
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load team.");
    setTeamContext(payload);
  }, [user]);

  const loadTeamTasks = useCallback(async () => {
    if (!user) return;
    setTeamTasksLoading(true);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/teams/tasks?ts=${Date.now()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
      });
      const payload = (await response.json()) as { tasks?: TeamTask[]; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load team tasks.");
      setTeamTasks(payload.tasks ?? []);
    } finally {
      setTeamTasksLoading(false);
    }
  }, [user]);

  const loadTeamChallenges = useCallback(async () => {
    if (!user) return;
    const response = await fetchWithSupabaseAuth(`/api/challenges?auth=required&ts=${Date.now()}`, {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" }
    }, { authRequired: true });
    const payload = (await response.json()) as { challenges?: Array<{ id: string; title: Record<string, string>; verification_logic?: string | null }>; error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load challenges.");
    setTeamChallenges((payload.challenges ?? [])
      .filter((challenge) => challenge.verification_logic !== "team_task_help_completed")
      .map((challenge) => ({ id: challenge.id, title: challenge.title, verification_logic: challenge.verification_logic })));
  }, [user]);

  const actOnTeamTask = useCallback(async (task: TeamTask, action: string, submission?: string, feedback?: string) => {
    setTeamTaskSavingId(task.id);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/teams/tasks/${task.id}/action`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, expectedVersion: task.version, submission: submission ?? null, feedback: feedback ?? null })
      });
      const payload = (await response.json()) as { task?: TeamTask; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to update task.");
      if (payload.task) {
        setTeamTasks((current) => current.map((item) => item.id === payload.task?.id ? payload.task : item));
      }
      await loadTeamContext();
    } catch (taskError) {
      console.warn("Team task action failed", taskError);
      setSocialError(taskError instanceof Error ? taskError.message : "Failed to update task.");
      await loadTeamTasks().catch(() => undefined);
    } finally {
      setTeamTaskSavingId(null);
    }
  }, [loadTeamContext, loadTeamTasks]);

  const requestTeamTaskHelp = useCallback(async (task: TeamTask, reason: TeamTaskHelpRequest["reason"], comment: string) => {
    setTeamTaskSavingId(task.id);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/teams/tasks/${task.id}/help`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason, comment })
      });
      const payload = (await response.json()) as { helpRequest?: TeamTaskHelpRequest; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to request help.");
      await Promise.all([loadTeamTasks(), loadTeamContext()]);
    } catch (helpError) {
      console.warn("Team task help request failed", helpError);
      setSocialError(helpError instanceof Error ? helpError.message : "Failed to request help.");
    } finally {
      setTeamTaskSavingId(null);
    }
  }, [loadTeamContext, loadTeamTasks]);

  const resolveTeamTaskHelp = useCallback(async (task: TeamTask, helpRequestId: string) => {
    setTeamTaskSavingId(task.id);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/teams/tasks/${task.id}/help`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "resolve", helpRequestId })
      });
      const payload = (await response.json()) as { helpRequest?: TeamTaskHelpRequest; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to resolve help.");
      await Promise.all([loadTeamTasks(), loadTeamContext()]);
    } catch (helpError) {
      console.warn("Team task help resolution failed", helpError);
      setSocialError(helpError instanceof Error ? helpError.message : "Failed to resolve help.");
    } finally {
      setTeamTaskSavingId(null);
    }
  }, [loadTeamContext, loadTeamTasks]);

  const proposeTeamTaskRevision = useCallback(async (task: TeamTask, changes: Record<string, unknown>) => {
    setTeamTaskSavingId(task.id);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/teams/tasks/${task.id}/revision`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ changes })
      });
      const payload = (await response.json()) as { revision?: TeamTaskRevision; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to propose changes.");
      setTeamTaskRevisionTaskId(null);
      setTeamTaskRevisionDraft({ firstStep: "", expectedResult: "", dueAt: "" });
      await Promise.all([loadTeamTasks(), loadTeamContext()]);
    } catch (revisionError) {
      console.warn("Team task revision proposal failed", revisionError);
      setSocialError(revisionError instanceof Error ? revisionError.message : "Failed to propose changes.");
    } finally {
      setTeamTaskSavingId(null);
    }
  }, [loadTeamContext, loadTeamTasks]);

  const respondToTeamTaskRevision = useCallback(async (task: TeamTask, revision: TeamTaskRevision, action: "accept" | "decline") => {
    setTeamTaskSavingId(task.id);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/teams/revisions/${revision.id}/action`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, expectedVersion: task.version })
      });
      const payload = (await response.json()) as { revision?: TeamTaskRevision; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to respond to changes.");
      await Promise.all([loadTeamTasks(), loadTeamContext()]);
    } catch (revisionError) {
      console.warn("Team task revision response failed", revisionError);
      setSocialError(revisionError instanceof Error ? revisionError.message : "Failed to respond to changes.");
    } finally {
      setTeamTaskSavingId(null);
    }
  }, [loadTeamContext, loadTeamTasks]);

  const createTeamTask = useCallback(async () => {
    const memberUserId = teamTaskMemberId.trim();
    const title = teamTaskTitle.trim();
    if (!memberUserId || !title || (teamTaskKind === "challenge" && !teamTaskChallengeId)) return;
    setTeamTaskCreating(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/teams/tasks", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          memberUserId,
          taskKind: teamTaskKind,
          title,
          description: teamTaskDescription,
          goalContext: teamTaskGoalContext,
          expectedResult: teamTaskExpectedResult,
          firstStep: teamTaskFirstStep,
          estimatedMinutes: teamTaskEstimatedMinutes ? Number(teamTaskEstimatedMinutes) : null,
          verificationCriteria: teamTaskVerificationCriteria,
          dueAt: teamTaskDueAt ? new Date(teamTaskDueAt).toISOString() : null,
          leaderReviewDueAt: teamTaskLeaderReviewDueAt ? new Date(teamTaskLeaderReviewDueAt).toISOString() : null,
          challengeId: teamTaskKind === "challenge" ? teamTaskChallengeId : null
        })
      });
      const payload = (await response.json()) as { task?: TeamTask; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to create task.");
      setTeamTaskTitle("");
      setTeamTaskDescription("");
      setTeamTaskGoalContext("");
      setTeamTaskExpectedResult("");
      setTeamTaskFirstStep("");
      setTeamTaskEstimatedMinutes("");
      setTeamTaskVerificationCriteria("");
      setTeamTaskLeaderReviewDueAt("");
      setTeamTaskDueAt("");
      setTeamTaskMemberId("");
      setTeamTaskChallengeId("");
      await Promise.all([loadTeamTasks(), loadTeamContext()]);
    } catch (taskError) {
      console.warn("Team task creation failed", taskError);
      setSocialError(taskError instanceof Error ? taskError.message : "Failed to create task.");
    } finally {
      setTeamTaskCreating(false);
    }
  }, [loadTeamContext, loadTeamTasks, teamTaskChallengeId, teamTaskDescription, teamTaskDueAt, teamTaskEstimatedMinutes, teamTaskExpectedResult, teamTaskFirstStep, teamTaskGoalContext, teamTaskKind, teamTaskLeaderReviewDueAt, teamTaskMemberId, teamTaskTitle, teamTaskVerificationCriteria]);

  const loadSocialProfile = useCallback(async () => {
    if (!user) return;
    const token = await getAccessToken();
    const response = await fetch(`/api/social/profile?ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache"
      }
    });
    const payload = (await response.json()) as SocialProfilePayload;
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load social profile.");
    setSocialProfile(payload);
    setProfileEditor((current) => profileAction === "edit" ? current : createProfileEditorState(payload, profile));
  }, [profile, profileAction, user]);

  const loadContacts = useCallback(async () => {
    if (!user) return;
    const token = await getAccessToken();
    const response = await fetch(`/api/social/contacts?ts=${Date.now()}`, {
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
    });
    const payload = (await response.json()) as { contacts?: ContactRow[]; error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load contacts.");
    setContacts(payload.contacts ?? []);
  }, [user]);

  const loadTrustConfirmations = useCallback(async () => {
    if (!user) return;
    const token = await getAccessToken();
    const response = await fetch(`/api/trust/confirmations?box=all&ts=${Date.now()}`, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Cache-Control": "no-cache"
      }
    });
    const payload = (await response.json()) as TrustConfirmationsPayload;
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load confirmations.");
    setTrustConfirmations(payload.confirmations ?? []);
    setTrustProfiles(Object.fromEntries((payload.profiles ?? []).map((item) => [item.user_id, item])));
  }, [user]);

  const loadOptionalTrustConfirmations = useCallback(async () => {
    try {
      await loadTrustConfirmations();
    } catch (trustError) {
      console.warn("Trust confirmations load failed", trustError);
      setTrustConfirmations([]);
      setTrustProfiles({});
    }
  }, [loadTrustConfirmations]);

  const loadProfileTab = useCallback(async () => {
    await Promise.all([loadReferralLink(), loadSocialProfile(), loadOptionalTrustConfirmations()]);
  }, [loadOptionalTrustConfirmations, loadReferralLink, loadSocialProfile]);

  const loadPeople = useCallback(async () => {
    if (!user) return;
    setPeopleLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ filter: peopleFilter, limit: "30", ts: String(Date.now()) });
      const query = peopleQuery.trim();
      if (query) params.set("q", query);
      const response = await fetch(`/api/social/people?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as PeoplePayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load people.");
      setPeoplePayload(payload);
    } finally {
      setPeopleLoading(false);
    }
  }, [peopleFilter, peopleQuery, user]);

  const submitPeopleSearch = useCallback(() => {
    const nextQuery = peopleSearchText.trim();
    if (nextQuery === peopleQuery) {
      void loadPeople();
      return;
    }
    setPeopleQuery(nextQuery);
  }, [loadPeople, peopleQuery, peopleSearchText]);

  const loadPeopleHub = useCallback(async () => {
    await Promise.all([loadPeople(), loadContacts(), loadOptionalTrustConfirmations(), loadReferralLink()]);
  }, [loadContacts, loadOptionalTrustConfirmations, loadPeople, loadReferralLink]);

  const loadSystemDrafts = useCallback(async () => {
    if (!user || systemDraftsLoadingRef.current) return;
    systemDraftsLoadingRef.current = true;
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ scope: "blog", drafts: "system", locale, limit: "20", ts: String(Date.now()) });
      const response = await fetch(`/api/social/feed?${params.toString()}`, {
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
      });
      const payload = (await response.json()) as FeedPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load system drafts.");
      const drafts = payload.posts ?? [];
      setSystemDrafts(drafts);
      setDailyDraft((current) => current ?? drafts.find((post) => post.post_type === "daily_progress" || post.post_type === "level_up") ?? null);
      systemDraftsLoadedRef.current = true;
      systemDraftsLocaleRef.current = locale;
    } finally {
      systemDraftsLoadingRef.current = false;
    }
  }, [locale, user]);

  const ensureDailyDraft = useCallback(async () => {
    if (!user || dailyDraftEnsuredRef.current) return;
    dailyDraftEnsuredRef.current = true;
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/social/feed/daily-progress/draft", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as { post?: FeedPost; error?: string };
      if (response.ok && payload.post) setDailyDraft(payload.post);
    } catch (draftError) {
      dailyDraftEnsuredRef.current = false;
      console.warn("Daily draft ensure failed", draftError);
    }
  }, [user]);

  const loadFeed = useCallback(async (append = false, force = false) => {
    if (!user) return;

    const requestedFilter = feedFilter;
    const cachedEntry = feedCacheRef.current[requestedFilter];
    const hasUsableCache = cachedEntry?.locale === locale;
    const cacheIsFresh = Boolean(cachedEntry && hasUsableCache && Date.now() - cachedEntry.fetchedAt < FEED_CACHE_TTL_MS);

    if (!append) {
      if (hasUsableCache && cachedEntry && feedFilterRef.current === requestedFilter) {
        setFeedPayload(cachedEntry.payload);
      }
      if (!force && cacheIsFresh) {
        if (feedFilterRef.current === requestedFilter) setFeedLoading(false);
        return;
      }
    }

    const requestKey = `${user.id}:${locale}:${requestedFilter}:${append ? "append" : "replace"}`;
    const currentRequest = feedLoadInFlightRef.current.get(requestKey);
    if (currentRequest) return currentRequest;

    const request = (async () => {
      const requestGeneration = feedLoadGenerationRef.current;
      const requestId = feedRequestIdsRef.current[requestedFilter] + 1;
      feedRequestIdsRef.current[requestedFilter] = requestId;
      if (append) setFeedLoadingMore(true);
      else setFeedLoading(true);
      try {
        const token = await getAccessToken();
        const params = new URLSearchParams({ scope: "feed", locale, limit: "21", ts: String(Date.now()) });
        if (requestedFilter !== "all") params.set("category", requestedFilter);
        if (append && feedCursorRef.current[requestedFilter]) params.set("cursor", feedCursorRef.current[requestedFilter]!);
        const response = await fetch(`/api/social/feed?${params.toString()}`, {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`,
            "Cache-Control": "no-cache"
          }
        });
        const payload = (await response.json()) as FeedPayload;
        if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load feed.");
        if (feedLoadGenerationRef.current !== requestGeneration || feedRequestIdsRef.current[requestedFilter] !== requestId) return;

        const currentEntry = feedCacheRef.current[requestedFilter];
        const currentPayload = currentEntry?.locale === locale ? currentEntry.payload : null;
        const nextPayload = append && currentPayload
          ? { ...payload, posts: [...currentPayload.posts, ...payload.posts] }
          : payload;
        feedCursorRef.current[requestedFilter] = payload.nextCursor ?? null;
        feedCacheRef.current[requestedFilter] = { payload: nextPayload, fetchedAt: Date.now(), locale };
        if (feedFilterRef.current === requestedFilter) setFeedPayload(nextPayload);
      } finally {
        if (feedLoadGenerationRef.current === requestGeneration && feedRequestIdsRef.current[requestedFilter] === requestId) {
          if (append) setFeedLoadingMore(false);
          else setFeedLoading(false);
        }
      }
    })();

    feedLoadInFlightRef.current.set(requestKey, request);
    try {
      await request;
    } finally {
      if (feedLoadInFlightRef.current.get(requestKey) === request) {
        feedLoadInFlightRef.current.delete(requestKey);
      }
    }
  }, [feedFilter, locale, user]);

  const loadBlog = useCallback(async () => {
    if (!selectedBlogAuthorId) await ensureDailyDraft();
  }, [ensureDailyDraft, selectedBlogAuthorId]);

  const loadSystemProfile = useCallback(async () => {
    if (!user || !selectedSystemAccountKey) return;
    setSystemLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({
        scope: "system",
        systemAccountKey: selectedSystemAccountKey,
        locale,
        limit: "60",
        ts: String(Date.now())
      });
      const response = await fetch(`/api/social/feed?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as FeedPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load system profile.");
      setSystemPayload(payload);
    } finally {
      setSystemLoading(false);
    }
  }, [locale, selectedSystemAccountKey, user]);

  useEffect(() => {
    if (!active) return;
    if (!user) {
      setReferralLink(null);
      setReferralLocked(false);
      setTeamContext(null);
      setTeamTasks([]);
      setTeamTaskDueAt("");
      setTeamRewards(null);
      setTeamRewardsOpen(false);
      setNotifications(null);
      setNotificationUnreadCount(0);
      return;
    }

    if (!navigator.onLine) {
      return;
    }

    const forceFeedRefresh = activeTab === "feed" && refreshNonce !== feedRefreshNonceRef.current;
    if (activeTab === "feed" && !selectedSystemAccountKey) feedRefreshNonceRef.current = refreshNonce;
    const load = activeTab === "feed"
      ? selectedSystemAccountKey ? loadSystemProfile : () => loadFeed(false, forceFeedRefresh)
      : activeTab === "people" ? loadPeopleHub
      : activeTab === "blog" ? loadBlog
      : activeTab === "teams" ? () => Promise.all([loadTeamContext(), loadTeamTasks(), loadTeamChallenges(), loadReferralLink()]).then(() => undefined)
      : loadProfileTab;
    setSocialError(null);
    load().catch((loadError) => {
      console.warn("Social data load failed", loadError);
      setSocialError(loadError instanceof Error ? loadError.message : "Failed to load social data.");
    });
  }, [active, activeTab, loadBlog, loadFeed, loadPeopleHub, loadProfileTab, loadReferralLink, loadSystemProfile, loadTeamChallenges, loadTeamContext, loadTeamTasks, refreshNonce, selectedSystemAccountKey, user]);

  const displayName = profile?.display_name ?? user?.email ?? t("profile.guest");
  const handle = profile?.username ? `@${profile.username}` : user?.email ?? t("profile.localMode");
  const pendingIncomingConfirmations = trustConfirmations?.filter((item) => item.counterparty_user_id === user?.id && item.status === "pending").length ?? 0;
  const combinedError = error ?? socialError;

  function updateCachedFeedPayloads(update: (payload: FeedPayload) => FeedPayload) {
    const nextCache = { ...feedCacheRef.current };
    (Object.keys(nextCache) as FeedFilter[]).forEach((filter) => {
      const entry = nextCache[filter];
      if (entry) nextCache[filter] = { ...entry, payload: update(entry.payload) };
    });
    feedCacheRef.current = nextCache;
    const currentEntry = nextCache[feedFilterRef.current];
    setFeedPayload(currentEntry?.locale === locale ? currentEntry.payload : null);
  }

  function invalidateFeedCache() {
    const nextCache = { ...feedCacheRef.current };
    (Object.keys(nextCache) as FeedFilter[]).forEach((filter) => {
      const entry = nextCache[filter];
      if (entry) nextCache[filter] = { ...entry, fetchedAt: 0 };
    });
    feedCacheRef.current = nextCache;
  }

  async function copyReferralLink() {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function shareReferralLink() {
    if (!referralLink) return;
    if (navigator.share) {
      await navigator.share({
        title: "Open Abundance",
        text: t("profile.referral.shareText"),
        url: referralLink.url
      });
      return;
    }
    await copyReferralLink();
  }

  function toggleProfileAction(action: Exclude<ProfileAction, null>) {
    if (action === "edit") {
      if (profileAction !== "edit") setProfileEditor(createProfileEditorState(socialProfile, profile));
    }
    setProfileAction((current) => current === action ? null : action);
  }

  async function saveProfileEditor() {
    setProfileSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const links = profileEditor.linkUrl.trim()
        ? [{
            label: profileEditor.linkLabel,
            url: profileEditor.linkUrl,
            visibility: profileEditor.linkVisibility
          }]
        : [];
      const response = await fetch("/api/social/profile", {
        method: "PUT",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          displayName: profileEditor.displayName,
          bio: profileEditor.bio,
          visibilitySettings: profileEditor.visibilitySettings,
          links
        })
      });
      const payload = (await response.json()) as SocialProfilePayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to save profile.");
      let updatedProfile = payload.profile;
      const nextAvatarUrl = profileEditor.avatarUrl.trim();
      const currentAvatarUrl = profile?.avatar_url ?? "";
      const nextAvatarPosition = profileEditor.avatarPosition;
      const currentAvatarPosition = profile?.avatar_position ?? "50% 50%";
      if (nextAvatarUrl && (nextAvatarUrl !== currentAvatarUrl || nextAvatarPosition !== currentAvatarPosition)) {
        setAvatarUploading(true);
        const avatarResponse = await fetch("/api/social/profile/avatar", {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ avatarUrl: nextAvatarUrl, avatarPosition: nextAvatarPosition })
        });
        const avatarPayload = (await avatarResponse.json()) as { profile?: UserProfile; error?: string };
        if (!avatarResponse.ok || avatarPayload.error || !avatarPayload.profile) throw new Error(avatarPayload.error ?? "Failed to save avatar.");
        updatedProfile = avatarPayload.profile;
      } else if (profileEditor.avatarRemoved && profile?.avatar_url) {
        setAvatarUploading(true);
        const avatarResponse = await fetch("/api/social/profile/avatar", {
          method: "DELETE",
          cache: "no-store",
          headers: { Authorization: `Bearer ${token}` }
        });
        const avatarPayload = (await avatarResponse.json()) as { profile?: UserProfile; error?: string };
        if (!avatarResponse.ok || avatarPayload.error || !avatarPayload.profile) throw new Error(avatarPayload.error ?? "Failed to remove avatar.");
        updatedProfile = avatarPayload.profile;
      }
      setSocialProfile({ ...payload, profile: updatedProfile });
      applyServerData({ profile: updatedProfile });
      setProfileEditor(createProfileEditorState({ ...payload, profile: updatedProfile }, updatedProfile));
      setProfileAction(null);
    } catch (saveError) {
      console.warn("Social profile save failed", saveError);
      setSocialError(saveError instanceof Error ? saveError.message : "Failed to save profile.");
    } finally {
      setAvatarUploading(false);
      setProfileSaving(false);
    }
  }

  async function openPublicProfile(userId: string) {
    setPublicProfileLoading(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/profile/${userId}?ts=${Date.now()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as PublicProfilePayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load profile.");
      setPublicProfile(payload);
    } catch (profileError) {
      console.warn("Public profile load failed", profileError);
      setSocialError(profileError instanceof Error ? profileError.message : "Failed to load profile.");
    } finally {
      setPublicProfileLoading(false);
    }
  }

  async function copyPublicWishToMine(wish: PublicWish) {
    setCopyingWishId(wish.id);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/wishes/${wish.id}/copy`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as { wish?: PublicWish; alreadyCopied?: boolean; error?: string };
      if (!response.ok || payload.error || !payload.wish) throw new Error(payload.error ?? "Failed to copy wish.");

      const copiedIncrement = payload.alreadyCopied ? 0 : 1;
      markWishCopied(wish.id, copiedIncrement);
    } catch (copyError) {
      console.warn("Public wish copy failed", copyError);
      setSocialError(copyError instanceof Error ? copyError.message : "Failed to copy wish.");
    } finally {
      setCopyingWishId(null);
    }
  }

  async function addStoryWish(post: FeedPost) {
    const recommendedWishId = recommendedWishIdForStory(post.source_key);
    if (!recommendedWishId || !user) return;
    setAddingStoryWishKey(post.source_key);
    setSocialError(null);
    setStoryWishError(null);
    try {
      let token = await getAccessToken();
      let { payload, response } = await requestStoryWish(recommendedWishId, locale, token);
      if (response.status === 401) {
        token = await refreshAccessToken();
        ({ payload, response } = await requestStoryWish(recommendedWishId, locale, token));
      }
      if (!response.ok || payload.error || !payload.wish) throw new StoryWishRequestError(response.status, payload.error ?? "Failed to add wish.");
      setSelectedPost(null);
      onOpenWishJourney(payload.wish.id);
    } catch (requestError) {
      console.warn("Story wish add failed", requestError);
      const message = storyWishErrorMessage(requestError, t);
      setStoryWishError(message);
      setSocialError(message);
    } finally {
      setAddingStoryWishKey(null);
    }
  }

  function markWishCopied(wishId: string, copiedIncrement: number) {
      setPublicProfile((current) => current
        ? {
            ...current,
            publicWishes: current.publicWishes.map((item) => item.id === wishId
              ? {
                  ...item,
                  viewer_has_copy: true,
                  copied_count: item.copied_count + copiedIncrement
                }
              : item)
          }
        : current);
    updateCachedFeedPayloads((payload) => updateFeedWishCopyState(payload, wishId, copiedIncrement) ?? payload);
    setSystemPayload((current) => updateFeedWishCopyState(current, wishId, copiedIncrement));
    setSelectedPost((current) => current ? updatePostWishCopyState(current, wishId, copiedIncrement) : current);
  }

  async function addManualContact(contactUserId: string) {
    setContactSavingId(contactUserId);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/social/contacts", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ contactUserId })
      });
      const payload = (await response.json()) as { contacts?: ContactRow[]; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to add contact.");
      setContacts(payload.contacts ?? []);
      setPeoplePayload((current) => current ? {
        ...current,
        people: current.people.map((item) => item.profile.user_id === contactUserId
          ? { ...item, relation: { ...item.relation, isContact: true } }
          : item)
      } : current);
      setPublicProfile((current) => current?.profile.user_id === contactUserId
        ? { ...current, relation: { ...current.relation, isContact: true } }
        : current);
    } catch (contactError) {
      console.warn("Contact add failed", contactError);
      setSocialError(contactError instanceof Error ? contactError.message : "Failed to add contact.");
    } finally {
      setContactSavingId(null);
    }
  }

  async function openDirectMessage(targetUserId: string) {
    setDirectTargetUserId(targetUserId);
    setDirectLoading(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/direct/conversations/${targetUserId}?ts=${Date.now()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as DirectConversationPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load direct conversation.");
      setDirectPayload(payload);
      setDirectMessageBody("");
    } catch (directError) {
      console.warn("Direct conversation load failed", directError);
      setDirectPayload(null);
      setDirectTargetUserId(null);
      setSocialError(directError instanceof Error ? directError.message : "Failed to load direct conversation.");
    } finally {
      setDirectLoading(false);
    }
  }

  async function sendDirectMessage() {
    const targetUserId = directTargetUserId ?? directPayload?.targetProfile.user_id;
    const body = directMessageBody.trim();
    if (!targetUserId || !body) return;

    setDirectSending(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/direct/conversations/${targetUserId}`, {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ body })
      });
      const payload = (await response.json()) as DirectConversationPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to send message.");
      setDirectPayload(payload);
      setDirectMessageBody("");
    } catch (directError) {
      console.warn("Direct message send failed", directError);
      setSocialError(directError instanceof Error ? directError.message : "Failed to send message.");
    } finally {
      setDirectSending(false);
    }
  }

  function closeDirectMessage() {
    setDirectPayload(null);
    setDirectTargetUserId(null);
    setDirectMessageBody("");
  }

  async function removeManualContact(contactUserId: string) {
    setContactSavingId(contactUserId);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/contacts?contactUserId=${encodeURIComponent(contactUserId)}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = (await response.json()) as { contacts?: ContactRow[]; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to remove contact.");
      setContacts(payload.contacts ?? []);
    } catch (contactError) {
      console.warn("Contact remove failed", contactError);
      setSocialError(contactError instanceof Error ? contactError.message : "Failed to remove contact.");
    } finally {
      setContactSavingId(null);
    }
  }

  async function requestContactConfirmation(contact: ContactRow) {
    setTrustCreatingForId(contact.contact_user_id);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/trust/confirmations", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          counterpartyUserId: contact.contact_user_id,
          confirmationType: "contact_confirmed",
          sourceType: "team_contact",
          sourceId: contact.contact_user_id,
          message: t("profile.trust.contactMessage"),
          metadata: { source: "profile_contacts", contactSource: contact.source }
        })
      });
      const payload = (await response.json()) as { confirmation?: TrustConfirmationRow; error?: string };
      if (!response.ok || payload.error || !payload.confirmation) throw new Error(payload.error ?? "Failed to request confirmation.");
      await loadTrustConfirmations();
    } catch (trustError) {
      console.warn("Trust confirmation request failed", trustError);
      setSocialError(trustError instanceof Error ? trustError.message : "Failed to request confirmation.");
    } finally {
      setTrustCreatingForId(null);
    }
  }

  async function respondToTrustConfirmation(confirmationId: string, action: "confirm" | "decline") {
    setTrustSavingId(confirmationId);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/trust/confirmations/${confirmationId}/${action}`, {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = (await response.json()) as { confirmation?: TrustConfirmationRow; error?: string };
      if (!response.ok || payload.error || !payload.confirmation) throw new Error(payload.error ?? "Failed to update confirmation.");
      setTrustConfirmations((current) => current?.map((item) => item.id === payload.confirmation?.id ? payload.confirmation : item) ?? current);
    } catch (trustError) {
      console.warn("Trust confirmation response failed", trustError);
      setSocialError(trustError instanceof Error ? trustError.message : "Failed to update confirmation.");
    } finally {
      setTrustSavingId(null);
    }
  }

  async function createDailyDraft() {
    setFeedSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/social/feed/daily-progress/draft", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({})
      });
      const payload = (await response.json()) as { post?: FeedPost; error?: string };
      if (!response.ok || payload.error || !payload.post) throw new Error(payload.error ?? "Failed to create daily draft.");
      setDailyDraft(payload.post);
      await Promise.all([loadFeed(false, true), loadBlog()]);
    } catch (draftError) {
      console.warn("Daily draft create failed", draftError);
      setSocialError(draftError instanceof Error ? draftError.message : "Failed to create daily draft.");
    } finally {
      setFeedSaving(false);
    }
  }

  async function createExternalLinkPost() {
    const url = externalLinkUrl.trim();
    if (!url) return;

    setFeedSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/social/feed", {
        method: "POST",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ url })
      });
      const payload = (await response.json()) as { post?: FeedPost; error?: string };
      if (!response.ok || payload.error || !payload.post) throw new Error(payload.error ?? "Failed to add external link.");
      setExternalLinkUrl("");
      invalidateFeedCache();
      await Promise.all([loadFeed(false, true), loadBlog()]);
    } catch (linkError) {
      console.warn("External link post create failed", linkError);
      setSocialError(linkError instanceof Error ? linkError.message : "Failed to add external link.");
    } finally {
      setFeedSaving(false);
    }
  }

  function updateLocalPostCover(postId: string, media: FeedMedia) {
    const update = (item: FeedPost) => item.id === postId ? { ...item, media: [media, ...item.media.filter((current) => current.sort_order !== 0)] } : item;
    setSystemDrafts((current) => current.map(update));
    setDailyDraft((current) => current ? update(current) : current);
    updateCachedFeedPayloads((payload) => ({ ...payload, posts: payload.posts.map(update) }));
    setSelectedPost((current) => current ? update(current) : current);
  }

  async function updatePostCover(post: FeedPost, templateKey: string) {
    setFeedSaving(true);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/feed/posts/${post.id}/cover`, {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ templateKey })
      });
      const payload = (await response.json()) as { media?: FeedMedia; error?: string };
      if (!response.ok || payload.error || !payload.media) throw new Error(payload.error ?? "Failed to update cover.");
      updateLocalPostCover(post.id, payload.media);
    } catch (coverError) {
      setSocialError(coverError instanceof Error ? coverError.message : "Failed to update cover.");
    } finally {
      setFeedSaving(false);
    }
  }

  async function uploadPostCover(post: FeedPost, file: File) {
    setFeedSaving(true);
    try {
      const token = await getAccessToken();
      const form = new FormData();
      form.set("file", file);
      const response = await fetch(`/api/social/feed/posts/${post.id}/cover`, {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` },
        body: form
      });
      const payload = (await response.json()) as { media?: FeedMedia; error?: string };
      if (!response.ok || payload.error || !payload.media) throw new Error(payload.error ?? "Failed to upload cover.");
      updateLocalPostCover(post.id, payload.media);
    } catch (coverError) {
      setSocialError(coverError instanceof Error ? coverError.message : "Failed to upload cover.");
    } finally {
      setFeedSaving(false);
    }
  }

  async function publishPost(post: FeedPost) {
    setFeedSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/feed/posts/${post.id}`, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          action: "publish",
          body: post.body,
          visibility: post.visibility,
          statBlocks: post.statBlocks.map((block) => ({
            blockKey: block.block_key,
            visibility: block.visibility === "public" ? "public" : "private"
          }))
        })
      });
      const payload = (await response.json()) as { post?: FeedPost; error?: string };
      if (!response.ok || payload.error || !payload.post) throw new Error(payload.error ?? "Failed to publish post.");
      const updatedPost: FeedPost = {
        ...post,
        ...payload.post,
        system_verified: payload.post.system_verified ?? post.system_verified,
        verifiedChallenge: payload.post.verifiedChallenge ?? post.verifiedChallenge ?? null
      };
      setDailyDraft((current) => current?.id === updatedPost.id ? updatedPost : current);
      setSelectedPost((current) => current?.id === updatedPost.id ? updatedPost : current);
      invalidateFeedCache();
      await Promise.all([loadFeed(false, true), loadBlog()]);
      if (updatedPost.system_verified) onTabChange("feed");
    } catch (publishError) {
      console.warn("Feed post publish failed", publishError);
      setSocialError(publishError instanceof Error ? publishError.message : "Failed to publish post.");
    } finally {
      setFeedSaving(false);
    }
  }

  async function updateProjectReview(post: FeedPost, changes: ReviewEditPayload) {
    setFeedSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/feed/posts/${post.id}`, {
        method: "PATCH",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(changes)
      });
      const payload = (await response.json()) as { post?: Partial<FeedPost>; error?: string };
      if (!response.ok || payload.error || !payload.post) throw new Error(payload.error ?? "Failed to update review.");
      const updatedPost: FeedPost = {
        ...post,
        ...payload.post,
        projectReview: payload.post.projectReview ?? post.projectReview
      };
      updateCachedFeedPayloads((current) => replaceFeedPost(current, updatedPost) ?? current);
      setSelectedPost(updatedPost);
      await loadFeed(false, true);
    } catch (updateError) {
      console.warn("Project review update failed", updateError);
      setSocialError(updateError instanceof Error ? updateError.message : "Failed to update review.");
      throw updateError;
    } finally {
      setFeedSaving(false);
    }
  }

  async function deletePost(post: FeedPost) {
    if (!window.confirm(t("social.post.deleteConfirm", { title: post.body ?? t("social.post.detail") }))) return;

    setFeedSaving(true);
    setSocialError(null);
    try {
      const token = await getAccessToken();
      const response = await fetch(`/api/social/feed/posts/${post.id}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = (await response.json()) as { deletedPostId?: string; error?: string };
      if (!response.ok || payload.error || !payload.deletedPostId) throw new Error(payload.error ?? "Failed to delete post.");
      setDailyDraft((current) => current?.id === post.id ? null : current);
      setSelectedPost((current) => current?.id === post.id ? null : current);
      invalidateFeedCache();
      await Promise.all([loadFeed(false, true), loadBlog()]);
    } catch (deleteError) {
      console.warn("Feed post delete failed", deleteError);
      setSocialError(deleteError instanceof Error ? deleteError.message : "Failed to delete post.");
    } finally {
      setFeedSaving(false);
    }
  }

  function updateDailyDraftBody(body: string) {
    setDailyDraft((current) => current ? { ...current, body } : current);
  }

  function updateSystemDraftBody(postId: string, body: string) {
    const update = (item: FeedPost) => item.id === postId ? { ...item, body } : item;
    setSystemDrafts((current) => current.map(update));
    setSelectedPost((current) => current ? update(current) : current);
  }

  function toggleDailyDraftBlock(blockKey: string) {
    setDailyDraft((current) => current ? {
      ...current,
      statBlocks: current.statBlocks.map((block) => block.block_key === blockKey
        ? { ...block, visibility: block.visibility === "public" ? "private" : "public" }
        : block)
    } : current);
  }

  function openAuthorBlog(authorUserId: string) {
    setSelectedBlogAuthorId(authorUserId === user?.id ? null : authorUserId);
    onTabChange("blog");
  }

  function openPostDetail(post: FeedPost) {
    setStoryWishError(null);
    setSelectedPost(post);
  }

  function openSystemAccount(accountKey: string) {
    if (selectedSystemAccountKey === accountKey) {
      setSelectedPost(null);
      return;
    }
    feedScrollPositionRef.current = window.scrollY;
    setSelectedPost(null);
    setSelectedSystemAccountKey(accountKey);
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  function closeSystemAccount() {
    const scrollPosition = feedScrollPositionRef.current;
    setSelectedSystemAccountKey(null);
    requestAnimationFrame(() => window.scrollTo({ top: scrollPosition }));
  }

  async function toggleTeamRewards() {
    const nextOpen = !teamRewardsOpen;
    setTeamRewardsOpen(nextOpen);
    if (!nextOpen || teamRewards || teamRewardsLoading) return;

    setTeamRewardsLoading(true);
    setTeamRewardsError(null);
    try {
      setTeamRewards(await loadTeamRewardsHistory());
    } catch (loadError) {
      console.warn("Team rewards history load failed", loadError);
      setTeamRewardsError(loadError instanceof Error ? loadError.message : "Failed to load team rewards.");
    } finally {
      setTeamRewardsLoading(false);
    }
  }

  async function openPayoutNotifications() {
    if (!user) return;
    const nextOpen = profileAction !== "activity";
    setProfileAction(nextOpen ? "activity" : null);
    if (!nextOpen) return;

    setNotificationsLoading(true);
    setSocialError(null);
    try {
      const [notificationPage, coreRows, rewardRows] = await Promise.all([
        loadNotificationCenter(locale).catch(() => ({ notifications: [], unreadCount: 0 })),
        loadCoreNotifications(),
        loadTeamRewardsHistory()
      ]);
      setNotifications([...notificationPage.notifications, ...buildPayoutNotifications(coreRows, rewardRows, locale)]);
      setNotificationUnreadCount(notificationPage.unreadCount);
    } catch (loadError) {
      console.warn("Payout notifications load failed", loadError);
      setSocialError(loadError instanceof Error ? loadError.message : "Failed to load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  }

  async function markAllNotificationsRead() {
    if (!notificationUnreadCount) return;
    try {
      await markNotificationsRead();
      const readAt = new Date().toISOString();
      setNotifications((current) => current?.map((item) => item.createdAt ? { ...item, readAt } : item) ?? null);
      setNotificationUnreadCount(0);
    } catch (markError) {
      setSocialError(markError instanceof Error ? markError.message : "Failed to update notifications.");
    }
  }

  async function openNotification(item: PayoutNotification) {
    if (!item.deep_link) return;
    if (item.createdAt && !item.readAt) {
      try {
        await markNotificationsRead([item.id]);
        setNotifications((current) => current?.map((row) => row.id === item.id ? { ...row, readAt: new Date().toISOString() } : row) ?? null);
        setNotificationUnreadCount((count) => Math.max(0, count - 1));
      } catch (readError) {
        setSocialError(readError instanceof Error ? readError.message : "Failed to update notification.");
      }
    }
    window.location.assign(item.deep_link);
  }

  return (
    <section className="social-screen">
      {combinedError ? <p className="finance-error social-top-error" role="alert">{combinedError}</p> : null}
      {activeTab === "feed" && !user && !loading ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <Newspaper size={34} />
          </div>
          <strong>{t("social.feed.title")}</strong>
          <p>{t("profile.registrationRequired")}</p>
        </section>
      ) : null}

      {activeTab === "feed" && user && selectedSystemAccountKey ? (
        <SystemProfileView
          copyingWishId={copyingWishId}
          currentUserId={user.id}
          loading={systemLoading}
          locale={locale}
          payload={systemPayload?.systemAccount?.account_key === selectedSystemAccountKey ? systemPayload : null}
          t={t}
          onBack={closeSystemAccount}
          onCopyWish={copyPublicWishToMine}
          onDeletePost={deletePost}
          onOpenPost={openPostDetail}
          onOpenSystemAccount={openSystemAccount}
          onPublish={publishPost}
        />
      ) : null}

      {activeTab === "feed" && user && !selectedSystemAccountKey ? (
        <FeedView
          addingStoryWishKey={addingStoryWishKey}
          copyingWishId={copyingWishId}
          currentUserId={user.id}
          dailyDraft={dailyDraft}
          systemDrafts={systemDrafts}
          externalLinkUrl={externalLinkUrl}
          linkComposerOpen={linkComposerOpen}
          feedPayload={feedPayload}
          filter={feedFilter}
          loading={feedLoading}
          loadingMore={feedLoadingMore}
          saving={feedSaving}
          locale={locale}
          t={t}
          onCreateDraft={createDailyDraft}
          onCreateExternalLink={createExternalLinkPost}
          onCopyWish={copyPublicWishToMine}
          onAddStoryWish={addStoryWish}
          onDraftBodyChange={updateDailyDraftBody}
          onDraftBodyChangeForPost={updateSystemDraftBody}
          onExternalLinkUrlChange={setExternalLinkUrl}
          onFilterChange={(nextFilter) => {
            if (nextFilter === feedFilter) return;
            feedFilterRef.current = nextFilter;
            const cachedEntry = feedCacheRef.current[nextFilter];
            setFeedPayload(cachedEntry?.locale === locale ? cachedEntry.payload : null);
            setFeedFilter(nextFilter);
          }}
          onLoadMore={() => { void loadFeed(true); }}
          onLinkComposerToggle={() => setLinkComposerOpen((current) => !current)}
          onOpenAuthor={openPublicProfile}
          onOpenBlog={openAuthorBlog}
          onOpenPost={openPostDetail}
          onOpenChallenge={onOpenChallenge}
          onOpenSystemAccount={openSystemAccount}
          onDeletePost={deletePost}
          onPublish={publishPost}
          onUpdateCover={updatePostCover}
          onUploadCover={uploadPostCover}
          onToggleDraftBlock={toggleDailyDraftBlock}
        />
      ) : null}

      {activeTab === "people" && !user && !loading ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <Users size={34} />
          </div>
          <strong>{t("social.people.title")}</strong>
          <p>{t("profile.registrationRequired")}</p>
        </section>
      ) : null}

      {activeTab === "people" && user ? (
        <PeopleView
          contactSavingId={contactSavingId}
          contacts={contacts}
          confirmations={trustConfirmations}
          currentUserId={user.id}
          filter={peopleFilter}
          loading={peopleLoading}
          locale={locale}
          pendingConfirmations={pendingIncomingConfirmations}
          payload={peoplePayload}
          profiles={trustProfiles}
          query={peopleSearchText}
          referralReady={Boolean(referralLink)}
          section={peopleSection}
          savingId={trustSavingId}
          trustCreatingForId={trustCreatingForId}
          t={t}
          onAddContact={(userId) => { void addManualContact(userId); }}
          onConfirm={(confirmationId) => { void respondToTrustConfirmation(confirmationId, "confirm"); }}
          onDecline={(confirmationId) => { void respondToTrustConfirmation(confirmationId, "decline"); }}
          onFilterChange={setPeopleFilter}
          onMessage={(row) => { void openDirectMessage(row.profile.user_id); }}
          onMessageContact={(userId) => { void openDirectMessage(userId); }}
          onOpenBlog={openAuthorBlog}
          onOpenProfile={openPublicProfile}
          onQueryChange={setPeopleSearchText}
          onRefresh={submitPeopleSearch}
          onRequestConfirmation={(contact) => { void requestContactConfirmation(contact); }}
          onRemoveContact={(userId) => { void removeManualContact(userId); }}
          onSectionChange={setPeopleSection}
          onInvite={() => setReferralQrOpen(true)}
        />
      ) : null}

      {activeTab === "blog" && !user && !loading ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <BookOpen size={34} />
          </div>
          <strong>{t("social.blog.title")}</strong>
          <p>{t("profile.registrationRequired")}</p>
        </section>
      ) : null}

      {user ? (
        <BlogWorkspace
          key={user.id}
          userId={user.id}
          authorId={selectedBlogAuthorId}
          locale={locale}
          active={active && activeTab === "blog"}
          refreshKey={dailyDraft?.id ?? ""}
          openCabinetNonce={openFeedDraftsNonce}
          t={t}
          onOpenPost={openPostDetail}
          onChanged={() => { invalidateFeedCache(); void loadSystemDrafts().catch(() => undefined); }}
        />
      ) : null}

      {activeTab === "teams" ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <Users size={34} />
          </div>
          <strong>{t("social.teams.title")}</strong>
          {!user && !loading ? <p>{t("profile.registrationRequired")}</p> : null}
          {user ? (
            <>
              <TeamsGrowthHero
                currentUserId={user.id}
                context={teamContext}
                tasks={teamTasks}
                locale={locale}
                t={t}
                onMessage={(userId) => { void openDirectMessage(userId); }}
                onOpenChallenge={onOpenChallenge}
                onOpenInvite={() => setReferralQrOpen(true)}
                onOpenProfile={openPublicProfile}
                canInvite={Boolean(referralLink) && !referralLocked}
              />
              <div className="team-summary">
                <span>{t("profile.teams.leader")}</span>
                {teamContext?.leader.type === "user" && teamContext.membership?.leader_user_id ? (
                  <button className="inline-profile-button" type="button" onClick={() => { void openPublicProfile(teamContext.membership?.leader_user_id ?? ""); }}>
                    <span className="team-member-avatar">
                      {teamContext.leader.profile?.avatar_url ? <img alt="" src={normalizeAvatarPreviewUrl(teamContext.leader.profile.avatar_url) ?? undefined} style={{ objectPosition: teamContext.leader.profile.avatar_position ?? "50% 50%" }} /> : <UserRound size={16} />}
                    </span>
                    <UserNameWithLevel
                      label={t("profile.levelBadge", { level: teamContext.leader.profile?.level ?? 0 })}
                      level={teamContext.leader.profile?.level}
                    >
                      {formatLeader(teamContext, locale)}
                    </UserNameWithLevel>
                  </button>
                ) : (
                  <strong>{formatLeader(teamContext, locale)}</strong>
                )}
                {teamContext?.leader.type === "user" && teamContext.membership?.leader_user_id ? (
                  <button className="text-button" type="button" onClick={() => { void openDirectMessage(teamContext.membership?.leader_user_id ?? ""); }}>
                    {t("social.teams.messageLeader")}
                  </button>
                ) : null}
                <p>{formatTeamAssignment(teamContext, locale, t)}</p>
              </div>
              <div className="team-summary">
                <span>{t("profile.teams.leadership")}</span>
                <strong
                  className="leadership-value"
                  aria-label={t("profile.teams.leadershipUsage", {
                    total: teamContext?.leadership.total_points ?? 0,
                    used: teamContext?.leadership.used_points ?? 0
                  })}
                >
                  {teamContext?.leadership.used_points ?? 0}/{teamContext?.leadership.total_points ?? 0}
                </strong>
                <progress
                  className="leadership-progress"
                  max={Math.max(teamContext?.leadership.total_points ?? 0, 1)}
                  value={Math.min(
                    teamContext?.leadership.used_points ?? 0,
                    Math.max(teamContext?.leadership.total_points ?? 0, 1)
                  )}
                />
                <p>
                  {t("profile.teams.leadershipBreakdown", {
                    base: teamContext?.leadership.base_points ?? 0,
                    bonus: teamContext?.leadership.bonus_points ?? 0,
                    free: teamContext?.leadership.free_points ?? 0
                  })}
                </p>
                {teamContext?.leadership.overcommitted ? <p className="finance-error">{t("profile.teams.overcommitted")}</p> : null}
              </div>
              <div className="team-summary">
                <span>{t("profile.teams.members")}</span>
                <strong>{teamContext?.directMembers.length ?? 0}</strong>
                {teamContext?.directMembers.length ? (
                  <div className="compact-profile-list">
                    {teamContext.directMembers.map((member) => (
                      <span className="compact-profile-entry" key={member.userId}>
                      <button className="compact-profile-button" type="button" onClick={() => { void openPublicProfile(member.userId); }}>
                        <span className="team-member-avatar">
                          {member.profile?.avatar_url ? <img alt="" src={normalizeAvatarPreviewUrl(member.profile.avatar_url) ?? undefined} style={{ objectPosition: member.profile.avatar_position ?? "50% 50%" }} /> : <UserRound size={14} />}
                        </span>
                        <UserNameWithLevel
                          label={t("profile.levelBadge", { level: member.profile?.level ?? 0 })}
                          level={member.profile?.level}
                        >
                          {formatProfileName(member.profile, member.userId)}
                        </UserNameWithLevel>
                        {" · "}
                        {t("profile.teams.memberCost", {
                          points: member.leadershipCost
                        })}
                      </button>
                      <button className="text-button" type="button" onClick={() => { void openDirectMessage(member.userId); }}>{t("social.teams.messageMember")}</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>{t("profile.teams.emptyMembers")}</p>
                )}
              </div>
              <TeamTaskBoard
                currentUserId={user.id}
                context={teamContext}
                tasks={teamTasks}
                challenges={teamChallenges}
                loading={teamTasksLoading}
                savingId={teamTaskSavingId}
                submissions={teamTaskSubmission}
                reviewFeedback={teamTaskReviewFeedback}
                helpDrafts={teamTaskHelpDraft}
                helpReasons={teamTaskHelpReason}
                revisionTaskId={teamTaskRevisionTaskId}
                revisionDraft={teamTaskRevisionDraft}
                createState={{
                  title: teamTaskTitle,
                  description: teamTaskDescription,
                  goalContext: teamTaskGoalContext,
                  expectedResult: teamTaskExpectedResult,
                  firstStep: teamTaskFirstStep,
                  estimatedMinutes: teamTaskEstimatedMinutes,
                  verificationCriteria: teamTaskVerificationCriteria,
                  leaderReviewDueAt: teamTaskLeaderReviewDueAt,
                  dueAt: teamTaskDueAt,
                  memberId: teamTaskMemberId,
                  kind: teamTaskKind,
                  challengeId: teamTaskChallengeId,
                  creating: teamTaskCreating
                }}
                referralLink={referralLink}
                referralLocked={referralLocked}
                locale={locale}
                t={t}
                onAction={(task, action, submission, feedback) => { void actOnTeamTask(task, action, submission, feedback); }}
                onCreate={() => { void createTeamTask(); }}
                onCreateStateChange={(field, value) => {
                  if (field === "title") setTeamTaskTitle(value);
                  if (field === "description") setTeamTaskDescription(value);
                  if (field === "goalContext") setTeamTaskGoalContext(value);
                  if (field === "expectedResult") setTeamTaskExpectedResult(value);
                  if (field === "firstStep") setTeamTaskFirstStep(value);
                  if (field === "estimatedMinutes") setTeamTaskEstimatedMinutes(value);
                  if (field === "verificationCriteria") setTeamTaskVerificationCriteria(value);
                  if (field === "leaderReviewDueAt") setTeamTaskLeaderReviewDueAt(value);
                  if (field === "dueAt") setTeamTaskDueAt(value);
                  if (field === "memberId") setTeamTaskMemberId(value);
                  if (field === "kind") setTeamTaskKind(value as "manual" | "challenge");
                  if (field === "challengeId") setTeamTaskChallengeId(value);
                }}
                onSubmissionChange={(taskId, value) => setTeamTaskSubmission((current) => ({ ...current, [taskId]: value }))}
                onReviewFeedbackChange={(taskId, value) => setTeamTaskReviewFeedback((current) => ({ ...current, [taskId]: value }))}
                onHelpDraftChange={(taskId, value) => setTeamTaskHelpDraft((current) => ({ ...current, [taskId]: value }))}
                onHelpReasonChange={(taskId, value) => setTeamTaskHelpReason((current) => ({ ...current, [taskId]: value }))}
                onRequestHelp={(task, reason, comment) => { void requestTeamTaskHelp(task, reason, comment); }}
                onResolveHelp={(task, helpRequestId) => { void resolveTeamTaskHelp(task, helpRequestId); }}
                onOpenRevision={(taskId) => setTeamTaskRevisionTaskId(taskId)}
                onCloseRevision={() => setTeamTaskRevisionTaskId(null)}
                onRevisionDraftChange={(field, value) => setTeamTaskRevisionDraft((current) => ({ ...current, [field]: value }))}
                onProposeRevision={(task, changes) => { void proposeTeamTaskRevision(task, changes); }}
                onRespondRevision={(task, revision, action) => { void respondToTeamTaskRevision(task, revision, action); }}
                onOpenChallenge={onOpenChallenge}
                onOpenInvite={() => setReferralQrOpen(true)}
                onOpenProfile={openPublicProfile}
                onMessage={(userId) => { void openDirectMessage(userId); }}
              />
              <HistoryPanel
                title={locale === "ru" ? "История лидерских бонусов" : "Team bonus history"}
                open={teamRewardsOpen}
                loading={teamRewardsLoading}
                error={teamRewardsError}
                emptyText={locale === "ru" ? "Лидерских бонусов пока нет." : "No team bonuses yet."}
                loadingText={t("app.common.loading")}
                rowCount={teamRewards?.length ?? 0}
                onToggle={toggleTeamRewards}
              >
                <div className="payout-list">
                  {(teamRewards ?? []).map((row) => (
                    <article className="payout-row" key={`${row.bonus_date}-${row.created_at}`}>
                      <div>
                        <strong>{formatDay(row.bonus_date, locale)}</strong>
                        <span>{locale === "ru" ? "Участников" : "Members"}: {row.source_count}</span>
                      </div>
                      <div>
                        <strong>+{formatMoney(row.reward_amount, locale)}</strong>
                        <span>{locale === "ru" ? "в Core" : "to Core"}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </HistoryPanel>
            </>
          ) : null}
        </section>
      ) : null}

      {activeTab === "profile" && !user && !loading ? (
        <section className="profile-panel">
          <div className="profile-avatar placeholder">
            <UserRound size={34} />
          </div>
          <strong>{t("profile.guest")}</strong>
          <p>{t("profile.registrationRequired")}</p>
        </section>
      ) : null}

      {activeTab === "profile" && user ? (
        <section className="profile-panel owner-profile-panel">
          <div className="owner-profile-header">
            <div className="profile-avatar">
              {profile?.avatar_url ? <img alt="" src={profile.avatar_url} style={{ objectPosition: profile.avatar_position }} /> : <UserRound size={34} />}
            </div>
            <div className="owner-profile-copy">
              <strong>
                <UserNameWithLevel
                  label={t("profile.levelBadge", { level: core?.level ?? profile?.level ?? 0 })}
                  level={core?.level ?? profile?.level ?? 0}
                >
                  {displayName}
                </UserNameWithLevel>
              </strong>
              {profile?.username ? <p>{handle}</p> : null}
            </div>
          </div>
          <div className="profile-action-row" aria-label={t("profile.actions.title")}>
            <button className="profile-action-button" type="button" aria-label={t("profile.public.edit")} aria-expanded={profileAction === "edit"} onClick={() => toggleProfileAction("edit")}>
              <Edit3 size={18} />
              <span>{t("profile.actions.edit")}</span>
            </button>
            <button className="profile-action-button" type="button" aria-label={t("profile.actions.settings")} aria-expanded={profileAction === "settings"} onClick={() => toggleProfileAction("settings")}>
              <Settings size={18} />
              <span>{t("profile.actions.settings")}</span>
            </button>
            <button className="profile-action-button" type="button" aria-label={t("profile.actions.skills")} aria-expanded={profileAction === "skills"} onClick={() => toggleProfileAction("skills")}>
              <Sparkles size={18} />
              <span>{t("profile.actions.skills")}</span>
            </button>
            <button className="profile-action-button" type="button" aria-label={t("profile.actions.activity")} aria-expanded={profileAction === "activity"} onClick={openPayoutNotifications}>
              <span className="profile-action-icon-with-badge"><Bell size={18} />{pendingIncomingConfirmations + notificationUnreadCount > 0 ? <i>{pendingIncomingConfirmations + notificationUnreadCount}</i> : null}</span>
              <span>{t("profile.actions.activity")}</span>
            </button>
          </div>
          <section className="public-profile-box owner-profile-summary">
            <div className="section-heading-row"><span>{t("profile.public.title")}</span></div>
            {socialProfile?.profile?.bio ? <p>{socialProfile.profile.bio}</p> : <p>{t("profile.public.emptyBio")}</p>}
            {socialProfile?.links.length ? (
              <div className="profile-links">
                {socialProfile.links.map((item) => <a href={item.url} target="_blank" rel="noreferrer" key={item.id}><ExternalLink size={15} />{item.label ?? readableHost(item.url)}</a>)}
              </div>
            ) : null}
          </section>
          <div className="referral-box referral-box-compact">
            <div className="referral-box-copy"><span><Link size={15} />{t("profile.referral.title")}</span><small>{t("profile.referral.compactHint")}</small></div>
            <div className="referral-compact-actions">
              <button
                className="secondary-button referral-icon-button"
                type="button"
                disabled={!referralLink}
                aria-label={copied ? t("profile.referral.copied") : t("profile.referral.copy")}
                title={copied ? t("profile.referral.copied") : t("profile.referral.copy")}
                onClick={copyReferralLink}
              >
                {copied ? <Check size={19} /> : <Copy size={19} />}
              </button>
              <button className="secondary-button" type="button" disabled={!referralLink} onClick={() => setReferralQrOpen(true)}><Share2 size={16} />{t("profile.referral.invite")}</button>
            </div>
            {referralLocked ? <small className="referral-locked-hint">{t("social.teams.inviteLocked")}</small> : null}
          </div>
          <LegalDisclosure
            contact={t("legal.contact")}
            locale={locale}
            privacy={t("legal.privacy")}
            summary={t("legal.summary")}
            terms={t("legal.terms")}
          />
        </section>
      ) : null}

      {profileAction === "edit" && user ? (
        <ProfileEditorDialog
          editor={profileEditor}
          profile={profile}
          saving={profileSaving || avatarUploading}
          t={t}
          onChange={setProfileEditor}
          onSave={() => { void saveProfileEditor(); }}
          onClose={() => setProfileAction(null)}
        />
      ) : null}
      {profileAction === "settings" ? (
        <AppearanceDialog
          accentTheme={accentTheme}
          colorTheme={colorTheme}
          displayCurrency={displayCurrency}
          locale={locale}
          t={t}
          uiScale={uiScale}
          onClose={() => setProfileAction(null)}
          onLocale={(value) => { void setLocale(value); }}
          onCurrency={setDisplayCurrency}
          onScale={(value) => setUiScale(value)}
          onTheme={(value) => setColorTheme(value)}
          onAccent={(value) => setAccentTheme(value)}
        />
      ) : null}
      {profileAction === "skills" ? (
        <SkillPassportDialog t={t} onClose={() => setProfileAction(null)} />
      ) : null}
      {profileAction === "activity" ? (
        <ActivityDialog
          notifications={notifications}
          notificationsLoading={notificationsLoading}
          unreadCount={notificationUnreadCount}
          pendingConfirmations={pendingIncomingConfirmations}
          locale={locale}
          t={t}
          onClose={() => setProfileAction(null)}
          onMarkAllRead={() => void markAllNotificationsRead()}
          onOpenNotification={(item) => void openNotification(item)}
          onOpenConfirmations={() => { setProfileAction(null); setPeopleSection("confirmations"); onTabChange("people"); }}
        />
      ) : null}

      {publicProfileLoading ? <p className="finance-error neutral">{t("app.common.loading")}</p> : null}
      {referralQrOpen && referralLink ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setReferralQrOpen(false)}>
          <section className="modal-sheet small referral-qr-modal" role="dialog" aria-modal="true" aria-label={t("profile.referral.qrTitle")} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={() => setReferralQrOpen(false)}>
              <X size={18} />
            </button>
            <strong>{t("profile.referral.qrTitle")}</strong>
            <div className="referral-qr-code">
              <QRCodeSVG value={referralLink.url} size={220} level="M" marginSize={2} />
            </div>
            <p>{referralLink.url}</p>
          </section>
        </div>
      ) : null}
      {publicProfile ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setPublicProfile(null)}>
          <section className="modal-sheet public-profile-modal" role="dialog" aria-modal="true" aria-label={t("profile.public.title")} onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={() => setPublicProfile(null)}>
              <X size={18} />
            </button>
            <div className="profile-avatar">
              {publicProfile.profile.avatar_url ? <img alt="" src={publicProfile.profile.avatar_url} style={{ objectPosition: publicProfile.profile.avatar_position ?? "50% 50%" }} /> : <UserRound size={34} />}
            </div>
            <strong>
              <UserNameWithLevel
                label={t("profile.levelBadge", { level: publicProfile.profile.level })}
                level={publicProfile.profile.level}
              >
                {formatProfileName(publicProfile.profile, publicProfile.profile.user_id)}
              </UserNameWithLevel>
            </strong>
            <div className="profile-facts">
              {publicProfile.relation.isTeam ? <span>{t("profile.visibility.team")}</span> : null}
              {publicProfile.relation.isContact ? <span>{t("profile.visibility.contacts")}</span> : null}
            </div>
            {!publicProfile.relation.isSelf ? (
              <div className="public-profile-actions">
                <button className="secondary-button" type="button" onClick={() => { void openDirectMessage(publicProfile.profile.user_id); }}>
                  <MessageCircle size={16} />
                  {t("social.people.message")}
                </button>
                <button className="secondary-button" type="button" onClick={() => openAuthorBlog(publicProfile.profile.user_id)}>
                  <BookOpen size={16} />
                  {t("social.feed.openBlog")}
                </button>
                {!publicProfile.relation.isContact ? (
                  <button className="secondary-button" type="button" disabled={contactSavingId === publicProfile.profile.user_id} onClick={() => { void addManualContact(publicProfile.profile.user_id); }}>
                    <UserPlus size={16} />
                    {t("social.people.addContact")}
                  </button>
                ) : null}
              </div>
            ) : null}
            {publicProfile.profile.bio ? <p>{publicProfile.profile.bio}</p> : null}
            {publicProfile.links.length ? (
              <div className="profile-links">
                {publicProfile.links.map((item) => (
                  <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                    <ExternalLink size={15} />
                    {item.label ?? readableHost(item.url)}
                  </a>
                ))}
              </div>
            ) : null}
            {publicProfile.publicWishes.length ? (
              <PublicWishesPanel
                copyingWishId={copyingWishId}
                isSelf={publicProfile.relation.isSelf}
                locale={locale}
                t={t}
                wishes={publicProfile.publicWishes}
                onCopy={copyPublicWishToMine}
              />
            ) : null}
          </section>
        </div>
      ) : null}
      {selectedPost ? (
        <PostDetailModal
          copyingWishId={copyingWishId}
          currentUserId={user?.id ?? null}
          locale={locale}
          post={selectedPost}
          readOnly={activeTab === "blog"}
          t={t}
          onClose={() => { setStoryWishError(null); setSelectedPost(null); }}
          onDeletePost={deletePost}
          onOpenAuthor={openPublicProfile}
          onOpenBlog={openAuthorBlog}
          onOpenChallenge={onOpenChallenge}
          onOpenSystemAccount={openSystemAccount}
          onPublish={publishPost}
          onUpdateCover={updatePostCover}
          onUploadCover={uploadPostCover}
          onUpdateReview={updateProjectReview}
          onCopyWish={copyPublicWishToMine}
          onAddStoryWish={addStoryWish}
          storyWishError={storyWishError}
          storyWishSaving={addingStoryWishKey === selectedPost.source_key}
          onReposted={() => {
            invalidateFeedCache();
            void Promise.all([loadFeed(false, true), loadBlog()]);
          }}
        />
      ) : null}
      {directTargetUserId ? (
        <DirectMessageModal
          currentUserId={user?.id ?? ""}
          loading={directLoading}
          messageBody={directMessageBody}
          payload={directPayload}
          sending={directSending}
          t={t}
          onBodyChange={setDirectMessageBody}
          onClose={closeDirectMessage}
          onOpenProfile={(userId) => { void openPublicProfile(userId); }}
          onSend={() => { void sendDirectMessage(); }}
        />
      ) : null}
    </section>
  );
}

function TeamsGrowthHero({
  currentUserId,
  context,
  tasks,
  locale,
  t,
  onMessage,
  onOpenChallenge,
  onOpenInvite,
  onOpenProfile,
  canInvite
}: {
  currentUserId: string;
  context: TeamContext | null;
  tasks: TeamTask[];
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onMessage: (userId: string) => void;
  onOpenChallenge: () => void;
  onOpenInvite: () => void;
  onOpenProfile: (userId: string) => void;
  canInvite: boolean;
}) {
  const [focus, setFocus] = useState<"mine" | "help">("mine");
  const memberTasks = tasks.filter((task) => task.member_user_id === currentUserId);
  const leaderTasks = tasks.filter((task) => task.leader_user_id === currentUserId);
  const isMentor = Boolean(context?.directMembers.length) || leaderTasks.length > 0;
  const activeMemberTasks = memberTasks.filter((task) => ["proposed", "accepted", "returned"].includes(task.status));
  const reviewTasks = leaderTasks.filter((task) => ["submitted", "proposed", "accepted", "returned"].includes(task.status));
  const attentionTasks = focus === "help" ? reviewTasks : activeMemberTasks;
  const leadProfile = context?.leader.type === "user" ? context.leader.profile : null;
  const roomPeople = [
    ...(leadProfile ? [{ id: leadProfile.user_id, profile: leadProfile, role: "mentor" as const }] : []),
    ...(context?.directMembers ?? []).map((member) => ({ id: member.userId, profile: member.profile, role: "member" as const }))
  ].filter((person) => person.profile);
  const firstTask = attentionTasks[0] ?? null;
  const taskTargetId = firstTask ? (firstTask.member_user_id === currentUserId ? firstTask.leader_user_id : firstTask.member_user_id) : null;
  const taskTarget = taskTargetId
    ? (taskTargetId === leadProfile?.user_id ? leadProfile : context?.directMembers.find((member) => member.userId === taskTargetId)?.profile)
    : null;
  const pendingCount = focus === "help" ? reviewTasks.length : activeMemberTasks.length;
  const completedCount = tasks.filter((task) => task.member_user_id === currentUserId && task.status === "completed").length;

  return (
    <section className="team-growth-hero" aria-labelledby="team-growth-title">
      <div className="team-growth-heading">
        <div>
          <span className="team-growth-eyebrow"><Sparkles size={14} /> {t("social.teams.circleEyebrow")}</span>
          <h2 id="team-growth-title">{t("social.teams.circleTitle")}</h2>
          <p>{t("social.teams.circleSubtitle")}</p>
        </div>
        <span className="team-growth-spark" aria-hidden="true"><Star size={18} fill="currentColor" /></span>
      </div>

      <div className="team-focus-switch" role="group" aria-label={t("social.teams.focusLabel")}>
        <button className={focus === "mine" ? "active" : ""} type="button" aria-pressed={focus === "mine"} onClick={() => setFocus("mine")}>
          <UserRound size={15} /> {t("social.teams.focusMine")}
        </button>
        {isMentor ? (
          <button className={focus === "help" ? "active" : ""} type="button" aria-pressed={focus === "help"} onClick={() => setFocus("help")}>
            <Users size={15} /> {t("social.teams.focusHelp")}
            {reviewTasks.length ? <b>{reviewTasks.length}</b> : null}
          </button>
        ) : null}
      </div>

      <div className="team-growth-grid">
        <div className="team-circle-card">
          <div className="team-card-kicker"><span>{t("social.teams.roomTitle")}</span><span>{roomPeople.length + 1}</span></div>
          <div className="team-circle-scene" aria-label={t("social.teams.roomTable")}>
            <span className="team-circle-halo" aria-hidden="true" />
            <span className="team-circle-table" aria-hidden="true"><span>{t("social.teams.roomTable")}</span></span>
            <span className="team-circle-self" title={t("social.teams.youHere")}><Sparkles size={20} /><small>{t("social.teams.youHere")}</small></span>
            {roomPeople.slice(0, 6).map((person, index) => (
              <button
                className={`team-circle-person person-${index + 1}`}
                key={person.id}
                type="button"
                title={formatProfileName(person.profile, person.id)}
                onClick={() => onOpenProfile(person.id)}
              >
                <span className="team-circle-avatar">
                  {person.profile?.avatar_url ? <img alt="" src={normalizeAvatarPreviewUrl(person.profile.avatar_url) ?? undefined} style={{ objectPosition: person.profile.avatar_position ?? "50% 50%" }} /> : <UserRound size={16} />}
                </span>
                <small>{formatProfileName(person.profile, person.id)}</small>
              </button>
            ))}
          </div>
          <div className="team-room-actions">
            <button className="team-room-chip" type="button" disabled={!canInvite} onClick={onOpenInvite}><Sparkles size={14} /> {t("social.teams.roomInvite")}</button>
            <button className="team-room-chip" type="button" onClick={() => firstTask && taskTargetId ? onMessage(taskTargetId) : undefined} disabled={!taskTargetId}>
              <MessageCircle size={14} /> {t("social.teams.roomTalk")}
            </button>
          </div>
        </div>

        <div className="team-agenda-card">
          <div className="team-card-kicker"><span><Sparkles size={14} /> {t("social.teams.todayTitle")}</span><span className="team-agenda-count">{pendingCount}</span></div>
          <h3>{focus === "help" ? t("social.teams.todayHelpTitle") : t("social.teams.todayMineTitle")}</h3>
          {firstTask ? (
            <article className="team-agenda-next">
              <span className="team-agenda-dot" aria-hidden="true"><Check size={14} /></span>
              <div>
                <strong>{firstTask.title}</strong>
                <p>{firstTask.status === "submitted" ? t("social.teams.todayReview") : firstTask.due_at ? t("social.teams.todayDue", { date: formatDate(firstTask.due_at, locale) }) : t("social.teams.todayNext")}</p>
                {taskTarget ? <button className="text-button" type="button" onClick={() => onOpenProfile(taskTargetId ?? "")}>{formatProfileName(taskTarget, taskTargetId ?? "")}</button> : null}
              </div>
            </article>
          ) : (
            <div className="team-agenda-empty"><span aria-hidden="true">✦</span><p>{t("social.teams.todayEmpty")}</p></div>
          )}
          <div className="team-agenda-footer">
            <span>{t("social.teams.completedMine", { count: completedCount })}</span>
            {focus === "help" && !reviewTasks.length ? <button className="secondary-button" type="button" onClick={onOpenChallenge}>{t("social.teams.findStep")}</button> : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamTaskBoard({
  currentUserId,
  context,
  tasks,
  challenges,
  loading,
  savingId,
  submissions,
  reviewFeedback,
  helpDrafts,
  helpReasons,
  revisionTaskId,
  revisionDraft,
  createState,
  referralLink,
  referralLocked,
  locale,
  t,
  onAction,
  onCreate,
  onCreateStateChange,
  onSubmissionChange,
  onReviewFeedbackChange,
  onHelpDraftChange,
  onHelpReasonChange,
  onRequestHelp,
  onResolveHelp,
  onOpenRevision,
  onCloseRevision,
  onRevisionDraftChange,
  onProposeRevision,
  onRespondRevision,
  onOpenChallenge,
  onOpenInvite,
  onOpenProfile,
  onMessage
}: {
  currentUserId: string;
  context: TeamContext | null;
  tasks: TeamTask[];
  challenges: TeamChallengeOption[];
  loading: boolean;
  savingId: string | null;
  submissions: Record<string, string>;
  reviewFeedback: Record<string, string>;
  helpDrafts: Record<string, string>;
  helpReasons: Record<string, TeamTaskHelpRequest["reason"]>;
  revisionTaskId: string | null;
  revisionDraft: { firstStep: string; expectedResult: string; dueAt: string };
  createState: {
    title: string;
    description: string;
    goalContext: string;
    expectedResult: string;
    firstStep: string;
    estimatedMinutes: string;
    verificationCriteria: string;
    leaderReviewDueAt: string;
    dueAt: string;
    memberId: string;
    kind: "manual" | "challenge";
    challengeId: string;
    creating: boolean;
  };
  referralLink: ReferralLink | null;
  referralLocked: boolean;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onAction: (task: TeamTask, action: string, submission?: string, feedback?: string) => void;
  onCreate: () => void;
  onCreateStateChange: (field: "title" | "description" | "goalContext" | "expectedResult" | "firstStep" | "estimatedMinutes" | "verificationCriteria" | "leaderReviewDueAt" | "dueAt" | "memberId" | "kind" | "challengeId", value: string) => void;
  onSubmissionChange: (taskId: string, value: string) => void;
  onReviewFeedbackChange: (taskId: string, value: string) => void;
  onHelpDraftChange: (taskId: string, value: string) => void;
  onHelpReasonChange: (taskId: string, value: TeamTaskHelpRequest["reason"]) => void;
  onRequestHelp: (task: TeamTask, reason: TeamTaskHelpRequest["reason"], comment: string) => void;
  onResolveHelp: (task: TeamTask, helpRequestId: string) => void;
  onOpenRevision: (taskId: string) => void;
  onCloseRevision: () => void;
  onRevisionDraftChange: (field: "firstStep" | "expectedResult" | "dueAt", value: string) => void;
  onProposeRevision: (task: TeamTask, changes: Record<string, unknown>) => void;
  onRespondRevision: (task: TeamTask, revision: TeamTaskRevision, action: "accept" | "decline") => void;
  onOpenChallenge: () => void;
  onOpenInvite: () => void;
  onOpenProfile: (userId: string) => void;
  onMessage: (userId: string) => void;
}) {
  const memberTasks = tasks.filter((task) => task.member_user_id === currentUserId);
  const leaderTasks = tasks.filter((task) => task.leader_user_id === currentUserId);
  const isLeader = Boolean(context?.directMembers.length) || leaderTasks.length > 0;
  const path = context?.leaderPath;
  const statusKey = (status: TeamTask["status"]): MessageKey => `social.teams.${status}` as MessageKey;
  const challengeName = (challengeId: string | null) => {
    if (!challengeId) return null;
    const challenge = challenges.find((item) => item.id === challengeId);
    return challenge ? challenge.title[locale] ?? challenge.title.en ?? challenge.id : challengeId;
  };
  const helpReasonKey = (reason: TeamTaskHelpRequest["reason"]): MessageKey => `social.teams.helpReason.${reason}` as MessageKey;

  return (
    <>
      {isLeader ? (
        <div className="team-help-grid">
          <section className="team-summary team-path-summary">
            <span>{t("social.teams.leaderPath")}</span>
            <div className="team-path-steps">
              <span className={path?.firstResultCompleted ? "is-done" : "is-next"}>{path?.firstResultCompleted ? "✓" : "1"} {t("social.teams.path.result")}</span>
              <span className={path?.referralRegistered ? "is-done" : path?.inviteUnlocked ? "is-next" : ""}>{path?.referralRegistered ? "✓" : "2"} {t("social.teams.path.invite")}</span>
              <span className={path?.newcomerHelpCompleted ? "is-done" : path?.referralRegistered ? "is-next" : ""}>{path?.newcomerHelpCompleted ? "✓" : "3"} {t("social.teams.path.help")}</span>
            </div>
            {path?.next === "publish_result" ? <button className="secondary-button" type="button" onClick={onOpenChallenge}>{t("social.teams.path.result")}</button> : null}
            {path?.next === "invite_participant" ? (
              <button className="secondary-button" type="button" disabled={referralLocked || !referralLink} onClick={onOpenInvite}>{t("social.teams.path.invite")}</button>
            ) : null}
          </section>
          <section className="team-summary">
            <span>{t("social.teams.referralQuality")}</span>
            <p>{t("social.teams.registered", { count: context?.referralQuality?.registered ?? 0 })}</p>
            <p>{t("social.teams.activated", { count: context?.referralQuality?.activated ?? 0 })}</p>
            <p>{t("social.teams.retainedD7", { count: context?.referralQuality?.retainedD7 ?? 0 })}</p>
          </section>
        </div>
      ) : null}

      <section className="team-summary team-task-summary">
        <div className="section-heading-row">
          <span>{t("social.teams.tasks")}</span>
          {context?.taskCounts?.leaderReview ? <strong>{t("social.teams.taskQueue", { count: context.taskCounts.leaderReview })}</strong> : null}
        </div>
        {loading ? <p>{t("app.common.loading")}</p> : null}
        {!loading && !tasks.length ? <p>{t("social.teams.emptyTasks")}</p> : null}
        {tasks.map((task) => {
          const mine = task.member_user_id === currentUserId;
          const otherUserId = mine ? task.leader_user_id : task.member_user_id;
          const targetProfile = mine ? context?.leader.profile : context?.directMembers.find((item) => item.userId === task.member_user_id)?.profile;
          const pending = savingId === task.id;
          return (
            <article className="team-task-card" key={task.id}>
              <div className="team-task-card-header">
                <div>
                  <strong>{task.title}</strong>
                  <span>{t(statusKey(task.status))}{task.task_kind === "challenge" && challengeName(task.challenge_id) ? ` · ${challengeName(task.challenge_id)}` : ""}</span>
                </div>
                <small>{task.due_at ? `${t("social.teams.taskDueShort")}: ${formatDate(task.due_at, locale)}` : formatDate(task.updated_at, locale)}</small>
              </div>
              {(task.goal_context || task.expected_result || task.first_step || task.estimated_minutes || task.verification_criteria || task.leader_review_due_at) ? (
                <div className="team-task-agreement">
                  {task.goal_context ? <p><strong>{t("social.teams.goalContext")}:</strong> {task.goal_context}</p> : null}
                  {task.expected_result ? <p><strong>{t("social.teams.expectedResult")}:</strong> {task.expected_result}</p> : null}
                  {task.first_step ? <p><strong>{t("social.teams.firstStep")}:</strong> {task.first_step}</p> : null}
                  {task.estimated_minutes ? <p><strong>{t("social.teams.estimatedMinutes")}:</strong> {task.estimated_minutes} {t("social.teams.minutes")}</p> : null}
                  {task.verification_criteria ? <p><strong>{t("social.teams.verificationCriteria")}:</strong> {task.verification_criteria}</p> : null}
                  {task.leader_review_due_at ? <p><strong>{t("social.teams.reviewDue")}:</strong> {formatDate(task.leader_review_due_at, locale)}</p> : null}
                </div>
              ) : null}
              {task.description ? <p>{task.description}</p> : null}
              {task.submission ? <p className="team-task-submission"><strong>{t("social.teams.submission")}:</strong> {task.submission}</p> : null}
              {task.review_feedback ? <p className="team-task-feedback"><strong>{t("social.teams.reviewFeedback")}:</strong> {task.review_feedback}</p> : null}
              {(task.revisions ?? []).filter((revision) => revision.status === "open").map((revision) => (
                <div className="team-task-revision" key={revision.id}>
                  <strong>{t("social.teams.revisionOpen")}</strong>
                  <span>{revision.proposer_user_id === currentUserId ? t("social.teams.revisionWaiting") : t("social.teams.revisionNeedsResponse")}</span>
                  {revision.changes.firstStep ? <p><strong>{t("social.teams.firstStep")}:</strong> {String(revision.changes.firstStep)}</p> : null}
                  {revision.changes.expectedResult ? <p><strong>{t("social.teams.expectedResult")}:</strong> {String(revision.changes.expectedResult)}</p> : null}
                  {revision.changes.dueAt ? <p><strong>{t("social.teams.taskDueShort")}:</strong> {formatDate(String(revision.changes.dueAt), locale)}</p> : null}
                  {revision.proposer_user_id !== currentUserId ? (
                    <div className="team-task-actions">
                      <button className="secondary-button" type="button" disabled={pending} onClick={() => onRespondRevision(task, revision, "accept")}>{t("social.teams.revisionAccept")}</button>
                      <button className="text-button" type="button" disabled={pending} onClick={() => onRespondRevision(task, revision, "decline")}>{t("social.teams.revisionDecline")}</button>
                    </div>
                  ) : null}
                </div>
              ))}
              <div className="team-task-actions">
                {targetProfile ? <button className="text-button" type="button" onClick={() => onOpenProfile(otherUserId)}>{formatProfileName(targetProfile, otherUserId)}</button> : null}
                <button className="text-button" type="button" onClick={() => onMessage(otherUserId)}>{mine ? t("social.teams.messageLeader") : t("social.teams.messageMember")}</button>
                {mine && task.status === "proposed" ? <><button className="secondary-button" type="button" disabled={pending} onClick={() => onAction(task, "accept")}>{t("social.teams.accept")}</button><button className="secondary-button" type="button" disabled={pending} onClick={() => onAction(task, "decline")}>{t("social.teams.decline")}</button></> : null}
                {mine && ["accepted", "returned"].includes(task.status) && task.task_kind === "manual" ? (
                  <>
                    <textarea value={submissions[task.id] ?? ""} onChange={(event) => onSubmissionChange(task.id, event.target.value)} placeholder={t("social.teams.submission")} maxLength={4000} />
                    <button className="secondary-button" type="button" disabled={pending || !(submissions[task.id] ?? "").trim()} onClick={() => onAction(task, "submit", submissions[task.id])}>{t("social.teams.submit")}</button>
                  </>
                ) : null}
                {!mine && task.status === "submitted" ? (
                  <>
                    <textarea value={reviewFeedback[task.id] ?? ""} onChange={(event) => onReviewFeedbackChange(task.id, event.target.value)} placeholder={t("social.teams.reviewFeedbackPlaceholder")} maxLength={4000} />
                    <button className="secondary-button" type="button" disabled={pending} onClick={() => onAction(task, "complete", undefined, reviewFeedback[task.id])}>{t("social.teams.complete")}</button>
                    <button className="secondary-button" type="button" disabled={pending || !(reviewFeedback[task.id] ?? "").trim()} onClick={() => onAction(task, "return", undefined, reviewFeedback[task.id])}>{t("social.teams.return")}</button>
                  </>
                ) : null}
                {!mine && ["proposed", "accepted", "submitted", "returned"].includes(task.status) ? <button className="text-button" type="button" disabled={pending} onClick={() => onAction(task, "cancel")}>{t("social.teams.cancel")}</button> : null}
                {mine && task.task_kind === "challenge" && ["accepted", "returned"].includes(task.status) ? <button className="secondary-button" type="button" onClick={onOpenChallenge}>{t("social.feed.openChallenge")}</button> : null}
                {mine && ["proposed", "accepted", "returned"].includes(task.status) && !(task.revisions ?? []).some((revision) => revision.status === "open") ? <button className="text-button" type="button" disabled={pending} onClick={() => onOpenRevision(task.id)}><Edit3 size={14} /> {t("social.teams.proposeChange")}</button> : null}
                {(["proposed", "accepted", "submitted", "returned"].includes(task.status)) ? (
                  <>
                    {(task.help_requests ?? []).some((help) => help.status === "open") ? (
                      <button className="text-button" type="button" disabled={pending} onClick={() => onResolveHelp(task, (task.help_requests ?? []).find((help) => help.status === "open")?.id ?? "")}><Check size={14} /> {t("social.teams.helpResolve")}</button>
                    ) : (
                      <>
                        <select className="team-help-reason" value={helpReasons[task.id] ?? "blocked"} onChange={(event) => onHelpReasonChange(task.id, event.target.value as TeamTaskHelpRequest["reason"])} aria-label={t("social.teams.helpReasonLabel")}>
                          {["blocked", "clarification", "feedback", "other"].map((reason) => <option value={reason} key={reason}>{t(helpReasonKey(reason as TeamTaskHelpRequest["reason"]))}</option>)}
                        </select>
                        <input className="team-help-comment" value={helpDrafts[task.id] ?? ""} onChange={(event) => onHelpDraftChange(task.id, event.target.value)} placeholder={t("social.teams.helpCommentPlaceholder")} maxLength={2000} />
                        <button className="text-button" type="button" disabled={pending} onClick={() => onRequestHelp(task, helpReasons[task.id] ?? "blocked", helpDrafts[task.id] ?? "")}><MessageCircle size={14} /> {t("social.teams.helpRequest")}</button>
                      </>
                    )}
                  </>
                ) : null}
              </div>
              {revisionTaskId === task.id ? (
                <div className="team-task-revision-form">
                  <strong>{t("social.teams.revisionTitle")}</strong>
                  <input value={revisionDraft.firstStep} onChange={(event) => onRevisionDraftChange("firstStep", event.target.value)} placeholder={t("social.teams.firstStep")} maxLength={1200} />
                  <textarea value={revisionDraft.expectedResult} onChange={(event) => onRevisionDraftChange("expectedResult", event.target.value)} placeholder={t("social.teams.expectedResult")} maxLength={2000} />
                  <label className="team-task-due-field"><span>{t("social.teams.taskDue")}</span><input type="datetime-local" value={revisionDraft.dueAt} onChange={(event) => onRevisionDraftChange("dueAt", event.target.value)} /></label>
                  <div className="team-task-actions">
                    <button className="secondary-button" type="button" disabled={pending || (!revisionDraft.firstStep.trim() && !revisionDraft.expectedResult.trim() && !revisionDraft.dueAt)} onClick={() => onProposeRevision(task, { ...(revisionDraft.firstStep.trim() ? { firstStep: revisionDraft.firstStep.trim() } : {}), ...(revisionDraft.expectedResult.trim() ? { expectedResult: revisionDraft.expectedResult.trim() } : {}), ...(revisionDraft.dueAt ? { dueAt: new Date(revisionDraft.dueAt).toISOString() } : {}) })}>{t("social.teams.revisionSend")}</button>
                    <button className="text-button" type="button" disabled={pending} onClick={onCloseRevision}>{t("app.common.cancel")}</button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>

      {isLeader && context?.directMembers.length ? (
        <section className="team-summary team-task-create">
          <div className="section-heading-row"><span>{t("social.teams.createTask")}</span></div>
          <div className="team-task-form">
            <select value={createState.memberId} onChange={(event) => onCreateStateChange("memberId", event.target.value)} aria-label={t("social.people.title")}>
              <option value="">{t("social.people.title")}</option>
              {context.directMembers.map((member) => <option key={member.userId} value={member.userId}>{formatProfileName(member.profile, member.userId)}</option>)}
            </select>
            <select value={createState.kind} onChange={(event) => onCreateStateChange("kind", event.target.value)} aria-label={t("social.teams.tasks")}>
              <option value="manual">{t("social.teams.taskManual")}</option>
              <option value="challenge">{t("social.teams.taskChallenge")}</option>
            </select>
            {createState.kind === "challenge" ? (
              <select value={createState.challengeId} onChange={(event) => onCreateStateChange("challengeId", event.target.value)} aria-label={t("social.teams.taskChallenge")}>
                <option value="">{t("social.teams.taskChallenge")}</option>
                {challenges.map((challenge) => <option key={challenge.id} value={challenge.id}>{challenge.title[locale] ?? challenge.title.en ?? challenge.id}</option>)}
              </select>
            ) : null}
            <input value={createState.title} onChange={(event) => onCreateStateChange("title", event.target.value)} placeholder={t("social.teams.taskTitle")} maxLength={160} />
            <textarea value={createState.description} onChange={(event) => onCreateStateChange("description", event.target.value)} placeholder={t("social.teams.taskDescription")} maxLength={4000} />
            <input value={createState.goalContext} onChange={(event) => onCreateStateChange("goalContext", event.target.value)} placeholder={t("social.teams.goalContext")} maxLength={1200} />
            <input value={createState.expectedResult} onChange={(event) => onCreateStateChange("expectedResult", event.target.value)} placeholder={t("social.teams.expectedResult")} maxLength={2000} />
            <input value={createState.firstStep} onChange={(event) => onCreateStateChange("firstStep", event.target.value)} placeholder={t("social.teams.firstStep")} maxLength={1200} />
            <input type="number" min="1" max="1440" value={createState.estimatedMinutes} onChange={(event) => onCreateStateChange("estimatedMinutes", event.target.value)} placeholder={t("social.teams.estimatedMinutes")} />
            <textarea value={createState.verificationCriteria} onChange={(event) => onCreateStateChange("verificationCriteria", event.target.value)} placeholder={t("social.teams.verificationCriteria")} maxLength={2000} />
            <label className="team-task-due-field">
              <span>{t("social.teams.taskDue")}</span>
              <input type="datetime-local" value={createState.dueAt} onChange={(event) => onCreateStateChange("dueAt", event.target.value)} />
            </label>
            <label className="team-task-due-field">
              <span>{t("social.teams.reviewDue")}</span>
              <input type="datetime-local" value={createState.leaderReviewDueAt} onChange={(event) => onCreateStateChange("leaderReviewDueAt", event.target.value)} />
            </label>
            <button className="secondary-button" type="button" disabled={createState.creating || !createState.memberId || !createState.title.trim() || (createState.kind === "challenge" && !createState.challengeId)} onClick={onCreate}>{t("social.teams.assign")}</button>
          </div>
        </section>
      ) : null}
    </>
  );
}

function DirectMessageModal({
  currentUserId,
  loading,
  messageBody,
  payload,
  sending,
  t,
  onBodyChange,
  onClose,
  onOpenProfile,
  onSend
}: {
  currentUserId: string;
  loading: boolean;
  messageBody: string;
  payload: DirectConversationPayload | null;
  sending: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onBodyChange: (body: string) => void;
  onClose: () => void;
  onOpenProfile: (userId: string) => void;
  onSend: () => void;
}) {
  const targetProfile = payload?.targetProfile ?? null;
  const targetName = targetProfile ? formatProfileName(targetProfile, targetProfile.user_id) : t("social.people.message");

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet direct-message-modal" role="dialog" aria-modal="true" aria-label={t("social.direct.title")} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}>
          <X size={18} />
        </button>
        <header className="direct-message-header">
          <button className="feed-author" type="button" disabled={!targetProfile} onClick={() => targetProfile ? onOpenProfile(targetProfile.user_id) : undefined}>
            <span className="feed-author-avatar">
              {targetProfile?.avatar_url ? <img alt="" src={targetProfile.avatar_url} style={{ objectPosition: targetProfile.avatar_position ?? "50% 50%" }} /> : <UserRound size={18} />}
            </span>
            <UserNameWithLevel
              label={targetProfile ? t("profile.levelBadge", { level: targetProfile.level }) : undefined}
              level={targetProfile?.level}
            >
              {targetName}
            </UserNameWithLevel>
          </button>
        </header>
        <div className="direct-message-list">
          {loading ? <p>{t("app.common.loading")}</p> : null}
          {!loading && !payload?.messages.length ? <p>{t("social.direct.empty")}</p> : null}
          {payload?.messages.map((message) => (
            <article className={message.sender_user_id === currentUserId ? "direct-bubble own" : "direct-bubble"} key={message.id}>
              <p>{message.body}</p>
            </article>
          ))}
        </div>
        <form className="direct-message-composer" onSubmit={(event) => { event.preventDefault(); onSend(); }}>
          <textarea
            maxLength={2000}
            placeholder={t("social.direct.placeholder")}
            value={messageBody}
            onChange={(event) => onBodyChange(event.target.value)}
          />
          <button className="finance-small-icon-button primary" type="submit" disabled={sending || loading || !messageBody.trim()} aria-label={t("social.direct.send")}>
            <Send size={15} />
          </button>
        </form>
      </section>
    </div>
  );
}

function ProfileEditorDialog({
  editor,
  profile,
  saving,
  t,
  onChange,
  onSave,
  onClose
}: {
  editor: ProfileEditorState;
  profile: UserProfile | null;
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onChange: Dispatch<SetStateAction<ProfileEditorState>>;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet profile-action-modal profile-editor-modal" role="dialog" aria-modal="true" aria-labelledby="profile-editor-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <div className="modal-header"><span>{t("profile.actions.edit")}</span><h2 id="profile-editor-title">{t("profile.public.title")}</h2></div>
        <form className="profile-editor" onSubmit={(event) => { event.preventDefault(); onSave(); }}>
          <AvatarPicker
            currentUrl={profile?.avatar_url ?? null}
            value={editor.avatarUrl}
            position={editor.avatarPosition}
            removed={editor.avatarRemoved}
            t={t}
            onChange={(avatarUrl) => onChange((current) => ({ ...current, avatarUrl, avatarRemoved: false }))}
            onPositionChange={(avatarPosition) => onChange((current) => ({ ...current, avatarPosition }))}
            onRemove={() => onChange((current) => ({ ...current, avatarUrl: "", avatarRemoved: true }))}
          />
          <label className="finance-field"><span>{t("profile.public.displayName")}</span><input required minLength={1} maxLength={80} value={editor.displayName} onChange={(event) => onChange((current) => ({ ...current, displayName: event.target.value }))} /></label>
          {profile?.username ? <p className="profile-readonly-hint">@{profile.username}</p> : null}
          <label className="finance-field"><span>{t("profile.public.bio")}</span><textarea maxLength={700} value={editor.bio} onChange={(event) => onChange((current) => ({ ...current, bio: event.target.value }))} /></label>
          <div className="term-row">
            <label className="finance-field"><span>{t("profile.public.linkLabel")}</span><input maxLength={40} value={editor.linkLabel} onChange={(event) => onChange((current) => ({ ...current, linkLabel: event.target.value }))} /></label>
            <label className="finance-field"><span>{t("profile.public.linkUrl")}</span><input maxLength={500} inputMode="url" value={editor.linkUrl} onChange={(event) => onChange((current) => ({ ...current, linkUrl: event.target.value }))} /></label>
          </div>
          <label className="finance-field"><span>{t("profile.public.linkVisibility")}</span><select value={editor.linkVisibility} onChange={(event) => onChange((current) => ({ ...current, linkVisibility: event.target.value as ProfileVisibility }))}>{PROFILE_VISIBILITY_LEVELS.map((visibility) => <option value={visibility} key={visibility}>{t(visibilityLabelKey(visibility))}</option>)}</select></label>
          <details className="profile-visibility-details">
            <summary>{t("profile.public.visibilitySettings")}</summary>
            <div className="visibility-grid">{PROFILE_VISIBILITY_KEYS.map((key) => <label className="finance-field" key={key}><span>{t(profileVisibilityKeyLabel(key))}</span><select value={editor.visibilitySettings[key]} onChange={(event) => onChange((current) => ({ ...current, visibilitySettings: { ...current.visibilitySettings, [key]: event.target.value as ProfileVisibility } }))}>{PROFILE_VISIBILITY_LEVELS.map((visibility) => <option value={visibility} key={visibility}>{t(visibilityLabelKey(visibility))}</option>)}</select></label>)}</div>
          </details>
          <div className="modal-action-row"><button className="secondary-button" type="submit" disabled={saving}><Save size={16} />{saving ? t("app.common.loading") : t("app.common.save")}</button><button className="secondary-button" type="button" disabled={saving} onClick={onClose}><X size={16} />{t("app.common.cancel")}</button></div>
        </form>
      </section>
    </div>
  );
}

function AvatarPicker({ currentUrl, value, position, removed, t, onChange, onPositionChange, onRemove }: { currentUrl: string | null; value: string; position: string; removed: boolean; t: (key: MessageKey, values?: Record<string, string | number>) => string; onChange: (value: string) => void; onPositionChange: (value: string) => void; onRemove: () => void }) {
  const previewUrl = removed ? null : normalizeAvatarPreviewUrl(value.trim() || currentUrl);
  const [positionX, positionY] = parseAvatarPosition(position);

  return (
    <div className="avatar-picker">
      <div className="profile-avatar avatar-picker-preview">{previewUrl ? <img alt="" src={previewUrl} style={{ objectPosition: position }} /> : <UserRound size={34} />}</div>
      <label className="finance-field avatar-url-field">
        <span>{t("profile.avatar.change")} <MediaUrlHelp t={t} /></span>
        <input type="url" inputMode="url" maxLength={2048} placeholder={t("profile.avatar.placeholder")} value={value} onChange={(event) => onChange(event.target.value)} />
      </label>
      <div className="avatar-picker-actions">
        {previewUrl ? <button className="text-button" type="button" onClick={onRemove}>{t("profile.avatar.remove")}</button> : null}
      </div>
      {previewUrl ? (
        <div className="avatar-crop-controls">
          <strong>{t("profile.avatar.crop")}</strong>
          <label><span>{t("profile.avatar.cropHorizontal")}</span><input type="range" min="0" max="100" value={positionX} onChange={(event) => onPositionChange(`${event.target.value}% ${positionY}%`)} /></label>
          <label><span>{t("profile.avatar.cropVertical")}</span><input type="range" min="0" max="100" value={positionY} onChange={(event) => onPositionChange(`${positionX}% ${event.target.value}%`)} /></label>
        </div>
      ) : null}
      <small>{t("profile.avatar.hint")}</small>
    </div>
  );
}

function normalizeAvatarPreviewUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.hostname.toLowerCase() !== "drive.google.com" && url.hostname.toLowerCase() !== "drive.usercontent.google.com") return value;
    const fileId = url.pathname.match(/\/file\/d\/([^/]+)/i)?.[1] ?? url.searchParams.get("id");
    const resourceKey = url.searchParams.get("resourcekey");
    return fileId ? `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}${resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : ""}` : value;
  } catch {
    return value;
  }
}

function parseAvatarPosition(value: string): [number, number] {
  const match = value.match(/^(\d{1,3})%\s+(\d{1,3})%$/);
  if (!match) return [50, 50];
  return [Math.min(Math.max(Number(match[1]), 0), 100), Math.min(Math.max(Number(match[2]), 0), 100)];
}

function AppearanceDialog({ accentTheme, colorTheme, displayCurrency, locale, t, uiScale, onAccent, onClose, onCurrency, onLocale, onScale, onTheme }: { accentTheme: AccentTheme; colorTheme: ColorTheme; displayCurrency: DisplayCurrency; locale: AppLocale; t: (key: MessageKey, values?: Record<string, string | number>) => string; uiScale: UiScale; onAccent: (theme: AccentTheme) => void; onClose: () => void; onCurrency: (currency: DisplayCurrency) => void; onLocale: (locale: AppLocale) => void; onScale: (scale: UiScale) => void; onTheme: (theme: ColorTheme) => void }) {
  const [soundsOn, setSoundsOn] = useState(false);

  useEffect(() => {
    setSoundsOn(getSoundsEnabled());
  }, []);

  const toggleSounds = () => {
    const next = !soundsOn;
    setSoundsEnabled(next);
    setSoundsOn(next);
    if (next) playUiSound("action");
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet profile-action-modal" role="dialog" aria-modal="true" aria-labelledby="appearance-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <div className="modal-header"><span>{t("profile.actions.settings")}</span><h2 id="appearance-title">{t("profile.appearance.title")}</h2></div>
        <div className="profile-appearance appearance-dialog-body">
          <div className="appearance-setting-row"><span>{t("profile.language")}</span><div className="appearance-options" role="group" aria-label={t("profile.language")}>{(["ru", "en"] as AppLocale[]).map((item) => <button className={locale === item ? "active" : ""} type="button" aria-pressed={locale === item} key={item} onClick={() => onLocale(item)}>{item === "ru" ? t("profile.language.ru") : t("profile.language.en")}</button>)}</div></div>
          <div className="appearance-setting-row"><span className="appearance-setting-label">{t("profile.currency")} <CurrencyDisplayHelp /></span><div className="appearance-options appearance-currency-options" role="group" aria-label={t("profile.currency")}>{DISPLAY_CURRENCIES.map((currency) => <button className={displayCurrency === currency ? "active" : ""} type="button" aria-label={t(`profile.currency.${currency.toLowerCase()}` as MessageKey)} title={t(`profile.currency.${currency.toLowerCase()}` as MessageKey)} aria-pressed={displayCurrency === currency} key={currency} onClick={() => onCurrency(currency)}>{DISPLAY_CURRENCY_SYMBOLS[currency]}</button>)}</div></div>
          <div className="appearance-setting-row"><span>{t("profile.appearance.scale")}</span><div className="appearance-options" role="group" aria-label={t("profile.appearance.scale")}>{UI_SCALES.map((scale) => <button className={uiScale === scale ? "active" : ""} type="button" aria-pressed={uiScale === scale} key={scale} onClick={() => onScale(scale)}>{scale}%</button>)}</div></div>
          <div className="appearance-setting-row"><span>{t("profile.appearance.theme")}</span><div className="appearance-options" role="group" aria-label={t("profile.appearance.theme")}>{COLOR_THEMES.map((theme) => <button className={colorTheme === theme ? "active" : ""} type="button" aria-pressed={colorTheme === theme} key={theme} onClick={() => onTheme(theme)}>{t(`profile.appearance.theme.${theme}` as MessageKey)}</button>)}</div></div>
          <div className="appearance-setting-row"><span>{t("profile.appearance.color")}</span><div className="appearance-options appearance-color-options" role="group" aria-label={t("profile.appearance.color")}>{ACCENT_THEMES.map((theme) => <button className={accentTheme === theme ? "active" : ""} type="button" aria-pressed={accentTheme === theme} key={theme} onClick={() => onAccent(theme)}><i className={`appearance-color-swatch ${theme}`} aria-hidden="true" /><span>{t(`profile.appearance.color.${theme}` as MessageKey)}</span></button>)}</div></div>
          <div className="appearance-setting-row"><span>{t("ai.chat.sound.title")}</span><div className="appearance-sound-control"><small>{t("ai.chat.sound.description")}</small><div className="appearance-sound-actions"><button className="ai-chat-icon-btn" type="button" onClick={toggleSounds} aria-pressed={soundsOn} aria-label={t("ai.chat.sound.toggle")} title={t("ai.chat.sound.toggle")}>{soundsOn ? <Volume2 size={17} /> : <VolumeX size={17} />}</button><button className="ai-chat-icon-btn" type="button" onClick={() => playUiSound("action")} disabled={!soundsOn} aria-label={t("ai.chat.sound.previewAction")} title={t("ai.chat.sound.previewAction")}><Play size={16} /></button><button className="ai-chat-icon-btn" type="button" onClick={() => playUiSound("reward")} disabled={!soundsOn} aria-label={t("ai.chat.sound.previewReward")} title={t("ai.chat.sound.previewReward")}><Sparkles size={16} /></button></div></div></div>
        </div>
      </section>
    </div>
  );
}

function ActivityDialog({ notifications, notificationsLoading, unreadCount, pendingConfirmations, locale, t, onClose, onMarkAllRead, onOpenNotification, onOpenConfirmations }: { notifications: PayoutNotification[] | null; notificationsLoading: boolean; unreadCount: number; pendingConfirmations: number; locale: AppLocale; t: (key: MessageKey, values?: Record<string, string | number>) => string; onClose: () => void; onMarkAllRead: () => void; onOpenNotification: (item: PayoutNotification) => void; onOpenConfirmations: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet profile-action-modal activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <div className="modal-header"><span>{t("profile.actions.activity")}</span><h2 id="activity-title">{t("profile.activity.title")}</h2>{unreadCount ? <small>{t("notifications.unreadCount", { count: unreadCount })}</small> : null}</div>
        {unreadCount ? <button className="text-button activity-mark-read" type="button" onClick={onMarkAllRead}>{t("profile.activity.markAllRead")}</button> : null}
        {pendingConfirmations ? <button className="activity-confirmation-link" type="button" onClick={onOpenConfirmations}><Bell size={16} /><span>{t("profile.activity.pendingConfirmations", { count: pendingConfirmations })}</span><ChevronDown size={16} /></button> : null}
        {notificationsLoading ? <p className="finance-error neutral">{t("app.common.loading")}</p> : null}
        {!notificationsLoading && notifications?.length ? <div className="notification-list">{notifications.map((item) => <article className={`notification-row${item.readAt ? "" : item.createdAt ? " unread" : ""}`} key={item.id}>{item.deep_link ? <button type="button" onClick={() => onOpenNotification(item)}><strong>{item.title}</strong><p>{item.body}</p></button> : <><strong>{item.title}</strong><p>{item.body}</p></>}</article>)}</div> : null}
        {!notificationsLoading && !pendingConfirmations && notifications && notifications.length === 0 ? <p className="feed-empty">{t("profile.activity.empty")}</p> : null}
        <NotificationControls locale={locale} t={t} />
      </section>
    </div>
  );
}

const NOTIFICATION_CATEGORIES = ["deals", "disputes", "wallet", "rewards", "team", "confirmations", "reminders", "system"] as const;
const REQUIRED_IN_APP_NOTIFICATION_CATEGORIES = new Set<NotificationCategory>(["deals", "disputes", "wallet", "rewards", "system"]);
type NotificationCategory = typeof NOTIFICATION_CATEGORIES[number];
type NotificationPreference = { category: NotificationCategory; in_app_enabled: boolean; push_enabled: boolean };
type NotificationDevice = { id: string; device_label: string | null; user_agent: string | null; enabled: boolean; last_seen_at: string };

function NotificationControls({ locale, t }: { locale: AppLocale; t: (key: MessageKey, values?: Record<string, string | number>) => string }) {
  const [preferences, setPreferences] = useState<NotificationPreference[]>([]);
  const [devices, setDevices] = useState<NotificationDevice[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        const [preferenceResponse, deviceResponse] = await Promise.all([
          fetch(`/api/notifications/preferences?ts=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } }),
          fetch(`/api/notifications/subscriptions?ts=${Date.now()}`, { cache: "no-store", headers: { Authorization: `Bearer ${token}` } })
        ]);
        const preferencePayload = await preferenceResponse.json() as { preferences?: NotificationPreference[]; error?: string };
        const devicePayload = await deviceResponse.json() as { devices?: NotificationDevice[]; error?: string };
        if (!preferenceResponse.ok || !deviceResponse.ok) throw new Error(preferencePayload.error ?? devicePayload.error ?? "Failed to load notification settings.");
        if (mounted) { setPreferences(preferencePayload.preferences ?? []); setDevices(devicePayload.devices ?? []); }
      } catch (loadError) {
        if (mounted) setError(loadError instanceof Error ? loadError.message : "Failed to load notification settings.");
      }
    })();
    return () => { mounted = false; };
  }, []);

  const preferenceFor = (category: NotificationCategory) => preferences.find((item) => item.category === category) ?? { category, in_app_enabled: true, push_enabled: true };

  async function updatePreference(category: NotificationCategory, field: "in_app_enabled" | "push_enabled", enabled: boolean) {
    const current = preferenceFor(category);
    const next = { ...current, [field]: enabled };
    setPreferences((items) => [...items.filter((item) => item.category !== category), next]);
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/notifications/preferences", { method: "PUT", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ category, inAppEnabled: next.in_app_enabled, pushEnabled: next.push_enabled, locale }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to save notification setting.");
    } catch (saveError) {
      setPreferences((items) => [...items.filter((item) => item.category !== category), current]);
      setError(saveError instanceof Error ? saveError.message : "Failed to save notification setting.");
    }
  }

  async function disableDevice(subscriptionId: string) {
    try {
      const token = await getAccessToken();
      const response = await fetch("/api/notifications/subscriptions", { method: "DELETE", cache: "no-store", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ subscriptionId }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to disable push device.");
      setDevices((items) => items.map((item) => item.id === subscriptionId ? { ...item, enabled: false } : item));
    } catch (disableError) {
      setError(disableError instanceof Error ? disableError.message : "Failed to disable push device.");
    }
  }

  return <details className="notification-settings"><summary>{t("notifications.settings")}</summary><div className="notification-settings-body">{error ? <p className="finance-error">{error}</p> : null}<div className="notification-preferences">{NOTIFICATION_CATEGORIES.map((category) => { const preference = preferenceFor(category); return <div className="notification-preference-row" key={category}><strong>{t(`notifications.category.${category}` as MessageKey)}</strong><label><input type="checkbox" checked={preference.in_app_enabled} disabled={REQUIRED_IN_APP_NOTIFICATION_CATEGORIES.has(category)} onChange={(event) => void updatePreference(category, "in_app_enabled", event.target.checked)} /> {t("notifications.inApp")}</label><label><input type="checkbox" checked={preference.push_enabled} onChange={(event) => void updatePreference(category, "push_enabled", event.target.checked)} /> Push</label></div>; })}</div><div className="notification-devices"><strong>{t("notifications.devices")}</strong>{devices.length ? devices.map((device) => <div key={device.id}><span>{device.device_label ?? t("notifications.deviceUnknown")}</span><button className="text-button" type="button" disabled={!device.enabled} onClick={() => void disableDevice(device.id)}>{device.enabled ? t("notifications.disable") : t("notifications.disabled")}</button></div>) : <small>{t("notifications.devicesEmpty")}</small>}</div></div></details>;
}

function SkillPassportDialog({ t, onClose }: { t: (key: MessageKey, values?: Record<string, string | number>) => string; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet profile-action-modal skills-modal" role="dialog" aria-modal="true" aria-labelledby="skills-title" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}><X size={18} /></button>
        <div className="modal-header"><h2 id="skills-title">{t("profile.actions.skills")}</h2></div>
        <SkillPassportApp />
      </section>
    </div>
  );
}

function PeopleView({
  contactSavingId,
  contacts,
  confirmations,
  currentUserId,
  filter,
  loading,
  locale,
  pendingConfirmations,
  payload,
  profiles,
  query,
  referralReady,
  section,
  savingId,
  trustCreatingForId,
  t,
  onAddContact,
  onConfirm,
  onDecline,
  onFilterChange,
  onMessage,
  onMessageContact,
  onOpenBlog,
  onOpenProfile,
  onQueryChange,
  onRefresh,
  onRequestConfirmation,
  onRemoveContact,
  onSectionChange,
  onInvite
}: {
  contactSavingId: string | null;
  contacts: ContactRow[] | null;
  confirmations: TrustConfirmationRow[] | null;
  currentUserId: string;
  filter: PeopleFilter;
  loading: boolean;
  locale: AppLocale;
  pendingConfirmations: number;
  payload: PeoplePayload | null;
  profiles: Record<string, TeamProfile>;
  query: string;
  referralReady: boolean;
  section: PeopleSection;
  savingId: string | null;
  trustCreatingForId: string | null;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onAddContact: (userId: string) => void;
  onConfirm: (confirmationId: string) => void;
  onDecline: (confirmationId: string) => void;
  onFilterChange: (filter: PeopleFilter) => void;
  onMessage: (row: PeopleRow) => void;
  onMessageContact: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
  onRequestConfirmation: (contact: ContactRow) => void;
  onRemoveContact: (userId: string) => void;
  onSectionChange: (section: PeopleSection) => void;
  onInvite: () => void;
}) {
  const people = payload?.people ?? [];
  const filters: PeopleFilter[] = ["nearby", "team", "referrals", "same_level", "active"];
  const contactRows = contacts ?? [];

  return (
    <section className="people-layout">
      <div className="people-heading-row">
        <div><strong>{t("social.people.title")}</strong><small>{t("social.people.subtitle")}</small></div>
        <button className="secondary-button people-invite-button" type="button" disabled={!referralReady} onClick={onInvite}><Share2 size={16} />{t("profile.referral.invite")}</button>
      </div>
      <div className="people-section-tabs" role="tablist" aria-label={t("social.people.sections")}>
        {(["discover", "contacts", "confirmations"] as PeopleSection[]).map((item) => (
          <button className={section === item ? "active" : ""} type="button" role="tab" aria-selected={section === item} key={item} onClick={() => onSectionChange(item)}>
            {t(peopleSectionLabelKey(item))}{item === "contacts" ? ` · ${contactRows.length}` : item === "confirmations" && pendingConfirmations ? ` · ${pendingConfirmations}` : ""}
          </button>
        ))}
      </div>
      {section === "discover" ? (
        <>
          <form className="people-search" onSubmit={(event) => { event.preventDefault(); onRefresh(); }}>
            <Search size={17} />
            <input maxLength={80} placeholder={t("social.people.searchPlaceholder")} value={query} onChange={(event) => onQueryChange(event.target.value)} />
            <button className="finance-small-icon-button primary" type="submit" aria-label={t("social.people.search")}><Search size={15} /></button>
          </form>
          <label className="people-filter-select">
            <span>{t("social.people.filters")}</span>
            <select value={filter} onChange={(event) => onFilterChange(event.target.value as PeopleFilter)}>
              {filters.map((item) => <option value={item} key={item}>{t(peopleFilterLabelKey(item))}</option>)}
            </select>
          </label>
          {loading && !people.length ? <p className="finance-error neutral">{t("app.common.loading")}</p> : null}
          {!loading && !people.length ? <p className="feed-empty">{t("social.people.empty")}</p> : null}
          {people.length ? (
            <div className="people-list">
              {people.map((row) => {
                const name = formatProfileName(row.profile, row.profile.user_id);
                const canAddContact = row.profile.user_id !== currentUserId && !row.relation.isContact;
                return (
                  <article className="people-row" key={row.profile.user_id}>
                    <button className="people-row-main" type="button" onClick={() => { void onOpenProfile(row.profile.user_id); }}>
                      <span className="people-avatar">{row.profile.avatar_url ? <img alt="" src={row.profile.avatar_url} style={{ objectPosition: row.profile.avatar_position ?? "50% 50%" }} /> : <UserRound size={20} />}</span>
                      <span className="people-row-copy">
                        <span className="people-row-title"><strong><UserNameWithLevel label={t("profile.levelBadge", { level: row.profile.level })} level={row.profile.level}>{name}</UserNameWithLevel></strong></span>
                        <small>{row.profile.username ? `@${row.profile.username}` : row.headline ?? t("social.people.noHeadline")}</small>
                        {row.headline && row.profile.username ? <p>{row.headline}</p> : null}
                        <span className="people-stat-row"><span>{t("social.people.trustStat", { count: row.publicStats.trust.confirmed })}</span><span>{t("social.people.teamStat", { strength: row.publicStats.team.strength, members: row.publicStats.team.members })}</span><span>{t(peopleInfluenceLabelKey(row.publicStats.influence.label))}</span></span>
                      </span>
                    </button>
                    <div className="people-actions">
                      <button className="finance-small-icon-button" type="button" aria-label={t("social.feed.openBlog")} onClick={() => onOpenBlog(row.profile.user_id)}><BookOpen size={15} /></button>
                      <button className="finance-small-icon-button" type="button" aria-label={t("social.people.message")} onClick={() => onMessage(row)}><MessageCircle size={15} /></button>
                      {canAddContact ? <button className="finance-small-icon-button primary" type="button" disabled={contactSavingId === row.profile.user_id} aria-label={t("social.people.addContact")} onClick={() => onAddContact(row.profile.user_id)}><UserPlus size={15} /></button> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </>
      ) : null}
      {section === "contacts" ? (
        <section className="people-subpanel">
          {!contacts ? <p className="finance-error neutral">{t("app.common.loading")}</p> : null}
          {contacts && !contactRows.length ? <p className="feed-empty">{t("profile.contacts.empty")}</p> : null}
          {contactRows.length ? <div className="contact-list">{contactRows.map((contact) => {
            const trustState = getContactTrustState(contact.contact_user_id, confirmations, currentUserId);
            return <article className="contact-row" key={`${contact.contact_user_id}-${contact.source}`}>
              <button type="button" onClick={() => { void onOpenProfile(contact.contact_user_id); }}>
                <span className="contact-row-avatar">{contact.profile?.avatar_url ? <img alt="" src={contact.profile.avatar_url} style={{ objectPosition: contact.profile.avatar_position ?? "50% 50%" }} /> : <UserRound size={17} />}</span>
                <span><UserNameWithLevel label={t("profile.levelBadge", { level: contact.profile?.level ?? 0 })} level={contact.profile?.level}>{formatProfileName(contact.profile, contact.contact_user_id)}</UserNameWithLevel></span>
                <small>{t(contactSourceLabelKey(contact.source))}</small>
              </button>
              <div className="contact-actions">
                <button className="finance-small-icon-button" type="button" aria-label={t("social.people.message")} onClick={() => onMessageContact(contact.contact_user_id)}><MessageCircle size={15} /></button>
                <button className="finance-small-icon-button primary" type="button" disabled={Boolean(trustState) || trustCreatingForId === contact.contact_user_id} aria-label={t("profile.trust.requestContact")} onClick={() => onRequestConfirmation(contact)}><Send size={15} /></button>
                {contact.source === "manual" && !contact.is_required ? <button className="finance-small-icon-button" type="button" disabled={contactSavingId === contact.contact_user_id} aria-label={t("profile.contacts.remove")} onClick={() => onRemoveContact(contact.contact_user_id)}><Trash2 size={15} /></button> : null}
              </div>
            </article>;
          })}</div> : null}
        </section>
      ) : null}
      {section === "confirmations" ? <TrustConfirmationsPanel confirmations={confirmations} currentUserId={currentUserId} locale={locale} profiles={profiles} savingId={savingId} t={t} onConfirm={onConfirm} onDecline={onDecline} onOpenProfile={onOpenProfile} /> : null}
    </section>
  );
}

function PublicWishesPanel({
  copyingWishId,
  isSelf,
  locale,
  t,
  wishes,
  onCopy
}: {
  copyingWishId: string | null;
  isSelf: boolean;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  wishes: PublicWish[];
  onCopy: (wish: PublicWish) => void;
}) {
  return (
    <section className="public-wishes-panel">
      <h3>{t("wishes.publicTitle")}</h3>
      <div className="public-wish-list">
        {wishes.map((wish) => (
          <article className="public-wish-card" key={wish.id}>
            {wish.image_url ? <img alt="" src={wish.image_url} /> : <span className="public-wish-placeholder">{wish.title.slice(0, 1)}</span>}
            <div>
              <strong>{wish.title}</strong>
              {wish.description ? <p>{wish.description}</p> : null}
              <div className="public-wish-meta">
                {wish.category ? <span>{wish.category}</span> : null}
                {wish.target_amount ? <span>{formatWishAmount(wish, locale)}</span> : null}
                <span>{t("wishes.level", { level: wish.difficulty_level })}</span>
                <span>{t("wishes.copiedCount", { count: wish.copied_count })}</span>
              </div>
            </div>
            {!isSelf ? (
              <button
                className="secondary-button"
                type="button"
                disabled={copyingWishId === wish.id || wish.viewer_has_copy}
                onClick={() => onCopy(wish)}
              >
                <Copy size={15} />
                {wish.viewer_has_copy ? t("wishes.addedToMine") : copyingWishId === wish.id ? t("wishes.saving") : t("wishes.addToMine")}
              </button>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

function SystemProfileView({
  copyingWishId,
  currentUserId,
  loading,
  locale,
  payload,
  t,
  onBack,
  onCopyWish,
  onDeletePost,
  onOpenPost,
  onOpenSystemAccount,
  onPublish
}: {
  copyingWishId: string | null;
  currentUserId: string;
  loading: boolean;
  locale: AppLocale;
  payload: FeedPayload | null;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onBack: () => void;
  onCopyWish: (wish: PublicWish) => void;
  onDeletePost: (post: FeedPost) => void;
  onOpenPost: (post: FeedPost) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onPublish: (post: FeedPost) => void;
}) {
  const account = payload?.systemAccount ?? null;
  const posts = payload?.posts ?? [];

  return (
    <section className="feed-layout system-profile-view">
      <section className="system-profile-header">
        <button className="system-profile-back" type="button" onClick={onBack}>
          <ArrowLeft size={18} />
          {t("social.systemProfile.backToFeed")}
        </button>
        <span className="system-profile-avatar">
          <img alt="" src={account?.avatar_url ?? "/icons/twenty-levels-app-icon-192.png"} />
        </span>
        <div className="system-profile-copy">
          <strong>{account?.display_name ?? "Abundance System"}</strong>
          <p>{localizedSystemBio(account?.bio, locale)}</p>
          <span>{t("social.systemProfile.chapterCount", { count: posts.length })}</span>
        </div>
      </section>
      <PostList
        copyingWishId={copyingWishId}
        currentUserId={currentUserId}
        emptyText={t("social.systemProfile.empty")}
        loading={loading}
        locale={locale}
        posts={posts}
        showBlogAction={false}
        showSystemProfileAction={false}
        showTileAuthor={false}
        t={t}
        onCopyWish={onCopyWish}
        onDeletePost={onDeletePost}
        onOpenAuthor={() => undefined}
        onOpenBlog={() => undefined}
        onOpenPost={onOpenPost}
        onOpenSystemAccount={onOpenSystemAccount}
        onPublish={onPublish}
      />
    </section>
  );
}

function FeedView({
  addingStoryWishKey,
  copyingWishId,
  currentUserId,
  dailyDraft,
  systemDrafts,
  externalLinkUrl,
  linkComposerOpen,
  feedPayload,
  filter,
  loading,
  loadingMore,
  saving,
  locale,
  t,
  onCreateDraft,
  onCreateExternalLink,
  onAddStoryWish,
  onCopyWish,
  onDraftBodyChange,
  onDraftBodyChangeForPost,
  onExternalLinkUrlChange,
  onFilterChange,
  onLoadMore,
  onLinkComposerToggle,
  onOpenAuthor,
  onOpenBlog,
  onOpenChallenge,
  onOpenPost,
  onOpenSystemAccount,
  onDeletePost,
  onPublish,
  onUpdateCover,
  onUploadCover,
  onToggleDraftBlock
}: {
  addingStoryWishKey: string | null;
  copyingWishId: string | null;
  currentUserId: string;
  dailyDraft: FeedPost | null;
  systemDrafts: FeedPost[];
  externalLinkUrl: string;
  linkComposerOpen: boolean;
  feedPayload: FeedPayload | null;
  filter: FeedFilter;
  loading: boolean;
  loadingMore: boolean;
  saving: boolean;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCreateDraft: () => void;
  onCreateExternalLink: () => void;
  onAddStoryWish: (post: FeedPost) => void;
  onCopyWish: (wish: PublicWish) => void;
  onDraftBodyChange: (body: string) => void;
  onDraftBodyChangeForPost: (postId: string, body: string) => void;
  onExternalLinkUrlChange: (url: string) => void;
  onFilterChange: (filter: FeedFilter) => void;
  onLoadMore: () => void;
  onLinkComposerToggle: () => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenChallenge: () => void;
  onOpenPost: (post: FeedPost) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
  onUpdateCover: (post: FeedPost, templateKey: string) => void;
  onUploadCover: (post: FeedPost, file: File) => void;
  onToggleDraftBlock: (blockKey: string) => void;
}) {
  const posts = feedPayload?.posts ?? [];

  return (
    <section className="feed-layout">
      <div className="feed-filter-row" role="group" aria-label={t("social.feed.title")}>
        <button aria-pressed={filter === "all"} className={filter === "all" ? "active" : ""} type="button" onClick={() => onFilterChange("all")}>
          {t("social.feed.filter.all")}
        </button>
        <button aria-pressed={filter === "stories"} className={filter === "stories" ? "active" : ""} type="button" onClick={() => onFilterChange("stories")}>
          {t("social.feed.filter.stories")}
        </button>
        <button aria-pressed={filter === "opportunities"} className={filter === "opportunities" ? "active" : ""} type="button" onClick={() => onFilterChange("opportunities")}>
          {t("social.feed.filter.opportunities")}
        </button>
        <button aria-pressed={filter === "system"} className={filter === "system" ? "active" : ""} type="button" onClick={() => onFilterChange("system")}>
          {t("social.feed.filter.system")}
        </button>
        <button aria-pressed={filter === "reviews"} className={filter === "reviews" ? "active" : ""} type="button" onClick={() => onFilterChange("reviews")}>
          {t("social.feed.filter.reviews")}
        </button>
      </div>
      {filter === "opportunities" ? <p className="feed-mode-hint">{t("social.feed.opportunitiesHint")}</p> : null}
      {filter === "reviews" && feedPayload?.reviewSummary ? (
        <ReviewSummary summary={feedPayload.reviewSummary} locale={locale} t={t} />
      ) : null}
      <PostList
        addingStoryWishKey={addingStoryWishKey}
        copyingWishId={copyingWishId}
        currentUserId={currentUserId}
        emptyText={t("social.feed.empty")}
        loading={loading}
        locale={locale}
        posts={posts}
        emptyState={filter === "all" ? (
          <div className="feed-empty-action">
            <p>{t("social.feed.empty")}</p>
            <small>{t("social.feed.emptyHint")}</small>
          </div>
        ) : undefined}
        showBlogAction={true}
        t={t}
        onCopyWish={onCopyWish}
        onAddStoryWish={onAddStoryWish}
        onOpenAuthor={onOpenAuthor}
        onOpenBlog={onOpenBlog}
        onOpenPost={onOpenPost}
        onOpenSystemAccount={onOpenSystemAccount}
        onDeletePost={onDeletePost}
        onPublish={onPublish}
      />
      {feedPayload?.nextCursor ? (
        <button className="secondary-button feed-load-more" type="button" disabled={loadingMore} onClick={onLoadMore}>
          {loadingMore ? t("app.common.loading") : t("social.review.loadMore")}
        </button>
      ) : null}
      <button className="secondary-button feed-today-action" type="button" onClick={onOpenChallenge}>
        {t("social.feed.takeStep")} <ArrowRight size={15} />
      </button>
    </section>
  );
}

function ReviewSummary({ summary, locale, t }: {
  summary: FeedReviewSummary;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  return (
    <section className="review-summary">
      <div>
        <span>{t("social.review.summary")}</span>
        <strong>{summary.count ? summary.average.toLocaleString(locale, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) : "—"}</strong>
        <ReviewStars value={Math.round(summary.average)} />
        <small>{t("social.review.count", { count: summary.count })}</small>
      </div>
      <div className="review-distribution">
        {[5, 4, 3, 2, 1].map((rating) => (
          <div key={rating}>
            <span>{rating}</span>
            <Star size={12} fill="currentColor" />
            <progress max={Math.max(summary.count, 1)} value={summary.distribution[String(rating)] ?? 0} />
            <small>{summary.distribution[String(rating)] ?? 0}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExternalLinkComposer({
  open,
  saving,
  t,
  url,
  onToggle,
  onSubmit,
  onUrlChange
}: {
  open: boolean;
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  url: string;
  onToggle: () => void;
  onSubmit: () => void;
  onUrlChange: (url: string) => void;
}) {
  if (!open) {
    return (
      <button className="compact-composer-action" type="button" onClick={onToggle}>
        <ExternalLink size={15} />
        {t("social.feed.externalLink")}
      </button>
    );
  }

  return (
    <form className="external-link-composer" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <label htmlFor="external-link-url">
        {t("social.feed.externalLink")}
        <MediaUrlHelp t={t} />
        <button className="text-button" type="button" onClick={onToggle}>{t("app.common.close")}</button>
      </label>
      <div>
        <input
          id="external-link-url"
          inputMode="url"
          maxLength={1000}
          placeholder={t("social.feed.externalLinkPlaceholder")}
          type="url"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
        />
        <button className="finance-small-icon-button primary" type="submit" disabled={saving || !url.trim()} aria-label={t("social.feed.addExternalLink")}>
          <ExternalLink size={15} />
        </button>
      </div>
    </form>
  );
}

function SystemEventCoverPicker({ post, saving, t, onUpdateCover, onUploadCover }: {
  post: FeedPost;
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onUpdateCover: (post: FeedPost, templateKey: string) => void;
  onUploadCover: (post: FeedPost, file: File) => void;
}) {
  const options = [
    ["daily_progress", "social.feed.cover.template.daily_progress", "/feed/system-events/daily-progress.png"],
    ["level_up", "social.feed.cover.template.level_up", "/feed/system-events/level-up.png"],
    ["wish_completed", "social.feed.cover.template.wish_completed", "/feed/system-events/wish-completed.png"],
    ["challenge_completed", "social.feed.cover.template.challenge_completed", "/feed/system-events/challenge-completed.png"]
  ] as const;
  const currentUrl = (post.media ?? []).find((media) => media.sort_order === 0)?.media_url;
  return (
    <div className="system-event-cover-picker">
      <div className="system-event-cover-heading">
        <span>{t("social.feed.cover")}</span>
        <label className="secondary-button system-event-upload">
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUploadCover(post, file);
            event.currentTarget.value = "";
          }} />
          {t("social.feed.cover.upload")}
        </label>
      </div>
      <div className="system-event-cover-options">
        {options.map(([key, labelKey, url]) => (
          <button className={currentUrl === url ? "active" : ""} type="button" key={key} disabled={saving} aria-label={t(labelKey)} aria-pressed={currentUrl === url} onClick={() => onUpdateCover(post, key)}>
            <img alt="" src={url} />
            <span>{t(labelKey)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PostList(props: {
  addingStoryWishKey?: string | null;
  copyingWishId: string | null;
  currentUserId: string;
  emptyText: string;
  emptyState?: ReactNode;
  loading: boolean;
  locale: AppLocale;
  posts: FeedPost[];
  saving?: boolean;
  showBlogAction: boolean;
  showSystemProfileAction?: boolean;
  showTileAuthor?: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCopyWish: (wish: PublicWish) => void;
  onAddStoryWish?: (post: FeedPost) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
}) {
  const { addingStoryWishKey, emptyState, emptyText, loading, onAddStoryWish, onOpenPost, posts, showTileAuthor = true, t } = props;
  if (loading && !posts.length) {
    return <div className="feed-post-gallery feed-post-gallery-loading" aria-label={t("app.common.loading")}>
      {Array.from({ length: 9 }, (_, index) => <span className="feed-post-tile-skeleton" key={index} />)}
    </div>;
  }
  if (!posts.length) return emptyState ?? <p className="feed-empty">{emptyText}</p>;

  return <FeedPostGallery addingStoryWishKey={addingStoryWishKey} fallbackTitle={t("social.post.detail")} posts={posts} showAuthor={showTileAuthor} wishActionLabel={t("social.feed.wantThis")} evidenceLabels={{ demo: t("social.feed.demoBadge"), verified: t("social.feed.verifiedBadge") }} onAddStoryWish={onAddStoryWish} onOpen={onOpenPost} />;
}

export function PostCard({
  copyingWishId,
  currentUserId,
  locale,
  post,
  saving,
  showBlogAction,
  showSystemProfileAction,
  t,
  onCopyWish,
  onOpenAuthor,
  onOpenBlog,
  onOpenPost,
  onOpenSystemAccount,
  onDeletePost,
  onPublish
}: {
  copyingWishId: string | null;
  currentUserId: string;
  locale: AppLocale;
  post: FeedPost;
  saving: boolean;
  showBlogAction: boolean;
  showSystemProfileAction: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCopyWish: (wish: PublicWish) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
}) {
  const canDelete = Boolean(post.author_user_id) && post.author_user_id === currentUserId;

  return (
    <article className="feed-post-card">
      <header>
        <div className="feed-author-block">
          <PostAuthor post={post} t={t} onOpenAuthor={onOpenAuthor} onOpenSystemAccount={onOpenSystemAccount} />
          {post.system_verified ? <span className="system-story-badge">{t("social.feed.verifiedBadge")}</span> : null}
          {post.post_type === "reality_demo" ? <span className="reality-demo-badge">{t("social.feed.demoBadge")}</span> : null}
          {post.post_type === "abundance_story" ? (
            <span className="system-story-badge">
              {showSystemProfileAction || !post.systemStory
                ? t("social.feed.systemStoryBadge")
                : t("social.systemProfile.chapterNumber", { number: post.systemStory.series_order })}
            </span>
          ) : null}
          {post.post_type === "project_review" ? <span className="project-review-badge">{t("social.review.badge")}</span> : null}
        </div>
        <small>{formatPostDate(post, locale)}</small>
      </header>
      <button className="feed-post-body" type="button" onClick={() => onOpenPost(post)}>
        {post.projectReview ? (
          <div className="project-review-rating">
            <ReviewStars value={post.projectReview.overall_rating} />
            <span>{t("social.review.mission", { rating: post.projectReview.mission_rating })}</span>
          </div>
        ) : null}
        <p>{post.body ?? t("social.post.detail")}</p>
        <StatBlockGrid blocks={post.statBlocks} locale={locale} t={t} />
      </button>
      <PostMedia media={post.media} locale={locale} onOpen={() => onOpenPost(post)} portrait={post.post_type === "abundance_story"} />
      <WishPostPreview
        copyingWishId={copyingWishId}
        currentUserId={currentUserId}
        locale={locale}
        post={post}
        t={t}
        onCopyWish={onCopyWish}
      />
      <ExternalLinkPreview post={post} />
      <footer>
        <span className={`post-status ${post.status}`}>{t(postStatusLabelKey(post.status))}</span>
        <div className="feed-card-actions">
          {showBlogAction && post.author_user_id ? (
            <button className="finance-small-icon-button" type="button" aria-label={t("social.feed.openBlog")} onClick={() => onOpenBlog(post.author_user_id!)}>
              <BookOpen size={15} />
            </button>
          ) : null}
          {showSystemProfileAction && post.systemStory ? (
            <button className="system-story-profile-link" type="button" onClick={() => onOpenSystemAccount(post.systemStory!.system_account_key)}>
              <BookOpen size={14} />
              {t("social.systemProfile.allChapters")}
            </button>
          ) : null}
          {post.status === "draft" ? (
            <button className="finance-small-icon-button primary" type="button" disabled={saving} aria-label={t("social.feed.publish")} onClick={() => onPublish(post)}>
              <Send size={15} />
            </button>
          ) : null}
          {canDelete ? (
            <button className="finance-small-icon-button danger" type="button" disabled={saving} aria-label={t("social.post.delete")} onClick={() => onDeletePost(post)}>
              <Trash2 size={15} />
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}

function WishPostPreview({
  copyingWishId,
  currentUserId,
  hideCopy = false,
  locale,
  post,
  t,
  onCopyWish
}: {
  copyingWishId: string | null;
  currentUserId: string | null;
  hideCopy?: boolean;
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCopyWish: (wish: PublicWish) => void;
}) {
  const wish = post.wish;
  if (!wish) return null;

  const canCopy = !hideCopy && wish.owner_user_id !== currentUserId;
  const isCopying = copyingWishId === wish.id;

  return (
    <section className="wish-post-preview">
      {wish.image_url ? <img alt="" src={wish.image_url} /> : <span className="wish-post-placeholder">{wish.title.slice(0, 1)}</span>}
      <div>
        <strong>{wish.title}</strong>
        {wish.description ? <p>{wish.description}</p> : null}
        <div className="public-wish-meta">
          {wish.target_amount ? <span>{formatWishAmount(wish, locale)}</span> : null}
          <span>{t("wishes.level", { level: wish.difficulty_level })}</span>
          <span>{t("wishes.copiedCount", { count: wish.copied_count })}</span>
        </div>
      </div>
      {canCopy ? (
        <button
          className="secondary-button"
          type="button"
          disabled={isCopying || wish.viewer_has_copy}
          onClick={() => onCopyWish(wish)}
        >
          <Copy size={15} />
          {wish.viewer_has_copy ? t("wishes.addedToMine") : isCopying ? t("wishes.saving") : t("wishes.addToMine")}
        </button>
      ) : null}
    </section>
  );
}

export function PostDetailModal({
  copyingWishId,
  currentUserId,
  readOnly = false,
  locale,
  post,
  t,
  onClose,
  onAddStoryWish,
  onCopyWish,
  onDeletePost,
  onOpenAuthor,
  onOpenBlog,
  onOpenChallenge,
  onOpenSystemAccount,
  onPublish,
  onUpdateCover,
  onUploadCover,
  onUpdateReview,
  onReposted,
  storyWishError = null,
  storyWishSaving = false
}: {
  copyingWishId: string | null;
  currentUserId: string | null;
  readOnly?: boolean;
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onClose: () => void;
  onAddStoryWish?: (post: FeedPost) => void;
  onCopyWish: (wish: PublicWish) => void;
  onDeletePost: (post: FeedPost) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenChallenge: () => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onPublish: (post: FeedPost) => void;
  onUpdateCover?: (post: FeedPost, templateKey: string) => void;
  onUploadCover?: (post: FeedPost, file: File) => void;
  onUpdateReview: (post: FeedPost, changes: ReviewEditPayload) => Promise<void>;
  onReposted?: () => void;
  storyWishError?: string | null;
  storyWishSaving?: boolean;
}) {
  const canDelete = !readOnly && Boolean(post.author_user_id) && post.author_user_id === currentUserId;
  const hasVisualMedia = post.media.some((item) => (item.media_type === "image" || item.media_type === "video") && Boolean(item.media_url));
  const fallbackCover = hasVisualMedia ? null : getFeedPostCover(post);
  const hasDetailCover = hasVisualMedia || Boolean(fallbackCover);
  const [editingReview, setEditingReview] = useState(false);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewDraft, setReviewDraft] = useState<ReviewEditPayload>({
    body: post.body ?? "",
    overallRating: post.projectReview?.overall_rating ?? 0,
    missionRating: post.projectReview?.mission_rating ?? 0,
    attitude: post.projectReview?.attitude ?? "",
    mostUsefulArea: post.projectReview?.most_useful_area ?? ""
  });

  async function saveReview() {
    setReviewSaving(true);
    try {
      await onUpdateReview(post, reviewDraft);
      setEditingReview(false);
    } catch {
      // The parent surfaces the API error without closing the editor.
    } finally {
      setReviewSaving(false);
    }
  }

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop post-detail-backdrop" role="presentation" onClick={onClose}>
      <section className={`modal-sheet post-detail-modal${hasDetailCover ? " has-media" : ""}`} role="dialog" aria-modal="true" aria-label={t("social.post.detail")} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}>
          <X size={18} />
        </button>
        {hasVisualMedia ? <PostMedia media={post.media} locale={locale} showSource /> : null}
        {fallbackCover ? <div className="post-detail-cover"><img alt="" src={fallbackCover} /></div> : null}
        <div className="post-detail-content">
          <div className="post-detail-author-row">
            <PostAuthor detail post={post} t={t} onOpenAuthor={onOpenAuthor} onOpenSystemAccount={onOpenSystemAccount} />
            {post.system_verified ? <span className="system-story-badge">{t("social.feed.verifiedBadge")}</span> : null}
            {post.post_type === "reality_demo" ? <span className="reality-demo-badge">{t("social.feed.demoBadge")}</span> : null}
            {post.post_type === "abundance_story" ? <span className="system-story-badge">{t("social.feed.systemStoryBadge")}</span> : null}
            {post.post_type === "project_review" ? <span className="project-review-badge">{t("social.review.badge")}</span> : null}
          </div>
          {post.system_verified && post.verifiedChallenge ? <VerifiedChallengeMeta locale={locale} post={post} t={t} /> : null}
          {post.projectReview && !editingReview ? (
            <div className="project-review-detail-meta">
              <ReviewStars value={post.projectReview.overall_rating} />
              <span>{t("social.review.mission", { rating: post.projectReview.mission_rating })}</span>
              <span>{t(`appTesting.attitude.${post.projectReview.attitude}` as MessageKey)}</span>
              <span>{t(`appTesting.area.${post.projectReview.most_useful_area}` as MessageKey)}</span>
            </div>
          ) : null}
          {editingReview && post.projectReview ? (
            <div className="project-review-editor">
              <label>
                <span>{t("appTesting.overallRating")}</span>
                <select value={reviewDraft.overallRating} onChange={(event) => setReviewDraft((current) => ({ ...current, overallRating: Number(event.target.value) }))}>
                  {[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating}/5</option>)}
                </select>
              </label>
              <label>
                <span>{t("appTesting.missionRating")}</span>
                <select value={reviewDraft.missionRating} onChange={(event) => setReviewDraft((current) => ({ ...current, missionRating: Number(event.target.value) }))}>
                  {[1, 2, 3, 4, 5].map((rating) => <option value={rating} key={rating}>{rating}/5</option>)}
                </select>
              </label>
              <label>
                <span>{t("appTesting.attitude")}</span>
                <select value={reviewDraft.attitude} onChange={(event) => setReviewDraft((current) => ({ ...current, attitude: event.target.value }))}>
                  {APP_TESTING_ATTITUDES.map((attitude) => <option value={attitude} key={attitude}>{t(`appTesting.attitude.${attitude}` as MessageKey)}</option>)}
                </select>
              </label>
              <label>
                <span>{t("appTesting.mostUseful")}</span>
                <select value={reviewDraft.mostUsefulArea} onChange={(event) => setReviewDraft((current) => ({ ...current, mostUsefulArea: event.target.value }))}>
                  {APP_TESTING_USEFUL_AREAS.map((area) => <option value={area} key={area}>{t(`appTesting.area.${area}` as MessageKey)}</option>)}
                </select>
              </label>
              <label>
                <span>{t("appTesting.publicReview")}</span>
                <textarea maxLength={1500} value={reviewDraft.body} onChange={(event) => setReviewDraft((current) => ({ ...current, body: event.target.value }))} />
              </label>
              <div className="project-review-editor-actions">
                <button className="secondary-button" type="button" onClick={() => setEditingReview(false)}>{t("social.review.cancel")}</button>
                <button className="primary-button" type="button" disabled={reviewSaving || reviewDraft.body.trim().length < 100} onClick={() => { void saveReview(); }}>
                  {reviewSaving ? t("app.common.loading") : t("social.review.save")}
                </button>
              </div>
            </div>
          ) : <p className="post-detail-body">{post.body ?? t("social.post.detail")}</p>}
          {post.projectReview && !editingReview ? <small className="project-review-reward-note">{t("social.review.rewarded", { reward: formatMoney(3, locale) })}</small> : null}
          <span className={`post-status ${post.status}`}>{t(postStatusLabelKey(post.status))} - {formatPostDate(post, locale)}</span>
          <RepostSourcePreview post={post} locale={locale} t={t} />
          <StatBlockGrid blocks={post.statBlocks} locale={locale} t={t} />
          <WishPostPreview
            copyingWishId={copyingWishId}
            currentUserId={currentUserId}
            hideCopy={readOnly}
            locale={locale}
            post={post}
            t={t}
            onCopyWish={onCopyWish}
          />
          <ExternalLinkPreview post={post} />
          <FeedPostInteractions currentUserId={currentUserId} locale={locale} post={post} t={t} onReposted={onReposted} />
          <div className="post-detail-actions">
            {!readOnly && onAddStoryWish && recommendedWishIdForStory(post.source_key) ? (
              <div className="story-wish-action-wrap">
                <button aria-describedby={storyWishError ? "story-wish-error" : undefined} className="primary-button story-wish-action" type="button" disabled={storyWishSaving} onClick={() => onAddStoryWish(post)}>
                  <Heart size={16} />
                  {storyWishSaving ? t("app.common.loading") : t("social.feed.wantThis")}
                </button>
                {storyWishError ? <p className="finance-error inline" id="story-wish-error" role="alert">{storyWishError}</p> : null}
              </div>
            ) : null}
            {post.system_verified && post.verifiedChallenge ? (
              <button className="primary-button" type="button" onClick={() => { onClose(); onOpenChallenge(); }}>
                <Check size={15} />
                {t("social.feed.openChallenge")}
              </button>
            ) : null}
            {post.author_user_id ? (
              <button className="secondary-button" type="button" onClick={() => onOpenBlog(post.author_user_id!)}>
                <BookOpen size={16} />
                {t("social.feed.openBlog")}
              </button>
            ) : null}
            {post.systemStory ? (
              <button className="system-story-profile-link" type="button" onClick={() => onOpenSystemAccount(post.systemStory!.system_account_key)}>
                <BookOpen size={14} />
                {t("social.systemProfile.allChapters")}
              </button>
            ) : null}
            {canDelete && post.projectReview && !editingReview ? (
              <button className="secondary-button" type="button" onClick={() => setEditingReview(true)}>
                <Edit3 size={15} />
                {t("social.review.edit")}
              </button>
            ) : null}
            {!readOnly && post.status === "draft" ? (
              <button className="finance-small-icon-button primary" type="button" aria-label={t("social.feed.publish")} onClick={() => onPublish(post)}>
                <Send size={15} />
              </button>
            ) : null}
            {canDelete ? (
              <button className="finance-small-icon-button danger" type="button" aria-label={t("social.post.delete")} onClick={() => onDeletePost(post)}>
                <Trash2 size={15} />
              </button>
            ) : null}
          </div>
        </div>
      </section>
    </div>
  );
}

function ExternalLinkPreview({ post }: { post: FeedPost }) {
  const externalLink = post.externalLinks?.[0];
  if (!externalLink) return null;

  return (
    <a className="external-link-preview" href={externalLink.external_url} target="_blank" rel="noreferrer">
      <span>{formatProviderLabel(externalLink.provider)}</span>
      <strong>{externalLink.title ?? externalLink.external_url}</strong>
      {externalLink.author_handle ? <small>{externalLink.author_handle}</small> : null}
      <ExternalLink size={15} />
    </a>
  );
}

function RepostSourcePreview({
  locale,
  post,
  t
}: {
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  const source = post.repostOf;
  if (!source) return null;
  return (
    <section className="repost-source-preview">
      <small>{t("social.feed.repost")}</small>
      <strong>{source.authorName ?? t("social.feed.manualPost")}</strong>
      {source.body ? <p>{source.body}</p> : null}
      <PostMedia media={source.media} locale={locale} />
    </section>
  );
}

function VerifiedChallengeMeta({
  locale,
  post,
  t
}: {
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  const challenge = post.verifiedChallenge;
  if (!challenge) return null;

  const title = localizedSystemBio(challenge.challenge_title, locale) || t("social.feed.challengeDone");
  const verificationType = t(verificationLabelKey(challenge.verification_type));

  return (
    <div className="verified-challenge-meta">
      <strong>{t("social.feed.challengeDone")}: {title}</strong>
      <span>{t("social.feed.challengeVerification", { type: verificationType })}</span>
      <span>{t("social.feed.challengeCompletedAt", { date: formatDate(challenge.completed_at, locale) })}</span>
    </div>
  );
}

function StatBlockGrid({ blocks, locale, t }: { blocks: FeedStatBlock[]; locale: AppLocale; t: (key: MessageKey, values?: Record<string, string | number>) => string }) {
  if (!blocks.length) return null;
  return (
    <div className="post-stat-grid">
      {blocks.map((block) => (
        <span className={statBlockClassName(block, "post-stat-block")} key={block.id}>
          <small>{t(statBlockLabelKey(block.block_key))}</small>
          <strong>{formatStatBlockValue(block, locale)}</strong>
        </span>
      ))}
    </div>
  );
}

function ReviewStars({ value }: { value: number }) {
  return (
    <span className="project-review-stars" aria-label={`${value}/5`}>
      {[1, 2, 3, 4, 5].map((rating) => (
        <Star size={16} fill={rating <= value ? "currentColor" : "none"} key={rating} />
      ))}
    </span>
  );
}

function HistoryPanel({
  title,
  open,
  loading,
  error,
  emptyText,
  loadingText,
  rowCount,
  onToggle,
  children
}: {
  title: string;
  open: boolean;
  loading: boolean;
  error: string | null;
  emptyText: string;
  loadingText: string;
  rowCount: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  const hasRows = rowCount > 0;

  return (
    <section className="history-section">
      <button className="history-toggle" type="button" onClick={onToggle}>
        <span>{title}</span>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open ? (
        <div className="history-body">
          {loading ? <p>{loadingText}</p> : null}
          {error ? <p className="finance-error">{error}</p> : null}
          {!error && hasRows ? children : null}
          {!loading && !error && !hasRows ? <p>{emptyText}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

function PostAuthor({
  detail = false,
  post,
  t,
  onOpenAuthor,
  onOpenSystemAccount
}: {
  detail?: boolean;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onOpenAuthor: (userId: string) => void;
  onOpenSystemAccount: (accountKey: string) => void;
}) {
  const isSystemStory = post.post_type === "abundance_story";
  const content = (
    <>
      <span className="feed-author-avatar">
        {isSystemStory ? <img alt="" src={post.systemStory?.account?.avatar_url ?? "/icons/twenty-levels-app-icon-192.png"} /> : post.author?.avatar_url ? <img alt="" src={post.author.avatar_url} style={{ objectPosition: post.author.avatar_position ?? "50% 50%" }} /> : <UserRound size={18} />}
      </span>
      {isSystemStory ? (
        <span>{post.systemStory?.account?.display_name ?? post.authorName ?? "Open Abundance"}</span>
      ) : (
        <UserNameWithLevel
          label={post.author ? t("profile.levelBadge", { level: post.author.level }) : undefined}
          level={post.author?.level}
        >
          {post.authorName ?? formatProfileName(post.author, post.author_user_id ?? "Open Abundance")}
        </UserNameWithLevel>
      )}
    </>
  );

  if (post.systemStory) {
    return (
      <button className={`feed-author${detail ? " detail-author" : ""}`} type="button" onClick={() => onOpenSystemAccount(post.systemStory!.system_account_key)}>
        {content}
      </button>
    );
  }

  if (!post.author_user_id) return <div className={`feed-author${detail ? " detail-author" : ""}`}>{content}</div>;

  return (
    <button className={`feed-author${detail ? " detail-author" : ""}`} type="button" onClick={() => { void onOpenAuthor(post.author_user_id!); }}>
      {content}
    </button>
  );
}

function PostMedia({ media, locale, onOpen, portrait = false, showSource = false }: { media: FeedMedia[]; locale: AppLocale; onOpen?: () => void; portrait?: boolean; showSource?: boolean }) {
  const playableMedia = media.filter((item) => (item.media_type === "image" || item.media_type === "video") && Boolean(item.media_url));
  if (!playableMedia.length) return null;

  return (
    <div className={`feed-post-media${playableMedia.length > 1 ? " multiple" : ""}${portrait ? " portrait" : ""}`}>
      {playableMedia.map((item) => {
        const visual = item.media_type === "video"
          ? <video controls preload="metadata" src={item.media_url ?? undefined} />
          : <img alt={localizedMediaAlt(item.alt_text, locale)} loading="lazy" src={item.media_url ?? undefined} />;
        return onOpen ? (
          <button type="button" key={item.id} onClick={onOpen}>{visual}</button>
        ) : (
          <figure key={item.id}>
            {visual}
            {showSource && item.source_url ? (
              <figcaption>
                <a href={item.source_url} target="_blank" rel="noreferrer">{item.source_label ?? "Source"}</a>
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

function TrustConfirmationsPanel({
  confirmations,
  currentUserId,
  locale,
  profiles,
  savingId,
  t,
  onConfirm,
  onDecline,
  onOpenProfile
}: {
  confirmations: TrustConfirmationRow[] | null;
  currentUserId: string;
  locale: AppLocale;
  profiles: Record<string, TeamProfile>;
  savingId: string | null;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onConfirm: (confirmationId: string) => void;
  onDecline: (confirmationId: string) => void;
  onOpenProfile: (userId: string) => void;
}) {
  const pendingIncomingCount = confirmations?.filter((item) => item.counterparty_user_id === currentUserId && item.status === "pending").length ?? 0;
  const visibleConfirmations = (confirmations ?? []).slice(0, 8);

  return (
    <section className="public-profile-box trust-confirmations-box">
      <div className="section-heading-row">
        <span>{t("profile.trust.title")}</span>
        <strong>{pendingIncomingCount}</strong>
      </div>
      {!confirmations ? <p>{t("app.common.loading")}</p> : null}
      {confirmations && !visibleConfirmations.length ? <p>{t("profile.trust.empty")}</p> : null}
      {visibleConfirmations.length ? (
        <div className="trust-confirmation-list">
          {visibleConfirmations.map((confirmation) => {
            const isIncoming = confirmation.counterparty_user_id === currentUserId;
            const otherUserId = isIncoming ? confirmation.requester_user_id : confirmation.counterparty_user_id;
            const otherProfile = profiles[otherUserId] ?? null;
            const canRespond = isIncoming && confirmation.status === "pending";
            return (
              <article className={`trust-confirmation-row status-${confirmation.status}`} key={confirmation.id}>
                <div className="trust-confirmation-main">
                  <button className="trust-profile-button" type="button" onClick={() => onOpenProfile(otherUserId)}>
                    <UserNameWithLevel
                      label={otherProfile ? t("profile.levelBadge", { level: otherProfile.level }) : undefined}
                      level={otherProfile?.level}
                    >
                      {formatProfileName(otherProfile, otherUserId)}
                    </UserNameWithLevel>
                  </button>
                  <span className="trust-confirmation-meta">
                    {t(isIncoming ? "profile.trust.incoming" : "profile.trust.outgoing")} · {t(trustConfirmationTypeLabelKey(confirmation.confirmation_type))}
                  </span>
                  {confirmation.message ? <p>{confirmation.message}</p> : null}
                  <small>
                    {confirmation.status === "pending"
                      ? t("profile.trust.expires", { date: formatDate(confirmation.expires_at, locale) })
                      : formatDate(confirmation.responded_at ?? confirmation.updated_at, locale)}
                  </small>
                </div>
                <div className="trust-confirmation-side">
                  <span className="trust-status-pill">{t(trustConfirmationStatusLabelKey(confirmation.status))}</span>
                  {canRespond ? (
                    <div className="trust-confirmation-actions">
                      <button className="finance-small-icon-button primary" type="button" disabled={savingId === confirmation.id} aria-label={t("profile.trust.confirm")} onClick={() => onConfirm(confirmation.id)}>
                        <Check size={15} />
                      </button>
                      <button className="finance-small-icon-button" type="button" disabled={savingId === confirmation.id} aria-label={t("profile.trust.decline")} onClick={() => onDecline(confirmation.id)}>
                        <X size={15} />
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}

async function getAccessToken(): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}

async function refreshAccessToken(): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error("Supabase session refresh failed.");
  return data.session.access_token;
}

async function requestStoryWish(recommendedWishId: string, locale: AppLocale, token: string) {
  const response = await fetch("/api/wishes", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
    body: JSON.stringify({ locale, sourceRecommendedWishId: recommendedWishId })
  });
  const payload = await response.json().catch(() => ({})) as { wish?: { id: string }; error?: string };
  return { payload, response };
}

class StoryWishRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "StoryWishRequestError";
  }
}

function storyWishErrorMessage(error: unknown, t: (key: MessageKey) => string): string {
  if (error instanceof StoryWishRequestError) {
    if (error.status === 400 || error.status === 404) return t("wishes.addUnavailable");
    if (error.status === 401 || error.status === 403) return t("wishes.addAuthError");
    return t("wishes.addServerError");
  }
  if (error instanceof Error && /session/i.test(error.message)) return t("wishes.addAuthError");
  return t("wishes.addError");
}

async function loadTeamRewardsHistory(since?: string): Promise<TeamRewardDay[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({ limit: "30", ts: String(Date.now()) });
  if (since) params.set("since", since);
  const response = await fetch(`/api/teams/rewards-history?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: TeamRewardDay[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load team rewards.");
  return payload.rows ?? [];
}

async function loadCoreNotifications(since?: string): Promise<CoreNotificationRow[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({ limit: "30", ts: String(Date.now()) });
  if (since) params.set("since", since);
  const response = await fetch(`/api/core/accrual-history?${params.toString()}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Cache-Control": "no-cache"
    }
  });
  const payload = (await response.json()) as { rows?: CoreNotificationRow[]; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load core payouts.");
  return payload.rows ?? [];
}

async function loadNotificationCenter(locale: AppLocale): Promise<{ notifications: PayoutNotification[]; unreadCount: number }> {
  const token = await getAccessToken();
  const response = await fetch(`/api/notifications?limit=50&locale=${locale}&ts=${Date.now()}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
  });
  const payload = await response.json() as { notifications?: PayoutNotification[]; unreadCount?: number; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load notifications.");
  return { notifications: payload.notifications ?? [], unreadCount: payload.unreadCount ?? 0 };
}

async function markNotificationsRead(ids?: string[]): Promise<void> {
  const token = await getAccessToken();
  const response = await fetch("/api/notifications", {
    method: "PATCH",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(ids ? { ids } : { all: true })
  });
  const payload = await response.json() as { error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to update notifications.");
}

function buildPayoutNotifications(coreRows: CoreNotificationRow[], rewardRows: TeamRewardDay[], locale: AppLocale): PayoutNotification[] {
  const notifications: PayoutNotification[] = [];
  const coreAmount = coreRows.reduce((sum, row) => sum + Number(row.core_amount), 0);
  const walletAmount = coreRows.reduce((sum, row) => sum + Number(row.wallet_amount), 0);
  const teamAmount = rewardRows.reduce((sum, row) => sum + Number(row.reward_amount), 0);

  if (coreRows.length) {
    notifications.push({
      id: "core-payouts",
      title: locale === "ru" ? "Daily rate начислен" : "Daily rate received",
      body: `${locale === "ru" ? "Core" : "Core"} +${formatMoney(coreAmount, locale)} · Wallet +${formatMoney(walletAmount, locale)}`
    });
  }

  if (teamAmount > 0) {
    notifications.push({
      id: "team-bonus",
      title: locale === "ru" ? "Лидерский бонус начислен" : "Team bonus received",
      body: `+${formatMoney(teamAmount, locale)} ${locale === "ru" ? "в Core" : "to Core"}`
    });
  }

  return notifications;
}

function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatDay(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

function formatLeader(teamContext: TeamContext | null, locale: AppLocale): string {
  if (!teamContext?.membership) return locale === "ru" ? "Система" : "System";
  if (teamContext.leader.type === "system") return locale === "ru" ? "Система" : "System";
  return formatProfileName(teamContext.leader.profile, teamContext.membership.leader_user_id ?? "");
}

function formatTeamAssignment(
  teamContext: TeamContext | null,
  locale: AppLocale,
  t: (key: MessageKey, values?: Record<string, string | number>) => string
): string {
  if (!teamContext) return t("app.common.loading");
  if (teamContext.assignment.status === "queued") return t("profile.teams.queued");
  if (teamContext.assignment.status === "system") return t("profile.teams.system");
  if (teamContext.assignment.status === "missing") return t("profile.teams.missing");
  if (!teamContext.membership) return t("profile.teams.pending");
  return t("profile.teams.assigned", { date: formatDate(teamContext.membership.assigned_at, locale) });
}

function formatProfileName(profile: TeamProfile | null, fallback: string): string {
  return profile?.display_name ?? (profile?.username ? `@${profile.username}` : fallback.slice(0, 8));
}

function localizedMediaAlt(value: unknown, locale: AppLocale): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const localized = value as Record<string, unknown>;
  const preferred = localized[locale];
  if (typeof preferred === "string") return preferred;
  return typeof localized.en === "string" ? localized.en : "";
}

function localizedSystemBio(value: unknown, locale: AppLocale): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const localized = value as Record<string, unknown>;
  const preferred = localized[locale];
  if (typeof preferred === "string") return preferred;
  if (typeof localized.en === "string") return localized.en;
  return "";
}

function createProfileEditorState(payload: SocialProfilePayload | null, fallbackProfile: UserProfile | null = null): ProfileEditorState {
  const firstLink = payload?.links[0];
  return {
    displayName: payload?.profile?.display_name ?? fallbackProfile?.display_name ?? "",
    bio: payload?.profile?.bio ?? "",
    linkLabel: firstLink?.label ?? "",
    linkUrl: firstLink?.url ?? "",
    linkVisibility: (firstLink?.visibility as ProfileVisibility | undefined) ?? "public",
    visibilitySettings: payload?.visibilitySettings ?? { ...DEFAULT_PROFILE_VISIBILITY_SETTINGS },
    avatarUrl: payload?.profile?.avatar_url ?? fallbackProfile?.avatar_url ?? "",
    avatarPosition: payload?.profile?.avatar_position ?? fallbackProfile?.avatar_position ?? "50% 50%",
    avatarRemoved: false
  };
}

function updateFeedWishCopyState(payload: FeedPayload | null, wishId: string, copiedIncrement: number): FeedPayload | null {
  if (!payload) return payload;
  return {
    ...payload,
    posts: payload.posts.map((post) => updatePostWishCopyState(post, wishId, copiedIncrement))
  };
}

function replaceFeedPost(payload: FeedPayload | null, updatedPost: FeedPost): FeedPayload | null {
  if (!payload) return payload;
  return {
    ...payload,
    posts: payload.posts.map((post) => post.id === updatedPost.id ? updatedPost : post)
  };
}

function updatePostWishCopyState(post: FeedPost, wishId: string, copiedIncrement: number): FeedPost {
  if (post.wish?.id !== wishId) return post;
  return {
    ...post,
    wish: {
      ...post.wish,
      viewer_has_copy: true,
      copied_count: post.wish.copied_count + copiedIncrement
    }
  };
}

function visibilityLabelKey(visibility: ProfileVisibility): MessageKey {
  return `profile.visibility.${visibility}` as MessageKey;
}

function profileVisibilityKeyLabel(key: ProfileVisibilityKey): MessageKey {
  return `profile.visibilityBlock.${key}` as MessageKey;
}

function contactSourceLabelKey(source: string): MessageKey {
  if (source === "team_leader") return "profile.contacts.sourceLeader";
  if (source === "team_member") return "profile.contacts.sourceMember";
  return "profile.contacts.sourceManual";
}

function peopleFilterLabelKey(filter: PeopleFilter): MessageKey {
  if (filter === "team") return "social.people.filter.team";
  if (filter === "referrals") return "social.people.filter.referrals";
  if (filter === "same_level") return "social.people.filter.sameLevel";
  if (filter === "active") return "social.people.filter.active";
  return "social.people.filter.nearby";
}

function peopleSectionLabelKey(section: PeopleSection): MessageKey {
  if (section === "contacts") return "social.people.section.contacts";
  if (section === "confirmations") return "social.people.section.confirmations";
  return "social.people.section.discover";
}

function peopleInfluenceLabelKey(label: PeopleRow["publicStats"]["influence"]["label"]): MessageKey {
  if (label === "creator") return "social.people.influence.creator";
  if (label === "active") return "social.people.influence.active";
  return "social.people.influence.new";
}

function getContactTrustState(contactUserId: string, confirmations: TrustConfirmationRow[] | null, currentUserId: string): TrustConfirmationStatus | null {
  const confirmation = confirmations?.find((item) =>
    ((item.requester_user_id === currentUserId && item.counterparty_user_id === contactUserId)
      || (item.requester_user_id === contactUserId && item.counterparty_user_id === currentUserId))
    && item.confirmation_type === "contact_confirmed"
    && (item.status === "pending" || item.status === "confirmed")
  );
  return confirmation?.status ?? null;
}

function trustConfirmationTypeLabelKey(type: TrustConfirmationType): MessageKey {
  if (type === "help_given") return "profile.trust.typeHelpGiven";
  if (type === "help_received") return "profile.trust.typeHelpReceived";
  if (type === "deal_completed") return "profile.trust.typeDealCompleted";
  if (type === "challenge_confirmed") return "profile.trust.typeChallengeConfirmed";
  if (type === "contact_confirmed") return "profile.trust.typeContactConfirmed";
  return "profile.trust.typeProofAdded";
}

function trustConfirmationStatusLabelKey(status: TrustConfirmationStatus): MessageKey {
  if (status === "confirmed") return "profile.trust.statusConfirmed";
  if (status === "declined") return "profile.trust.statusDeclined";
  if (status === "expired") return "profile.trust.statusExpired";
  return "profile.trust.statusPending";
}

function postStatusLabelKey(status: FeedPost["status"]): MessageKey {
  if (status === "published") return "social.post.published";
  if (status === "archived") return "social.post.archived";
  return "social.post.draft";
}

function verificationLabelKey(type: string | null): MessageKey {
  if (type === "auto") return "challenges.verification.auto";
  if (type === "community") return "challenges.verification.community";
  return "challenges.verification.manual";
}

function statBlockLabelKey(blockKey: string): MessageKey {
  if (blockKey === "level") return "social.post.level";
  if (blockKey === "total_core_growth") return "social.post.totalCoreGrowth";
  if (blockKey === "team_strength") return "social.post.teamStrength";
  if (blockKey === "core_growth") return "social.post.coreGrowth";
  if (blockKey === "wallet_income") return "social.post.walletIncome";
  if (blockKey === "daily_rate") return "social.post.dailyRate";
  if (blockKey === "reinvest") return "social.post.reinvest";
  return "social.post.detail";
}

function formatPostDate(post: FeedPost, locale: AppLocale): string {
  return formatDate(post.published_at ?? post.created_at, locale);
}

function formatWishAmount(wish: PublicWish, locale: AppLocale): string {
  const amount = wish.target_amount ?? 0;
  if (wish.target_currency === "USD") return formatMoney(amount, locale);
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(amount)} ${wish.target_currency}`;
}

function formatProviderLabel(provider: string): string {
  if (provider === "tiktok") return "TikTok";
  if (provider === "instagram") return "Instagram";
  if (provider === "telegram") return "Telegram";
  if (provider === "youtube") return "YouTube";
  if (provider === "x") return "X";
  return "Website";
}

function formatStatBlockValue(block: FeedStatBlock, locale: AppLocale): string {
  if (block.block_key === "level") {
    const levelAfter = readValueNumber(block.value, "levelAfter");
    const levelBefore = readValueNumber(block.value, "levelBefore");
    const leveledUp = Boolean(readValue(block.value, "leveledUp"));
    if (!Number.isFinite(levelAfter)) return "Lvl 0";
    return leveledUp && Number.isFinite(levelBefore) ? `Lvl ${levelBefore} -> ${levelAfter}` : `Lvl ${levelAfter}`;
  }

  if (block.block_key === "total_core_growth") {
    const amount = readValueNumber(block.value, "amount");
    return `+${formatMoney(Number.isFinite(amount) ? amount : 0, locale)}`;
  }

  if (block.block_key === "team_strength") {
    const levelSum = readValueNumber(block.value, "levelSum");
    const memberCount = readValueNumber(block.value, "memberCount");
    const members = Number.isFinite(memberCount) ? memberCount : 0;
    const strength = Number.isFinite(levelSum) ? levelSum : 0;
    return `${strength} LVL / ${members}`;
  }

  if (block.block_key === "daily_rate" || block.block_key === "reinvest") {
    const percent = readValueNumber(block.value, "percent");
    return Number.isFinite(percent) ? formatPercentValue(percent) : "0%";
  }

  const amount = readValueNumber(block.value, "amount");
  return formatMoney(Number.isFinite(amount) ? amount : 0, locale);
}

function statBlockClassName(block: FeedStatBlock, baseClassName: string, active = false): string {
  const classNames = [baseClassName];
  if (active) classNames.push("active");
  if (block.block_key === "level" && Boolean(readValue(block.value, "leveledUp"))) classNames.push("level-up");
  return classNames.join(" ");
}

function readValue(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return (value as Record<string, unknown>)[key];
}

function readValueNumber(value: unknown, key: string): number {
  const raw = readValue(value, key);
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function formatPercentValue(value: number): string {
  const percent = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percent.toLocaleString("en-US", { maximumFractionDigits: 4 })}%`;
}

function readableHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
