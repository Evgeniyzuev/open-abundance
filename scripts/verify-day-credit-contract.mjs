import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dayCredit, dayCreditStats, dailyGoalRule } from "../lib/dayCredit.ts";

const row = (local_date, progress_core, target_core = 10, status = "accepted") => ({ local_date, status, progress_core, target_core });

assert.equal(dayCredit(row("d", 0)), "none", "only signing in gives nothing");
assert.equal(dayCredit(row("d", 1)), "kept");
assert.equal(dayCredit(row("d", 4.99)), "kept");
assert.equal(dayCredit(row("d", 5)), "counted", "50% counts the day");
assert.equal(dayCredit(row("d", 9.99)), "counted");
assert.equal(dayCredit(row("d", 10)), "full");
assert.equal(dayCredit(row("d", 0, 10, "completed")), "full");
assert.equal(dayCredit(row("d", "5", "10")), "counted", "numeric strings from the database work");

// Streaks: today not credited yet does not break yesterday's streak.
const rows = [row("2026-10-17", 0), row("2026-10-16", 6), row("2026-10-15", 10), row("2026-10-14", 2), row("2026-10-13", 8)];
let stats = dayCreditStats(rows, "2026-10-17");
assert.equal(stats.countedStreak, 2, "16th and 15th count; 14th (20%) ends it");
assert.equal(stats.keptStreak, 4, "any action keeps the chain: 16, 15, 14, 13");
assert.equal(stats.countedTotal, 3);
assert.equal(stats.fullTotal, 1);
stats = dayCreditStats([...rows.slice(1), row("2026-10-17", 5)], "2026-10-17");
assert.equal(stats.countedStreak, 3, "today counts once it reaches 50%");
assert.equal(dayCreditStats([], "2026-10-17").countedStreak, 0);
assert.equal(dayCreditStats([row("2026-10-12", 9)], "2026-10-17").countedStreak, 0, "a gap breaks the streak");
assert.equal(dayCreditStats([row("2026-09-30", 9), row("2026-10-01", 9)], "2026-10-01").countedStreak, 2, "month borders work");

assert.deepEqual(dailyGoalRule("daily_goal_half_streak_3"), { kind: "counted_streak", days: 3 });
assert.deepEqual(dailyGoalRule("daily_goal_full_total_7"), { kind: "full_total", days: 7 });
assert.equal(dailyGoalRule("daily_goal_half_streak_0"), null);
assert.equal(dailyGoalRule("daily_goal_x_3"), null);
assert.equal(dailyGoalRule(null), null);

// Today screen: the server sends the credit, the screen shows it, and every text exists in both languages.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const server = read("lib/serverToday.ts");
assert.ok(server.includes("dayCreditStats(datesResult.data") && server.includes("credit: { ...streaks.credit, today: dayCredit(today) }"), "the Today payload carries the credit");
assert.ok(/select\("local_date,status,progress_core,target_core"\)/.test(server), "the streak query reads the progress of each day");
const home = read("components/HomeTodayApp.tsx");
for (const key of ["today.creditNone", "today.creditKept", "today.creditCounted", "today.creditFull", "today.halfStreak", "today.fullDays", "today.halfStreakChallenge3", "today.halfStreakChallenge7", "today.halfMark"]) {
  assert.ok(read("lib/messages/en.ts").includes(`"${key}"`) && read("lib/messages/ru.ts").includes(`"${key}"`), `${key} exists in both languages`);
}
assert.ok(home.includes("today-progress-half") && home.includes("creditMessage("), "the bar marks the half and the screen explains the day");
console.log("Daily goal credit contract verified.");
