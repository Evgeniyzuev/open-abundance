import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addDays, buildRealityDays, realityCalendar, realitySeries, summarizeReality } from "../lib/realityTimeline.ts";

const row = (postId, date, blocks, postType = "daily_progress") => ({ postId, postType, body: null, date, cover: null, blocks });
const days = buildRealityDays([
  row("newer-dup", "2026-10-13", [{ key: "level", value: { levelBefore: 4, levelAfter: 5 } }, { key: "turnover", value: { amount: 12 } }], "level_up"),
  row("older-dup", "2026-10-13", [{ key: "level", value: { levelAfter: 4 } }]),
  row("old", "2026-09-20", [{ key: "level", value: { levelBefore: 3, levelAfter: 3 } }, { key: "total_core_growth", value: { amount: "0.5" } }]),
  row("hidden", "2026-10-01", []),
  row("bad-date", "13.10.2026", [])
]);
assert.deepEqual(days.map((day) => day.postId), ["old", "hidden", "newer-dup"], "oldest first, one per date, the first (newest) post wins");
assert.equal(days[1].turnover, null, "a hidden block stays null, not zero");
assert.equal(days[0].coreGrowth, 0.5);

const today = "2026-10-14";
const summary = summarizeReality(days, today);
assert.equal(summary.activeDays, 3);
assert.equal(summary.turnover30, 12, "only the last 30 days count");
assert.equal(summary.levelStart, 3);
assert.equal(summary.level, 5);
assert.equal(summary.firstDate, "2026-09-20");

assert.deepEqual(realitySeries(days, "turnover", 30, today), [{ date: "2026-10-13", value: 12 }]);
assert.deepEqual(realitySeries(days, "level", 0, today).map((point) => point.value), [3, 5], "hidden days are skipped");
assert.deepEqual(realitySeries(days, "level", 7, today).map((point) => point.date), ["2026-10-13"]);

const calendar = realityCalendar(days, today, 12);
assert.equal(calendar.length, 12);
assert.equal(calendar.at(-1)[0].date, "2026-10-12", "weeks start on Monday");
assert.equal(calendar.at(-1).find((cell) => cell.date === "2026-10-13").day.postId, "newer-dup");
assert.equal(calendar.at(-1).find((cell) => cell.date === "2026-10-15").future, true);
assert.equal(addDays("2026-03-01", -1), "2026-02-28");

// API: signed-out readable, only published public day posts and their public blocks.
const api = readFileSync("app/api/reality/[userId]/route.ts", "utf8");
assert.match(api, /\.in\("post_type", \["daily_progress", "level_up"\]\)/);
assert.match(api, /\.eq\("status", "published"\)\s*\.eq\("visibility", "public"\)\s*\.is\("deleted_at", null\)/);
assert.match(api, /\.eq\("visibility", "public"\)/);
assert.match(api, /\.limit\(MAX_DAYS\)/);
assert.doesNotMatch(api, /getAuthenticatedUser/);

const view = readFileSync("components/RealityView.tsx", "utf8");
assert.match(view, /prefers-reduced-motion: reduce/);
assert.match(view, /if \(!days\?\.length\) return null;/);
assert.match(readFileSync("components/PublicUserPage.tsx", "utf8"), /<RealityView userId=\{payload\.profile\.user_id\}/);

console.log("reality timeline contract ok");
