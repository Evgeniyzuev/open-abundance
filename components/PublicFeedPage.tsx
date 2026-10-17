"use client";

import { Newspaper } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import FeedPostGallery from "@/components/FeedPostGallery";
import GuestJoinPanel from "@/components/GuestJoinPanel";
import PublicTabBar from "@/components/PublicTabBar";
import { PostDetailModal } from "@/components/social/FeedParts";
import { useUserContext } from "@/components/UserProvider";
import type { FeedPayload, FeedPost } from "@/lib/socialFeed";

/**
 * The public feed for visitors without an account (and anyone who opens /feed): public posts only, read only.
 * It is reached from a blog or profile, so a person who came by an invitation link can look around before joining.
 */
export default function PublicFeedPage() {
  const { user, loading, locale, t } = useUserContext();
  const router = useRouter();
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [selected, setSelected] = useState<FeedPost | null>(null);
  const inFlight = useRef(false);

  const load = useCallback(async (cursor?: string | null) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const params = new URLSearchParams({ scope: "feed", locale, limit: "20", ts: String(Date.now()) });
      if (cursor) params.set("cursor", cursor);
      // No session is sent on purpose: this page always shows the public view.
      const response = await fetch(`/api/social/feed?${params}`, { cache: "no-store", signal: AbortSignal.timeout(30000) });
      const payload = (await response.json()) as FeedPayload;
      if (!response.ok || payload.error) throw new Error(payload.error ?? "Failed to load the feed.");
      setPosts((current) => (cursor ? [...current, ...payload.posts.filter((post) => !current.some((item) => item.id === post.id))] : payload.posts));
      setNextCursor(payload.nextCursor ?? null);
      setLoaded(true);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load the feed.");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [locale]);

  useEffect(() => {
    if (!loading) void load();
  }, [loading, load]);

  return (
    <main className="app-shell public-user-shell">
      <section className="public-user-page">
        {!loading ? (
          <>
            <GuestJoinPanel />
            <header className="public-user-header">
              <strong>{t("social.feed.title")}</strong>
              {user ? <nav className="public-user-tabs" aria-label={t("social.feed.title")}><Link href="/"><Newspaper size={15} />{t("public.feed.openApp")}</Link></nav> : null}
            </header>
            {error ? <p className="finance-error">{error}</p> : null}
            {posts.length ? (
              <FeedPostGallery
                fallbackTitle={t("social.post.detail")}
                posts={posts}
                evidenceLabels={{ demo: t("social.feed.demoBadge"), verified: t("social.feed.verifiedBadge") }}
                t={t}
                onOpen={setSelected}
              />
            ) : loaded && !busy ? <p>{t("social.feed.empty")}</p> : null}
            {busy ? <p className="finance-error neutral">{t("app.common.loading")}</p> : null}
            {nextCursor && !busy ? <button className="secondary-button" type="button" onClick={() => void load(nextCursor)}>{t("social.blog.showMore")}</button> : null}
            {selected ? (
              <PostDetailModal
                copyingWishId={null}
                currentUserId={user?.id ?? null}
                locale={locale}
                post={selected}
                readOnly
                t={t}
                onClose={() => setSelected(null)}
                onCopyWish={() => undefined}
                onDeletePost={() => undefined}
                onOpenAuthor={(authorUserId) => router.push(`/u/${authorUserId}/blog`)}
                onOpenBlog={(authorUserId) => router.push(`/u/${authorUserId}/blog`)}
                onOpenChallenge={() => router.push("/?view=challenges")}
                onOpenSystemAccount={() => undefined}
                onPublish={() => undefined}
                onUpdateReview={async () => undefined}
              />
            ) : null}
            <PublicTabBar active="feed" />
          </>
        ) : null}
      </section>
    </main>
  );
}
