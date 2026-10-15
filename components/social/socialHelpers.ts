import type { TeamProfile, TeamContext, TeamRewardDay, CoreNotificationRow, PayoutNotification, TrustConfirmationType, TrustConfirmationStatus, TrustConfirmationRow, SocialProfilePayload, PeopleFilter, PeopleRow, ProfileEditorState, PeopleSection } from "@/components/social/socialTypes";
import { personLabel } from "@/lib/personName";
import { X } from "lucide-react";
import { type UserProfile } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney as formatMoney } from "@/lib/moneyFormat";
import { readValue } from "@/lib/realityDayFormat";
import type { FeedPayload, FeedPost, FeedStatBlock, FeedWish as PublicWish } from "@/lib/socialFeed";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";
import { DEFAULT_PROFILE_VISIBILITY_SETTINGS, type ProfileVisibility, type ProfileVisibilityKey } from "@/lib/socialProfile";

export async function getAccessToken(): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}

export async function refreshAccessToken(): Promise<string> {
  const supabase = getBrowserSupabaseClient();
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  if (!data.session?.access_token) throw new Error("Supabase session refresh failed.");
  return data.session.access_token;
}

export async function requestStoryWish(recommendedWishId: string, locale: AppLocale, token: string) {
  const response = await fetch("/api/wishes", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
    body: JSON.stringify({ locale, sourceRecommendedWishId: recommendedWishId })
  });
  const payload = await response.json().catch(() => ({})) as { wish?: { id: string }; error?: string };
  return { payload, response };
}

export class StoryWishRequestError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "StoryWishRequestError";
  }
}

export function storyWishErrorMessage(error: unknown, t: (key: MessageKey) => string): string {
  if (error instanceof StoryWishRequestError) {
    if (error.status === 400 || error.status === 404) return t("wishes.addUnavailable");
    if (error.status === 401 || error.status === 403) return t("wishes.addAuthError");
    return t("wishes.addServerError");
  }
  if (error instanceof Error && /session/i.test(error.message)) return t("wishes.addAuthError");
  return t("wishes.addError");
}

export async function loadTeamRewardsHistory(since?: string): Promise<TeamRewardDay[]> {
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

export async function loadCoreNotifications(since?: string): Promise<CoreNotificationRow[]> {
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

export async function loadNotificationCenter(locale: AppLocale): Promise<{ notifications: PayoutNotification[]; unreadCount: number }> {
  const token = await getAccessToken();
  const response = await fetch(`/api/notifications?limit=50&locale=${locale}&ts=${Date.now()}`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" }
  });
  const payload = await response.json() as { notifications?: PayoutNotification[]; unreadCount?: number; error?: string };
  if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load notifications.");
  return { notifications: payload.notifications ?? [], unreadCount: payload.unreadCount ?? 0 };
}

export async function markNotificationsRead(ids?: string[]): Promise<void> {
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

export function buildPayoutNotifications(coreRows: CoreNotificationRow[], rewardRows: TeamRewardDay[], locale: AppLocale): PayoutNotification[] {
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

export function formatDate(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function formatDay(value: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00Z`));
}

export function formatLeader(teamContext: TeamContext | null, locale: AppLocale): string {
  if (!teamContext?.membership) return locale === "ru" ? "Система" : "System";
  if (teamContext.leader.type === "system") return locale === "ru" ? "Система" : "System";
  return formatProfileName(teamContext.leader.profile, teamContext.membership.leader_user_id ?? "");
}

export function formatTeamAssignment(
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

export function formatProfileName(profile: TeamProfile | null, fallback: string): string {
  return personLabel(profile, fallback.slice(0, 8));
}

export function localizedMediaAlt(value: unknown, locale: AppLocale): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const localized = value as Record<string, unknown>;
  const preferred = localized[locale];
  if (typeof preferred === "string") return preferred;
  return typeof localized.en === "string" ? localized.en : "";
}

export function localizedSystemBio(value: unknown, locale: AppLocale): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const localized = value as Record<string, unknown>;
  const preferred = localized[locale];
  if (typeof preferred === "string") return preferred;
  if (typeof localized.en === "string") return localized.en;
  return "";
}

export function createProfileEditorState(payload: SocialProfilePayload | null, fallbackProfile: UserProfile | null = null): ProfileEditorState {
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

export function updateFeedWishCopyState(payload: FeedPayload | null, wishId: string, copiedIncrement: number): FeedPayload | null {
  if (!payload) return payload;
  return {
    ...payload,
    posts: payload.posts.map((post) => updatePostWishCopyState(post, wishId, copiedIncrement))
  };
}

export function replaceFeedPost(payload: FeedPayload | null, updatedPost: FeedPost): FeedPayload | null {
  if (!payload) return payload;
  return {
    ...payload,
    posts: payload.posts.map((post) => post.id === updatedPost.id ? updatedPost : post)
  };
}

export function updatePostWishCopyState(post: FeedPost, wishId: string, copiedIncrement: number): FeedPost {
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

export function visibilityLabelKey(visibility: ProfileVisibility): MessageKey {
  return `profile.visibility.${visibility}` as MessageKey;
}

export function profileVisibilityKeyLabel(key: ProfileVisibilityKey): MessageKey {
  return `profile.visibilityBlock.${key}` as MessageKey;
}

export function contactSourceLabelKey(source: string): MessageKey {
  if (source === "team_leader") return "profile.contacts.sourceLeader";
  if (source === "team_member") return "profile.contacts.sourceMember";
  return "profile.contacts.sourceManual";
}

export function peopleFilterLabelKey(filter: PeopleFilter): MessageKey {
  if (filter === "team") return "social.people.filter.team";
  if (filter === "referrals") return "social.people.filter.referrals";
  if (filter === "same_level") return "social.people.filter.sameLevel";
  if (filter === "active") return "social.people.filter.active";
  return "social.people.filter.nearby";
}

export function peopleSectionLabelKey(section: PeopleSection): MessageKey {
  if (section === "contacts") return "social.people.section.contacts";
  if (section === "confirmations") return "social.people.section.confirmations";
  return "social.people.section.discover";
}

export function peopleInfluenceLabelKey(label: PeopleRow["publicStats"]["influence"]["label"]): MessageKey {
  if (label === "creator") return "social.people.influence.creator";
  if (label === "active") return "social.people.influence.active";
  return "social.people.influence.new";
}

export function getContactTrustState(contactUserId: string, confirmations: TrustConfirmationRow[] | null, currentUserId: string): TrustConfirmationStatus | null {
  const confirmation = confirmations?.find((item) =>
    ((item.requester_user_id === currentUserId && item.counterparty_user_id === contactUserId)
      || (item.requester_user_id === contactUserId && item.counterparty_user_id === currentUserId))
    && item.confirmation_type === "contact_confirmed"
    && (item.status === "pending" || item.status === "confirmed")
  );
  return confirmation?.status ?? null;
}

export function trustConfirmationTypeLabelKey(type: TrustConfirmationType): MessageKey {
  if (type === "help_given") return "profile.trust.typeHelpGiven";
  if (type === "help_received") return "profile.trust.typeHelpReceived";
  if (type === "deal_completed") return "profile.trust.typeDealCompleted";
  if (type === "challenge_confirmed") return "profile.trust.typeChallengeConfirmed";
  if (type === "contact_confirmed") return "profile.trust.typeContactConfirmed";
  return "profile.trust.typeProofAdded";
}

export function trustConfirmationStatusLabelKey(status: TrustConfirmationStatus): MessageKey {
  if (status === "confirmed") return "profile.trust.statusConfirmed";
  if (status === "declined") return "profile.trust.statusDeclined";
  if (status === "expired") return "profile.trust.statusExpired";
  return "profile.trust.statusPending";
}

export function postStatusLabelKey(status: FeedPost["status"]): MessageKey {
  if (status === "published") return "social.post.published";
  if (status === "archived") return "social.post.archived";
  return "social.post.draft";
}

export function verificationLabelKey(type: string | null): MessageKey {
  if (type === "auto") return "challenges.verification.auto";
  if (type === "community") return "challenges.verification.community";
  return "challenges.verification.manual";
}

export function formatPostDate(post: FeedPost, locale: AppLocale): string {
  return formatDate(post.published_at ?? post.created_at, locale);
}

export function formatWishAmount(wish: PublicWish, locale: AppLocale): string {
  const amount = wish.target_amount ?? 0;
  if (wish.target_currency === "USD") return formatMoney(amount, locale);
  return `${new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(amount)} ${wish.target_currency}`;
}

export function formatProviderLabel(provider: string): string {
  if (provider === "tiktok") return "TikTok";
  if (provider === "instagram") return "Instagram";
  if (provider === "telegram") return "Telegram";
  if (provider === "youtube") return "YouTube";
  if (provider === "x") return "X";
  return "Website";
}

export function statBlockClassName(block: FeedStatBlock, baseClassName: string, active = false): string {
  const classNames = [baseClassName];
  if (active) classNames.push("active");
  if (block.block_key === "level" && Boolean(readValue(block.value, "leveledUp"))) classNames.push("level-up");
  return classNames.join(" ");
}

export function readableHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
