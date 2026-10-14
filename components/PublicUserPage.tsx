"use client";

import { personLabel } from "@/lib/personName";
import { BookOpen, Check, ExternalLink, UserPlus, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PublicBlog } from "@/components/BlogWorkspace";
import { PostDetailModal } from "@/components/SocialApp";
import { UserNameWithLevel } from "@/components/UserLevelBadge";
import { useUserContext } from "@/components/UserProvider";
import type { AppLocale, MessageKey } from "@/lib/i18n";
import { formatAdaptiveMoney } from "@/lib/moneyFormat";
import type { FeedPost } from "@/lib/socialFeed";
import { getBrowserSupabaseClient } from "@/lib/supabaseClient";

type PublicUserView = "profile" | "blog";
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
  links: Array<{ id: string; label: string | null; url: string }>;
  publicWishes: Array<{ id: string; title: string; description: string; image_url: string | null; difficulty_level: number; copied_count: number }>;
  economyMetrics?: Array<Record<string, string | number>>;
  relation: { isSelf: boolean; isContact: boolean; isTeam: boolean; isFollower: boolean };
  followersCount?: number;
  viewerSignedIn?: boolean;
  visibleBlocks: Record<string, boolean>;
  error?: string;
};
export default function PublicUserPage({ userId, initialView, initialPostId = null }: { userId: string; initialView: PublicUserView; initialPostId?: string | null }) {
  const { user, loading, locale, t } = useUserContext();
  const router = useRouter();
  const [profilePayload, setProfilePayload] = useState<PublicProfilePayload | null>(null);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [view, setView] = useState<PublicUserView>(initialView);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [followSaving, setFollowSaving] = useState(false);
  const viewerId = user?.id ?? null;

  const loadProfile = useCallback(async () => {
    setPageLoading(true);
    setPageError(null);
    try {
      // Signed-out visitors (shared links) get the public part of the profile.
      const token = await getOptionalAccessToken();
      const response = await fetch(`/api/social/profile/${userId}?ts=${Date.now()}`, {
        cache: "no-store",
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as PublicProfilePayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load profile.");
      setProfilePayload(payload);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load profile.");
    } finally {
      setPageLoading(false);
    }
    // The viewer reaches the API through the token; reload when the signed-in person changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerId, userId]);

  useEffect(() => {
    if (loading || view !== "profile") return;
    void loadProfile();
  }, [loadProfile, loading, view]);

  async function toggleFollow() {
    if (!profilePayload || followSaving) return;
    setFollowSaving(true);
    setPageError(null);
    try {
      const token = await getOptionalAccessToken();
      if (!token) throw new Error("Supabase session is missing.");
      const response = await fetch("/api/social/follows", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ userId, follow: !profilePayload.relation.isFollower })
      });
      const payload = await response.json() as { following?: boolean; followersCount?: number; error?: string };
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to update follow.");
      setProfilePayload((current) => current ? {
        ...current,
        relation: { ...current.relation, isFollower: Boolean(payload.following) },
        followersCount: payload.followersCount ?? current.followersCount
      } : current);
    } catch (followError) {
      setPageError(followError instanceof Error ? followError.message : "Failed to update follow.");
    } finally {
      setFollowSaving(false);
    }
  }

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const profile = profilePayload?.profile ?? null;
  const displayName = profile ? formatProfileName(profile, userId) : t("profile.public.title");

  return (
    <main className="app-shell public-user-shell">
      <section className="public-user-page">
        {!loading ? (
          <>
            <header className="public-user-header">
              {view === "profile" ? <>
              <div className="profile-avatar">
                {profile?.avatar_url ? <img alt="" src={profile.avatar_url} style={{ objectPosition: profile.avatar_position ?? "50% 50%" }} /> : <UserRound size={34} />}
              </div>
              <strong>
                <UserNameWithLevel
                  label={t("profile.levelBadge", { level: profile?.level ?? 0 })}
                  level={profile?.level}
                >
                  {displayName}
                </UserNameWithLevel>
              </strong>
              <div className="profile-facts">
                {profilePayload ? <span>{t("social.follow.followers", { count: profilePayload.followersCount ?? 0 })}</span> : null}
                {profilePayload?.relation.isTeam && !profilePayload.relation.isSelf ? <span>{t("profile.visibility.team")}</span> : null}
                {profilePayload?.relation.isContact && !profilePayload.relation.isSelf ? <span>{t("profile.visibility.contacts")}</span> : null}
              </div>
              {profilePayload && !profilePayload.relation.isSelf ? (
                profilePayload.viewerSignedIn ? (
                  <button
                    className={profilePayload.relation.isFollower ? "secondary-button public-follow-button" : "challenge-primary-action public-follow-button"}
                    type="button"
                    aria-pressed={profilePayload.relation.isFollower}
                    disabled={followSaving}
                    onClick={() => void toggleFollow()}
                  >
                    {profilePayload.relation.isFollower ? <Check size={16} aria-hidden="true" /> : <UserPlus size={16} aria-hidden="true" />}
                    {profilePayload.relation.isFollower ? t("social.follow.following") : t("social.follow.follow")}
                  </button>
                ) : (
                  <a className="challenge-primary-action public-follow-button" href="/?auth=signin">
                    <UserPlus size={16} aria-hidden="true" />{t("social.follow.signInToFollow")}
                  </a>
                )
              ) : null}
              </> : null}
              <nav className="public-user-tabs" aria-label={t("profile.public.title")}>
                <Link className={view === "profile" ? "active" : ""} href={`/u/${userId}`}>
                  <UserRound size={15} />
                  {t("profile.public.title")}
                </Link>
                <Link className={view === "blog" ? "active" : ""} href={`/u/${userId}/blog`}>
                  <BookOpen size={15} />
                  {t("social.blog.title")}
                </Link>
              </nav>
            </header>
            {pageError ? <p className="finance-error">{pageError}</p> : null}
            {view === "profile" && pageLoading && !profilePayload ? <p className="finance-error neutral">{t("app.common.loading")}</p> : null}
            {view === "profile" && profilePayload ? (
              <PublicProfileView locale={locale} payload={profilePayload} t={t} />
            ) : null}
            {view === "blog" ? (
              <PublicBlog key={userId} authorId={userId} initialPostId={initialPostId} locale={locale} t={t} onOpenPost={setSelectedPost} />
            ) : null}
            {selectedPost ? (
              <PostDetailModal
                copyingWishId={null}
                currentUserId={user?.id ?? null}
                locale={locale}
                post={selectedPost}
                readOnly
                t={t}
                onClose={() => setSelectedPost(null)}
                onCopyWish={() => undefined}
                onDeletePost={() => undefined}
                onOpenAuthor={(authorUserId) => router.push(`/u/${authorUserId}`)}
                onOpenBlog={(authorUserId) => router.push(`/u/${authorUserId}/blog`)}
                onOpenChallenge={() => router.push("/?view=challenges")}
                onOpenSystemAccount={() => undefined}
                onPublish={() => undefined}
                onUpdateReview={async () => undefined}
              />
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

function PublicProfileView({
  payload,
  locale,
  t
}: {
  payload: PublicProfilePayload;
  locale: AppLocale;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
}) {
  return (
    <section className="public-user-content">
      {payload.profile.bio ? <p className="public-user-bio">{payload.profile.bio}</p> : null}
      {payload.links.length ? (
        <div className="profile-links">
          {payload.links.map((link) => (
            <a href={link.url} target="_blank" rel="noreferrer" key={link.id}>
              <ExternalLink size={15} />
              {link.label ?? readableHost(link.url)}
            </a>
          ))}
        </div>
      ) : null}
      {payload.economyMetrics?.length ? (
        <section className="economy-metrics-panel public-economy-panel">
          <div className="economy-metrics-header"><div><h2>{t("wallet.economy.title")}</h2><p>{t("wallet.economy.explainer")}</p></div></div>
          {payload.economyMetrics.map((metric) => {
            const periodType = String(metric.periodType ?? "lifetime") as "day" | "month" | "year" | "lifetime";
            const periodKey = String(metric.periodKey ?? "lifetime");
            const labels: Record<string, MessageKey> = {
              wallet_inflows_total: "wallet.economy.inflows",
              wallet_outflows_total: "wallet.economy.outflows",
              marketplace_sales_gross: "wallet.economy.marketplaceSales",
              marketplace_purchases_gross: "wallet.economy.marketplacePurchases",
              marketplace_completed_sales_count: "wallet.economy.marketplaceSales",
              marketplace_completed_purchase_count: "wallet.economy.marketplacePurchases",
              core_growth_total: "wallet.economy.coreGrowth",
              core_level_end: "wallet.core"
            };
            return (
              <div key={`${periodType}:${periodKey}`}>
                <small>{t(`wallet.economy.period.${periodType}` as MessageKey)} · {periodKey}</small>
                <div className="economy-metrics-grid">
                  {Object.entries(metric).filter(([key]) => key !== "periodType" && key !== "periodKey" && labels[key]).map(([key, value]) => (
                    <div className="economy-metric-card" key={key}><span>{t(labels[key])}</span><strong>{key === "core_level_end" ? String(value) : formatAdaptiveMoney(Number(value), locale)}</strong></div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
      {payload.publicWishes.length ? (
        <section className="public-wishes-panel">
          <h3>{t("wishes.publicTitle")}</h3>
          <div className="public-wish-list">
            {payload.publicWishes.map((wish) => (
              <article className="public-wish-card" key={wish.id}>
                {wish.image_url ? <img alt="" src={wish.image_url} /> : <span className="public-wish-placeholder">{wish.title.slice(0, 1)}</span>}
                <div>
                  <strong>{wish.title}</strong>
                  {wish.description ? <p>{wish.description}</p> : null}
                  <div className="public-wish-meta">
                    <span>{t("wishes.level", { level: wish.difficulty_level })}</span>
                    <span>{t("wishes.copiedCount", { count: wish.copied_count })}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}

async function getOptionalAccessToken(): Promise<string | null> {
  const { data, error } = await getBrowserSupabaseClient().auth.getSession();
  if (error) return null;
  return data.session?.access_token ?? null;
}

function formatProfileName(profile: { display_name: string | null; username: string | null }, fallback: string): string {
  return personLabel(profile, fallback.slice(0, 8));
}

function readableHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
