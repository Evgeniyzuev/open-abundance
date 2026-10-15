import type { FeedPayload } from "@/lib/socialFeed";

// Last first-page of each feed filter, kept so the feed paints instantly on the
// next visit while a fresh page loads in the background (stale-while-revalidate).
const KEY_PREFIX = "openAbundanceFeedSnapshot";
const MAX_POSTS = 12;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Stored = { savedAt: number; payload: FeedPayload };

function snapshotKey(userId: string, locale: string, filter: string) {
  return `${KEY_PREFIX}:${userId}:${locale}:${filter}`;
}

export function readFeedSnapshot(userId: string, locale: string, filter: string): FeedPayload | null {
  try {
    const raw = window.localStorage.getItem(snapshotKey(userId, locale, filter));
    if (!raw) return null;
    const stored = JSON.parse(raw) as Stored;
    if (!stored?.payload?.posts?.length || Date.now() - stored.savedAt > MAX_AGE_MS) return null;
    return stored.payload;
  } catch {
    return null;
  }
}

export function writeFeedSnapshot(userId: string, locale: string, filter: string, payload: FeedPayload) {
  try {
    if (!payload.posts.length) return;
    const trimmed: FeedPayload = { ...payload, posts: payload.posts.slice(0, MAX_POSTS), nextCursor: null };
    window.localStorage.setItem(snapshotKey(userId, locale, filter), JSON.stringify({ savedAt: Date.now(), payload: trimmed } satisfies Stored));
  } catch {
    // Storage may be full or blocked; the feed simply loads from the network.
  }
}

export function clearFeedSnapshots() {
  try {
    const keys: string[] = [];
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(KEY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
