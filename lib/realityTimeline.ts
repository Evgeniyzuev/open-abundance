export type RealityDayRow = {
  postId: string;
  postType: string;
  body: string | null;
  date: string;
  cover: { type: string; url: string | null } | null;
  blocks: Array<{ key: string; value: unknown }>;
};

export type RealityDay = {
  postId: string;
  date: string;
  postType: string;
  body: string | null;
  cover: { type: string; url: string | null } | null;
  level: number | null;
  levelBefore: number | null;
  turnover: number | null;
  spent: number | null;
  wins: number | null;
  coreGrowth: number | null;
};

export type RealityMetric = "turnover" | "coreGrowth" | "level";

/** One entry per date (newest post wins), oldest first. Hidden blocks stay null, never zero. */
export function buildRealityDays(rows: RealityDayRow[]): RealityDay[] {
  const byDate = new Map<string, RealityDayRow>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue;
    if (!byDate.has(row.date)) byDate.set(row.date, row);
  }
  return Array.from(byDate.values())
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((row) => {
      const block = (key: string) => row.blocks.find((item) => item.key === key)?.value;
      return {
        postId: row.postId,
        date: row.date,
        postType: row.postType,
        body: row.body,
        cover: row.cover,
        level: readNumber(block("level"), "levelAfter"),
        levelBefore: readNumber(block("level"), "levelBefore"),
        turnover: readNumber(block("turnover"), "amount"),
        spent: readNumber(block("spent"), "amount"),
        wins: readNumber(block("wins"), "count"),
        coreGrowth: readNumber(block("total_core_growth"), "amount")
      };
    });
}

export function addDays(date: string, delta: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + delta);
  return value.toISOString().slice(0, 10);
}

export function summarizeReality(days: RealityDay[], today: string) {
  const since = addDays(today, -29);
  const recent = days.filter((day) => day.date >= since && day.date <= today);
  const withLevel = days.filter((day) => day.level !== null);
  const first = withLevel[0] ?? null;
  const last = withLevel.at(-1) ?? null;
  return {
    activeDays: days.length,
    turnover30: recent.reduce((sum, day) => sum + (day.turnover ?? 0), 0),
    hasTurnover: days.some((day) => day.turnover !== null),
    level: last?.level ?? null,
    levelStart: first ? first.levelBefore ?? first.level : null,
    firstDate: days[0]?.date ?? null
  };
}

/** Points for one metric over the last `periodDays` (0 = all), skipping days where it is hidden. */
export function realitySeries(days: RealityDay[], metric: RealityMetric, periodDays: number, today: string): Array<{ date: string; value: number }> {
  const since = periodDays > 0 ? addDays(today, -(periodDays - 1)) : "";
  return days
    .filter((day) => day.date >= since && day.date <= today && day[metric] !== null)
    .map((day) => ({ date: day.date, value: day[metric] as number }));
}

/** Calendar grid: `weeks` columns of Monday..Sunday ending with the week of `today`. */
export function realityCalendar(days: RealityDay[], today: string, weeks = 12): Array<Array<{ date: string; day: RealityDay | null; future: boolean }>> {
  const byDate = new Map(days.map((day) => [day.date, day]));
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(today, -weekday - (weeks - 1) * 7);
  return Array.from({ length: weeks }, (_, week) => Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, week * 7 + index);
    return { date, day: byDate.get(date) ?? null, future: date > today };
  }));
}

function readNumber(value: unknown, key: string): number | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const parsed = Number((value as Record<string, unknown>)[key]);
  return Number.isFinite(parsed) ? parsed : null;
}
