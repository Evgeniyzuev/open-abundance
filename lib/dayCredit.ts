// Pure rules of the daily goal chain (no imports, tested directly by node).
// A day is credited by how much of the daily Core target was reached: any action beyond signing in keeps
// the streak, 50% counts the day, 100% is a full day (the bonus).

export type DayCredit = "none" | "kept" | "counted" | "full";

export type DayRow = { local_date: string; status: string; progress_core: number | string | null; target_core: number | string | null };

export function dayCredit(row: Pick<DayRow, "status" | "progress_core" | "target_core">): DayCredit {
  if (row.status === "completed") return "full";
  const progress = Number(row.progress_core ?? 0);
  const target = Number(row.target_core ?? 0);
  if (!(progress > 0)) return "none";
  if (!(target > 0)) return "counted";
  const ratio = progress / target;
  if (ratio >= 1) return "full";
  return ratio >= 0.5 ? "counted" : "kept";
}

const RANK: Record<DayCredit, number> = { none: 0, kept: 1, counted: 2, full: 3 };

function previousDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);
}

export type DayCreditStats = { keptStreak: number; countedStreak: number; countedTotal: number; fullTotal: number };

/** Streaks end today if today is credited, otherwise yesterday (today is not over yet). */
export function dayCreditStats(rows: DayRow[], today: string): DayCreditStats {
  const credit = new Map(rows.map((row) => [row.local_date, dayCredit(row)]));
  const streak = (minimum: DayCredit) => {
    let cursor = (credit.get(today) ?? "none") !== "none" && RANK[credit.get(today)!] >= RANK[minimum] ? today : previousDate(today);
    let count = 0;
    while (RANK[credit.get(cursor) ?? "none"] >= RANK[minimum]) {
      count += 1;
      cursor = previousDate(cursor);
    }
    return count;
  };
  let countedTotal = 0;
  let fullTotal = 0;
  for (const value of credit.values()) {
    if (RANK[value] >= RANK.counted) countedTotal += 1;
    if (value === "full") fullTotal += 1;
  }
  return { keptStreak: streak("kept"), countedStreak: streak("counted"), countedTotal, fullTotal };
}

/** The numbers a "daily_goal_*" check asks for: kind and how many days. */
export function dailyGoalRule(logic: string | null | undefined): { kind: "counted_streak" | "full_total"; days: number } | null {
  const match = logic?.match(/^daily_goal_(half_streak|full_total)_(\d+)$/);
  if (!match) return null;
  const days = Number(match[2]);
  if (!Number.isSafeInteger(days) || days <= 0) return null;
  return { kind: match[1] === "half_streak" ? "counted_streak" : "full_total", days };
}
