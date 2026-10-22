// "Combo of the day" (no imports, tested directly by node). The daily set gets one riddle that is the
// same for everyone on a UTC day, so authors and channels can talk about it like Hamster's Daily Combo.
// The answer is found in the app. The combo is the riddle plus two more actions; it builds a streak
// with one free "frozen" day a week. Rewards are not money: a streak and a celebration.

export const RIDDLE_COUNT = 10;
export const COMBO_MIN_OTHER_ACTIONS = 2;
export const COMBO_STREAK_STORAGE_KEY = "open-abundance:combo-streak:v1";
const FREEZE_EVERY_DAYS = 7;

// Accepted answers, compared after normalizeRiddleAnswer. Russian and English both count.
const RIDDLE_ANSWERS: Record<number, string[]> = {
  1: ["core", "кор", "ядро"],
  2: ["nova", "нова"],
  3: ["кошелек", "wallet"],
  4: ["маркет", "маркетплейс", "market", "marketplace"],
  5: ["план", "plan"],
  6: ["реалити", "реалитироста", "reality", "growthreality"],
  7: ["человек", "человечность", "person", "human", "humanity"],
  8: ["желание", "wish"],
  9: ["историироста", "истории", "growthstories", "stories"],
  10: ["челлендж", "челендж", "challenge"]
};

export type ComboStreak = { lastDay: string | null; streak: number; freezeDay: string | null };

/** The same riddle for everyone on a UTC date (yyyy-mm-dd), 1..RIDDLE_COUNT, never the same two days running. */
export function riddleOfDay(utcDay: string): number {
  const days = Math.floor(Date.parse(`${utcDay}T00:00:00Z`) / 86_400_000);
  if (!Number.isFinite(days)) return 1;
  // A step coprime with the count walks through every riddle before repeating.
  return ((days * 3) % RIDDLE_COUNT + RIDDLE_COUNT) % RIDDLE_COUNT + 1;
}

export function normalizeRiddleAnswer(value: string): string {
  return value.toLowerCase().replace(/ё/g, "е").replace(/[^\p{L}\p{N}]/gu, "");
}

export function isRiddleAnswer(riddle: number, value: string): boolean {
  const answer = normalizeRiddleAnswer(value);
  return answer.length > 0 && (RIDDLE_ANSWERS[riddle] ?? []).includes(answer);
}

/** Combo of the day: the riddle is solved and at least two other cards were acted on. */
export function isComboCollected(acted: string[]): boolean {
  return acted.includes("riddle") && acted.filter((kind) => kind !== "riddle").length >= COMBO_MIN_OTHER_ACTIONS;
}

export function freshComboStreak(): ComboStreak {
  return { lastDay: null, streak: 0, freezeDay: null };
}

export function restoreComboStreak(raw: unknown): ComboStreak {
  const value = raw as Partial<ComboStreak> | null;
  if (!value || typeof value !== "object") return freshComboStreak();
  const day = (item: unknown) => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item) ? item : null;
  return { lastDay: day(value.lastDay), streak: Math.max(0, Math.floor(Number(value.streak) || 0)), freezeDay: day(value.freezeDay) };
}

/**
 * Records today's combo. Yesterday continues the streak; one missed day is forgiven once a week
 * (the "frozen" day); a longer gap starts again from 1. Recording the same day twice changes nothing.
 */
export function recordCombo(streak: ComboStreak, day: string): ComboStreak {
  if (streak.lastDay === day) return streak;
  const gap = streak.lastDay ? daysBetween(streak.lastDay, day) : Infinity;
  if (gap === 1) return { ...streak, lastDay: day, streak: streak.streak + 1 };
  const freezeFree = !streak.freezeDay || daysBetween(streak.freezeDay, day) >= FREEZE_EVERY_DAYS;
  if (gap === 2 && freezeFree) return { lastDay: day, streak: streak.streak + 1, freezeDay: addDay(streak.lastDay!, 1) };
  return { lastDay: day, streak: 1, freezeDay: streak.freezeDay };
}

/** The streak as it stands today: it is still alive if the last combo was today, yesterday or within a usable freeze. */
export function currentComboStreak(streak: ComboStreak, day: string): number {
  if (!streak.lastDay) return 0;
  const gap = daysBetween(streak.lastDay, day);
  if (gap <= 1) return streak.streak;
  const freezeFree = !streak.freezeDay || daysBetween(streak.freezeDay, day) >= FREEZE_EVERY_DAYS;
  return gap === 2 && freezeFree ? streak.streak : 0;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function addDay(day: string, delta: number): string {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}
