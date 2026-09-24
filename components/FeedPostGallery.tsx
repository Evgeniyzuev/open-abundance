"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { FeedPostSignalMenu } from "@/components/FeedPostSignals";
import ProtectedImage from "@/components/ProtectedImage";
import { emptyFeedPreferenceState, isFeedTopicInterested, isFeedTopicMuted, readFeedPreferences, type FeedPreferenceState } from "@/lib/feedPreferences";
import type { MessageKey } from "@/lib/i18n";
import type { FeedPost } from "@/lib/socialFeed";
import { recommendedWishIdForStory } from "@/lib/wishJourney";

type FeedPostGalleryProps = {
  fallbackTitle: string;
  posts: FeedPost[];
  onOpen: (post: FeedPost) => void;
  onAddStoryWish?: (post: FeedPost) => void;
  addingStoryWishKey?: string | null;
  currentUserId?: string | null;
  emptyText?: string;
  t?: (key: MessageKey, values?: Record<string, string | number>) => string;
  wishActionLabel?: string;
  evidenceLabels?: { demo: string; verified: string };
  showAuthor?: boolean;
};

export default function FeedPostGallery({ addingStoryWishKey, currentUserId = null, emptyText, evidenceLabels, fallbackTitle, onAddStoryWish, posts, showAuthor = true, t, wishActionLabel = "I want this too", onOpen }: FeedPostGalleryProps) {
  const [preferences, setPreferences] = useState<FeedPreferenceState>(emptyFeedPreferenceState);

  useEffect(() => {
    setPreferences(readFeedPreferences(currentUserId));
  }, [currentUserId]);

  const visiblePosts = posts
    .filter((post) => !isFeedTopicMuted(post, preferences))
    .sort((left, right) => Number(isFeedTopicInterested(right, preferences)) - Number(isFeedTopicInterested(left, preferences)));

  if (!visiblePosts.length) return <p className="feed-empty">{emptyText ?? fallbackTitle}</p>;

  return (
    <div className="feed-post-gallery">
      {visiblePosts.map((post, index) => (
        <FeedPostTile adding={Boolean(addingStoryWishKey && addingStoryWishKey === post.source_key)} currentUserId={currentUserId} evidenceLabels={evidenceLabels} fallbackTitle={fallbackTitle} key={post.id} post={post} priority={index < 3} showAuthor={showAuthor} t={t} wishActionLabel={wishActionLabel} onAddStoryWish={onAddStoryWish} onOpen={onOpen} onSignalChanged={() => setPreferences(readFeedPreferences(currentUserId))} />
      ))}
    </div>
  );
}

function FeedPostTile({ adding, currentUserId, evidenceLabels, fallbackTitle, post, priority, showAuthor, t, wishActionLabel, onAddStoryWish, onOpen, onSignalChanged }: { adding: boolean; currentUserId: string | null; evidenceLabels?: FeedPostGalleryProps["evidenceLabels"]; fallbackTitle: string; post: FeedPost; priority: boolean; showAuthor: boolean; t?: FeedPostGalleryProps["t"]; wishActionLabel: string; onAddStoryWish?: (post: FeedPost) => void; onOpen: (post: FeedPost) => void; onSignalChanged: () => void }) {
  const title = getFeedPostTitle(post, fallbackTitle);
  const cover = getFeedPostCover(post);
  const imageCount = post.media.filter((item) => item.media_type === "image").length;
  const author = getTileAuthor(post);
  const canAddWish = Boolean(onAddStoryWish && recommendedWishIdForStory(post.source_key));
  const evidence = post.post_type === "reality_demo" ? evidenceLabels?.demo : post.system_verified ? evidenceLabels?.verified : null;

  return (
    <article className={`feed-post-tile-shell ${currentUserId ? "has-feed-signals" : ""}`}>
      <button aria-label={title} className="feed-post-tile" type="button" onClick={() => onOpen(post)}>
        {cover ? <FeedCover priority={priority} src={cover} /> : <span className="feed-post-tile-fallback">{getPostFallbackMark(post)}</span>}
        {showAuthor && author ? (
          <span aria-label={author.name} className="feed-post-tile-author">
            <span className="feed-post-tile-avatar">
              {author.avatarUrl ? <img alt="" loading="lazy" src={author.avatarUrl} style={{ objectPosition: author.avatarPosition }} /> : author.name.slice(0, 1).toUpperCase()}
            </span>
          </span>
        ) : null}
        {imageCount > 1 ? <span className="feed-post-tile-count">{imageCount}</span> : null}
        {evidence ? <span className="feed-post-tile-evidence" title={evidence}>{evidence}</span> : null}
        <span className="feed-post-tile-copy">{title}</span>
      </button>
      {currentUserId && t ? <FeedPostSignalMenu currentUserId={currentUserId} onAddStoryWish={canAddWish ? onAddStoryWish : undefined} onSignalChanged={onSignalChanged} post={post} storyWishSaving={adding} t={t} /> : null}
    </article>
  );
}

function FeedCover({ priority, src }: { priority: boolean; src: string }) {
  if (src.startsWith("/api/social/content/")) return <ProtectedImage alt="" loading={priority ? "eager" : "lazy"} src={src} />;
  if (src.startsWith("/")) {
    return <Image alt="" fill priority={priority} sizes="(max-width: 720px) 33vw, 260px" src={src} />;
  }
  return <img alt="" decoding="async" fetchPriority={priority ? "high" : "auto"} loading={priority ? "eager" : "lazy"} src={src} />;
}

export function getFeedPostCover(post: FeedPost): string | null {
  const media = [...post.media, ...(post.repostOf?.media ?? [])].find((item) => item.media_type === "image" && (item.thumbnail_url || item.media_url));
  if (media?.thumbnail_url || media?.media_url) return media.thumbnail_url ?? media.media_url;
  if (post.wish?.image_url) return post.wish.image_url;
  const externalThumbnail = post.externalLinks.find((item) => item.thumbnail_url)?.thumbnail_url;
  if (externalThumbnail) return post.post_type === "external_link" ? `/api/social/content/${post.id}/thumbnail` : externalThumbnail;
  return systemCoverForType(post.post_type);
}

export function getFeedPostTitle(post: FeedPost, fallbackTitle: string): string {
  const bodyTitle = post.body?.trim().split("\n").find(Boolean)?.trim() ?? post.repostOf?.body?.trim().split("\n").find(Boolean)?.trim();
  return post.title?.trim() || post.wish?.title || post.externalLinks[0]?.title || bodyTitle || fallbackTitle;
}

function getPostFallbackMark(post: FeedPost): string {
  if (post.projectReview) return "★";
  if (post.wish) return "✦";
  return post.systemStory ? "OA" : "•";
}

function systemCoverForType(postType: string): string | null {
  if (postType === "level_up") return "/feed/system-events/level-up.png";
  if (postType === "wish_completed") return "/feed/system-events/wish-completed.png";
  if (postType === "challenge") return "/feed/system-events/challenge-completed.png";
  if (postType === "daily_progress") return "/feed/system-events/daily-progress.png";
  return null;
}

function getTileAuthor(post: FeedPost): { name: string; avatarUrl: string | null; avatarPosition?: string } | null {
  if (post.post_type === "abundance_story" && post.systemStory) {
    return {
      name: post.systemStory.account?.display_name ?? post.authorName ?? "Open Abundance",
      avatarUrl: post.systemStory.account?.avatar_url ?? null
    };
  }
  if (!["daily_progress", "level_up", "wish_completed", "challenge"].includes(post.post_type)) return null;
  const name = post.author?.display_name ?? post.author?.username ?? post.authorName;
  return name ? { name, avatarUrl: post.author?.avatar_url ?? null, avatarPosition: post.author?.avatar_position } : null;
}
