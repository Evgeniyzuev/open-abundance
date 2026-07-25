"use client";

import { ArrowLeft, Bell, BookOpen, Check, ChevronDown, ChevronUp, Copy, Edit3, ExternalLink, Eye, EyeOff, Languages, Link, MessageCircle, Newspaper, QrCode, Save, Search, Send, Share2, Star, Trash2, UserPlus, UserRound, Users, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import FeedPostGallery from "@/components/FeedPostGallery";
import { UserNameWithLevel } from "@/components/UserLevelBadge";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney as formatMoney } from "@/lib/moneyFormat";
import type { FeedExternalLink, FeedMedia, FeedPayload, FeedPost, FeedProjectReview, FeedReviewSummary, FeedStatBlock, FeedSystemAccount, FeedSystemStory, FeedWish as PublicWish } from "@/lib/socialFeed";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { DEFAULT_PROFILE_VISIBILITY_SETTINGS, PROFILE_VISIBILITY_KEYS, PROFILE_VISIBILITY_LEVELS, type ProfileVisibility, type ProfileVisibilityKey, type ProfileVisibilitySettings } from "@/lib/socialProfile";
import { COLOR_THEMES, UI_SCALES, type ColorTheme, type UiScale } from "@/lib/appearance";
import { APP_TESTING_ATTITUDES, APP_TESTING_USEFUL_AREAS } from "@/lib/appTestingFeedback";

type SocialTab = "feed" | "people" | "blog" | "profile" | "teams";
type SocialTabChange = (tab: SocialTab) => void;
type ReferralLink = { code: string; url: string };
type TeamProfile = {
  user_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
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
  profile: { bio: string | null } | null;
  visibilitySettings: ProfileVisibilitySettings;
  links: ProfileLinkRow[];
  contacts: ContactRow[];
  error?: string;
};
type PublicProfilePayload = {
  profile: {
    user_id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
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
type FeedFilter = "all" | "stories" | "system" | "reviews";
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
  bio: string;
  linkLabel: string;
  linkUrl: string;
  linkVisibility: ProfileVisibility;
  visibilitySettings: ProfileVisibilitySettings;
};

export default function SocialApp({
  active,
  activeTab,
  refreshNonce,
  onTabChange
}: {
  active: boolean;
  activeTab: SocialTab;
  refreshNonce: number;
  onTabChange: SocialTabChange;
}) {
  const {
    user,
    profile,
    core,
    loading,
    error,
    locale,
    uiScale,
    colorTheme,
    setLocale,
    setUiScale,
    setColorTheme,
    t
  } = useUserContext();
  const [referralLink, setReferralLink] = useState<ReferralLink | null>(null);
  const [teamContext, setTeamContext] = useState<TeamContext | null>(null);
  const [socialError, setSocialError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [referralQrOpen, setReferralQrOpen] = useState(false);
  const [teamRewardsOpen, setTeamRewardsOpen] = useState(false);
  const [teamRewards, setTeamRewards] = useState<TeamRewardDay[] | null>(null);
  const [teamRewardsLoading, setTeamRewardsLoading] = useState(false);
  const [teamRewardsError, setTeamRewardsError] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<PayoutNotification[] | null>(null);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [socialProfile, setSocialProfile] = useState<SocialProfilePayload | null>(null);
  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileEditor, setProfileEditor] = useState<ProfileEditorState>(() => createProfileEditorState(null));
  const [profileSaving, setProfileSaving] = useState(false);
  const [trustConfirmations, setTrustConfirmations] = useState<TrustConfirmationRow[] | null>(null);
  const [trustProfiles, setTrustProfiles] = useState<Record<string, TeamProfile>>({});
  const [trustSavingId, setTrustSavingId] = useState<string | null>(null);
  const [trustCreatingForId, setTrustCreatingForId] = useState<string | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfilePayload | null>(null);
  const [publicProfileLoading, setPublicProfileLoading] = useState(false);
  const [copyingWishId, setCopyingWishId] = useState<string | null>(null);
  const [contactSavingId, setContactSavingId] = useState<string | null>(null);
  const [peoplePayload, setPeoplePayload] = useState<PeoplePayload | null>(null);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleSearchText, setPeopleSearchText] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>("nearby");
  const [directPayload, setDirectPayload] = useState<DirectConversationPayload | null>(null);
  const [directTargetUserId, setDirectTargetUserId] = useState<string | null>(null);
  const [directMessageBody, setDirectMessageBody] = useState("");
  const [directLoading, setDirectLoading] = useState(false);
  const [directSending, setDirectSending] = useState(false);
  const [feedPayload, setFeedPayload] = useState<FeedPayload | null>(null);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("all");
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);
  const [blogPayload, setBlogPayload] = useState<FeedPayload | null>(null);
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
  const feedCursorRef = useRef<string | null>(null);
  const dailyDraftEnsuredRef = useRef(false);

  useEffect(() => {
    setSocialError(null);
    setCopied(false);
    setReferralLink(null);
    setTeamContext(null);
    setTeamRewards(null);
    setTeamRewardsOpen(false);
    setTeamRewardsLoading(false);
    setTeamRewardsError(null);
    setNotifications(null);
    setNotificationsOpen(false);
    setNotificationsLoading(false);
    setSocialProfile(null);
    setProfileEditorOpen(false);
    setProfileEditor(createProfileEditorState(null));
    setProfileSaving(false);
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
    setDirectPayload(null);
    setDirectTargetUserId(null);
    setDirectMessageBody("");
    setDirectLoading(false);
    setDirectSending(false);
    setFeedPayload(null);
    setFeedFilter("all");
    setFeedLoadingMore(false);
    setBlogPayload(null);
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
    feedCursorRef.current = null;
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
    const payload = (await response.json()) as ReferralLink & { error?: string };
    if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load referral link.");
    setReferralLink({ code: payload.code, url: payload.url });
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
    setProfileEditor((current) => profileEditorOpen ? current : createProfileEditorState(payload));
  }, [profileEditorOpen, user]);

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

  const loadSystemDrafts = useCallback(async () => {
    if (!user) return;
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

  const loadFeed = useCallback(async (append = false) => {
    if (!user) return;
    if (!append) {
      void ensureDailyDraft();
      void loadSystemDrafts();
    }
    if (append) setFeedLoadingMore(true);
    else setFeedLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ scope: "feed", locale, limit: "20", ts: String(Date.now()) });
      if (feedFilter !== "all") params.set("category", feedFilter);
      if (append && feedCursorRef.current) params.set("cursor", feedCursorRef.current);
      const response = await fetch(`/api/social/feed?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as FeedPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load feed.");
      feedCursorRef.current = payload.nextCursor ?? null;
      setFeedPayload((current) => append && current
        ? { ...payload, posts: [...current.posts, ...payload.posts] }
        : payload);
    } finally {
      if (append) setFeedLoadingMore(false);
      else setFeedLoading(false);
    }
  }, [ensureDailyDraft, feedFilter, loadSystemDrafts, locale, user]);

  const loadBlog = useCallback(async () => {
    if (!user) return;
    setFeedLoading(true);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ scope: "blog", locale, ts: String(Date.now()) });
      if (selectedBlogAuthorId) params.set("authorUserId", selectedBlogAuthorId);
      const response = await fetch(`/api/social/feed?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as FeedPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load blog.");
      setBlogPayload(payload);
    } finally {
      setFeedLoading(false);
    }
  }, [locale, selectedBlogAuthorId, user]);

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
      setTeamContext(null);
      setTeamRewards(null);
      setTeamRewardsOpen(false);
      setNotifications(null);
      setNotificationsOpen(false);
      return;
    }

    if (!navigator.onLine) {
      return;
    }

    const load = activeTab === "feed"
      ? selectedSystemAccountKey ? loadSystemProfile : loadFeed
      : activeTab === "people" ? loadPeople
      : activeTab === "blog" ? loadBlog
      : activeTab === "teams" ? loadTeamContext
      : loadProfileTab;
    setSocialError(null);
    load().catch((loadError) => {
      console.warn("Social data load failed", loadError);
      setSocialError(loadError instanceof Error ? loadError.message : "Failed to load social data.");
    });
  }, [active, activeTab, loadBlog, loadFeed, loadPeople, loadProfileTab, loadSystemProfile, loadTeamContext, refreshNonce, selectedSystemAccountKey, user]);

  const displayName = profile?.display_name ?? user?.email ?? t("profile.guest");
  const handle = profile?.username ? `@${profile.username}` : user?.email ?? t("profile.localMode");
  const nextLocale: AppLocale = locale === "ru" ? "en" : "ru";
  const combinedError = error ?? socialError;

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

  function openProfileEditor() {
    setProfileEditor(createProfileEditorState(socialProfile));
    setProfileEditorOpen(true);
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
          bio: profileEditor.bio,
          visibilitySettings: profileEditor.visibilitySettings,
          links
        })
      });
      const payload = (await response.json()) as SocialProfilePayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to save profile.");
      await loadSocialProfile();
      setProfileEditorOpen(false);
    } catch (saveError) {
      console.warn("Social profile save failed", saveError);
      setSocialError(saveError instanceof Error ? saveError.message : "Failed to save profile.");
    } finally {
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
    setFeedPayload((current) => updateFeedWishCopyState(current, wishId, copiedIncrement));
    setBlogPayload((current) => updateFeedWishCopyState(current, wishId, copiedIncrement));
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
      setSocialProfile((current) => current ? { ...current, contacts: payload.contacts ?? current.contacts } : current);
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
      setSocialProfile((current) => current ? { ...current, contacts: payload.contacts ?? [] } : current);
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
      await Promise.all([loadFeed(), loadBlog()]);
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
      await Promise.all([loadFeed(), loadBlog()]);
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
    setFeedPayload((current) => current ? { ...current, posts: current.posts.map(update) } : current);
    setBlogPayload((current) => current ? { ...current, posts: current.posts.map(update) } : current);
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
      const updatedPost = payload.post;
      setDailyDraft((current) => current?.id === updatedPost.id ? updatedPost : current);
      setSelectedPost((current) => current?.id === updatedPost.id ? updatedPost : current);
      await Promise.all([loadFeed(), loadBlog()]);
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
      setFeedPayload((current) => replaceFeedPost(current, updatedPost));
      setBlogPayload((current) => replaceFeedPost(current, updatedPost));
      setSelectedPost(updatedPost);
      await loadFeed();
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
      await Promise.all([loadFeed(), loadBlog()]);
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
    const nextOpen = !notificationsOpen;
    setNotificationsOpen(nextOpen);
    if (!nextOpen) return;

    setNotificationsLoading(true);
    setSocialError(null);
    try {
      const [coreRows, rewardRows] = await Promise.all([
        loadCoreNotifications(),
        loadTeamRewardsHistory()
      ]);
      setNotifications(buildPayoutNotifications(coreRows, rewardRows, locale));
    } catch (loadError) {
      console.warn("Payout notifications load failed", loadError);
      setSocialError(loadError instanceof Error ? loadError.message : "Failed to load notifications.");
    } finally {
      setNotificationsLoading(false);
    }
  }

  return (
    <section className="social-screen">
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
          onOpenPost={setSelectedPost}
          onOpenSystemAccount={openSystemAccount}
          onPublish={publishPost}
        />
      ) : null}

      {activeTab === "feed" && user && !selectedSystemAccountKey ? (
        <FeedView
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
          onDraftBodyChange={updateDailyDraftBody}
          onDraftBodyChangeForPost={updateSystemDraftBody}
          onExternalLinkUrlChange={setExternalLinkUrl}
          onFilterChange={(nextFilter) => {
            feedCursorRef.current = null;
            setFeedPayload(null);
            setFeedFilter(nextFilter);
          }}
          onLoadMore={() => { void loadFeed(true); }}
          onLinkComposerToggle={() => setLinkComposerOpen((current) => !current)}
          onOpenAuthor={openPublicProfile}
          onOpenBlog={openAuthorBlog}
          onOpenPost={setSelectedPost}
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
          currentUserId={user.id}
          filter={peopleFilter}
          loading={peopleLoading}
          payload={peoplePayload}
          query={peopleSearchText}
          t={t}
          onAddContact={(userId) => { void addManualContact(userId); }}
          onFilterChange={setPeopleFilter}
          onMessage={(row) => { void openDirectMessage(row.profile.user_id); }}
          onOpenBlog={openAuthorBlog}
          onOpenProfile={openPublicProfile}
          onQueryChange={setPeopleSearchText}
          onRefresh={submitPeopleSearch}
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

      {activeTab === "blog" && user ? (
        <BlogView
          blogPayload={blogPayload}
          copyingWishId={copyingWishId}
          currentUserId={user.id}
          dailyDraft={dailyDraft}
          systemDrafts={systemDrafts}
          externalLinkUrl={externalLinkUrl}
          linkComposerOpen={linkComposerOpen}
          loading={feedLoading}
          locale={locale}
          saving={feedSaving}
          selectedBlogAuthorId={selectedBlogAuthorId}
          t={t}
          onOpenAuthor={openPublicProfile}
          onOpenOwnBlog={() => setSelectedBlogAuthorId(null)}
          onOpenPost={setSelectedPost}
          onOpenSystemAccount={openSystemAccount}
          onCopyWish={copyPublicWishToMine}
          onDeletePost={deletePost}
          onPublish={publishPost}
          onCreateDraft={createDailyDraft}
          onDraftBodyChange={updateDailyDraftBody}
          onDraftBodyChangeForPost={updateSystemDraftBody}
          onToggleDraftBlock={toggleDailyDraftBlock}
          onUpdateCover={updatePostCover}
          onUploadCover={uploadPostCover}
          onExternalLinkUrlChange={setExternalLinkUrl}
          onLinkComposerToggle={() => setLinkComposerOpen((current) => !current)}
          onCreateExternalLink={createExternalLinkPost}
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
              <div className="team-summary">
                <span>{t("profile.teams.leader")}</span>
                {teamContext?.leader.type === "user" && teamContext.membership?.leader_user_id ? (
                  <button className="inline-profile-button" type="button" onClick={() => { void openPublicProfile(teamContext.membership?.leader_user_id ?? ""); }}>
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
                      <button className="compact-profile-button" type="button" key={member.userId} onClick={() => { void openPublicProfile(member.userId); }}>
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
                    ))}
                  </div>
                ) : (
                  <p>{t("profile.teams.emptyMembers")}</p>
                )}
              </div>
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
        <section className="profile-panel">
          <div className="profile-avatar">
            {profile?.avatar_url ? <img alt="" src={profile.avatar_url} /> : <UserRound size={34} />}
          </div>
          <strong>
            <UserNameWithLevel
              label={t("profile.levelBadge", { level: core?.level ?? profile?.level ?? 0 })}
              level={core?.level ?? profile?.level ?? 0}
            >
              {displayName}
            </UserNameWithLevel>
          </strong>
          <p>{handle}</p>
          <div className="profile-facts">
            <span>{t("profile.created", { date: profile ? formatDate(profile.created_at, locale) : "..." })}</span>
            <span>{locale.toUpperCase()}</span>
          </div>
          <button className="secondary-button" type="button" aria-label={t("profile.language.toggle")} onClick={() => setLocale(nextLocale)}>
            <Languages size={16} />
            {t(nextLocale === "ru" ? "profile.language.ru" : "profile.language.en")}
          </button>
          <section className="profile-appearance" aria-label={t("profile.appearance.title")}>
            <div className="section-heading-row">
              <span>{t("profile.appearance.title")}</span>
            </div>
            <div className="appearance-setting-row">
              <span>{t("profile.appearance.scale")}</span>
              <div className="appearance-options" role="group" aria-label={t("profile.appearance.scale")}>
                {UI_SCALES.map((scale) => (
                  <button
                    className={uiScale === scale ? "active" : ""}
                    type="button"
                    aria-pressed={uiScale === scale}
                    key={scale}
                    onClick={() => setUiScale(scale as UiScale)}
                  >
                    {scale}%
                  </button>
                ))}
              </div>
            </div>
            <div className="appearance-setting-row">
              <span>{t("profile.appearance.theme")}</span>
              <div className="appearance-options" role="group" aria-label={t("profile.appearance.theme")}>
                {COLOR_THEMES.map((theme) => (
                  <button
                    className={colorTheme === theme ? "active" : ""}
                    type="button"
                    aria-pressed={colorTheme === theme}
                    key={theme}
                    onClick={() => setColorTheme(theme as ColorTheme)}
                  >
                    {t(`profile.appearance.theme.${theme}` as MessageKey)}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className="public-profile-box">
            <div className="section-heading-row">
              <span>{t("profile.public.title")}</span>
              <button className="finance-small-icon-button" type="button" aria-label={t("profile.public.edit")} onClick={openProfileEditor}>
                <Edit3 size={16} />
              </button>
            </div>
            {profileEditorOpen ? (
              <div className="profile-editor">
                <label className="finance-field">
                  <span>{t("profile.public.bio")}</span>
                  <textarea value={profileEditor.bio} maxLength={700} onChange={(event) => setProfileEditor((current) => ({ ...current, bio: event.target.value }))} />
                </label>
                <div className="term-row">
                  <label className="finance-field">
                    <span>{t("profile.public.linkLabel")}</span>
                    <input value={profileEditor.linkLabel} maxLength={40} onChange={(event) => setProfileEditor((current) => ({ ...current, linkLabel: event.target.value }))} />
                  </label>
                  <label className="finance-field">
                    <span>{t("profile.public.linkUrl")}</span>
                    <input value={profileEditor.linkUrl} maxLength={500} inputMode="url" onChange={(event) => setProfileEditor((current) => ({ ...current, linkUrl: event.target.value }))} />
                  </label>
                </div>
                <label className="finance-field">
                  <span>{t("profile.public.linkVisibility")}</span>
                  <select value={profileEditor.linkVisibility} onChange={(event) => setProfileEditor((current) => ({ ...current, linkVisibility: event.target.value as ProfileVisibility }))}>
                    {PROFILE_VISIBILITY_LEVELS.map((visibility) => (
                      <option value={visibility} key={visibility}>{t(visibilityLabelKey(visibility))}</option>
                    ))}
                  </select>
                </label>
                <div className="visibility-grid">
                  {PROFILE_VISIBILITY_KEYS.map((key) => (
                    <label className="finance-field" key={key}>
                      <span>{t(profileVisibilityKeyLabel(key))}</span>
                      <select
                        value={profileEditor.visibilitySettings[key]}
                        onChange={(event) => setProfileEditor((current) => ({
                          ...current,
                          visibilitySettings: {
                            ...current.visibilitySettings,
                            [key]: event.target.value as ProfileVisibility
                          }
                        }))}
                      >
                        {PROFILE_VISIBILITY_LEVELS.map((visibility) => (
                          <option value={visibility} key={visibility}>{t(visibilityLabelKey(visibility))}</option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <div className="referral-actions">
                  <button className="secondary-button" type="button" disabled={profileSaving} onClick={saveProfileEditor}>
                    <Save size={16} />
                    {t("app.common.done")}
                  </button>
                  <button className="secondary-button" type="button" disabled={profileSaving} onClick={() => setProfileEditorOpen(false)}>
                    <X size={16} />
                    {t("app.common.cancel")}
                  </button>
                </div>
              </div>
            ) : (
              <>
                {socialProfile?.profile?.bio ? <p>{socialProfile.profile.bio}</p> : <p>{t("profile.public.emptyBio")}</p>}
                {socialProfile?.links.length ? (
                  <div className="profile-links">
                    {socialProfile.links.map((item) => (
                      <a href={item.url} target="_blank" rel="noreferrer" key={item.id}>
                        <ExternalLink size={15} />
                        {item.label ?? readableHost(item.url)}
                      </a>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </section>
          <section className="public-profile-box">
            <div className="section-heading-row">
              <span>{t("profile.contacts.title")}</span>
              <strong>{socialProfile?.contacts.length ?? 0}</strong>
            </div>
            {socialProfile?.contacts.length ? (
              <div className="contact-list">
                {socialProfile.contacts.map((contact) => {
                  const contactTrustState = getContactTrustState(contact.contact_user_id, trustConfirmations, user.id);
                  return (
                    <article className="contact-row" key={`${contact.contact_user_id}-${contact.source}`}>
                      <button type="button" onClick={() => { void openPublicProfile(contact.contact_user_id); }}>
                        <UserNameWithLevel
                          label={t("profile.levelBadge", { level: contact.profile?.level ?? 0 })}
                          level={contact.profile?.level}
                        >
                          {formatProfileName(contact.profile, contact.contact_user_id)}
                        </UserNameWithLevel>
                        <small>{t(contactSourceLabelKey(contact.source))}</small>
                      </button>
                      <div className="contact-actions">
                        <button
                          className="finance-small-icon-button primary"
                          type="button"
                          disabled={Boolean(contactTrustState) || trustCreatingForId === contact.contact_user_id}
                          aria-label={t("profile.trust.requestContact")}
                          onClick={() => { void requestContactConfirmation(contact); }}
                        >
                          <Send size={15} />
                        </button>
                        {contact.source === "manual" && !contact.is_required ? (
                          <button className="finance-small-icon-button" type="button" disabled={contactSavingId === contact.contact_user_id} aria-label={t("profile.contacts.remove")} onClick={() => { void removeManualContact(contact.contact_user_id); }}>
                            <Trash2 size={15} />
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p>{t("profile.contacts.empty")}</p>
            )}
          </section>
          <TrustConfirmationsPanel
            confirmations={trustConfirmations}
            currentUserId={user.id}
            locale={locale}
            profiles={trustProfiles}
            savingId={trustSavingId}
            t={t}
            onConfirm={(confirmationId) => { void respondToTrustConfirmation(confirmationId, "confirm"); }}
            onDecline={(confirmationId) => { void respondToTrustConfirmation(confirmationId, "decline"); }}
            onOpenProfile={openPublicProfile}
          />
          <div className="profile-notifications">
            <button className="finance-icon-button" type="button" aria-label={locale === "ru" ? "Уведомления" : "Notifications"} onClick={openPayoutNotifications}>
              <Bell size={18} />
            </button>
            {notificationsOpen ? (
              <div className="notification-panel">
                {notificationsLoading ? <p>{t("app.common.loading")}</p> : null}
                {!notificationsLoading && notifications?.length ? notifications.map((item) => (
                  <article className="notification-row" key={item.id}>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </article>
                )) : null}
                {!notificationsLoading && notifications && notifications.length === 0 ? (
                  <p>{locale === "ru" ? "Новых поступлений нет." : "No new payouts."}</p>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="referral-box">
            <span><Link size={15} />{t("profile.referral.title")}</span>
            <p>{referralLink?.url ?? t("app.common.loading")}</p>
            <div className="referral-actions">
              <button
                className="secondary-button referral-icon-button"
                type="button"
                disabled={!referralLink}
                aria-label={t("profile.referral.showQr")}
                title={t("profile.referral.showQr")}
                onClick={() => setReferralQrOpen(true)}
              >
                <QrCode size={19} />
              </button>
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
              <button
                className="secondary-button referral-icon-button"
                type="button"
                disabled={!referralLink}
                aria-label={t("profile.referral.share")}
                title={t("profile.referral.share")}
                onClick={shareReferralLink}
              >
                <Share2 size={19} />
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {combinedError ? <p className="finance-error">{combinedError}</p> : null}
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
              {publicProfile.profile.avatar_url ? <img alt="" src={publicProfile.profile.avatar_url} /> : <UserRound size={34} />}
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
          t={t}
          onClose={() => setSelectedPost(null)}
          onDeletePost={deletePost}
          onOpenAuthor={openPublicProfile}
          onOpenBlog={openAuthorBlog}
          onOpenSystemAccount={openSystemAccount}
          onPublish={publishPost}
          onUpdateCover={updatePostCover}
          onUploadCover={uploadPostCover}
          onUpdateReview={updateProjectReview}
          onCopyWish={copyPublicWishToMine}
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
              {targetProfile?.avatar_url ? <img alt="" src={targetProfile.avatar_url} /> : <UserRound size={18} />}
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

function PeopleView({
  contactSavingId,
  currentUserId,
  filter,
  loading,
  payload,
  query,
  t,
  onAddContact,
  onFilterChange,
  onMessage,
  onOpenBlog,
  onOpenProfile,
  onQueryChange,
  onRefresh
}: {
  contactSavingId: string | null;
  currentUserId: string;
  filter: PeopleFilter;
  loading: boolean;
  payload: PeoplePayload | null;
  query: string;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onAddContact: (userId: string) => void;
  onFilterChange: (filter: PeopleFilter) => void;
  onMessage: (row: PeopleRow) => void;
  onOpenBlog: (userId: string) => void;
  onOpenProfile: (userId: string) => void;
  onQueryChange: (query: string) => void;
  onRefresh: () => void;
}) {
  const people = payload?.people ?? [];
  const filters: PeopleFilter[] = ["nearby", "team", "referrals", "same_level", "active"];

  return (
    <section className="people-layout">
      <form className="people-search" onSubmit={(event) => { event.preventDefault(); onRefresh(); }}>
        <Search size={17} />
        <input
          maxLength={80}
          placeholder={t("social.people.searchPlaceholder")}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <button className="finance-small-icon-button primary" type="submit" aria-label={t("social.people.search")}>
          <Search size={15} />
        </button>
      </form>
      <div className="people-filter-row" aria-label={t("social.people.filters")}>
        {filters.map((item) => (
          <button
            className={item === filter ? "active" : ""}
            type="button"
            key={item}
            onClick={() => onFilterChange(item)}
          >
            {t(peopleFilterLabelKey(item))}
          </button>
        ))}
      </div>
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
                  <span className="people-avatar">
                    {row.profile.avatar_url ? <img alt="" src={row.profile.avatar_url} /> : <UserRound size={20} />}
                  </span>
                  <span className="people-row-copy">
                    <span className="people-row-title">
                      <strong>
                        <UserNameWithLevel
                          label={t("profile.levelBadge", { level: row.profile.level })}
                          level={row.profile.level}
                        >
                          {name}
                        </UserNameWithLevel>
                      </strong>
                    </span>
                    <small>{row.profile.username ? `@${row.profile.username}` : row.headline ?? t("social.people.noHeadline")}</small>
                    {row.headline && row.profile.username ? <p>{row.headline}</p> : null}
                    <span className="people-stat-row">
                      <span>{t("social.people.trustStat", { count: row.publicStats.trust.confirmed })}</span>
                      <span>{t("social.people.teamStat", { strength: row.publicStats.team.strength, members: row.publicStats.team.members })}</span>
                      <span>{t(peopleInfluenceLabelKey(row.publicStats.influence.label))}</span>
                    </span>
                  </span>
                </button>
                <div className="people-actions">
                  <button className="finance-small-icon-button" type="button" aria-label={t("social.feed.openBlog")} onClick={() => onOpenBlog(row.profile.user_id)}>
                    <BookOpen size={15} />
                  </button>
                  <button className="finance-small-icon-button" type="button" aria-label={t("social.people.message")} onClick={() => onMessage(row)}>
                    <MessageCircle size={15} />
                  </button>
                  {canAddContact ? (
                    <button className="finance-small-icon-button primary" type="button" disabled={contactSavingId === row.profile.user_id} aria-label={t("social.people.addContact")} onClick={() => onAddContact(row.profile.user_id)}>
                      <UserPlus size={15} />
                    </button>
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
          <img alt="" src={account?.avatar_url ?? "/icons/icon2.svg"} />
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
  onCopyWish,
  onDraftBodyChange,
  onDraftBodyChangeForPost,
  onExternalLinkUrlChange,
  onFilterChange,
  onLoadMore,
  onLinkComposerToggle,
  onOpenAuthor,
  onOpenBlog,
  onOpenPost,
  onOpenSystemAccount,
  onDeletePost,
  onPublish,
  onUpdateCover,
  onUploadCover,
  onToggleDraftBlock
}: {
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
  onCopyWish: (wish: PublicWish) => void;
  onDraftBodyChange: (body: string) => void;
  onDraftBodyChangeForPost: (postId: string, body: string) => void;
  onExternalLinkUrlChange: (url: string) => void;
  onFilterChange: (filter: FeedFilter) => void;
  onLoadMore: () => void;
  onLinkComposerToggle: () => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
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
        <button className={filter === "all" ? "active" : ""} type="button" onClick={() => onFilterChange("all")}>
          {t("social.feed.filter.all")}
        </button>
        <button className={filter === "stories" ? "active" : ""} type="button" onClick={() => onFilterChange("stories")}>
          {t("social.feed.filter.stories")}
        </button>
        <button className={filter === "system" ? "active" : ""} type="button" onClick={() => onFilterChange("system")}>
          {t("social.feed.filter.system")}
        </button>
        <button className={filter === "reviews" ? "active" : ""} type="button" onClick={() => onFilterChange("reviews")}>
          {t("social.feed.filter.reviews")}
        </button>
      </div>
      {filter === "reviews" && feedPayload?.reviewSummary ? (
        <ReviewSummary summary={feedPayload.reviewSummary} locale={locale} t={t} />
      ) : null}
      <PostList
        copyingWishId={copyingWishId}
        currentUserId={currentUserId}
        emptyText={t("social.feed.empty")}
        loading={loading}
        locale={locale}
        posts={posts}
        showBlogAction={true}
        t={t}
        onCopyWish={onCopyWish}
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

type BlogSubTab = "posts" | "drafts";

function BlogView({
  blogPayload,
  copyingWishId,
  currentUserId,
  dailyDraft,
  systemDrafts,
  externalLinkUrl,
  linkComposerOpen,
  loading,
  locale,
  saving,
  selectedBlogAuthorId,
  t,
  onCopyWish,
  onOpenAuthor,
  onOpenOwnBlog,
  onOpenPost,
  onOpenSystemAccount,
  onDeletePost,
  onPublish,
  onCreateDraft,
  onDraftBodyChange,
  onDraftBodyChangeForPost,
  onToggleDraftBlock,
  onUpdateCover,
  onUploadCover,
  onExternalLinkUrlChange,
  onLinkComposerToggle,
  onCreateExternalLink
}: {
  blogPayload: FeedPayload | null;
  copyingWishId: string | null;
  currentUserId: string;
  dailyDraft: FeedPost | null;
  systemDrafts: FeedPost[];
  externalLinkUrl: string;
  linkComposerOpen: boolean;
  loading: boolean;
  locale: AppLocale;
  saving: boolean;
  selectedBlogAuthorId: string | null;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCopyWish: (wish: PublicWish) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenOwnBlog: () => void;
  onOpenPost: (post: FeedPost) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
  onCreateDraft: () => void;
  onDraftBodyChange: (body: string) => void;
  onDraftBodyChangeForPost: (postId: string, body: string) => void;
  onToggleDraftBlock: (blockKey: string) => void;
  onUpdateCover: (post: FeedPost, templateKey: string) => void;
  onUploadCover: (post: FeedPost, file: File) => void;
  onExternalLinkUrlChange: (url: string) => void;
  onLinkComposerToggle: () => void;
  onCreateExternalLink: () => void;
}) {
  const [blogSubTab, setBlogSubTab] = useState<BlogSubTab>("posts");
  const posts = blogPayload?.posts ?? [];
  const author = blogPayload?.author ?? posts[0]?.author ?? null;
  const title = selectedBlogAuthorId ? formatProfileName(author, selectedBlogAuthorId) : t("social.blog.mine");

  return (
    <section className="feed-layout">
      <section className="blog-heading">
        <div>
          <span>{t("social.blog.title")}</span>
          <strong>
            {selectedBlogAuthorId ? (
              <UserNameWithLevel
                label={author ? t("profile.levelBadge", { level: author.level }) : undefined}
                level={author?.level}
              >
                {title}
              </UserNameWithLevel>
            ) : title}
          </strong>
        </div>
        {selectedBlogAuthorId && selectedBlogAuthorId !== currentUserId ? (
          <button className="secondary-button" type="button" onClick={onOpenOwnBlog}>
            <UserRound size={16} />
            {t("social.blog.mine")}
          </button>
        ) : null}
      </section>
      <div className="feed-filter-row" role="group" aria-label={t("social.blog.title")}>
        <button className={blogSubTab === "posts" ? "active" : ""} type="button" onClick={() => setBlogSubTab("posts")}>
          {t("social.blog.tab.posts")}
        </button>
        <button className={blogSubTab === "drafts" ? "active" : ""} type="button" onClick={() => setBlogSubTab("drafts")}>
          {t("social.blog.tab.drafts")}
        </button>
      </div>
      {blogSubTab === "posts" ? (
        <PostList
          copyingWishId={copyingWishId}
          currentUserId={currentUserId}
          emptyText={t("social.blog.empty")}
          loading={loading}
          locale={locale}
          posts={posts}
          saving={saving}
          showBlogAction={false}
          t={t}
          onCopyWish={onCopyWish}
          onOpenAuthor={onOpenAuthor}
          onOpenBlog={onOpenAuthor}
          onOpenPost={onOpenPost}
          onOpenSystemAccount={onOpenSystemAccount}
          onDeletePost={onDeletePost}
          onPublish={onPublish}
        />
      ) : (
        <section className="feed-composer">
          <div className="section-heading-row">
            <span>{t("social.feed.systemDrafts")}</span>
            <button className="secondary-button" type="button" disabled={saving} onClick={onCreateDraft}>
              <Newspaper size={16} />
              {t("social.feed.createDraft")}
            </button>
          </div>
          {dailyDraft ? (
            <DailyDraftEditor
              locale={locale}
              post={dailyDraft}
              saving={saving}
              t={t}
              onBodyChange={onDraftBodyChange}
              onPublish={() => onPublish(dailyDraft)}
              onToggleBlock={onToggleDraftBlock}
              onUpdateCover={onUpdateCover}
              onUploadCover={onUploadCover}
            />
          ) : null}
          {systemDrafts.filter((post) => post.id !== dailyDraft?.id).map((post) => (
            <SystemDraftEditor
              key={post.id}
              locale={locale}
              post={post}
              saving={saving}
              t={t}
              onBodyChange={(body) => onDraftBodyChangeForPost(post.id, body)}
              onPublish={() => onPublish(post)}
              onUpdateCover={onUpdateCover}
              onUploadCover={onUploadCover}
            />
          ))}
          <ExternalLinkComposer
            open={linkComposerOpen}
            saving={saving}
            t={t}
            url={externalLinkUrl}
            onToggle={onLinkComposerToggle}
            onSubmit={onCreateExternalLink}
            onUrlChange={onExternalLinkUrlChange}
          />
        </section>
      )}
    </section>
  );
}

function DailyDraftEditor({
  locale,
  post,
  saving,
  t,
  onBodyChange,
  onPublish,
  onToggleBlock,
  onUpdateCover,
  onUploadCover
}: {
  locale: AppLocale;
  post: FeedPost;
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onBodyChange: (body: string) => void;
  onPublish: () => void;
  onToggleBlock: (blockKey: string) => void;
  onUpdateCover: (post: FeedPost, templateKey: string) => void;
  onUploadCover: (post: FeedPost, file: File) => void;
}) {
  return (
    <div className="daily-draft-editor">
      <textarea value={post.body ?? ""} maxLength={700} onChange={(event) => onBodyChange(event.target.value)} />
      <SystemEventCoverPicker post={post} saving={saving} t={t} onUpdateCover={onUpdateCover} onUploadCover={onUploadCover} />
      <div className="stat-block-picker-heading">
        <span>{t("social.post.visibilitySettings")}</span>
      </div>
      <div className="stat-block-picker">
        {post.statBlocks.map((block) => {
          const isPublic = block.visibility === "public";
          const blockLabel = t(statBlockLabelKey(block.block_key));
          return (
            <button
              aria-label={t(isPublic ? "social.post.hideBlock" : "social.post.showBlock", { block: blockLabel })}
              aria-pressed={isPublic}
              className={statBlockClassName(block, "stat-block-toggle", isPublic)}
              type="button"
              key={block.id}
              onClick={() => onToggleBlock(block.block_key)}
            >
              <span>{blockLabel}</span>
              <strong>{formatStatBlockValue(block, locale)}</strong>
              <small>
                {isPublic ? <Eye size={13} /> : <EyeOff size={13} />}
                {t(isPublic ? "social.post.publicBlock" : "social.post.privateBlock")}
              </small>
            </button>
          );
        })}
      </div>
      <button className="secondary-button primary-social-action" type="button" disabled={saving || post.status === "published"} onClick={onPublish}>
        <Send size={16} />
        {t("social.feed.publish")}
      </button>
    </div>
  );
}

function SystemDraftEditor({ locale, post, saving, t, onBodyChange, onPublish, onUpdateCover, onUploadCover }: {
  locale: AppLocale;
  post: FeedPost;
  saving: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onBodyChange: (body: string) => void;
  onPublish: () => void;
  onUpdateCover: (post: FeedPost, templateKey: string) => void;
  onUploadCover: (post: FeedPost, file: File) => void;
}) {
  return (
    <div className="daily-draft-editor system-event-draft-editor">
      <textarea value={post.body ?? ""} maxLength={700} onChange={(event) => onBodyChange(event.target.value)} />
      <SystemEventCoverPicker post={post} saving={saving} t={t} onUpdateCover={onUpdateCover} onUploadCover={onUploadCover} />
      <StatBlockGrid blocks={post.statBlocks} locale={locale} t={t} />
      <button className="secondary-button primary-social-action" type="button" disabled={saving || post.status === "published"} onClick={onPublish}>
        <Send size={16} />
        {t("social.feed.publish")}
      </button>
    </div>
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
  copyingWishId: string | null;
  currentUserId: string;
  emptyText: string;
  loading: boolean;
  locale: AppLocale;
  posts: FeedPost[];
  saving?: boolean;
  showBlogAction: boolean;
  showSystemProfileAction?: boolean;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onCopyWish: (wish: PublicWish) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenPost: (post: FeedPost) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onDeletePost: (post: FeedPost) => void;
  onPublish: (post: FeedPost) => void;
}) {
  const { emptyText, loading, onOpenPost, posts, t } = props;
  if (loading && !posts.length) return <p className="finance-error neutral">{t("app.common.loading")}</p>;
  if (!posts.length) return <p className="feed-empty">{emptyText}</p>;

  return <FeedPostGallery fallbackTitle={t("social.post.detail")} posts={posts} onOpen={onOpenPost} />;
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
  onCopyWish,
  onDeletePost,
  onOpenAuthor,
  onOpenBlog,
  onOpenSystemAccount,
  onPublish,
  onUpdateCover,
  onUploadCover,
  onUpdateReview
}: {
  copyingWishId: string | null;
  currentUserId: string | null;
  readOnly?: boolean;
  locale: AppLocale;
  post: FeedPost;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onClose: () => void;
  onCopyWish: (wish: PublicWish) => void;
  onDeletePost: (post: FeedPost) => void;
  onOpenAuthor: (userId: string) => void;
  onOpenBlog: (userId: string) => void;
  onOpenSystemAccount: (accountKey: string) => void;
  onPublish: (post: FeedPost) => void;
  onUpdateCover?: (post: FeedPost, templateKey: string) => void;
  onUploadCover?: (post: FeedPost, file: File) => void;
  onUpdateReview: (post: FeedPost, changes: ReviewEditPayload) => Promise<void>;
}) {
  const canDelete = !readOnly && Boolean(post.author_user_id) && post.author_user_id === currentUserId;
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

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section className="modal-sheet post-detail-modal" role="dialog" aria-modal="true" aria-label={t("social.post.detail")} onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" aria-label={t("app.common.close")} onClick={onClose}>
          <X size={18} />
        </button>
        <div className="post-detail-author-row">
          <PostAuthor detail post={post} t={t} onOpenAuthor={onOpenAuthor} onOpenSystemAccount={onOpenSystemAccount} />
          {post.post_type === "reality_demo" ? <span className="reality-demo-badge">{t("social.feed.demoBadge")}</span> : null}
          {post.post_type === "abundance_story" ? <span className="system-story-badge">{t("social.feed.systemStoryBadge")}</span> : null}
          {post.post_type === "project_review" ? <span className="project-review-badge">{t("social.review.badge")}</span> : null}
        </div>
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
        {post.projectReview && !editingReview ? <small className="project-review-reward-note">{t("social.review.rewarded")}</small> : null}
        <span className={`post-status ${post.status}`}>{t(postStatusLabelKey(post.status))} - {formatPostDate(post, locale)}</span>
        <PostMedia media={post.media} locale={locale} portrait={post.post_type === "abundance_story"} showSource />
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
        <div className="post-detail-actions">
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
        {isSystemStory ? <img alt="" src={post.systemStory?.account?.avatar_url ?? "/icons/icon2.svg"} /> : post.author?.avatar_url ? <img alt="" src={post.author.avatar_url} /> : <UserRound size={18} />}
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
  const images = media.filter((item) => item.media_type === "image");
  if (!images.length) return null;

  return (
    <div className={`feed-post-media${images.length > 1 ? " multiple" : ""}${portrait ? " portrait" : ""}`}>
      {images.map((item) => {
        const image = <img alt={localizedMediaAlt(item.alt_text, locale)} loading="lazy" src={item.media_url ?? undefined} />;
        return onOpen ? (
          <button type="button" key={item.id} onClick={onOpen}>{image}</button>
        ) : (
          <figure key={item.id}>
            {image}
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

function createProfileEditorState(payload: SocialProfilePayload | null): ProfileEditorState {
  const firstLink = payload?.links[0];
  return {
    bio: payload?.profile?.bio ?? "",
    linkLabel: firstLink?.label ?? "",
    linkUrl: firstLink?.url ?? "",
    linkVisibility: (firstLink?.visibility as ProfileVisibility | undefined) ?? "public",
    visibilitySettings: payload?.visibilitySettings ?? { ...DEFAULT_PROFILE_VISIBILITY_SETTINGS }
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
  return `${formatMoney(wish.target_amount ?? 0, locale)} ${wish.target_currency}`;
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
