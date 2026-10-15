"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { hasBeenSeen, markSeen } from "@/lib/seenOnce";
import type { FeedPost } from "@/lib/socialFeed";

type Ring = { id: string; name: string; avatarUrl: string | null; userId: string | null; accountKey: string | null };

const MAX_RINGS = 12;
const EXPANDED_KEY = "openAbundanceFeedRingsOpen";
const PEEK_AVATARS = 5;

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
  // Compact by default (a thin strip of overlapping avatars, like Telegram); the full row opens on tap and is remembered.
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    try {
      setExpanded(window.localStorage.getItem(EXPANDED_KEY) === "1");
    } catch {
      // The open/closed choice is a convenience only.
    }
  }, []);
  function toggle() {
    setExpanded((current) => {
      try {
        window.localStorage.setItem(EXPANDED_KEY, current ? "0" : "1");
      } catch {
        // The open/closed choice is a convenience only.
      }
      return !current;
    });
  }
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
  const unseenCount = rings.filter((ring) => !hasBeenSeen(scope, ring.id)).length;

  return (
    <div className="feed-story-rings-wrap" data-seen={seenVersion}>
      <button aria-expanded={expanded} className="feed-story-strip" type="button" onClick={toggle}>
        <span className="feed-story-strip-faces" aria-hidden="true">
          {rings.slice(0, PEEK_AVATARS).map((ring) => (
            <span className={`feed-story-strip-face ${hasBeenSeen(scope, ring.id) ? "seen" : ""}`} key={ring.id}>
              {ring.avatarUrl ? <img alt="" loading="lazy" src={ring.avatarUrl} /> : <b>{ring.name.slice(0, 1).toUpperCase()}</b>}
            </span>
          ))}
        </span>
        <span className="feed-story-strip-label">{label}{unseenCount ? <i>{unseenCount}</i> : null}</span>
        {expanded ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
      </button>
      {expanded ? (
        <nav aria-label={label} className="feed-story-rings">
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
      ) : null}
    </div>
  );
}
