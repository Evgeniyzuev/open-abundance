// The inviter's path in one line for a person who came by their link: «день 12 · уровень 4 · 9 заданий» and the wish
// they walk to. Only public facts: days since sign-up, level, completed quests, a wish they made public themselves.
// Pure, so scripts/verify-inviter-path-contract.mjs runs it directly.

export type InviterPath = { days: number; level: number; quests: number; wish: string | null };

type Locale = "ru" | "en" | "es" | "zh" | "hi" | "ar";

const TEXT: Record<Locale, { day: string; level: string; quests: string; wish: string }> = {
  ru: { day: "день {n}", level: "уровень {n}", quests: "заданий: {n}", wish: "идёт к «{wish}»" },
  en: { day: "day {n}", level: "level {n}", quests: "quests: {n}", wish: "walking to “{wish}”" },
  es: { day: "día {n}", level: "nivel {n}", quests: "retos: {n}", wish: "camino a «{wish}»" },
  zh: { day: "第 {n} 天", level: "等级 {n}", quests: "任务：{n}", wish: "正在走向「{wish}」" },
  hi: { day: "दिन {n}", level: "स्तर {n}", quests: "काम: {n}", wish: "“{wish}” की ओर" },
  ar: { day: "اليوم {n}", level: "المستوى {n}", quests: "المهام: {n}", wish: "في الطريق إلى «{wish}»" }
};

export function cleanInviterPath(value: unknown): InviterPath | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const whole = (item: unknown) => (typeof item === "number" && Number.isFinite(item) && item >= 0 ? Math.floor(item) : 0);
  const wish = typeof raw.wish === "string" ? raw.wish.replace(/\s+/g, " ").trim().slice(0, 60) : "";
  return { days: whole(raw.days), level: whole(raw.level), quests: whole(raw.quests), wish: wish || null };
}

/** Days on the path counted from sign-up, the first day being day 1. */
export function inviterDays(createdAt: string | null | undefined, now = Date.now()): number {
  const start = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (!Number.isFinite(start)) return 0;
  return Math.max(1, Math.floor((now - start) / 86_400_000) + 1);
}

/** «день 12 · уровень 4 · заданий: 9»; empty facts are left out, so a brand-new inviter shows just «день 1». */
export function inviterPathFacts(path: InviterPath, locale: string): string {
  const text = TEXT[(locale in TEXT ? locale : "en") as Locale];
  const parts = [
    path.days > 0 ? text.day.replace("{n}", String(path.days)) : "",
    path.level > 0 ? text.level.replace("{n}", String(path.level)) : "",
    path.quests > 0 ? text.quests.replace("{n}", String(path.quests)) : ""
  ].filter(Boolean);
  return parts.join(" · ");
}

export function inviterPathWish(path: InviterPath, locale: string): string {
  if (!path.wish) return "";
  const text = TEXT[(locale in TEXT ? locale : "en") as Locale];
  return text.wish.replace("{wish}", path.wish);
}
