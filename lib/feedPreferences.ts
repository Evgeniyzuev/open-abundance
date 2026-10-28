import type { FeedPost } from "@/lib/socialFeed";

export type FeedSignal = "interest" | "not_for_me" | "can_help";

export type FeedPreferenceState = {
  interestedTopics: string[];
  mutedTopics: string[];
  helpTopics: string[];
};

const STORAGE_PREFIX = "open-abundance-feed-preferences:v1:";
const MAX_TOPICS = 40;

export function emptyFeedPreferenceState(): FeedPreferenceState {
  return { interestedTopics: [], mutedTopics: [], helpTopics: [] };
}

// A wish category is a real topic. Other posts stand for themselves: an older version grouped them by source prefix or
// post type, so one "Not for me" (also a left swipe in the post view) on one editorial story hid all of them, and on
// one member post hid every member post. Keys stored by that version simply no longer match anything.
export function getFeedTopicKey(post: FeedPost): string {
  const category = post.wish?.category?.trim().toLocaleLowerCase();
  if (category) return `category:${category}`;

  const sourceKey = post.source_key?.trim().toLocaleLowerCase();
  if (sourceKey) return `source_key:${sourceKey}`;

  return `post:${post.id}`;
}

export function readFeedPreferences(userId: string | null | undefined): FeedPreferenceState {
  if (!userId || typeof window === "undefined") return emptyFeedPreferenceState();
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return emptyFeedPreferenceState();
    const parsed = JSON.parse(raw) as Partial<FeedPreferenceState>;
    return {
      interestedTopics: normalizeTopicList(parsed.interestedTopics),
      mutedTopics: normalizeTopicList(parsed.mutedTopics),
      helpTopics: normalizeTopicList(parsed.helpTopics)
    };
  } catch {
    return emptyFeedPreferenceState();
  }
}

export function recordFeedSignal(userId: string | null | undefined, post: FeedPost, signal: FeedSignal): FeedPreferenceState {
  if (!userId || typeof window === "undefined") return emptyFeedPreferenceState();

  const current = readFeedPreferences(userId);
  const topic = getFeedTopicKey(post);
  const next: FeedPreferenceState = {
    interestedTopics: signal === "interest" ? addTopic(current.interestedTopics, topic) : current.interestedTopics,
    mutedTopics: signal === "not_for_me" ? addTopic(current.mutedTopics, topic) : current.mutedTopics,
    helpTopics: signal === "can_help" ? addTopic(current.helpTopics, topic) : current.helpTopics
  };

  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // The event is still recorded remotely; local preference storage is only an optimization.
  }
  return next;
}

export function isFeedTopicMuted(post: FeedPost, state: FeedPreferenceState): boolean {
  return state.mutedTopics.includes(getFeedTopicKey(post));
}

export function isFeedTopicInterested(post: FeedPost, state: FeedPreferenceState): boolean {
  return state.interestedTopics.includes(getFeedTopicKey(post));
}

function addTopic(topics: string[], topic: string): string[] {
  return [topic, ...topics.filter((item) => item !== topic)].slice(0, MAX_TOPICS);
}

function normalizeTopicList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, MAX_TOPICS);
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}
