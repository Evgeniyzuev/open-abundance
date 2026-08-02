"use client";

import { BookOpen, ExternalLink, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import FeedPostGallery from "@/components/FeedPostGallery";
import { PostDetailModal } from "@/components/SocialApp";
import { UserNameWithLevel } from "@/components/UserLevelBadge";
import { useUserContext } from "@/components/UserProvider";
import type { MessageKey } from "@/lib/i18n";
import type { FeedPayload, FeedPost } from "@/lib/socialFeed";
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
  relation: { isSelf: boolean; isContact: boolean; isTeam: boolean; isFollower: boolean };
  visibleBlocks: Record<string, boolean>;
  error?: string;
};
export default function PublicUserPage({ userId, initialView }: { userId: string; initialView: PublicUserView }) {
  const { user, loading, locale, t } = useUserContext();
  const router = useRouter();
  const [profilePayload, setProfilePayload] = useState<PublicProfilePayload | null>(null);
  const [feedPayload, setFeedPayload] = useState<FeedPayload | null>(null);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [view, setView] = useState<PublicUserView>(initialView);
  const [pageLoading, setPageLoading] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setPageLoading(true);
    setPageError(null);
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
      setProfilePayload(payload);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load profile.");
    } finally {
      setPageLoading(false);
    }
  }, [user, userId]);

  const loadBlog = useCallback(async () => {
    if (!user) return;
    setPageLoading(true);
    setPageError(null);
    try {
      const token = await getAccessToken();
      const params = new URLSearchParams({ scope: "blog", authorUserId: userId, ts: String(Date.now()) });
      const response = await fetch(`/api/social/feed?${params.toString()}`, {
        cache: "no-store",
        headers: {
          Authorization: `Bearer ${token}`,
          "Cache-Control": "no-cache"
        }
      });
      const payload = (await response.json()) as FeedPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load blog.");
      setFeedPayload(payload);
    } catch (error) {
      setPageError(error instanceof Error ? error.message : "Failed to load blog.");
    } finally {
      setPageLoading(false);
    }
  }, [user, userId]);

  useEffect(() => {
    if (!user) return;
    void loadProfile();
  }, [loadProfile, user]);

  useEffect(() => {
    if (!user || view !== "blog") return;
    void loadBlog();
  }, [loadBlog, user, view]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  const profile = profilePayload?.profile ?? null;
  const displayName = profile ? formatProfileName(profile, userId) : t("profile.public.title");

  return (
    <main className="app-shell public-user-shell">
      <section className="public-user-page">
        {!user && !loading ? (
          <section className="profile-panel">
            <div className="profile-avatar placeholder">
              <UserRound size={34} />
            </div>
            <strong>{t("profile.public.title")}</strong>
            <p>{t("profile.registrationRequired")}</p>
          </section>
        ) : null}
        {user ? (
          <>
            <header className="public-user-header">
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
                {profilePayload?.relation.isTeam ? <span>{t("profile.visibility.team")}</span> : null}
                {profilePayload?.relation.isContact ? <span>{t("profile.visibility.contacts")}</span> : null}
              </div>
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
            {pageLoading && !profilePayload ? <p className="finance-error neutral">{t("app.common.loading")}</p> : null}
            {view === "profile" && profilePayload ? (
              <PublicProfileView payload={profilePayload} t={t} />
            ) : null}
            {view === "blog" ? (
              <PublicBlogView loading={pageLoading} payload={feedPayload} t={t} onOpenPost={setSelectedPost} />
            ) : null}
            {selectedPost ? (
              <PostDetailModal
                copyingWishId={null}
                currentUserId={user.id}
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
  t
}: {
  payload: PublicProfilePayload;
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

function PublicBlogView({
  loading,
  payload,
  t,
  onOpenPost
}: {
  loading: boolean;
  payload: FeedPayload | null;
  t: (key: MessageKey, values?: Record<string, string | number>) => string;
  onOpenPost: (post: FeedPost) => void;
}) {
  const posts = payload?.posts ?? [];
  if (loading && !posts.length) return <p className="finance-error neutral">{t("app.common.loading")}</p>;
  if (!posts.length) return <p className="feed-empty">{t("social.blog.empty")}</p>;

  return <FeedPostGallery fallbackTitle={t("social.post.detail")} posts={posts} onOpen={onOpenPost} />;
}

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
    error
  } = await getBrowserSupabaseClient().auth.getSession();
  if (error) throw error;
  if (!session?.access_token) throw new Error("Supabase session is missing.");
  return session.access_token;
}

function formatProfileName(profile: { display_name: string | null; username: string | null }, fallback: string): string {
  return profile.display_name ?? (profile.username ? `@${profile.username}` : fallback.slice(0, 8));
}

function readableHost(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}
