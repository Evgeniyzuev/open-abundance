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

  return (
    <button aria-label={title} className="feed-post-tile" type="button" onClick={() => onOpen(post)}>
      {cover ? <img alt="" loading="lazy" src={cover} /> : <span className="feed-post-tile-fallback">{getPostFallbackMark(post)}</span>}
      {imageCount > 1 ? <span className="feed-post-tile-count">{imageCount}</span> : null}
      <span className="feed-post-tile-copy">{title}</span>
    </button>
  );
}

export function getFeedPostCover(post: FeedPost): string | null {
  const media = post.media.find((item) => item.media_type === "image");
  return media?.thumbnail_url ?? media?.media_url ?? post.wish?.image_url ?? post.externalLinks.find((item) => item.thumbnail_url)?.thumbnail_url ?? null;
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
