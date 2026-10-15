"use client";

import { useMemo, useState } from "react";
import { hasBeenSeen, markSeen } from "@/lib/seenOnce";
import type { FeedPost } from "@/lib/socialFeed";

type Ring = { id: string; name: string; avatarUrl: string | null; userId: string | null; accountKey: string | null };

const MAX_RINGS = 12;

function ringFor(post: FeedPost): Ring | null {
  if (post.author_user_id && post.author) {
    const name = post.author.display_name ?? post.author.username ?? post.authorName;
    return name ? { id: `u:${post.author_user_id}`, name, avatarUrl: post.author.avatar_url, userId: post.author_user_id, accountKey: null } : null;
  }
  const account = post.systemStory?.account;
  if (account?.account_key) {
    return { id: `s:${account.account_key}`, name: account.display_name ?? "Open Abundance", avatarUrl: account.avatar_url ?? null, userId: null, accountKey: account.account_key };
  }
  return null;
}

/** Instagram-style row of authors in the current feed; an unseen author gets a coloured ring. */
export default function FeedStoryRings({
  currentUserId,
  label,
  posts,
  onOpenAuthor,
  onOpenSystemAccount
}: {
  currentUserId: string;
  label: string;
  posts: FeedPost[];
  onOpenAuthor: (userId: string) => void;
  onOpenSystemAccount: (accountKey: string) => void;
}) {
  const [seenVersion, setSeenVersion] = useState(0);
  const rings = useMemo(() => {
    const byId = new Map<string, Ring>();
    for (const post of posts) {
      const ring = ringFor(post);
      if (ring && ring.userId !== currentUserId && !byId.has(ring.id)) byId.set(ring.id, ring);
      if (byId.size >= MAX_RINGS) break;
    }
    return [...byId.values()];
  }, [currentUserId, posts]);

  if (rings.length < 2) return null;
  const scope = `story-ring.${currentUserId}`;

  return (
    <nav aria-label={label} className="feed-story-rings" data-seen={seenVersion}>
      {rings.map((ring) => {
        const seen = hasBeenSeen(scope, ring.id);
        return (
          <button className={`feed-story-ring ${seen ? "seen" : ""}`} key={ring.id} type="button" onClick={() => {
            markSeen(scope, ring.id);
            setSeenVersion((version) => version + 1);
            if (ring.userId) onOpenAuthor(ring.userId);
            else if (ring.accountKey) onOpenSystemAccount(ring.accountKey);
          }}>
            <span className="feed-story-ring-avatar">
              {ring.avatarUrl ? <img alt="" loading="lazy" src={ring.avatarUrl} /> : <b>{ring.name.slice(0, 1).toUpperCase()}</b>}
            </span>
            <small>{ring.name}</small>
          </button>
        );
      })}
    </nav>
  );
}
