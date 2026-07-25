"use client";

import type { FeedPost } from "@/lib/socialFeed";

type FeedPostGalleryProps = {
  fallbackTitle: string;
  posts: FeedPost[];
  onOpen: (post: FeedPost) => void;
};

export default function FeedPostGallery({ fallbackTitle, posts, onOpen }: FeedPostGalleryProps) {
  return (
    <div className="feed-post-gallery">
      {posts.map((post) => (
        <FeedPostTile fallbackTitle={fallbackTitle} key={post.id} post={post} onOpen={onOpen} />
      ))}
    </div>
  );
}

function FeedPostTile({ fallbackTitle, post, onOpen }: { fallbackTitle: string; post: FeedPost; onOpen: (post: FeedPost) => void }) {
  const title = getFeedPostTitle(post, fallbackTitle);
  const cover = getFeedPostCover(post);
  const imageCount = post.media.filter((item) => item.media_type === "image").length;
  const author = getTileAuthor(post);

  return (
    <button aria-label={title} className="feed-post-tile" type="button" onClick={() => onOpen(post)}>
      {cover ? <img alt="" loading="lazy" src={cover} /> : <span className="feed-post-tile-fallback">{getPostFallbackMark(post)}</span>}
      {author ? (
        <span className="feed-post-tile-author">
          <span className="feed-post-tile-avatar">
            {author.avatarUrl ? <img alt="" loading="lazy" src={author.avatarUrl} /> : author.name.slice(0, 1).toUpperCase()}
          </span>
          <span>{author.name}</span>
        </span>
      ) : null}
      {imageCount > 1 ? <span className="feed-post-tile-count">{imageCount}</span> : null}
      <span className="feed-post-tile-copy">{title}</span>
    </button>
  );
}

export function getFeedPostCover(post: FeedPost): string | null {
  const media = post.media.find((item) => item.media_type === "image" && (item.thumbnail_url || item.media_url));
  if (media?.thumbnail_url || media?.media_url) return media.thumbnail_url ?? media.media_url;
  if (post.wish?.image_url) return post.wish.image_url;
  const externalThumbnail = post.externalLinks.find((item) => item.thumbnail_url)?.thumbnail_url;
  if (externalThumbnail) return externalThumbnail;
  return systemCoverForType(post.post_type);
}

export function getFeedPostTitle(post: FeedPost, fallbackTitle: string): string {
  const bodyTitle = post.body?.trim().split("\n").find(Boolean)?.trim();
  return post.wish?.title ?? post.externalLinks[0]?.title ?? bodyTitle ?? fallbackTitle;
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

function getTileAuthor(post: FeedPost): { name: string; avatarUrl: string | null } | null {
  if (post.post_type === "abundance_story" && post.systemStory) {
    return {
      name: post.systemStory.account?.display_name ?? post.authorName ?? "Open Abundance",
      avatarUrl: post.systemStory.account?.avatar_url ?? null
    };
  }
  if (!["daily_progress", "level_up", "wish_completed", "challenge"].includes(post.post_type)) return null;
  const name = post.author?.display_name ?? post.author?.username ?? post.authorName;
  return name ? { name, avatarUrl: post.author?.avatar_url ?? null } : null;
}
