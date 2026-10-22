// Public "growth stories" (/stories): one card per author built from their published reality days.
// Numbers come from system-made daily posts (Core and Wallet ledgers), never typed by the author.
import { addDays, type RealityDay } from "./realityTimeline.ts";

export const STORY_WINDOW_DAYS = 30;
export const STORY_MIN_ACTIVE_DAYS = 3;
export const STORY_LIST_LIMIT = 30;

export type StoryAuthor = {
  userId: string;
  name: string | null;
  username: string | null;
  level: number | null;
  humanityVerified: boolean;
};

export type GrowthStory = StoryAuthor & {
  activeDays: number;
  levelStart: number | null;
  levelNow: number | null;
  turnover: number;
  hasTurnover: boolean;
  coreGrowth: number;
  challenges: number;
  wishes: string[];
  wishesCount: number;
  firstDate: string;
  lastDate: string;
  // "What changed for me" from the author's published wish posts, newest first.
  changes: string[];
};

export type StoryWins = { date: string; challenges: number; wishes: Array<string | null> };

/** Summary of the last 30 days for one author, or null when there are too few days for a story. */
export function buildGrowthStory(author: StoryAuthor, days: RealityDay[], wins: StoryWins[], today: string): GrowthStory | null {
  const since = addDays(today, -(STORY_WINDOW_DAYS - 1));
  const recent = days.filter((day) => day.date >= since && day.date <= today);
  if (recent.length < STORY_MIN_ACTIVE_DAYS) return null;
  const recentWins = wins.filter((item) => item.date >= since && item.date <= today);
  const withLevel = recent.filter((day) => day.level !== null);
  const first = withLevel[0] ?? null;
  const last = withLevel.at(-1) ?? null;
  const wishes = recentWins.flatMap((item) => item.wishes);
  return {
    ...author,
    activeDays: recent.length,
    levelStart: first ? first.levelBefore ?? first.level : null,
    levelNow: last?.level ?? author.level,
    turnover: recent.reduce((sum, day) => sum + (day.turnover ?? 0), 0),
    hasTurnover: recent.some((day) => day.turnover !== null),
    coreGrowth: recent.reduce((sum, day) => sum + (day.coreGrowth ?? 0), 0),
    challenges: recentWins.reduce((sum, item) => sum + item.challenges, 0),
    // Private wishes count but keep their titles hidden.
    wishes: wishes.filter((title): title is string => Boolean(title)),
    wishesCount: wishes.length,
    firstDate: recent[0].date,
    lastDate: recent.at(-1)!.date,
    changes: []
  };
}

/** Fulfilled wishes first, then level growth, steady days and turnover; humanity-checked authors win ties. */
export function rankGrowthStories(stories: GrowthStory[]): GrowthStory[] {
  const levelGain = (story: GrowthStory) => story.levelStart !== null && story.levelNow !== null ? story.levelNow - story.levelStart : 0;
  return [...stories].sort((left, right) =>
    right.wishesCount - left.wishesCount
    || levelGain(right) - levelGain(left)
    || right.activeDays - left.activeDays
    || right.turnover - left.turnover
    || Number(right.humanityVerified) - Number(left.humanityVerified)
    || left.userId.localeCompare(right.userId)
  ).slice(0, STORY_LIST_LIMIT);
}

/** Reads the wins block written by the daily reality post: { challenges: [...], wishes: [{ title }] }. */
export function readStoryWins(value: unknown, date: string): StoryWins {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const list = (key: string) => Array.isArray(record[key]) ? record[key] as unknown[] : [];
  return {
    date,
    challenges: list("challenges").length,
    wishes: list("wishes").map((item) => wishTitle(item))
  };
}

function wishTitle(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const title = (item as Record<string, unknown>).title;
  if (typeof title === "string") return title.trim() || null;
  if (title && typeof title === "object") {
    const first = Object.values(title as Record<string, unknown>).find((value) => typeof value === "string" && value.trim());
    return typeof first === "string" ? first.trim() : null;
  }
  return null;
}

// The author's own words about a fulfilled wish ("what changed for me"), kept short for cards and videos.
export const WISH_COMPLETION_STORY_MAX = 600;

export function normalizeCompletionStory(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return text ? text.slice(0, WISH_COMPLETION_STORY_MAX).trim() : null;
}

export function withCompletionStory(body: string, story: string | null): string {
  return story ? `${body}\n\n${story}` : body;
}

/** The story part of a published wish_completed post: everything after the system first line. */
export function completionStoryFromBody(body: string | null): string | null {
  if (!body) return null;
  const split = body.indexOf("\n\n");
  return split < 0 ? null : normalizeCompletionStory(body.slice(split + 2));
}
