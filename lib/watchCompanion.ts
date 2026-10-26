/**
 * "Watch with Nova": Nova keeps the person company on one embedded video.
 *
 * Nova never sees the video. She reacts to its title and author and to what the
 * person writes or taps, and says so honestly. Emoji taps are answered locally
 * without AI, so the AI cost is bounded by the per-video and per-day limits below.
 */

/** AI replies on one video; after that Nova keeps watching quietly with emoji only. */
export const WATCH_AI_REPLIES_PER_VIDEO = 5;
/** Separate AI tool bucket so watching never eats the notes or chat helpers' quota. */
export const WATCH_AI_DAY_LIMIT = 20;
export const WATCH_AI_MONTH_LIMIT = 300;
/** After this many minutes watched together today Nova suggests stopping. */
export const WATCH_DAY_SOFT_LIMIT_MINUTES = 30;

export const WATCH_MAX_TITLE = 240;
export const WATCH_MAX_COMMENT = 280;
export const WATCH_MAX_REPLY = 200;

export const WATCH_REACTIONS = ["😂", "🔥", "😮", "❤️", "💃"] as const;
export type WatchReaction = (typeof WATCH_REACTIONS)[number];

export type WatchReply = { text: string; emoji: string | null; dance: boolean };

export function isWatchReaction(value: unknown): value is WatchReaction {
  return typeof value === "string" && (WATCH_REACTIONS as readonly string[]).includes(value);
}

export function cleanWatchText(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Accepts the model's JSON only when it is one short plain line; anything else is dropped. */
export function normalizeWatchReply(value: unknown): WatchReply | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const text = cleanWatchText(record.text, WATCH_MAX_REPLY + 40).replace(/[*#`_]/g, "");
  if (text.length < 2) return null;
  const trimmed = text.length > WATCH_MAX_REPLY ? `${text.slice(0, WATCH_MAX_REPLY - 1).trimEnd()}…` : text;
  const emoji = typeof record.emoji === "string" && /^\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic})*$/u.test(record.emoji.trim()) ? record.emoji.trim() : null;
  return { text: trimmed, emoji, dance: record.dance === true };
}
