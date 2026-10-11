// Pure helpers for Nova's weekly summary (no imports, tested directly by node).
// The week is the last completed Monday-to-Sunday week in UTC. The summary uses only the person's own
// counts; the text is written by a model from those facts, with a plain template as the fallback.

export type WeeklyStats = {
  weekStart: string;
  /** Core at the start and end of the week, from the daily accrual rows (null when there were none). */
  coreStart: number | null;
  coreEnd: number | null;
  accrued: number;
  challengesCompleted: number;
  novaMessages: number;
  postsPublished: number;
  wishesAdded: number;
  activeDays: number;
};

const DAY_MS = 86_400_000;

/** Monday (YYYY-MM-DD, UTC) of the last fully completed week. */
export function previousWeekStart(nowMs: number): string {
  const now = new Date(nowMs);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (now.getUTCDay() + 6) % 7;
  return new Date(today - sinceMonday * DAY_MS - 7 * DAY_MS).toISOString().slice(0, 10);
}

export function weekEndExclusive(weekStart: string): string {
  return new Date(Date.parse(`${weekStart}T00:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10);
}

/** A person with no visible activity in the week gets no summary: silence is better than a empty report. */
export function hasWeeklyActivity(stats: WeeklyStats): boolean {
  return stats.activeDays > 0 || stats.challengesCompleted > 0 || stats.novaMessages > 0 || stats.postsPublished > 0 || stats.wishesAdded > 0;
}

const money = (value: number) => value.toFixed(2);

/** The facts the model may use; every line is a number the person can check in the app. */
export function weeklyFacts(stats: WeeklyStats): string[] {
  const facts: string[] = [];
  facts.push(`days with the app opened: ${stats.activeDays} of 7`);
  if (stats.coreStart !== null && stats.coreEnd !== null) facts.push(`Core: from ${money(stats.coreStart)} to ${money(stats.coreEnd)} (daily accrual this week: ${money(stats.accrued)})`);
  if (stats.challengesCompleted > 0) facts.push(`challenges completed: ${stats.challengesCompleted}`);
  if (stats.wishesAdded > 0) facts.push(`wishes added: ${stats.wishesAdded}`);
  if (stats.postsPublished > 0) facts.push(`posts published: ${stats.postsPublished}`);
  if (stats.novaMessages > 0) facts.push(`messages to Nova: ${stats.novaMessages}`);
  return facts;
}

/** Plain text used when the model is unavailable. Never claims more than the counts say. */
export function weeklyFallbackText(stats: WeeklyStats, locale: "ru" | "en"): string {
  const ru = locale === "ru";
  const parts: string[] = [];
  parts.push(ru ? `На этой неделе вы заходили в приложение в ${stats.activeDays} из 7 дней.` : `This week you opened the app on ${stats.activeDays} of 7 days.`);
  if (stats.coreStart !== null && stats.coreEnd !== null) {
    parts.push(ru ? `Ядро выросло с ${money(stats.coreStart)} до ${money(stats.coreEnd)}.` : `Core grew from ${money(stats.coreStart)} to ${money(stats.coreEnd)}.`);
  }
  const done: string[] = [];
  if (stats.challengesCompleted > 0) done.push(ru ? `заданий выполнено: ${stats.challengesCompleted}` : `challenges completed: ${stats.challengesCompleted}`);
  if (stats.wishesAdded > 0) done.push(ru ? `желаний добавлено: ${stats.wishesAdded}` : `wishes added: ${stats.wishesAdded}`);
  if (stats.postsPublished > 0) done.push(ru ? `публикаций: ${stats.postsPublished}` : `posts: ${stats.postsPublished}`);
  if (done.length) parts.push(ru ? `Ещё: ${done.join(", ")}.` : `Also: ${done.join(", ")}.`);
  parts.push(ru ? "Выберите один небольшой шаг на новую неделю, и я помогу его спланировать." : "Pick one small step for the new week and I will help you plan it.");
  return parts.join(" ");
}

/** The model's text is accepted only when it is a short plain paragraph. */
export function acceptWeeklyText(text: string): string | null {
  const value = text.trim();
  if (value.length < 40 || value.length > 900) return null;
  return value;
}
